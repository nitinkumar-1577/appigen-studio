import { useCallback, useEffect, useRef, useState } from "react";
import type { ImperativePanelGroupHandle } from "react-resizable-panels";
import { Sidebar, type ViewKey } from "@/components/appigen/Sidebar";
import { PromptPanel } from "@/components/appigen/PromptPanel";
import { PreviewPanel } from "@/components/appigen/PreviewPanel";
import { DashboardPage } from "@/components/appigen/pages/DashboardPage";
import { MyAppsPage } from "@/components/appigen/pages/MyAppsPage";
import { TemplatesPage } from "@/components/appigen/pages/TemplatesPage";
import { ApiSettingsPage } from "@/components/appigen/pages/ApiSettingsPage";
import { PricingPage } from "@/components/appigen/pages/PricingPage";
import { BackendDeployPage } from "@/components/appigen/pages/BackendDeployPage";
import { AuthModal } from "@/components/appigen/AuthModal";
import { PricingModal } from "@/components/appigen/PricingModal";
import { SettingsPanel } from "@/components/appigen/SettingsPanel";
import { NotificationsMenu } from "@/components/appigen/NotificationsMenu";
import { GithubModal } from "@/components/appigen/GithubModal";
import { useApp } from "@/components/appigen/AppContext";
import { Sparkles,Menu, MessageSquare, Eye, Github as GithubIcon,Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { assertSupabaseFunctionAccess, supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { buildDocFromPrompt } from "@/lib/preview/buildDocFromPrompt";
import { normalizeFileMarkers } from "@/lib/preview/parseFileMarkers";
import { validateGeneratedCode, validateGeneratedFile } from "@/lib/preview/validateGeneratedCode";
import { getFunctionErrorMessage } from "@/lib/supabase/functionError";
import { createRunnableProjectZip } from "@/lib/projects/exportProject";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import { readGeneratedBackendState } from "@/lib/backend/generatedAppBackendStorage";
import { isNewAppPrompt, isProjectConversation } from "@/lib/projects/promptIntent";
import { formatImplementationPlan } from "@/lib/projects/implementationPlan";
import { mergeGeneratedFile, orderBuildFiles, runSequentialFileBuild, selectFilesForEdit, validateBuildFileResponse, validateFileTree, type BuildFileProgress } from "@/lib/projects/buildWorkflow";
import { clearLocalVersions, clearProjectChangeRecords, clearProjectMemory, deleteLocalVersion, discardProjectDraft, readProjectChangeRecords, readProjectDraft, readLocalVersionsForProject, readProjectMemory, writeLocalVersion, writeProjectChangeRecord, writeProjectDraft, writeProjectMemory, writeProjectMessages, type ChatMessage, type LocalProjectVersion } from "@/lib/projects/projectStorage";
import { computeChangeRecord, formatChangeRecord } from "@/lib/projects/changeTracking";
import { formatUnderstandingForPrompt, understandProject } from "@/lib/projects/projectUnderstanding";
import { detectConflicts, formatMemoryForPrompt, updateProjectMemory } from "@/lib/projects/projectMemory";
import { clearProjectVersions, createProjectVersion, deleteProject, deleteProjectVersion, enqueueBuildJob, loadLatestBuildJob, loadProject, loadProjectVersions, pauseBuildJob, persistActivity, persistProject, persistProjectThumbnail, resumeBuildJob, saveBuildCheckpoint, subscribeToBuildJob, subscribeToProjectSync, type DurableBuildJob } from "@/lib/projects/projectRepository";
import { loadLatestAccountBuildJob, loadLatestActiveBuildJob, subscribeToActiveBuildJobs, loadStudioSession, saveStudioSession, subscribeToStudioSession } from "@/lib/projects/projectRepository";
import { readAppPreferences, readGenerationSettings, recordActivity } from "@/lib/appPreferences";
import { trackAnonymousUsage } from "@/lib/telemetry";
import { analyzeIntent, intentSummary, isVagueNewAppPrompt, resolveFollowUp, responseLanguageInstruction } from "@/lib/projects/conversationIntelligence";
import {
  createActivityId,
  createBuildActivityEvent,
  updateBuildActivityEvent,
  type BuildActivity,
  type BuildActivityEvent,
} from "@/lib/projects/conversationActivity";
import { attemptsForIssue, buildQualityState, canAttemptRepair, createRepairAttempt, emptyQualityState, finalizeRepairAttempt, MAX_REPAIR_ATTEMPTS_PER_ISSUE, mergeRuntimeError, normalizeReviewFindings, type CheckStatus, type QualityState, type RepairAttempt, type RuntimeIssue } from "@/lib/projects/qualityEngine";

const SPLIT_STORAGE_KEY = "appigen.studio.split.v1";
const DEFAULT_SPLIT_RATIO = 30;
const clampSplitRatio = (value: number) => Math.min(45, Math.max(20, Math.round(value)));
export const shouldAutoHideSidebar = (isGenerating: boolean, wasGenerating: boolean) => isGenerating && !wasGenerating;

export const requiresClarification = (prompt: string, hasExistingCode: boolean) => !hasExistingCode && isVagueNewAppPrompt(prompt);

const CLARIFY_NEW_APP = "I can build that, but I need one more detail first: what should the app or page be? For example a todo app, an expense tracker, or a landing page, and who it is for. Tell me that and I will start building.";

export function resolveSplitDrop(layout: number[], startLayout: number[], lastRatio: number): number[] {
  const [chat, preview] = layout;
  if (chat <= 6) return [0, 100];
  if (preview <= 6) return [100, 0];
  const ratio = clampSplitRatio(chat);
  if (startLayout.length === 2 && (startLayout[0] <= 6 || startLayout[1] <= 6)) {
    const restored = clampSplitRatio(lastRatio);
    return [restored, 100 - restored];
  }
  return [ratio, 100 - ratio];
}

const readSplitRatio = () => {
  try {
    const value = Number(localStorage.getItem(SPLIT_STORAGE_KEY));
    if (Number.isFinite(value) && value >= 20 && value <= 45) return value;
  } catch {
    // Storage may be unavailable; fall back to the default split.
  }
  return DEFAULT_SPLIT_RATIO;
};

const VIEW_TITLES: Record<ViewKey, string> = {
  studio: "",
  dashboard: "Dashboard",
  apps: "My Apps",
  templates: "Templates",
  api: "API Settings",
  backend: "Backend & Deploy",
  pricing: "Pricing & Credits",
};

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "untitled";

export const getValidationSummary = (reviewSkipped: boolean, fileCount: number) =>
  reviewSkipped
    ? `AI review was skipped to save tokens, but local project validation passed for ${fileCount} source file${fileCount === 1 ? "" : "s"}, its app structure, and local imports.`
    : `Review complete: the project was checked against the prompt and plan. Validation passed for ${fileCount} source file${fileCount === 1 ? "" : "s"}, its app structure, and local imports.`;

export const createInitialStudioState = () => ({
  prompt: "",
  title: "Untitled Project",
  code: null as string | null,
  projectId: null as string | null,
  messages: [] as ChatMessage[],
  versions: [] as LocalProjectVersion[],
  mobileTab: "chat" as const,
});

export const removePromptConversationBlocks = (messages: ChatMessage[], promptText: string) => {
  const result: ChatMessage[] = [];
  let removing = false;
  for (const message of messages) {
    if (message.role === "user") {
      removing = message.content === promptText;
      if (removing) continue;
    }
    if (!removing) result.push(message);
  }
  return result;
};

export const resolveProjectTitle = (options: { editMode: boolean; planTitle?: string; fallback: string; currentTitle: string }) => {
  if (options.editMode) return options.currentTitle && options.currentTitle !== "Untitled Project" ? options.currentTitle : options.fallback;
  return options.planTitle?.trim() || options.fallback;
};

const suggestProjectTitle = (promptText: string) => {
  const normalized = promptText.replace(/\s+/g, " ").trim();
  if (normalized.length < 8) return "Untitled Project";

  const withoutInstruction = normalized
    .replace(/^(please\s+)?(build|create|make|design|generate|develop|มुझे|बनाओ)\s+(me\s+)?/i, "")
    .replace(/^(a|an|the|एक|एक\s+ऐसा)\s+/i, "");
  const core = withoutInstruction
    .split(/\s+(?:with|including|featuring|that|which|using|for|and|जिसमें|जिसके)\s+/i)[0]
    .replace(/[.,!?;:]+$/g, "");
  const ignored = new Set(["app", "application", "website", "web", "project", "page", "screen", "simple", "modern", "beautiful"]);
  const words = core.split(/\s+/).filter((word) => !ignored.has(word.toLowerCase()));
  const detectedType = [
    "ludo game", "game", "dashboard", "tracker", "planner", "manager",
    "marketplace", "portfolio", "blog", "chat", "ecommerce", "shop",
    "booking", "calendar", "quiz", "forum", "social network",
  ].find((type) => normalized.toLowerCase().includes(type));
  if (detectedType && !core.toLowerCase().includes(detectedType)) words.push(detectedType);

  const title = words
    .slice(0, 6)
    .join(" ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
  return title || "Untitled Project";
};

const Index = () => {
  const { user, session, authReady, recoveryPending, clearRecoveryPending, addNotification } = useApp();
  const [initialState] = useState(createInitialStudioState);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isChatThinking, setIsChatThinking] = useState(false);
  const [isGeneratingApp, setIsGeneratingApp] = useState(false);
  const [prompt, setPrompt] = useState(initialState.prompt);
  const [doc, setDoc] = useState<string>(() => buildDocFromPrompt(initialState.prompt));
  const [view, setView] = useState<ViewKey>("studio");
  const [sidebarActiveView, setSidebarActiveView] = useState<ViewKey>("studio");
  const [authOpen, setAuthOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [projectTitle, setProjectTitle] = useState(initialState.title);
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(initialState.code);
  const [workingCode, setWorkingCode] = useState<string | null>(initialState.code);
  const [changeBaseCode, setChangeBaseCode] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(initialState.projectId);
  const [projectUpdatedAt, setProjectUpdatedAt] = useState<string | null>(null);
  const [projectThumbnail, setProjectThumbnail] = useState<string | null>(null);
  const handleThumbnailCapture = (thumbnail: string) => {
    setProjectThumbnail((current) => current ?? thumbnail);
    if (projectId && session?.user?.id) {
      void persistProjectThumbnail(projectId, session.user.id, thumbnail).catch((error) => {
        console.warn("Project thumbnail could not be saved", error);
      });
    }
  };
  const [lastSyncedCode, setLastSyncedCode] = useState<string | null>(null);
  const lastSyncedPromptRef = useRef<string | null>(null);
  const lastSyncedTitleRef = useRef<string | null>(null);
  const lastSyncedMessagesRef = useRef<string | null>(null);
  const promptDirtyRef = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>(initialState.messages);
  const currentPromptRef = useRef(prompt);
  const currentTitleRef = useRef(projectTitle);
  const currentMessagesRef = useRef(messages);
  currentPromptRef.current = prompt;
  currentTitleRef.current = projectTitle;
  currentMessagesRef.current = messages;
  const studioSessionHydratingRef = useRef(false);
  const lastStudioSessionSerializedRef = useRef<string | null>(null);
  const [versions, setVersions] = useState<LocalProjectVersion[]>(initialState.versions);
  const openedSavedProjectRef = useRef(false);

const studioWorkspaceSnapshotRef = useRef<{
  prompt: string;
  doc: string;
  projectTitle: string;
  titleManuallyEdited: boolean;
  lastCode: string | null;
  workingCode: string | null;
  changeBaseCode: string | null;
  projectId: string | null;
  projectUpdatedAt: string | null;
  lastSyncedCode: string | null;
  lastSyncedPrompt: string | null;
  lastSyncedTitle: string | null;
  lastSyncedMessages: string | null;
  messages: ChatMessage[];
  versions: LocalProjectVersion[];
  qualityState: QualityState;
} | null>(null);
  const [progressStage, setProgressStage] = useState("Planning");
  const [buildFiles, setBuildFiles] = useState<BuildFileProgress[]>([]);
  const [buildTimeline, setBuildTimeline] = useState<string[]>([]);
  const partialBuildRef = useRef<{ prompt: string; code: string; completedPaths: string[] } | null>(null);
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [previewRuntime, setPreviewRuntime] = useState<{ status: "idle" | "pending" | "mounted" | "error"; message?: string; errorKind?: string }>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const activeRequestModeRef = useRef<"chat" | "build" | null>(null);
  const durableQueueAcceptedRef = useRef(false);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const previousUserRef = useRef(false);
  const [sidebarPinned, setSidebarPinned] = useState(true);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sidebarOverlayOpen, setSidebarOverlayOpen] = useState(false);
  const [splitRatio, setSplitRatio] = useState(readSplitRatio);
  const splitGroupRef = useRef<ImperativePanelGroupHandle>(null);
  const lastSplitRatioRef = useRef(splitRatio);
  const dragStartLayoutRef = useRef<number[]>([]);
  const [activityStartedAt, setActivityStartedAt] = useState<number | undefined>(undefined);
  const [activityExplanation, setActivityExplanation] = useState<string | undefined>(undefined);
  const buildFilesRef = useRef<BuildFileProgress[]>([]);
  const buildTimelineRef = useRef<string[]>([]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileStudioTab, setMobileStudioTab] = useState<"chat" | "preview">(initialState.mobileTab);
    // Keep only one Studio layout mounted at a time.
  const [isDesktopLayout, setIsDesktopLayout] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");

    const updateLayout = () => {
      setIsDesktopLayout(mediaQuery.matches);
    };

    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);

    return () => {
      mediaQuery.removeEventListener("change", updateLayout);
    };
  }, []);
  const [qualityState, setQualityState] = useState<QualityState>(emptyQualityState());
  const [qualityRunning, setQualityRunning] = useState(false);
  const [manualFixing, setManualFixing] = useState(false);
  const runtimeIssuesRef = useRef<RuntimeIssue[]>([]);
  const repairAttemptsRefState = useRef<RepairAttempt[]>([]);
  const pendingBuildRef = useRef<{ title: string; provider: string; editMode: boolean; validationSummary: string; changeSummary?: string; memoryNote?: string } | null>(null);
  const showPreview = Boolean(lastCode) || isGeneratingApp;
  const promptActivityTimer = useRef<number | undefined>(undefined);

  const hasAppWorkspace = isGeneratingApp || Boolean(lastCode);
  const hasStartedProject =
  Boolean(projectId) ||
  Boolean(lastCode) ||
  isGeneratingApp ||
  messages.length > 0;
  useEffect(() => {
  if (view === "studio" && !hasAppWorkspace) {
    setSidebarHidden(false);
    setSidebarPinned(true);
    setSidebarOverlayOpen(false);
  }
}, [view, hasAppWorkspace]);
  const wasGeneratingRef = useRef(false);
  useEffect(() => {
    // Only an actual build/edit steps the sidebar aside. Questions, explanations,
    // planning and normal conversation keep it visible.
    if (shouldAutoHideSidebar(isGeneratingApp, wasGeneratingRef.current)) {
      setSidebarPinned(false);
      setSidebarHidden(true);
      setSidebarOverlayOpen(false);
    }
    wasGeneratingRef.current = isGeneratingApp;
  }, [isGeneratingApp]);
const saveStudioWorkspaceSnapshot = () => {
  if (openedSavedProjectRef.current) return;

 studioWorkspaceSnapshotRef.current = {
  prompt,
  doc,
  projectTitle,
  titleManuallyEdited,
  lastCode,
  workingCode,
  changeBaseCode,
  projectId,
  projectUpdatedAt,
  lastSyncedCode,
  lastSyncedPrompt: lastSyncedPromptRef.current,
  lastSyncedTitle: lastSyncedTitleRef.current,
  lastSyncedMessages: lastSyncedMessagesRef.current,
  messages,
  versions,
  qualityState,
};
};
const restoreStudioWorkspaceSnapshot = () => {
  const snapshot = studioWorkspaceSnapshotRef.current;
  if (!snapshot) return;

  setPrompt(snapshot.prompt);
  setDoc(snapshot.doc);
  setProjectTitle(snapshot.projectTitle);
  setTitleManuallyEdited(snapshot.titleManuallyEdited);
  setLastCode(snapshot.lastCode);
  setWorkingCode(snapshot.workingCode);
  setChangeBaseCode(snapshot.changeBaseCode);
  setProjectId(snapshot.projectId);
  setProjectUpdatedAt(snapshot.projectUpdatedAt);
  setLastSyncedCode(snapshot.lastSyncedCode);
  lastSyncedPromptRef.current = snapshot.lastSyncedPrompt;
  lastSyncedTitleRef.current = snapshot.lastSyncedTitle;
  lastSyncedMessagesRef.current = snapshot.lastSyncedMessages;
  promptDirtyRef.current = false;
  setMessages(snapshot.messages);
  setVersions(snapshot.versions);
  setQualityState(snapshot.qualityState);

  openedSavedProjectRef.current = false;
  studioWorkspaceSnapshotRef.current = null;
};
const navigateView = (next: ViewKey) => {
  // Restore the previous Studio workspace only when no saved project is open.
  if (
  next === "studio" &&
  studioWorkspaceSnapshotRef.current
) {
  restoreStudioWorkspaceSnapshot();
  openedSavedProjectRef.current = false;
}
  // Save Studio workspace only when moving directly from Studio to My Apps.
  if (
    next === "apps" &&
    view === "studio" &&
    !openedSavedProjectRef.current
  ) {
    saveStudioWorkspaceSnapshot();
  }

  setSidebarHidden(false);
  setSidebarPinned(true);

  setView(next);
  setSidebarActiveView(next);
  setSidebarOverlayOpen(false);
  setMobileSidebarOpen(false);
};
  useEffect(() => {
    if (!isBuilding && !partialBuildRef.current) setWorkingCode(lastCode);
  }, [isBuilding, lastCode]);

  useEffect(() => {
    if (session?.provider_token && sessionStorage.getItem("appigen.github.connect.pending")) {
      sessionStorage.removeItem("appigen.github.connect.pending");
      setGithubOpen(true);
    }
  }, [session]);

  useEffect(() => {
    if (recoveryPending) setAuthOpen(true);
  }, [recoveryPending]);

  const chatKey = projectId || "local:current";
  useEffect(() => {
    if (authReady && !user) writeProjectMessages(chatKey, messages);
  }, [authReady, chatKey, messages, user]);
  useEffect(() => {
    if (!authReady || user) return;
    if (!readAppPreferences().autoDraft) {
      const existingDraft = readProjectDraft();
      if (existingDraft?.code) writeProjectDraft({ ...existingDraft, prompt: "", updatedAt: Date.now() });
      else discardProjectDraft();
      return;
    }
    if (readProjectDraft()?.ownerId) return;
    writeProjectDraft({ projectId, title: projectTitle, prompt, code: lastCode, messages, versions, updatedAt: Date.now() });
  }, [authReady, user, projectId, projectTitle, prompt, lastCode, messages, versions]);
  const [accountProjectLoading, setAccountProjectLoading] = useState(false);
  useEffect(() => {
    if (!authReady) return;
    if (!user || !session?.user.id) {
      if (previousUserRef.current) {
        setProjectId(null);
        setProjectUpdatedAt(null);
        setLastSyncedCode(null);
        setProjectTitle("Untitled Project");
        setTitleManuallyEdited(false);
        setPrompt("");
        setLastCode(null);
        setMessages([]);
        setVersions([]);
        setDoc(buildDocFromPrompt(""));
      }
      previousUserRef.current = false;
      setAccountProjectLoading(false);
      return;
    }
    setProjectId(null);
    setProjectUpdatedAt(null);
    setLastSyncedCode(null);
    setProjectTitle("Untitled Project");
    setTitleManuallyEdited(false);
    setPrompt("");
    setLastCode(null);
    setMessages([]);
    setVersions([]);
    setDoc(buildDocFromPrompt(""));
    previousUserRef.current = true;
    // Start signed-in users with a clean Studio. Saved projects are opened explicitly from My Apps.
    setAccountProjectLoading(false);
  }, [authReady, session?.user.id]);
  useEffect(() => {
    if (!authReady || !session?.user.id) return;

    let disposed = false;
    const userId = session.user.id;

    const restoreStudioSession = async () => {
      studioSessionHydratingRef.current = true;

      try {
        const saved = await loadStudioSession(userId);
        if (disposed) return;

        if (!saved) return;

        lastStudioSessionSerializedRef.current = JSON.stringify({
          project_id: saved.project_id,
          title: saved.title,
          prompt: saved.prompt,
          messages: saved.messages,
        });

        setProjectTitle(saved.title || "Untitled Project");
        setTitleManuallyEdited(Boolean(saved.title && saved.title !== "Untitled Project"));
        setPrompt(saved.prompt || "");
        setMessages(saved.messages || []);

        if (saved.project_id) {
          const project = await loadProject(saved.project_id, userId);
          if (disposed) return;

          const projectVersions = await loadProjectVersions(project.id, userId);
          if (disposed) return;

          setProjectId(project.id);
          setProjectUpdatedAt(project.updated_at);
          setProjectTitle(project.title);
    setPrompt(saved.prompt || "");
          setLastCode(project.code);
          setWorkingCode(project.code);
          setMessages(project.messages);
          setVersions(projectVersions);
          setDoc(buildDocFromPrompt(project.prompt, project.code));

          setLastSyncedCode(project.code);
          lastSyncedPromptRef.current = project.prompt;
          lastSyncedTitleRef.current = project.title;
          lastSyncedMessagesRef.current = JSON.stringify(project.messages);
        } else {
          setProjectId(null);
          setLastCode(null);
          setWorkingCode(null);
          setVersions([]);
          setDoc(buildDocFromPrompt(saved.prompt || ""));
        }

        promptDirtyRef.current = false;
      } catch (error) {
        console.warn("Could not restore Studio session", error);
      } finally {
        studioSessionHydratingRef.current = false;
      }
    };

    void restoreStudioSession();

    return () => {
      disposed = true;
      studioSessionHydratingRef.current = false;
   
    };
  }, [authReady, session?.user.id]);
    useEffect(() => {
    if (!authReady || !session?.user.id) return;

    let disposed = false;
    const userId = session.user.id;

    const unsubscribe = subscribeToStudioSession(userId, (remote) => {
      void (async () => {
        const remoteMessages = Array.isArray(remote.messages) ? remote.messages : [];
        const remoteSnapshot = JSON.stringify({
          project_id: remote.project_id,
          title: remote.title,
          prompt: remote.prompt,
          messages: remoteMessages,
        });

        if (remoteSnapshot === lastStudioSessionSerializedRef.current) return;
        if (studioSessionHydratingRef.current) return;
        const isRemoteStudioReset =
  !remote.project_id &&
  remote.title === "Untitled Project" &&
  !remote.prompt?.trim() &&
  remoteMessages.length === 0;

if (isRemoteStudioReset && projectId) {
  lastStudioSessionSerializedRef.current = remoteSnapshot;
  resetDeletedProject();
  return;
}

        const localSnapshot = JSON.stringify({
          project_id: projectId,
          title: currentTitleRef.current,
          prompt: currentPromptRef.current,
          messages: currentMessagesRef.current,
        });

        if (
          lastStudioSessionSerializedRef.current !== null &&
          localSnapshot !== lastStudioSessionSerializedRef.current
        ) {
          return;
        }

        try {
          if (remote.project_id) {
            const project = await loadProject(remote.project_id, userId);
            if (disposed) return;

            const projectVersions = await loadProjectVersions(project.id, userId);
            if (disposed) return;

            setProjectId(project.id);
            setProjectUpdatedAt(project.updated_at);
            setProjectTitle(project.title);
            setPrompt(remote.prompt || "");
            setLastCode(project.code);
            setWorkingCode(project.code);
            setMessages(project.messages);
            setVersions(projectVersions);
            setDoc(buildDocFromPrompt(project.prompt, project.code));

            setLastSyncedCode(project.code);
            lastSyncedPromptRef.current = project.prompt;
            lastSyncedTitleRef.current = project.title;
            lastSyncedMessagesRef.current = JSON.stringify(project.messages);
          } else {
            setProjectId(null);
            setProjectUpdatedAt(null);
            setProjectTitle(remote.title || "Untitled Project");
            setPrompt(remote.prompt || "");
            setLastCode(null);
            setWorkingCode(null);
            setMessages(remoteMessages);
            setVersions([]);
            setDoc(buildDocFromPrompt(remote.prompt || ""));
            setLastSyncedCode(null);
            lastSyncedPromptRef.current = remote.prompt || "";
            lastSyncedTitleRef.current = remote.title || "Untitled Project";
            lastSyncedMessagesRef.current = JSON.stringify(remoteMessages);
          }

          lastStudioSessionSerializedRef.current = remoteSnapshot;
          promptDirtyRef.current = false;
        } catch (error) {
          console.warn("Could not apply remote Studio session", error);
        }
      })();
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [authReady, session?.user.id, projectId]);
  
  useEffect(() => {
    if (!authReady || !session?.user.id) return;
    if (studioSessionHydratingRef.current) return;

    const userId = session.user.id;

    const snapshot = JSON.stringify({
      project_id: projectId,
      title: projectTitle,
      prompt,
      messages,
    });

    if (snapshot === lastStudioSessionSerializedRef.current) return;

    const timeoutId = window.setTimeout(() => {
      if (studioSessionHydratingRef.current) return;

      void saveStudioSession({
  userId,
  projectId,
  title: projectTitle,
  prompt,
  messages,
  ...(projectId ? {} : { activeBuildJobId: null }),
})
        .then(() => {
          lastStudioSessionSerializedRef.current = snapshot;
        })
        .catch((error) => {
          console.warn("Could not auto-save Studio session", error);
        });
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [authReady, session?.user.id, projectId, projectTitle, prompt, messages]);

  useEffect(() => {
    if (!authReady || !session?.user.id) return;

    let disposed = false;
    const restoringJobs = new Set<string>();

    const restoreActiveBuild = async (job: DurableBuildJob) => {
      if (disposed || !["queued", "running", "retrying"].includes(job.status)) return;
const savedSession = await loadStudioSession(session.user.id);

if (disposed) return;

if (!savedSession || savedSession.active_build_job_id !== job.id) {
  return;
}
      // This project is already open; its project-level listener handles updates.
      if (projectId === job.project_id) return;

    
      if (restoringJobs.has(job.id)) return;

      restoringJobs.add(job.id);

      try {
        const project = await loadProject(job.project_id, session.user.id);
        if (disposed) return;

        const projectVersions = await loadProjectVersions(
          job.project_id,
          session.user.id,
        );
        if (disposed) return;

        setProjectId(project.id);
        setProjectUpdatedAt(project.updated_at);
        setProjectTitle(project.title);
        setTitleManuallyEdited(true);

      setPrompt("");
        setLastCode(project.code);
        setWorkingCode(job.working_code || project.code);
        setMessages(project.messages);
        setVersions(projectVersions);
        setDoc(buildDocFromPrompt(project.prompt, project.code));

        setLastSyncedCode(project.code);
        lastSyncedPromptRef.current = project.prompt;
        lastSyncedTitleRef.current = project.title;
        lastSyncedMessagesRef.current = JSON.stringify(project.messages);
        promptDirtyRef.current = false;

        durableQueueAcceptedRef.current = true;
        setIsBuilding(true);
        setIsGeneratingApp(true);
        setProgressStage(job.current_stage || "Building");
setActivityStartedAt(Date.parse(job.created_at));
        setBuildFiles(
          Array.isArray(job.build_files)
            ? job.build_files as unknown as BuildFileProgress[]
            : [],
        );

        setBuildTimeline(
          Array.isArray(job.build_timeline)
            ? job.build_timeline.filter(
                (item): item is string => typeof item === "string",
              )
            : [],
        );
      } catch (error) {
        console.warn("Could not restore active build on this device", error);
      }
    };

    const unsubscribe = subscribeToActiveBuildJobs(
      session.user.id,
      (job) => {
        void restoreActiveBuild(job);
      },
    );
const unsubscribeSession = subscribeToStudioSession(
  session.user.id,
  (studio) => {
    if (!studio.active_build_job_id) return;

    void loadLatestActiveBuildJob(session.user.id)
      .then((job) => {
        if (job?.id === studio.active_build_job_id) {
          return restoreActiveBuild(job);
        }
      })
      .catch((error) => {
        console.warn("Could not restore build after session update", error);
      });
  },
);
    void loadLatestActiveBuildJob(session.user.id)
      .then((job) => {
        if (job) void restoreActiveBuild(job);
      })
      .catch((error) => {
        console.warn("Could not find an active account build", error);
      });

   return () => {
  disposed = true;
  unsubscribe();
  unsubscribeSession();
};
  }, [authReady, session?.user.id, projectId, lastCode]);


  useEffect(() => {
    if (!authReady || !session?.user.id) return;
    const refreshActiveProject = async (changedProjectId?: string) => {
      if (!projectId || (changedProjectId && changedProjectId !== projectId)) return;
      if (document.activeElement?.id === "app-prompt") return;
      try {
        const remote = await loadProject(projectId, session.user.id);
        const remoteChanged = remote.code !== lastSyncedCode;
        const localAlsoChanged = lastCode !== lastSyncedCode;
        const remotePromptChanged = remote.prompt !== lastSyncedPromptRef.current;
   const localPromptChanged = promptDirtyRef.current;
        const remoteTitleChanged = remote.title !== lastSyncedTitleRef.current;
        const localTitleChanged = currentTitleRef.current !== lastSyncedTitleRef.current;
        const remoteMessagesChanged = JSON.stringify(remote.messages) !== lastSyncedMessagesRef.current;
        const localMessagesChanged = JSON.stringify(currentMessagesRef.current) !== lastSyncedMessagesRef.current;
        if (promptDirtyRef.current && remote.prompt !== currentPromptRef.current) return;
        if (
          (remoteChanged && localAlsoChanged && remote.code !== lastCode) ||
          (remotePromptChanged && localPromptChanged && remote.prompt !== currentPromptRef.current) ||
          (remoteTitleChanged && localTitleChanged && remote.title !== currentTitleRef.current) ||
          (remoteMessagesChanged && localMessagesChanged && JSON.stringify(remote.messages) !== JSON.stringify(currentMessagesRef.current))
        ) {
          toast({ title: "Project updated elsewhere", description: "Another session saved changes. Your local unsaved work was kept; reload the project to compare.", variant: "destructive" });
          return;
        }
        setProjectTitle(remote.title);
        setTitleManuallyEdited(remote.title !== "Untitled Project");
      
        setLastCode(remote.code);
        setLastSyncedCode(remote.code);
        setProjectUpdatedAt(remote.updated_at);
        lastSyncedPromptRef.current = remote.prompt;
        lastSyncedTitleRef.current = remote.title;
        lastSyncedMessagesRef.current = JSON.stringify(remote.messages);
        setMessages(remote.messages);
        setDoc(buildDocFromPrompt(remote.prompt, remote.code));
        const remoteVersions = await loadProjectVersions(remote.id, session.user.id);
        setVersions(remoteVersions);
      } catch (error) {
        if (
          (typeof error === "object" && error !== null && "code" in error && error.code === "PGRST116") ||
          (error instanceof Error && /not found|deleted|changed|json object requested|0 rows/i.test(error.message))
        ) {
          setProjectId(null);
          setProjectTitle("Untitled Project");
          setPrompt("");
          setLastCode(null);
          setLastSyncedCode(null);
          setProjectUpdatedAt(null);
          setMessages([]);
          setVersions([]);
          setDoc(buildDocFromPrompt(""));
          toast({ title: "Project deleted elsewhere", description: "This project was removed from your workspace." });
        }
      }
    };
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") void refreshActiveProject();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    const unsubscribe = subscribeToProjectSync(session.user.id, {
      refreshProjects: async () => {},
      refreshProject: refreshActiveProject,
      refreshVersions: async (changedProjectId) => {
        if (changedProjectId !== projectId) return;
        setVersions(await loadProjectVersions(changedProjectId, session.user.id));
      },
      onDisconnected: () => { void refreshActiveProject(); },
    });
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
      unsubscribe();
    };
  }, [authReady, session?.user.id, projectId, lastCode, lastSyncedCode]);
  useEffect(() => {
    if (!authReady || !session?.user.id || !projectId) return;

    let disposed = false;

    const applyDurableJob = async (job: DurableBuildJob) => {
      if (disposed) return;

      const active = ["queued", "running", "retrying"].includes(job.status);

      if (active) {
        durableQueueAcceptedRef.current = true;
        setIsBuilding(true);
        setIsGeneratingApp(true);
        setActivityStartedAt(Date.parse(job.created_at));
        setProgressStage(job.current_stage || "Building");

        setBuildFiles(
          Array.isArray(job.build_files)
            ? job.build_files as unknown as BuildFileProgress[]
            : []
        );

        setBuildTimeline(
          Array.isArray(job.build_timeline)
            ? job.build_timeline.filter((item): item is string => typeof item === "string")
            : []
        );

        if (job.working_code) {
          setWorkingCode(job.working_code);
        }

        return;
      }

      if (job.status === "completed") {
        durableQueueAcceptedRef.current = false;
        setIsBuilding(false);
        setIsGeneratingApp(false);
        setProgressStage("Completed");

        try {
          const remote = await loadProject(projectId, session!.user.id);
          if (disposed) return;

          setProjectTitle(remote.title);
          setTitleManuallyEdited(true);
        
          setLastCode(remote.code);
          setWorkingCode(remote.code);
          setLastSyncedCode(remote.code);
          setProjectUpdatedAt(remote.updated_at);
          lastSyncedPromptRef.current = remote.prompt;
          lastSyncedTitleRef.current = remote.title;
          lastSyncedMessagesRef.current = JSON.stringify(remote.messages);
          setMessages(remote.messages);
          setDoc(buildDocFromPrompt(remote.prompt, remote.code));

          const remoteVersions = await loadProjectVersions(remote.id, session!.user.id);
          if (!disposed) setVersions(remoteVersions);
        } catch (error) {
          if (!disposed) {
            toast({
              title: "Build completed, but project refresh failed",
              description: error instanceof Error ? error.message : "Reload the project to see the final result.",
              variant: "destructive",
            });
          }
        }

        return;
      }

      if (job.status === "failed" || job.status === "cancelled") {
        durableQueueAcceptedRef.current = false;
        setIsBuilding(false);
        setIsGeneratingApp(false);
        setProgressStage(job.status === "failed" ? "Failed" : "Stopped");

        if (job.error) {
          toast({
            title: job.status === "failed" ? "Build failed" : "Build stopped",
            description: job.error,
            variant: "destructive",
          });
        }
      }
    };

    const unsubscribe = subscribeToBuildJob(projectId, (job) => {
      void applyDurableJob(job);
    });

    void loadLatestBuildJob(projectId, session.user.id)
      .then((job) => {
        if (job) void applyDurableJob(job);
      })
      .catch((error: unknown) => {
        console.warn("Could not load the latest durable build job", error);
      });

  return () => {
  disposed = true;
  unsubscribe();
};
  }, [authReady, session?.user.id, projectId]);
  useEffect(() => {
   if (!authReady || !user || !session?.user.id || !projectId || lastCode === null || durableQueueAcceptedRef.current) return;
    const timeout = window.setTimeout(() => {
      void persistProject({ projectId, userId: session.user.id, title: projectTitle, prompt, code: lastCode, messages, expectedUpdatedAt: projectUpdatedAt ?? undefined })
        .then(async (savedId) => {
          const authoritative = await loadProject(savedId, session.user.id);
          setProjectUpdatedAt(authoritative.updated_at);
          setLastSyncedCode(authoritative.code);
          lastSyncedPromptRef.current = authoritative.prompt;
          lastSyncedTitleRef.current = authoritative.title;
          lastSyncedMessagesRef.current = JSON.stringify(authoritative.messages);
          promptDirtyRef.current = false;
        })
        .catch((error: unknown) => toast({ title: "Project auto-save failed", description: error instanceof Error ? error.message : "Your latest changes could not be saved.", variant: "destructive" }));
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [authReady, user, session?.user.id, projectId, projectTitle, prompt, lastCode, messages]);

  const refreshQuality = (overrides: { code?: string | null; reviewFindings?: QualityState["reviewFindings"]; runtimeErrors?: RuntimeIssue[]; repairAttempts?: RepairAttempt[]; previewStatus?: "idle" | "pending" | "mounted" | "error"; previewSummary?: string } = {}) => {
    const code = overrides.code ?? lastCode ?? "";
    const runtimeErrors = overrides.runtimeErrors ?? runtimeIssuesRef.current;
    const repairAttempts = overrides.repairAttempts ?? repairAttemptsRefState.current;
    const status = overrides.previewStatus ?? previewRuntime.status;
    let previewSummary = overrides.previewSummary ?? "";
    if (!previewSummary) {
      if (status === "mounted") previewSummary = "Preview mounted successfully (live runtime mount verified).";
      else if (status === "error") previewSummary = "Preview runtime error reported (live verification failed).";
      else if (status === "pending") previewSummary = "Static/project validation passed. Live preview mount/runtime verification pending.";
      else previewSummary = "Live preview verification not started.";
    }
    const previewCheckStatus: CheckStatus = status === "mounted" ? "passed" : status === "error" ? "failed" : status === "pending" ? "running" : "idle";
    const next = buildQualityState({ code, prompt, reviewFindings: overrides.reviewFindings ?? qualityState.reviewFindings, runtimeErrors, repairAttempts, previewHealth: { status: previewCheckStatus, summary: previewSummary } });
    setQualityState(next);
    return next;
  };

  const runQualityChecks = async () => {
    if (!lastCode) {
      toast({ title: "No project to check", description: "Build or load a project first." });
      return;
    }
    setQualityRunning(true);
    try {
      // Deterministic/static checks run in-browser; build/TS/full test execution are reported as unsupported where no toolchain exists.
      refreshQuality({ code: lastCode });
      toast({ title: "Quality checks updated", description: "Static validation, structure analysis, and preview/runtime signals evaluated." });
    } finally {
      setQualityRunning(false);
    }
  };

  const rollbackRepairAttempt = async (attempt: RepairAttempt) => {
    if (!attempt.beforeCode) return;
    try {
      await snapshotCode(lastCode, `Before rollback of repair: ${attempt.issue}`);
    } catch {
      // best effort snapshot; user already confirmed rollback
    }
    const rolled = repairAttemptsRefState.current.map((a) => a.id === attempt.id ? { ...a, rolledBack: true, summary: `${a.summary} Rolled back by user.` } : a);
    repairAttemptsRefState.current = rolled;
    setLastCode(attempt.beforeCode);
    setWorkingCode(attempt.beforeCode);
    setDoc(buildDocFromPrompt(prompt, attempt.beforeCode));
    refreshQuality({ code: attempt.beforeCode, repairAttempts: rolled });
    toast({ title: "Rolled back", description: "Restored the previous working version for this repair attempt." });
  };

  const performRepair = async (issue: string, source: "manual" | "auto" | "preview") => {
    if (!lastCode) return { ok: false as const, reason: "no-code" };
    if (!canAttemptRepair(repairAttemptsRefState.current, issue)) {
      const msg = `Repair stopped after ${MAX_REPAIR_ATTEMPTS_PER_ISSUE} attempts for this issue: ${issue}`;
      const stopped: RepairAttempt = { id: `repair-stop-${Date.now()}`, issue, attempt: MAX_REPAIR_ATTEMPTS_PER_ISSUE, maxAttempts: MAX_REPAIR_ATTEMPTS_PER_ISSUE, at: Date.now(), status: "stopped", changedPaths: [], summary: msg, beforeCode: lastCode };
      repairAttemptsRefState.current = [...repairAttemptsRefState.current, stopped];
      refreshQuality({ repairAttempts: repairAttemptsRefState.current });
      return { ok: false as const, reason: "limit" };
    }
    const attemptNo = attemptsForIssue(repairAttemptsRefState.current, issue) + 1;
    const started = createRepairAttempt(issue, attemptNo, lastCode);
    repairAttemptsRefState.current = [...repairAttemptsRefState.current, started];
    refreshQuality({ repairAttempts: repairAttemptsRefState.current });
    const generationSettings = readGenerationSettings();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 70_000);
    try {
      // Likely root cause (evidence-based hint) to guide targeted repair without speculative claims.
      const rootCause = issue.toLowerCase().includes("blank") ? "Likely render/mount failure or runtime error preventing output." : issue.toLowerCase().includes("import") ? "Likely broken/missing import or unresolved module reference." : issue.toLowerCase().includes("type") || issue.toLowerCase().includes("undefined") ? "Likely null/undefined access or typing/runtime contract mismatch." : "Likely localized implementation defect related to the reported error.";
      const projectKey = chatKey;
      const understanding = lastCode ? understandProject(lastCode, projectId) : null;
      const memory = readProjectMemory(projectKey);
      const { data, error } = await supabase.functions.invoke("Appigen", {
        body: {
          mode: "repair",
          provider: generationSettings.provider,
          model: generationSettings.model,
          code: lastCode,
          error: `${issue}\nLikely root cause (hypothesis): ${rootCause}\nRepair constraints: make the smallest targeted fix in affected files only, preserve unrelated working files/features/architecture, do not silently overwrite unrelated files.`,
          projectUnderstanding: understanding ? formatUnderstandingForPrompt(understanding) : undefined,
          projectMemory: memory ? formatMemoryForPrompt(memory, understanding) : undefined,
        },
        signal: controller.signal,
      });
      if (error) throw error;
      if (typeof data?.code !== "string" || !data.code.trim()) throw new Error("The repair function returned no updated project code.");
      const repairedCode = normalizeFileMarkers(data.code);
      const validationError = validateGeneratedCode(repairedCode);
      if (validationError) throw new Error(`Repair returned an invalid project: ${validationError}`);
      const changed = computeChangeRecord({ projectKey, before: started.beforeCode || "", after: repairedCode, prompt, reason: `Repair: ${issue}` }).changedPaths;
      await snapshotCode(started.beforeCode, `Before ${source} repair attempt ${attemptNo}: ${issue}`);
      const finalized = finalizeRepairAttempt(started, { success: true, afterCode: repairedCode, projectKey, prompt, reason: `Repair (${source}): ${issue}` });
      repairAttemptsRefState.current = repairAttemptsRefState.current.map((a) => a.id === started.id ? finalized : a);
      setLastCode(repairedCode);
      setWorkingCode(repairedCode);
      setDoc(buildDocFromPrompt(prompt, repairedCode));
      // re-run relevant checks after repair (static/validation/preview signals available)
      refreshQuality({ code: repairedCode, repairAttempts: repairAttemptsRefState.current, runtimeErrors: runtimeIssuesRef.current });
      toast({ title: "Repair applied", description: `Attempt ${attemptNo}/${MAX_REPAIR_ATTEMPTS_PER_ISSUE} updated ${changed.length ? changed.join(", ") : "project"} (validated).` });
      return { ok: true as const, changedPaths: changed };
    } catch (e: unknown) {
      const message = controller.signal.aborted ? "Repair timed out." : await getFunctionErrorMessage(e, "Repair failed.");
      const finalized = finalizeRepairAttempt(started, { success: false, afterCode: started.beforeCode, projectKey: chatKey, prompt, reason: `Repair failed: ${issue}`, error: message, rolledBack: false });
      // stop if limit reached (finalizeRepairAttempt marks stopped on last failed attempt)
      if (finalized.status === "stopped") {
        finalized.summary = `${finalized.summary} No further attempts for this issue.`;
      }
      repairAttemptsRefState.current = repairAttemptsRefState.current.map((a) => a.id === started.id ? finalized : a);
      refreshQuality({ repairAttempts: repairAttemptsRefState.current });
      toast({ title: finalized.status === "stopped" ? "Repair stopped" : "Repair attempt failed", description: finalized.status === "stopped" ? `Unresolved after ${MAX_REPAIR_ATTEMPTS_PER_ISSUE} attempts: ${message}` : message, variant: "destructive" });
      return { ok: false as const, reason: finalized.status };
    } finally {
      window.clearTimeout(timeout);
    }
  };

  // Phase 9/5: autonomous repair loop with per-issue tracking (max 3), safety and quality updates.
  const lastReportedRef = useRef<string>("");
  const isRepairingRef = useRef(false);

  const handlePreviewRuntime = (event: { kind: "ready" | "error"; message?: string; stack?: string; errorKind?: string }) => {
    if (event.kind === "ready") {
      setPreviewRuntime({ status: "mounted" });
      const hadErrors = runtimeIssuesRef.current.some((e) => ["error", "promise", "compile", "render", "blank"].includes(e.kind));
      refreshQuality({ runtimeErrors: runtimeIssuesRef.current, previewStatus: hadErrors ? "error" : "mounted", previewSummary: hadErrors ? "Preview mounted but runtime issues were reported." : "Preview mounted successfully (live runtime mount verified)." });
      const pending = pendingBuildRef.current;
      if (pending) {
        pendingBuildRef.current = null;
        setBuildTimeline((current) => [...current, "Live preview mounted successfully"]);
        setMessages((current) => {
          const idx = [...current].reverse().findIndex((m) => m.role === "assistant" && m.content.includes("Live preview verification: pending"));
          if (idx === -1) return current;
          const real = current.length - 1 - idx;
          return current.map((m, i) => i === real ? { ...m, content: m.content.replace(/\n\nLive preview verification: pending[^\n]*/g, "\n\nLive preview verification: mounted successfully.") } : m);
        });
        toast({ title: pending.editMode ? "Preview verified" : "App ready", description: `${pending.title} mounted in preview.` });
      }
      return;
    }
    const kind = event.errorKind || "error";
    const msg = String(event.message || "Preview runtime error");
    runtimeIssuesRef.current = mergeRuntimeError(runtimeIssuesRef.current, { kind, message: msg, stack: event.stack });
    setPreviewRuntime({ status: "error", message: msg, errorKind: kind });
    refreshQuality({ runtimeErrors: runtimeIssuesRef.current, previewStatus: "error", previewSummary: `Preview runtime ${kind}: ${msg}` });
    if (["error", "promise", "compile", "render", "blank"].includes(kind)) {
      setBuildTimeline((current) => [...current, `Preview ${kind}: ${msg.slice(0, 120)}`]);
      if (pendingBuildRef.current) {
        setMessages((current) => current.map((message, index) => {
          if (index !== current.length - 1 || message.role !== "assistant" || !message.content.includes("Live preview verification: pending")) return message;
          return { ...message, content: message.content.replace(/Live preview verification: pending[^\n]*/g, `Live preview verification: failed (${kind}: ${msg.slice(0, 160)}).`) };
        }));
      }
    }
  };

  // Autonomous targeted repair on preview/runtime failures (max 3 attempts per issue). Runtime state is reported via handlePreviewRuntime.
  useEffect(() => {
    const onMsg = async (ev: MessageEvent) => {
      const previewWindow = document.querySelector<HTMLIFrameElement>('iframe[title="AppiGen Sandbox Preview"]')?.contentWindow;
      if (!previewWindow || ev.source !== previewWindow) return;
      const m = ev.data as { __appigen?: boolean; kind?: string; message?: string; stack?: string } | null;
      if (!m || typeof m !== "object" || !m.__appigen) return;
      const kind = String(m.kind || "");
      if (!["error", "compile", "promise", "blank", "render"].includes(kind)) return;
      if (!lastCode || isRepairingRef.current) return;
      const issue = `${kind}: ${String(m.message || "Preview failure").slice(0, 400)}`;
      const sig = `${kind}::${m.message}`;
      if (sig === lastReportedRef.current) return;
      lastReportedRef.current = sig;
      if (!canAttemptRepair(repairAttemptsRefState.current, issue)) return;
      isRepairingRef.current = true;
      try {
        await performRepair(issue, "preview");
      } finally {
        isRepairingRef.current = false;
        lastReportedRef.current = "";
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCode, prompt, projectId, chatKey]);

  const handleDownload = async () => {
    try {
      const backendState = readGeneratedBackendState(chatKey);
      const publicEnv: Record<string, string> = {};
      for (const v of backendState?.envVars ?? []) {
        if (!v.isSecret && v.publicValue) publicEnv[v.key] = v.publicValue;
      }
      const blob = await createRunnableProjectZip({
        title: projectTitle,
        prompt: prompt || messages.filter((m) => m.role === "user").at(-1)?.content || "",
        code: lastCode || "",
        backend: {
          mode: backendState?.mode ?? "shared",
          generatedAppId: backendState?.generatedAppId ?? (projectId || chatKey),
          supabaseUrl: SUPABASE_URL || undefined,
          supabaseAnonKey: SUPABASE_PUBLISHABLE_KEY || undefined,
          publicEnv,
        },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${slugify(projectTitle)}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "📦 ZIP ready", description: `${slugify(projectTitle)}.zip` });
    } catch (error: unknown) {
      toast({ title: "Download failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    }
  };

  const saveActivity = (entry: Parameters<typeof recordActivity>[1]) => {
    if (!session?.user.id) return;
    const activity = recordActivity(session.user.id, entry);
    void persistActivity(session.user.id, activity).catch((error: unknown) => {
      toast({ title: "Activity was not synced", description: error instanceof Error ? error.message : "Your activity could not be saved to your account.", variant: "destructive" });
    });
  };

  const handleBuild = async (stage?: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast({ title: "Prompt is empty", description: "Describe the app you want to build first.", variant: "destructive" });
      return;
    }
        // If a durable build is already active, append this prompt to that same build.
    if (session?.user?.id) {
      try {
        const activeJob = await loadLatestActiveBuildJob(session.user.id);

        if (activeJob) {
          const submitted: ChatMessage = {
            role: "user",
            content: trimmed,
            timestamp: Date.now(),
          };

          const payload = (activeJob.request_payload ?? {}) as Record<string, unknown>;
          const storedMessages = Array.isArray(payload.messages)
            ? payload.messages as ChatMessage[]
            : messages;

          const updatedMessages = [...storedMessages, submitted];

          const { error } = await supabase.rpc(
            "submit_appigen_build_prompt_update",
            {
              p_job_id: activeJob.id,
             p_prompt: trimmed,
              p_messages: updatedMessages,
            }
          );

          if (error) throw error;

          setProjectId(activeJob.project_id);
          setMessages(updatedMessages);
          setPrompt("");
          setIsBuilding(true);
          setIsGeneratingApp(true);
          setView("studio");
          setSidebarActiveView("studio");
          setMobileStudioTab("chat");

          void saveStudioSession({
            userId: session.user.id,
            projectId: activeJob.project_id,
            title: typeof payload.title === "string" ? payload.title : projectTitle,
            prompt: "",
            messages: updatedMessages,
            activeBuildJobId: activeJob.id,
          }).catch((error) => {
            console.warn("Studio session sync failed:", error);
          });

          toast({
            title: "Prompt added",
            description: "Your change will be applied to the current build.",
          });

          return;
        }
      } catch (error) {
        toast({
          title: "Could not add prompt",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
        return;
      }
    }
    lastReportedRef.current = "";
    isRepairingRef.current = false;

    const fallbackIntent = analyzeIntent(trimmed, {
      hasExistingProject: Boolean(lastCode),
      conversation: messages.slice(-12).map(({ role, content }) => ({
        role,
        content,
      })),
    });

    const generationSettings = readGenerationSettings();
      let intent = fallbackIntent;
    let effectivePrompt = trimmed;

    try {
      const { data, error } = await supabase.functions.invoke("Appigen", {
        body: {
          mode: "understand",
          provider: generationSettings.provider,
          model: generationSettings.model,
         prompt: effectivePrompt,
          code: lastCode ?? "",
          conversation: messages.slice(-12).map(({ role, content }) => ({
            role,
            content,
          })),
        },
      });

      if (error) throw error;

      const result = data?.understanding;
      if (result && typeof result.shouldBuild === "boolean") {
        const allowedIntents = [
          "general_conversation",
          "question",
          "explanation",
          "app_planning",
          "new_app_creation",
          "existing_project_edit",
          "follow_up_modification",
          "bug_fixing",
          "clarification",
          "undo_revert",
          "feature_discussion",
        ] as const;

        intent = {
          ...fallbackIntent,
          intent: allowedIntents.includes(result.intent)
            ? result.intent
            : fallbackIntent.intent,
          shouldBuild: result.shouldBuild,
          isQuestion: result.isQuestion === true,
          needsClarification: result.needsClarification === true,
        };

        if (
          typeof result.resolvedPrompt === "string" &&
          result.resolvedPrompt.trim()
        ) {
          effectivePrompt = result.resolvedPrompt.trim();
        }
      }
    } catch (error) {
      console.warn(
        "AI conversation understanding unavailable; using local fallback:",
        error,
      );
    }
   

    const editMode = Boolean(lastCode) && !isNewAppPrompt(trimmed);
    const clarifyFirst = intent.needsClarification;
    const questionMode = !intent.shouldBuild || clarifyFirst;
    const buildStartedAt = Date.now();
    

    // Prevent duplicate account-level builds.
    if (!questionMode && session?.user?.id) {
      const activeJob = await loadLatestActiveBuildJob(session.user.id);
      if (activeJob) {
        setIsBuilding(false);
        setIsGeneratingApp(false);
        toast({
          title: "A build is already active",
          description: "Your existing build is running on this account. Open that project or wait for it to finish before starting another build.",
          variant: "destructive",
        });
        return;
      }
    }

    const activityId = createActivityId(); 
    let planTitleApplied = "";
    setActivityStartedAt(buildStartedAt);
    const explanationText = intentSummary(intent.intent);
    setActivityExplanation(explanationText);
    let resolvedExplanation = explanationText;
    buildFilesRef.current = [];
    buildTimelineRef.current = [];
    const baseMessages = editMode ? messages : [];
    const submitted: ChatMessage = { role: "user", content: trimmed, timestamp: Date.now() };
    const nextMessages = [...baseMessages, submitted];
    let buildMessages = nextMessages;
    let versionsAfterBuild = versions;
    setMessages(nextMessages);
    setPrompt("");
    promptDirtyRef.current = false;
    if (clarifyFirst) {
      setMessages([...nextMessages, { role: "assistant", content: CLARIFY_NEW_APP, timestamp: Date.now() }]);
      setPrompt("");
     
      setActivityStartedAt(undefined);
      setActivityExplanation(undefined);
      setBuildTimeline([]);
      toast({ title: "Add a little detail", description: "Name the app or page you want and I will start building." });
      return;
    }
    promptDirtyRef.current = false;
    if (!editMode) {
      versionsAfterBuild = [];
      setVersions([]);
      setProjectTitle(suggestProjectTitle(trimmed));
      setTitleManuallyEdited(false);
    }
    if (!questionMode) {
  setView("studio");
  setSidebarActiveView("studio");
}
    setMobileStudioTab(questionMode ? "chat" : "preview");
    setProgressStage("Planning");
    setBuildTimeline(["Planning implementation", `Request type: ${intent.intent}`]);
    const projectKey = chatKey;
    const baseCodeForEdit = lastCode;
    const understanding = (editMode || Boolean(baseCodeForEdit)) && baseCodeForEdit ? understandProject(baseCodeForEdit, projectId) : null;
    const existingMemory = (editMode || Boolean(baseCodeForEdit)) ? readProjectMemory(projectKey) : null;
    const recentChanges = (editMode || Boolean(baseCodeForEdit)) ? readProjectChangeRecords(projectKey) : [];
    const recentChangeSummary = recentChanges[0] ? formatChangeRecord(recentChanges[0]) : "";
    const followUp = resolveFollowUp(effectivePrompt, {
      hasExistingProject: Boolean(baseCodeForEdit),
      recentFiles: recentChanges.flatMap((record) => record.changedPaths),
      lastAssistantMessage: [...messages].reverse().find((message) => message.role === "assistant" && message.kind !== "activity")?.content,
    });
    const followUpText = followUp.referencesPrevious
      ? `Follow-up references: ${followUp.undo ? "revert the previous change; " : ""}${followUp.mentionedFiles.length ? `target files: ${followUp.mentionedFiles.join(", ")}` : "the previous change"}${followUp.previousFileContext ? `\nPrevious assistant summary: ${followUp.previousFileContext}` : ""}`
      : "";
    const memoryPreview = (editMode || Boolean(baseCodeForEdit)) ? updateProjectMemory({ existing: existingMemory, projectKey, projectId, title: projectTitle, understanding, messages: nextMessages,prompt: effectivePrompt }) : null;
    if (understanding) setBuildTimeline((current) => [...current, `Understood project: ${understanding.architectureSummary}`]);
    if (memoryPreview?.conflicts.length) setBuildTimeline((current) => [...current, `Potential conflicts detected: ${memoryPreview.conflicts[0]}`]);
    const clarificationNeeded = (memoryPreview?.clarifications ?? []).filter((item) => !/too ambiguous/i.test(item) || trimmed.split(/\s+/).length < 4);
    if (questionMode && intent.needsClarification) clarificationNeeded.push("Please clarify what should change and where in the current project.");
    if (!questionMode && clarificationNeeded.length) {
      setMessages((current) => [...current, { role: "assistant", content: `I need clarification before making targeted changes:\n${clarificationNeeded.map((c) => `- ${c}`).join("\n")}\n\nPlease specify the target behavior/file or confirm the intended change so I can preserve unrelated functionality.`, timestamp: Date.now() }]);
      toast({ title: "Clarification needed", description: clarificationNeeded[0] });
     setIsBuilding(false);
setIsGeneratingApp(false);
      return;
    }
    const understandingText = understanding ? formatUnderstandingForPrompt(understanding) : "";
    const memoryText = memoryPreview ? formatMemoryForPrompt(memoryPreview, understanding) : "";
  durableQueueAcceptedRef.current = false;
setIsBuilding(!questionMode);
setIsGeneratingApp(!questionMode);
    let generatedPreview = false;
 const controller = new AbortController();
abortRef.current = controller;
activeRequestModeRef.current = questionMode ? "chat" : "build";
    setBuildFiles([]);
    setChangeBaseCode(baseCodeForEdit);
    setWorkingCode(partialBuildRef.current?.prompt === effectivePrompt ? partialBuildRef.current.code : baseCodeForEdit);
    let buildProvider: string = generationSettings.provider;
    try {
      assertSupabaseFunctionAccess();
            if (!questionMode && session?.user?.id) {
        const durableTitle = editMode
          ? projectTitle
          : titleManuallyEdited
            ? projectTitle
            : suggestProjectTitle(trimmed);

        const durableProjectId = await persistProject({
          projectId: editMode ? projectId : null,
          userId: session.user.id,
          title: durableTitle,
        prompt: effectivePrompt,
          code: baseCodeForEdit ?? "",
          messages: nextMessages,
        });

        setProjectId(durableProjectId);

        const queuedMessage: ChatMessage = {
          role: "assistant",
          content: "Build accepted and queued. The background worker will continue generation.",
          timestamp: Date.now(),
        };

        const queuedMessages = [...nextMessages, queuedMessage];

    const queuedJob = await enqueueBuildJob({
          userId: session.user.id,
          projectId: durableProjectId,
          requestPayload: {
          prompt: effectivePrompt,
            provider: generationSettings.provider,
            model: generationSettings.model,
            existingProject: editMode,
            code: baseCodeForEdit ?? "",
            conversation: baseMessages.slice(-12),
            projectUnderstanding: understandingText,
            projectMemory: memoryText,
            changeSummary: recentChangeSummary,
            responseLanguage: intent.responseLanguage,
            intent: intent.intent,
            followUp: followUpText,
            system: [
              generationSettings.systemInstructions,
              responseLanguageInstruction(intent.responseLanguage),
            ].filter(Boolean).join("\n\n"),
            temperature: generationSettings.temperature,
            topP: generationSettings.topP,
            safety: generationSettings.safety,
            title: durableTitle,
            messages: queuedMessages,
          },
        });
              setActivityStartedAt(Date.parse(queuedJob.created_at));
durableQueueAcceptedRef.current = true;
setMessages(queuedMessages);

await saveStudioSession({
  userId: session.user.id,
  projectId: durableProjectId,
  title: durableTitle,
  prompt: "",
  messages: queuedMessages,
  activeBuildJobId: queuedJob.id,
});

setPrompt("");
        setProgressStage("Queued");
        setBuildTimeline(["Build successfully added to background queue"]);
        toast({
          title: "Build queued",
          description: "Your project is saved. Background generation has been started.",
        });
        return;
      }
      if (questionMode) {
        setProgressStage("Planning");
        setIsChatThinking(true);
        
        const { data: authData } = await supabase.auth.getSession();
        const accessToken = authData.session?.access_token ?? SUPABASE_PUBLISHABLE_KEY;

        const chatResponse = await fetch(`${SUPABASE_URL}/functions/v1/Appigen`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            mode: "chat",
            provider: generationSettings.provider,
          prompt: effectivePrompt,
            code: lastCode ?? "",
            conversation: baseMessages.slice(-12),
            model: generationSettings.model,
            system: [
              generationSettings.systemInstructions,
              responseLanguageInstruction(intent.responseLanguage),
            ].filter(Boolean).join("\n\n"),
            projectUnderstanding: understandingText,
            projectMemory: memoryText,
            changeSummary: recentChangeSummary,
            responseLanguage: intent.responseLanguage,
            intent: intent.intent,
          }),
          signal: controller.signal,
        });

        if (!chatResponse.ok) {
          const errorText = await chatResponse.text();
          throw new Error(errorText || `Chat request failed (${chatResponse.status}).`);
        }

        if (!chatResponse.body) {
          throw new Error("The conversation route returned no streaming response.");
        }

        const reader = chatResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
       let streamedAnswer = "";
let streamProvider = "";
let streamCompleted = false;
const assistantTimestamp = Date.now();

        const processStreamLine = (line: string) => {
          if (!line.startsWith("data:")) return;

          const payload = line.slice(5).trim();
          if (!payload) return;

          const event = JSON.parse(payload) as {
            type?: string;
            text?: string;
            provider?: string;
            error?: string;
          };

          if (event.type === "meta" && typeof event.provider === "string") {
            streamProvider = event.provider;
          }

          if (event.type === "delta" && typeof event.text === "string") {
            streamedAnswer += event.text;
            setMessages([
              ...nextMessages,
              {
                role: "assistant",
                content: streamedAnswer,
                timestamp: assistantTimestamp,
              },
            ]);
          }

if (event.type === "done") {
  streamCompleted = true;
}

if (event.type === "error") {
  throw new Error(event.error || "The streaming response failed.");
}
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            processStreamLine(line.replace(/\r$/, ""));
          }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
          processStreamLine(buffer.replace(/\r$/, ""));
        }
if (!streamCompleted) {
  throw new Error("The conversation stream ended before completion.");
}

if (!streamedAnswer.trim()) {
  throw new Error("The conversation route returned no answer.");
}

        const completedMessages = [
          ...nextMessages,
          {
            role: "assistant" as const,
            content: streamedAnswer.trim(),
            timestamp: assistantTimestamp,
          },
        ];

        setMessages(completedMessages);
        setPrompt("");

        if (user && session?.user.id && projectId && lastCode) {
          await persistProject({
            projectId,
            userId: session.user.id,
            title: projectTitle,
            prompt,
            code: lastCode,
            messages: completedMessages,
            expectedUpdatedAt: projectUpdatedAt ?? undefined,
          });
        } else if (!user && lastCode) {
          writeProjectDraft({
            projectId: null,
            title: projectTitle,
            prompt,
            code: lastCode,
            messages: completedMessages,
            versions,
            updatedAt: Date.now(),
          });
        }

        toast({
          title: "Answer ready",
          description: streamProvider ? `Completed by ${streamProvider}.` : undefined,
        });
        return;

 
      }
      setProgressStage("Inspecting existing files");
      setBuildTimeline((current) => [...current, "Inspecting existing files"]);
      setProgressStage("Planning");
      setBuildTimeline((current) => [...current, "Creating the implementation plan"]);
      const { data: planData, error: planError } = await supabase.functions.invoke("Appigen", {
        body: {
          mode: "plan",
          provider: generationSettings.provider,
          prompt: effectivePrompt,
          stage,
          model: generationSettings.model,
          system: [generationSettings.systemInstructions, responseLanguageInstruction(intent.responseLanguage)].filter(Boolean).join("\n\n"),
          safety: generationSettings.safety,
          temperature: generationSettings.temperature,
          topP: generationSettings.topP,
          existingProject: editMode,
          ...(editMode ? { code: lastCode } : {}),
          conversation: baseMessages.slice(-12),
          projectUnderstanding: understandingText,
          projectMemory: memoryText,
          changeSummary: recentChangeSummary,
          responseLanguage: intent.responseLanguage,
          intent: intent.intent,
          followUp: followUpText,
        },
        signal: controller.signal,
      });
      if (planError) throw planError;
      const implementationPlan = planData?.plan?.implementationPlan as Record<string, unknown> | undefined;
      const planSummary = formatImplementationPlan(implementationPlan);
      if (!planSummary) throw new Error("The deployed Appigen Edge Function does not support the planning route.");
      const planDetails = planData?.plan?.implementationPlan as { title?: unknown; explanation?: unknown } | undefined;
      const planTitle = typeof planDetails?.title === "string" ? planDetails.title.trim().slice(0, 80) : "";
      const planExplanation = typeof planDetails?.explanation === "string" ? planDetails.explanation.trim().slice(0, 400) : "";
      if (planExplanation) { resolvedExplanation = planExplanation; setActivityExplanation(planExplanation); }
      if (!editMode && planTitle && !titleManuallyEdited) { planTitleApplied = planTitle; setProjectTitle(planTitle); }

const planMessageTimestamp = Date.now();

buildMessages = [
  ...nextMessages,
  {
    role: "assistant",
    content: planSummary,
    timestamp: planMessageTimestamp,
    events: [],
  },
];

setMessages(buildMessages);
      setMessages(buildMessages);
      setBuildTimeline((current) => [...current, "Implementation plan ready"]);
      let liveBuildEvents: BuildActivityEvent[] = [];

const publishBuildEvents = (nextEvents: BuildActivityEvent[]) => {
  liveBuildEvents = nextEvents;

  setMessages((current) =>
    current.map((message) =>
      message.timestamp === planMessageTimestamp
        ? { ...message, events: nextEvents }
        : message,
    ),
  );
};

const addPlanEvent = (
  event: Omit<BuildActivityEvent, "id" | "startedAt">,
) => {
  const nextEvent = createBuildActivityEvent(event);
  publishBuildEvents([...liveBuildEvents, nextEvent]);
  return nextEvent.id;
};

const patchPlanEvent = (
  eventId: string,
  patch: Parameters<typeof updateBuildActivityEvent>[1],
) => {
  publishBuildEvents(
    liveBuildEvents.map((event) =>
      event.id === eventId
        ? updateBuildActivityEvent(event, patch)
        : event,
    ),
  );
};
      addPlanEvent({
  kind: "planning",
  status: "success",
  title: "Implementation plan ready",
  detail: "The requested changes have been organized into a file-by-file build plan.",
});
      const canResume = partialBuildRef.current?.prompt === effectivePrompt;
      let generatedCode = canResume
        ? partialBuildRef.current?.code ?? ""
        : editMode && lastCode ? normalizeFileMarkers(lastCode) : "";
      const blueprint = Array.isArray(implementationPlan?.fileBlueprint) ? implementationPlan.fileBlueprint as Array<{ path: string; purpose: string }> : [];
      if (!blueprint.length) throw new Error("The implementation plan did not include a file blueprint.");
      const recentlyChangedPaths = recentChanges.flatMap((record) => record.changedPaths).slice(0, 12);
      const plannedFiles = editMode && generatedCode
        ? selectFilesForEdit(generatedCode, effectivePrompt, { understanding, recentlyChanged: recentlyChangedPaths }).map((path) => blueprint.find((file) => file.path === path) ?? ({ path, purpose: `Apply the requested change to ${path}` }))
        : blueprint;
      if (editMode) setBuildTimeline((current) => [...current, `Targeted files: ${plannedFiles.map((f) => f.path).join(", ")}`]);
      const uniqueFiles = orderBuildFiles([...new Map(plannedFiles.map((file) => [file.path, file])).values()], { understanding: understanding ?? undefined });
      if (!uniqueFiles.length) throw new Error("The plan did not select any files to generate.");
      if (uniqueFiles.length > 1) setBuildTimeline((current) => [...current, `Build order: ${uniqueFiles.map((f) => f.path).join(" -> ")}`]);
      setBuildFiles(uniqueFiles.map(({ path, purpose }) => ({ path, purpose, status: "queued" })));
      const requiredPaths = editMode
        ? [...(generatedCode.matchAll(/^\s*\/\/\s*FILE:\s*([^\n]+)/gm))].map((match) => match[1].trim())
        : uniqueFiles.filter((file) => file.path === "src/App.tsx" || file.path === "src/App.jsx" || file.path === "src/styles.css").map((file) => file.path);

      const previouslyCompleted = new Set(canResume ? partialBuildRef.current?.completedPaths ?? [] : []);
      setBuildFiles(uniqueFiles.map(({ path, purpose }) => ({ path, purpose, status: previouslyCompleted.has(path) ? "completed" : "queued" })));
     const fileEventIds = new Map<string, string>();
      const buildResult = await runSequentialFileBuild({
        files: uniqueFiles,
        initialSource: generatedCode,
        completedPaths: [...previouslyCompleted],
        signal: controller.signal,
        retries: 1,
        generate: async (file) => {
          setProgressStage(`Generating ${file.path}`);
          const { data: fileData, error: fileError } = await supabase.functions.invoke("Appigen", {
            body: {
             mode: "build_file", prompt: effectivePrompt, file,
              requirements: Array.isArray(implementationPlan?.requirements) ? implementationPlan.requirements 	: [effectivePrompt],
              specification: implementationPlan?.specification ?? null,
              requirementTrace: Array.isArray(implementationPlan?.requirementTrace) ? implementationPlan.requirementTrace : [],
              fileTree: [...new Set([...requiredPaths, ...uniqueFiles.map(({ path }) => path)])],
              existingSource: editMode ? (lastCode ?? "").slice(0, 22000) : "",
              implementationContext: generatedCode.slice(-14000),
              architecture: `${planSummary}\nArchitecture strategy: ${typeof (implementationPlan?.architecture as { strategy?: string } | undefined)?.strategy === "string" ? (implementationPlan?.architecture as { strategy?: string }).strategy : "adaptive"}\nUser architecture instructions: ${generationSettings.systemInstructions ?? ""}\nResponse language: ${intent.responseLanguage}`,
              projectUnderstanding: understandingText,
              projectMemory: memoryText,
              changeSummary: recentChangeSummary,
              provider: generationSettings.provider, model: generationSettings.model,
              temperature: generationSettings.temperature, topP: generationSettings.topP,
              responseLanguage: intent.responseLanguage,
              intent: intent.intent,
              followUp: followUpText,
            },
            signal: controller.signal,
          });
          if (fileError) throw fileError;
          return validateBuildFileResponse(fileData, file.path);
        },
        validate: (file, result) => {
          const fileValidationError = validateGeneratedFile(result.path, result.content, [...new Set([...requiredPaths, ...uniqueFiles.map(({ path }) => path)])]);
          if (fileValidationError) throw new Error(fileValidationError);
          buildProvider = result.provider ?? buildProvider;
          setProgressStage(`Validating ${file.path}`);
        },
        merge: (source, file, result) => mergeGeneratedFile(source, file.path, result.content),
        onProgress: (event, source, completedPaths) => {
          setBuildFiles((current) => {
            const next = current.map((item) => item.path === event.path ? { ...item, ...event } : item);
            buildFilesRef.current = next;
            return next;
          });
          if (event.status === "generating") {
            setBuildTimeline((current) => [...current, `Creating ${event.path}`]);
            setProgressStage(`Generating ${event.path}`);
            const existingFileEventId = fileEventIds.get(event.path);

if (existingFileEventId) {
  patchPlanEvent(existingFileEventId, {
    status: "running",
    detail: "Generating file content.",
  });
} else {
  const fileEventId = addPlanEvent({
    kind: "file",
    status: "running",
    title: `Creating ${event.path}`,
    detail: "Generating file content.",
    filePath: event.path,
  });

  fileEventIds.set(event.path, fileEventId);
}
          } else if (event.status === "validating") {
            setBuildTimeline((current) => [...current, `Validating ${event.path}`]);
            setProgressStage(`Validating ${event.path}`);
            const validationEventId = addPlanEvent({
  kind: "validation",
  status: "running",
  title: `Checking ${event.path}`,
  detail: "Validating generated file structure and content.",
  filePath: event.path,
});

const previousValidationId = fileEventIds.get(`${event.path}:validation`);

if (previousValidationId) {
  patchPlanEvent(previousValidationId, {
    status: "success",
    detail: "Validation completed.",
  });
}

fileEventIds.set(`${event.path}:validation`, validationEventId);
          } else if (event.status === "retrying") {
            setBuildTimeline((current) => [...current, `Retrying ${event.path}${event.error ? `: ${event.error}` : ""}`]);
            setProgressStage(`Retrying ${event.path}`);
            const retryFileEventId = fileEventIds.get(event.path);

if (retryFileEventId) {
  patchPlanEvent(retryFileEventId, {
    status: "running",
    detail: `Retrying file generation. ${event.error ?? ""}`,
    endedAt: undefined,
  });
}

const retryValidationId = fileEventIds.get(
  `${event.path}:validation`,
);

if (retryValidationId) {
  patchPlanEvent(retryValidationId, {
    status: "warning",
    detail: "Previous validation attempt needs another check.",
  });
}
          } else if (event.status === "failed") {
            setBuildTimeline((current) => [...current, `Failed ${event.path}: ${event.error ?? "unknown error"}`]);
            const failedFileEventId = fileEventIds.get(event.path);

if (failedFileEventId) {
  patchPlanEvent(failedFileEventId, {
    status: "error",
    detail: event.error ?? "File generation failed.",
    endedAt: Date.now(),
  });
}

const failedValidationId = fileEventIds.get(
  `${event.path}:validation`,
);

if (failedValidationId) {
  patchPlanEvent(failedValidationId, {
    status: "error",
    detail: event.error ?? "File validation failed.",
    endedAt: Date.now(),
  });
}
          }
          if (event.status === "completed") {
            const completedFileEventId = fileEventIds.get(event.path);

if (completedFileEventId) {
  patchPlanEvent(completedFileEventId, {
    status: "success",
    detail: "File generated successfully.",
    endedAt: Date.now(),
  });
}
           const completedValidationId = fileEventIds.get(
  `${event.path}:validation`,
);

if (completedValidationId) {
  patchPlanEvent(completedValidationId, {
    status: "success",
    detail: "Validation completed successfully.",
    endedAt: Date.now(),
  });
} 
            setBuildTimeline((current) => [...current, `Completed ${event.path}`]);
            partialBuildRef.current = { prompt: trimmed, code: source, completedPaths };
            generatedCode = source;
            setWorkingCode(source);
            const count = completedPaths.length;
            setMessages((current) => current.map((message, messageIndex) => messageIndex === current.length - 1 && message.role === "assistant" && message.content.startsWith("Implementation plan")
              ? { ...message, content: `${planSummary}\n\nFiles completed: ${count}/${uniqueFiles.length}` }
              : message));
          }
        },
      });
      generatedCode = buildResult.source;
      const generatedValidationError = validateFileTree(generatedCode, requiredPaths) || validateGeneratedCode(generatedCode, !editMode);
      if (generatedValidationError) throw new Error(`The generated project is invalid: ${generatedValidationError}`);
const reviewEventId = addPlanEvent({
  kind: "review",
  status: "running",
  title: "Reviewing generated project",
  detail: "Checking the complete project for structural and implementation issues.",
});
      setProgressStage("Reviewing");
      setBuildTimeline((current) => [...current, "Reviewing the complete project"]);
      const { data: reviewData, error: reviewError } = await supabase.functions.invoke("Appigen", {
        body: {
          mode: "review",
          prompt: trimmed,
          code: generatedCode,
          plan: implementationPlan,
          existingProject: editMode,
          provider: buildProvider.split(":")[0],
          model: generationSettings.model,
          safety: generationSettings.safety,
        },
        signal: controller.signal,
      });
      if (reviewError) throw reviewError;
      if (typeof reviewData?.code !== "string" || !reviewData.code.trim()) throw new Error("The review stage returned no project source.");
      const aiReviewFindings = normalizeReviewFindings(reviewData?.findings);
      if (aiReviewFindings.length) setBuildTimeline((current) => [...current, ...aiReviewFindings.map((finding) => `Review finding — ${finding.path}: ${finding.issue}`)]);
      if (reviewData?.repairAttempted && Array.isArray(reviewData?.changedPaths)) setBuildTimeline((current) => [...current, ...reviewData.changedPaths.filter((path: unknown): path is string => typeof path === "string").map((path: string) => `Repaired ${path}`)]);
      generatedCode = normalizeFileMarkers(reviewData.code);
patchPlanEvent(reviewEventId, {
  status: "success",
  detail: aiReviewFindings.length
    ? `Review completed with ${aiReviewFindings.length} finding(s).`
    : "Project review completed successfully.",
  endedAt: Date.now(),
});
      setProgressStage("Validating");
      setBuildTimeline((current) => [...current, "Running final project validation"]);
      const validationError = validateFileTree(generatedCode, requiredPaths) || validateGeneratedCode(generatedCode, !editMode);
      if (validationError) throw new Error(`The reviewed project is invalid: ${validationError}`);
      partialBuildRef.current = null;
      let activityVersionId: string | undefined;
      if (editMode && lastCode) {
        const snapshot: LocalProjectVersion = { id: crypto.randomUUID(), code: lastCode, prompt: trimmed, createdAt: Date.now() };
        const nextVersion: LocalProjectVersion = { id: crypto.randomUUID(), code: generatedCode, prompt: trimmed, createdAt: Date.now() };
        versionsAfterBuild = [nextVersion, snapshot, ...versions].slice(0, 50);
        setVersions(versionsAfterBuild);
        writeLocalVersion(chatKey, snapshot);
        writeLocalVersion(chatKey, nextVersion);
        activityVersionId = nextVersion.id;
        if (user && projectId) {
          const { data: auth } = await supabase.auth.getUser();
          if (auth.user) {
            try {
              await createProjectVersion({ projectId, userId: auth.user.id, code: lastCode, prompt: trimmed, id: snapshot.id });
              await createProjectVersion({ projectId, userId: auth.user.id, code: generatedCode, prompt: trimmed, id: nextVersion.id });
            } catch (versionError) {
              toast({
                title: "Version saved locally",
                description: `Cloud version history could not be updated: ${versionError instanceof Error ? versionError.message : "Unknown error"}`,
                variant: "destructive",
              });
            }
          }
        }
      }
      setProgressStage("Updating preview");
      setBuildTimeline((current) => [...current, "Validation passed; updating preview"]);
      generatedPreview = true;
      runtimeIssuesRef.current = [];
      repairAttemptsRefState.current = [];
      const fileCount = [...generatedCode.matchAll(/^\s*\/\/\s*FILE:/gm)].length || 1;
      const validationSummary = getValidationSummary(Boolean(reviewData?.reviewSkipped), fileCount);
      const finalTitle = resolveProjectTitle({ editMode, planTitle: planTitleApplied, fallback: suggestProjectTitle(trimmed), currentTitle: projectTitle });
      if (finalTitle !== projectTitle) setProjectTitle(finalTitle);

      const changeRecord = (editMode || baseCodeForEdit)
        ? computeChangeRecord({ projectKey, before: baseCodeForEdit, after: generatedCode, prompt: trimmed, reason: editMode ? "Follow-up edit" : "Project update" })
        : null;
      if (changeRecord) {
        setBuildTimeline((current) => [...current, `Change tracking: ${changeRecord.summary}`]);
        writeProjectChangeRecord(projectKey, changeRecord);
      }
      const updatedMemory = updateProjectMemory({
        existing: readProjectMemory(projectKey),
        projectKey,
        projectId,
        title: finalTitle,
        understanding: understandProject(generatedCode, projectId),
        messages: buildMessages,
        prompt: trimmed,
        changedFiles: changeRecord?.changedPaths ?? [],
        changeSummary: changeRecord ? formatChangeRecord(changeRecord) : undefined,
      });
      writeProjectMemory(projectKey, updatedMemory);
      const memoryNote = updatedMemory.conflicts.length ? `\n\nPotential decision conflicts detected (preserved for review): ${updatedMemory.conflicts.join("; ")}` : "";
      pendingBuildRef.current = { title: finalTitle, provider: buildProvider, editMode, validationSummary, ...(changeRecord ? { changeSummary: formatChangeRecord(changeRecord) } : {}), ...(memoryNote ? { memoryNote } : {}) };
      const initialQuality = buildQualityState({
        code: generatedCode,
        prompt: trimmed,
        reviewFindings: aiReviewFindings,
        runtimeErrors: [],
        repairAttempts: [],
        previewHealth: { status: "running", summary: "Static/project validation passed. Awaiting live preview mount/runtime verification (pending)." },
      });
      setQualityState(initialQuality);
      setPreviewRuntime({ status: "pending" });
      setLastCode(generatedCode);
      setWorkingCode(generatedCode);
      setDoc(buildDocFromPrompt(trimmed, generatedCode));
      if (!editMode) {
        const initialVersion: LocalProjectVersion = { id: crypto.randomUUID(), code: generatedCode, prompt: trimmed, createdAt: Date.now() };
        versionsAfterBuild = [initialVersion];
        setVersions(versionsAfterBuild);
        activityVersionId = initialVersion.id;
      }
      const activityFiles = buildFilesRef.current.length ? buildFilesRef.current : uniqueFiles.map((file) => ({ path: file.path, purpose: file.purpose, status: "completed" as const }));
      const activityTimeline = buildTimelineRef.current;
      const finalActivity: BuildActivity = {
        id: activityId,
        status: "success",
        title: editMode ? "Updated your project" : "Built your project",
        stage: validationSummary,
        files: activityFiles,
        timeline: activityTimeline,
        startedAt: buildStartedAt,
        endedAt: Date.now(),
        versionId: activityVersionId,
        provider: buildProvider,
        validation: [validationSummary, `Validation passed for ${fileCount} source file${fileCount === 1 ? "" : "s"}`],
        errors: [],
      };
      const activityMessage: ChatMessage = { role: "assistant", content: finalActivity.title, kind: "activity", title: finalActivity.title, explanation: resolvedExplanation, activity: finalActivity, timestamp: Date.now() };
      const completedMessages = [...buildMessages, { role: "assistant" as const, content: editMode
        ? `Project updated. ${validationSummary}${changeRecord ? `\n\n${formatChangeRecord(changeRecord)}` : ""}${memoryNote}\n\nLive preview verification: pending (awaiting successful mount). I will report runtime errors if detected. Your previous version is available to restore.`
        : `Project generated. ${validationSummary}\n\nLive preview verification: pending (awaiting successful mount). I will report runtime errors if detected.`, timestamp: Date.now() }, activityMessage];
      setMessages(completedMessages);
      setPrompt("");

      if (user) {
        setProgressStage("Saving");
        setBuildTimeline((current) => [...current, "Saving project and version"]);
        const uid = session?.user.id;
        if (uid) {
          try {
            const savedId = await persistProject({
              projectId: editMode ? projectId : null,
              userId: uid,
              title: finalTitle,
              prompt: trimmed,
              code: generatedCode,
              messages: completedMessages,
              expectedUpdatedAt: editMode ? projectUpdatedAt ?? undefined : undefined,
            });
            setProjectId(savedId);
            setLastSyncedCode(generatedCode);
            const authoritative = await loadProject(savedId, uid);
            setProjectUpdatedAt(authoritative.updated_at);
            if (!editMode) {
              const initialVersion = await createProjectVersion({ projectId: savedId, userId: uid, code: generatedCode, prompt: trimmed, id: activityVersionId });
              setVersions([initialVersion]);
              writeLocalVersion(savedId, initialVersion);
            }
            discardProjectDraft();
          } catch (saveError) {
            const recoveryDraft = readProjectDraft();
            if (recoveryDraft?.ownerId === uid && recoveryDraft.code === generatedCode) {
              setProjectId(recoveryDraft.projectId);
            }
            toast({
              title: "Build complete, cloud save failed",
              description: saveError instanceof Error ? saveError.message : "Your project could not be saved. Keep this tab open and retry.",
              variant: "destructive",
            });
          }
        }
      } else {
        setProgressStage("Saving");
        if (!editMode && activityVersionId) {
          const initialVersion: LocalProjectVersion = { id: activityVersionId, code: generatedCode, prompt: trimmed, createdAt: Date.now() };
          versionsAfterBuild = [initialVersion];
          setVersions(versionsAfterBuild);
          writeLocalVersion(chatKey, initialVersion);
        }
        writeProjectDraft({ projectId: null, title: finalTitle, prompt: trimmed, code: generatedCode, messages: completedMessages, versions: versionsAfterBuild, updatedAt: Date.now() });
        setBuildTimeline((current) => [...current, "Saved local project draft"]);
      }

      addNotification({ kind: "build", title: editMode ? "Project updated" : "Project generated", description: `${finalTitle} · preview verification pending` });
      void trackAnonymousUsage("build_completed").catch((error: unknown) => console.warn("Anonymous usage telemetry could not be recorded:", error));
      saveActivity({
        kind: editMode ? "edit" : "build",
        title: editMode ? "Project updated (verification pending)" : "Project generated (verification pending)",
        detail: `${finalTitle} · ${buildProvider}`,
        durationMs: Date.now() - buildStartedAt,
        promptCharacters: trimmed.length,
      });
      toast({
        title: editMode ? "Project updated" : "Project generated",
        description: "Static/project validation passed. Awaiting live preview verification; errors will be reported if detected.",
      });
    } catch (err: unknown) {
            if (questionMode) {
        const wasAborted =
          (err instanceof Error && err.name === "AbortError") ||
          controller.signal.aborted;

        console.error("Chat response failed:", err);

        const message = wasAborted
          ? "Response stopped. You can send another message."
          : await getFunctionErrorMessage(
              err,
              "I couldn't complete that response."
            );

        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: message,
            timestamp: Date.now(),
          },
        ]);

        toast({
          title: wasAborted ? "Response stopped" : "Chat response failed",
          description: message,
        });

        return;
      }
      setSidebarHidden(false);
setSidebarPinned(true);
setSidebarOverlayOpen(false); 
      if ((err instanceof Error && err.name === "AbortError") || controller.signal.aborted) {
        const stoppedFiles = buildFilesRef.current.map((file) => file.status === "generating" || file.status === "validating" || file.status === "queued" || file.status === "retrying" ? { ...file, status: "failed" as const, error: "Stopped by user" } : file);
        buildFilesRef.current = stoppedFiles;
        setBuildFiles(stoppedFiles);
        const stoppedSummary = `${stoppedFiles.filter((file) => file.status === "completed").length}/${stoppedFiles.length} files completed`;
        const stoppedActivity: BuildActivity = {
          id: activityId,
          status: "stopped",
          title: "Stopped by user",
          stage: `${stoppedSummary}; remaining files were not generated.`,
          files: stoppedFiles,
          timeline: [...buildTimelineRef.current, "Stopped by user"],
          startedAt: buildStartedAt,
          endedAt: Date.now(),
          provider: buildProvider,
          validation: [],
          errors: [],
        };
        setMessages((current) => [...current,
          { role: "assistant", content: `Build stopped by you. ${stoppedSummary}. Completed files are kept and this prompt can resume safely.`, timestamp: Date.now() },
          { role: "assistant", content: stoppedActivity.title, kind: "activity", title: stoppedActivity.title, explanation: resolvedExplanation, activity: stoppedActivity, timestamp: Date.now() },
        ]);
        toast({ title: "Build stopped", description: `Stopped after ${stoppedSummary}. Your prompt is still here; you can try again.` });
        return;
      }
      setBuildFiles((current) => current.map((file) => file.status === "generating" || file.status === "validating" ? { ...file, status: "failed", error: err instanceof Error ? err.message : "Generation failed" } : file));
      console.error("Build failed:", err);
      const errorMessage = await getFunctionErrorMessage(err, "Something went wrong calling the AI.");
      const staleGenerator =
        errorMessage.includes("does not support the planning route") ||
        errorMessage.includes("generic sample") ||
        (errorMessage.includes("generated project is invalid") &&
          /missing src\/styles\.css|missing a focused screen|missing reusable UI|must import its app-specific|must compose a page|reusable component from src\/components/i.test(errorMessage));
      const msg = staleGenerator
        ? `The deployed Appigen Edge Function is outdated or returned a generic project. Deploy the latest function before building again. Your prompt and current preview were kept unchanged.${errorMessage.includes("generated project is invalid") ? ` Validation: ${errorMessage.replace("The generated project is invalid: ", "")}` : ""}`
        : errorMessage;
      const failedFiles = buildFilesRef.current.map((file) => file.status === "generating" || file.status === "validating" || file.status === "queued" || file.status === "retrying" ? { ...file, status: "failed" as const, error: file.error ?? msg } : file);
      buildFilesRef.current = failedFiles;
      const failedActivity: BuildActivity = {
        id: activityId,
        status: "error",
        title: "Build unsuccessful",
        stage: msg,
        files: failedFiles,
        timeline: [...buildTimelineRef.current, `Failed: ${msg}`],
        startedAt: buildStartedAt,
        endedAt: Date.now(),
        provider: buildProvider,
        validation: [],
        errors: [msg],
      };
      setMessages((current) => [...current,
        { role: "assistant", content: `Build failed: ${msg}`, timestamp: Date.now() },
        { role: "assistant", content: failedActivity.title, kind: "activity", title: failedActivity.title, explanation: resolvedExplanation, activity: failedActivity, timestamp: Date.now() },
      ]);
         } finally {
      if (!durableQueueAcceptedRef.current) {
        setIsChatThinking(false);
       abortRef.current = null;
activeRequestModeRef.current = null;
setIsBuilding(false);
        setIsGeneratingApp(false);
        setProgressStage("Planning");

        if (!generatedPreview && !lastCode) setMobileStudioTab("chat");

        window.setTimeout(() => {
          const desktop = window.matchMedia("(min-width: 768px)").matches;
          if (desktop || mobileStudioTab === "chat") promptInputRef.current?.focus();
        }, 0);
      }
    }
  };
 const stopBuild = async () => {
  // Stop any local generation immediately.
abortRef.current?.abort();

if (activeRequestModeRef.current === "chat") {
  return;
}

const userId = session?.user.id;
  if (!userId) return;

  try {
    const activeJob = await loadLatestActiveBuildJob(userId);
    if (!activeJob) return;

    const { data, error } = await supabase.rpc(
      "cancel_appigen_build_job",
      { p_job_id: activeJob.id }
    );

    if (error) throw error;

    if (!data) {
      toast({
        title: "Build already finished",
        description: "There is no active build left to stop.",
      });
    }
  } catch (error) {
    toast({
      title: "Could not stop build",
      description: error instanceof Error ? error.message : "Please try again.",
      variant: "destructive",
    });
  }
};
  const handlePromptChange = (value: string) => {
    promptDirtyRef.current = true;
    setPrompt(value);
    if (!titleManuallyEdited) setProjectTitle(suggestProjectTitle(value));
    if (promptActivityTimer.current !== undefined) window.clearTimeout(promptActivityTimer.current);
    if (session?.user.id && value.trim()) {
      promptActivityTimer.current = window.setTimeout(() => {
        saveActivity({ kind: "prompt", title: "Prompt modified", detail: "Updated a build prompt" });
      }, 1400);
    }
  };
     const newProject = async () => {
    const userId = session?.user.id;

    try {
      let savedProjectId = projectId;

      // Preserve the current project and its complete conversation first.
      const preservedCode =
        workingCode ?? lastCode ?? partialBuildRef.current?.code ?? "";

      const hasProjectContent = Boolean(
        projectId ||
        prompt.trim() ||
        messages.length ||
        preservedCode.trim()
      );

      if (userId && hasProjectContent) {
        savedProjectId = await persistProject({
          projectId,
          userId,
          title: projectTitle,
          prompt,
          code: preservedCode,
          messages,
          expectedUpdatedAt: projectUpdatedAt ?? undefined,
        });

        // Pause only the build belonging to this project.
      const latestJob = await loadLatestBuildJob(savedProjectId, userId);

if (latestJob) {
  let pausedJob = latestJob;

  if (["queued", "running", "retrying"].includes(latestJob.status)) {
    const result = await pauseBuildJob(latestJob.id, userId);

    if (!result) {
      throw new Error(
        "The build status changed while saving. Please try New Project again."
      );
    }

    pausedJob = result;
  }

  // Save the latest incomplete build state before leaving this project.
  if (pausedJob.status === "paused") {
    await saveBuildCheckpoint(pausedJob.id, userId, {
      workingCode: preservedCode,
      buildFiles,
      buildTimeline,
      currentStage: progressStage,
    });
  }
}
      }

      // Detach the old project only after preservation succeeds.
      if (userId) {
        await saveStudioSession({
          userId,
          projectId: null,
          title: "Untitled Project",
          prompt: "",
          messages: [],
          activeBuildJobId: null,
        });
      }

      abortRef.current?.abort();
      abortRef.current = null;
      activeRequestModeRef.current = null;
      durableQueueAcceptedRef.current = false;

      if (chatKey === "local:current") clearLocalVersions(chatKey);

      partialBuildRef.current = null;
      buildFilesRef.current = [];
      buildTimelineRef.current = [];
      runtimeIssuesRef.current = [];
      repairAttemptsRefState.current = [];

      setProjectId(null);
      setProjectUpdatedAt(null);
      setLastSyncedCode(null);
      lastSyncedPromptRef.current = null;
      lastSyncedTitleRef.current = null;
      lastSyncedMessagesRef.current = null;
      lastStudioSessionSerializedRef.current = null;
      promptDirtyRef.current = false;

      setProjectTitle("Untitled Project");
      setTitleManuallyEdited(false);
      setPrompt("");
      setLastCode(null);
      setWorkingCode(null);
      setChangeBaseCode(null);
      setBuildFiles([]);
      setBuildTimeline([]);
      setMessages([]);
      setVersions([]);
      setQualityState(emptyQualityState());
      setDoc(buildDocFromPrompt(""));
      setActivityStartedAt(undefined);
      setActivityExplanation(undefined);
      setProgressStage("Planning");

      setIsBuilding(false);
      setIsChatThinking(false);
      setIsGeneratingApp(false);

      setPreviewRuntime({ status: "idle" });
      setView("studio");
      setSidebarActiveView("studio");
      setMobileStudioTab("chat");

      discardProjectDraft();
    } catch (error) {
      toast({
        title: "Project could not be safely saved",
        description:
          error instanceof Error
            ? error.message
            : "Your current project is still open. Please try again.",
        variant: "destructive",
      });
    }
  };
  const snapshotCode = async (code: string | null, action: string) => {
    if (!code || versions.some((version) => version.code === code)) return;
    const snapshot: LocalProjectVersion = { id: crypto.randomUUID(), code, prompt: action, createdAt: Date.now() };
    setVersions((current) => [snapshot, ...current].slice(0, 50));
    writeLocalVersion(chatKey, snapshot);
    if (user && projectId && session?.user.id) {
      const { error } = await supabase.from("project_versions").insert({
        id: snapshot.id,
        project_id: projectId,
        user_id: session.user.id,
        code: snapshot.code,
        prompt: snapshot.prompt,
      });
      if (error) throw error;
    }
  };

  const restoreVersion = (version: LocalProjectVersion) => {
    if (!(projectId && session?.user.id)) {
      void snapshotCode(lastCode, `Before restoring: ${version.prompt}`).catch((error: unknown) => {
        toast({ title: "Version snapshot failed", description: error instanceof Error ? error.message : "Could not preserve the current version.", variant: "destructive" });
      });
    }
    setLastCode(version.code); setWorkingCode(version.code); setPrompt(version.prompt); runtimeIssuesRef.current = []; repairAttemptsRefState.current = []; setQualityState(buildQualityState({ code: version.code, prompt: version.prompt })); setDoc(buildDocFromPrompt(version.prompt, version.code)); setVersionMenuOpen(false);
    if (projectId && session?.user.id) {
      void persistProject({ projectId, userId: session.user.id, title: projectTitle, prompt: version.prompt, code: version.code, messages, expectedUpdatedAt: projectUpdatedAt ?? undefined })
        .then(async (savedId) => {
          const authoritative = await loadProject(savedId, session.user.id);
          setProjectUpdatedAt(authoritative.updated_at);
          setLastSyncedCode(authoritative.code);
          lastSyncedPromptRef.current = authoritative.prompt;
          lastSyncedTitleRef.current = authoritative.title;
          lastSyncedMessagesRef.current = JSON.stringify(authoritative.messages);
          setVersions(await loadProjectVersions(savedId, session.user.id));
        })
        .catch((error: unknown) => toast({ title: "Version restored, save failed", description: error instanceof Error ? error.message : "Could not save the restored version.", variant: "destructive" }));
    }
    toast({ title: "Version restored" });
  };

  const resolveActivityCode = useCallback((versionId: string) =>
    versions.find((version) => version.id === versionId)?.code
    ?? readLocalVersionsForProject(chatKey).find((version) => version.id === versionId)?.code
    ?? null, [versions, chatKey]);

  const previewActivity = (activity: BuildActivity) => {
    const code = activity.versionId ? resolveActivityCode(activity.versionId) : null;
    if (!code) {
      toast({ title: "Preview unavailable", description: "The source snapshot for this activity is no longer stored.", variant: "destructive" });
      return;
    }
    setDoc(buildDocFromPrompt(activity.stage || projectTitle, code));
    setMobileStudioTab("preview");
  };

  const restoreActivityVersion = (versionId: string) => {
    const version = versions.find((item) => item.id === versionId)
      ?? readLocalVersionsForProject(chatKey).find((item) => item.id === versionId);
    if (!version) {
      toast({ title: "Version not found", description: "This activity's snapshot is no longer available.", variant: "destructive" });
      return;
    }
    restoreVersion(version);
  };

  const updateMessage = (timestamp: number, patch: Partial<ChatMessage>) =>
    setMessages((current) => current.map((message) => message.timestamp === timestamp ? { ...message, ...patch } : message));

 const resetDeletedProject = () => {
    // Stop any ongoing generation for the deleted project.
    abortRef.current?.abort();
    abortRef.current = null;
    partialBuildRef.current = null;

    clearLocalVersions(chatKey);
    writeProjectMessages(chatKey, []);
    discardProjectDraft();

    setProjectId(null);
    setProjectUpdatedAt(null);
    setLastSyncedCode(null);
    lastSyncedPromptRef.current = null;
    lastSyncedTitleRef.current = null;
    lastSyncedMessagesRef.current = null;
    promptDirtyRef.current = false;

    setProjectTitle("Untitled Project");
    setTitleManuallyEdited(false);
    setPrompt("");
    setLastCode(null);
    setWorkingCode(null);
    setChangeBaseCode(null);
    setBuildFiles([]);
    setBuildTimeline([]);
    buildFilesRef.current = [];
    buildTimelineRef.current = [];

    setMessages([]);
    setVersions([]);
    setDoc(buildDocFromPrompt(""));
    setActivityStartedAt(undefined);
    setActivityExplanation(undefined);
    setProgressStage("Planning");
    setIsBuilding(false);
    setIsGeneratingApp(false);

    setView("studio");
    setSidebarActiveView("studio");
    setMobileStudioTab("chat");
};
   
  
  const deleteVersion = async (version: LocalProjectVersion) => {
    const deletesLastVersion = versions.length === 1;
    if (!window.confirm(deletesLastVersion
      ? "Delete the last version? This will remove the app and reset Studio to Untitled Project."
      : "Delete this version and remove its prompt from the chat?")) return;
    const nextVersions = versions.filter((current) => current.id !== version.id);
    const nextMessages = removePromptConversationBlocks(messages, version.prompt);
    setVersionMenuOpen(false);
    let versionDeleted = false;
    try {
      if (user && projectId && session?.user.id) {
        await deleteProjectVersion(version.id, session.user.id);
        versionDeleted = true;
        if (nextVersions.length > 0) {
          await persistProject({ projectId, userId: session.user.id, title: projectTitle, prompt, code: lastCode, messages: nextMessages, expectedUpdatedAt: projectUpdatedAt ?? undefined });
          const authoritative = await loadProject(projectId, session.user.id);
          setProjectUpdatedAt(authoritative.updated_at);
          setLastSyncedCode(authoritative.code);
          lastSyncedPromptRef.current = authoritative.prompt;
          lastSyncedTitleRef.current = authoritative.title;
          lastSyncedMessagesRef.current = JSON.stringify(authoritative.messages);
        } else {
          await deleteProject(projectId, session.user.id);
        }
      }
      deleteLocalVersion(chatKey, version.id);
      if (nextVersions.length === 0) resetDeletedProject();
      else {
        setVersions(nextVersions);
        setMessages(nextMessages);
      }
      toast({ title: "Version deleted" });
    } catch (error) {
      if (versionDeleted) {
        deleteLocalVersion(chatKey, version.id);
        setVersions(nextVersions);
        setMessages(nextMessages);
        toast({ title: "Version deleted; project cleanup failed", description: error instanceof Error ? error.message : "The version is gone, but the app could not be archived.", variant: "destructive" });
      } else {
        writeLocalVersion(chatKey, version);
        setVersions(versions);
        setMessages(messages);
        toast({ title: "Version delete failed", description: error instanceof Error ? error.message : "Could not delete this version.", variant: "destructive" });
      }
    }
  };

  const clearVersions = async () => {
    if (!versions.length || !window.confirm("Delete all versions and remove this app? Studio will reset to Untitled Project.")) return;
    const previousVersions = versions;
    setVersionMenuOpen(false);
    let historyDeleted = false;
    try {
      if (user && projectId && session?.user.id) {
        await clearProjectVersions(projectId, session.user.id);
        historyDeleted = true;
        await deleteProject(projectId, session.user.id);
      }
      resetDeletedProject();
      toast({ title: "App and versions deleted", description: "Studio is ready for a new Untitled Project." });
    } catch (error) {
      if (historyDeleted) {
        clearLocalVersions(chatKey);
        setVersions([]);
        toast({ title: "Versions deleted; app cleanup failed", description: error instanceof Error ? error.message : "The versions are gone, but the app could not be archived.", variant: "destructive" });
      } else {
        setVersions(previousVersions);
        toast({ title: "Could not delete app versions", description: error instanceof Error ? error.message : "The app and its version history could not be deleted.", variant: "destructive" });
      }
    }
  };

  const manualFix = async (issue?: string) => {
    if (!lastCode || manualFixing) return;
    const repairIssue = (issue && issue.trim()) || "Manual Fix requested: inspect for actual syntax, import, runtime, responsive-layout, and interaction defects. Preserve requested features and design; fix only affected source files.";
    setManualFixing(true);
    try {
      const result = await performRepair(repairIssue, "manual");
      if (result.ok && user && projectId && session?.user.id && lastCode) {
        try {
          const authoritativeAfter = await loadProject(projectId, session.user.id).catch(() => null);
          await persistProject({ projectId, userId: session.user.id, title: projectTitle, prompt, code: (readProjectDraft()?.code as string | null) ?? lastCode, messages, expectedUpdatedAt: authoritativeAfter?.updated_at ?? projectUpdatedAt ?? undefined });
        } catch {
          // persistence is best-effort; local/preview state already reflects validated repair
        }
      }
    } finally {
      setManualFixing(false);
    }
  };

  const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

  const toggleSidebar = () => {
    if (!isDesktop()) {
      setMobileSidebarOpen((open) => !open);
      return;
    }
    if (hasAppWorkspace) {
      setSidebarOverlayOpen((open) => !open);
      return;
    }
    if (sidebarHidden) {
      setSidebarHidden(false);
      setSidebarPinned(true);
      return;
    }
    setSidebarHidden(true);
  };

  const persistSplitRatio = (value: number) => {
    const clamped = clampSplitRatio(value);
    lastSplitRatioRef.current = clamped;
    setSplitRatio(clamped);
    try {
      localStorage.setItem(SPLIT_STORAGE_KEY, String(clamped));
    } catch {
      // Split persistence is best-effort when storage is unavailable.
    }
  };

  const handleSplitLayout = (layout: number[]) => {
    const [chat, preview] = layout;
    if (chat > 6 && preview > 6) persistSplitRatio(chat);
  };

  const handleSplitDragging = (dragging: boolean) => {
    const group = splitGroupRef.current;
    if (!group) return;
    if (dragging) {
      dragStartLayoutRef.current = group.getLayout();
      return;
    }
    group.setLayout(resolveSplitDrop(group.getLayout(), dragStartLayoutRef.current, lastSplitRatioRef.current));
  };


  useEffect(() => { buildFilesRef.current = buildFiles; }, [buildFiles]);
  useEffect(() => { buildTimelineRef.current = buildTimeline; }, [buildTimeline]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "[") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTypingTarget = tag === "input" || tag === "textarea" || tag === "select" || Boolean(target?.isContentEditable);
      if (isTypingTarget) return;
      e.preventDefault();
      if (!isDesktop()) {
        setMobileSidebarOpen((open) => !open);
      } else if (hasAppWorkspace) {
        setSidebarOverlayOpen((open) => !open);
      } else if (sidebarHidden) {
        setSidebarHidden(false);
        setSidebarPinned(true);
      } else {
        setSidebarHidden(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasAppWorkspace, sidebarHidden]);

  if (!authReady || (user && accountProjectLoading)) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        Restoring your workspace…
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <div className="relative flex flex-1 overflow-hidden">
       <Sidebar
  active={sidebarActiveView}
  workspaceActive={view === "studio" && hasAppWorkspace}
  onChange={navigateView}
  onOpenSettings={() => setSettingsOpen(true)}
  onOpenSignIn={() => setAuthOpen(true)}
  onOpenPricing={() => setPricingOpen(true)}
  pinned={sidebarPinned}
  hidden={sidebarHidden}
  overlayOpen={sidebarOverlayOpen}
  onOverlayOpenChange={setSidebarOverlayOpen}
  mobileOpen={mobileSidebarOpen}
  onMobileOpenChange={setMobileSidebarOpen}
/>

        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <header className="relative z-30 flex h-14 sm:h-16 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background/40 px-3 sm:px-6 backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              {view === "studio" && hasAppWorkspace && (
  <button
    type="button"
    onMouseEnter={() => setSidebarOverlayOpen(true)}
    onClick={() => setSidebarOverlayOpen((prev) => !prev)}
    aria-label="Toggle workspace sidebar"
    title="Toggle sidebar"
    className="hidden h-9 w-9 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-muted-foreground md:flex"
  >
    <Menu className="h-5 w-5" />
  </button>
)}
         {view === "studio" ? (
             <h1 className="min-w-0 max-w-[18ch] sm:max-w-[40ch] truncate font-display text-sm sm:text-base font-semibold text-foreground">{projectTitle}</h1>
              ) : (
                <h1 className="truncate font-display text-sm sm:text-base font-semibold text-foreground">{VIEW_TITLES[view]}</h1>
              )}
           {view === "studio" && (
                <span className="hidden rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary sm:inline">
{titleManuallyEdited && projectTitle !== "Untitled Project" ? "Draft" : "Auto title"}                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {view === "studio" && hasStartedProject && (
  <button
    onClick={newProject}
className="flex h-9 items-center gap-1.5 rounded-lg border border-primary bg-primary px-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
  >
    <Plus className="h-4 w-4" />
    <span className="hidden sm:inline">New Project</span>
  </button>
)}
              {view === "studio" && lastCode && (
                <button onClick={() => setGithubOpen(true)} className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2.5 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-secondary">
                  <GithubIcon className="h-4 w-4" /><span className="hidden sm:inline">Connect to GitHub</span>
                </button>
              )}
              <NotificationsMenu />
              <button
                onClick={() => setPricingOpen(true)}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-gradient-primary px-2.5 sm:px-3.5 text-xs font-semibold text-primary-foreground shadow-glow transition-smooth hover:brightness-110"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Upgrade</span>
              </button>
            </div>
          </header>

          <main className="relative z-0 flex flex-1 flex-col overflow-hidden">
            {view === "studio" && (
              <>
                {/* Mobile tab switcher */}
       {showPreview && !isDesktopLayout && <div className="flex shrink-0 items-center gap-1 border-b border-border/60 bg-background/60 p-1.5">
                  <button
                    onClick={() => setMobileStudioTab("chat")}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-smooth",
                      mobileStudioTab === "chat"
                        ? "bg-primary text-primary-foreground shadow-soft"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Prompt
                  </button>
                  <button
                    onClick={() => setMobileStudioTab("preview")}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-smooth",
                      mobileStudioTab === "preview"
                        ? "bg-primary text-primary-foreground shadow-soft"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </button>
                </div>}

                <div className={cn("flex min-h-0 flex-1 flex-col lg:flex-row", !showPreview && "justify-center")}>
                  {!showPreview ? (
                    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:flex lg:w-full">
                      <PromptPanel
                        prompt={prompt}
                        onPromptChange={handlePromptChange}
                        onBuild={handleBuild}
                        onDownload={handleDownload}
                        onStop={stopBuild}
                        onNewProject={newProject}
                        isBuilding={isBuilding}
                        isChatThinking={isChatThinking}
                        progressStage={progressStage}
                        buildFiles={buildFiles}
                        buildTimeline={buildTimeline}
                        messages={messages}
                        hasCode={Boolean(lastCode)}
                        workingCode={workingCode}
                        inputRef={promptInputRef}
                        activityStartedAt={activityStartedAt}
                        activityExplanation={activityExplanation}
                        resolveActivityCode={resolveActivityCode}
                        onPreviewActivity={previewActivity}
                        onRestoreActivity={restoreActivityVersion}
                        onMessageFeedback={(timestamp, feedback) => updateMessage(timestamp, { feedback })}
                        onToggleBookmark={(timestamp) => setMessages((current) => current.map((message) => message.timestamp === timestamp ? { ...message, bookmarked: !message.bookmarked } : message))}
                        onRetryBuild={() => void handleBuild()}
                      />
                    </section>
                  ) : (
                    <>
{isDesktopLayout ? (
  <ResizablePanelGroup ref={splitGroupRef} direction="horizontal" className="flex min-h-0 flex-1" onLayout={handleSplitLayout}>
                        <ResizablePanel id="studio-chat" order={1} defaultSize={splitRatio} minSize={0} collapsedSize={0} collapsible className="min-w-0">
                          <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-border/60">
                            <PromptPanel
                              prompt={prompt}
                              onPromptChange={handlePromptChange}
                              onBuild={handleBuild}
                              onDownload={handleDownload}
                              onStop={stopBuild}
                              onNewProject={newProject}
                              isBuilding={isBuilding}
                            isChatThinking={isChatThinking}
                              progressStage={progressStage}
                              buildFiles={buildFiles}
                              buildTimeline={buildTimeline}
                              messages={messages}
                              hasCode={Boolean(lastCode)}
                              workingCode={workingCode}
                              inputRef={promptInputRef}
                              activityStartedAt={activityStartedAt}
                              activityExplanation={activityExplanation}
                              resolveActivityCode={resolveActivityCode}
                              onPreviewActivity={previewActivity}
                              onRestoreActivity={restoreActivityVersion}
                              onMessageFeedback={(timestamp, feedback) => updateMessage(timestamp, { feedback })}
                              onToggleBookmark={(timestamp) => setMessages((current) => current.map((message) => message.timestamp === timestamp ? { ...message, bookmarked: !message.bookmarked } : message))}
                              onRetryBuild={() => void handleBuild()}
                            />
                          </section>
                        </ResizablePanel>
                        <ResizableHandle withHandle onDragging={handleSplitDragging} className="w-1.5 bg-border/70 transition-colors hover:bg-primary/50" />
                        <ResizablePanel id="studio-preview" order={2} defaultSize={100 - splitRatio} minSize={0} collapsedSize={0} collapsible className="min-w-0">
                          <section className="flex h-full min-h-0 min-w-0 flex-1">
                            <PreviewPanel
                              isBuilding={isBuilding}
                              doc={doc}
                              code={lastCode}
                              workingCode={workingCode}
                              baseCode={changeBaseCode}
                              versions={versions}
                              onRestoreVersion={restoreVersion}
                              onDeleteVersion={deleteVersion}
                              onClearVersions={() => void clearVersions()}
                              onManualFix={manualFix}
                              fixing={manualFixing}
                              onPreviewRuntime={handlePreviewRuntime}
                              onThumbnailCapture={handleThumbnailCapture}
                              onCodeChange={(newCode) => {
                                lastReportedRef.current = "";
                                isRepairingRef.current = false;
                                runtimeIssuesRef.current = [];
                                refreshQuality({ code: newCode, runtimeErrors: [] });
                                void (async () => {
                                  try {
                                    await snapshotCode(lastCode, `Before code editor save: ${prompt || "manual edit"}`);
                                  } catch (error) {
                                    toast({ title: "Version snapshot failed", description: error instanceof Error ? error.message : "Could not preserve the current version.", variant: "destructive" });
                                  }
                                  setLastCode(newCode);
                                  setWorkingCode(newCode);
                                  setDoc(buildDocFromPrompt(prompt, newCode));
                                  if (user && session?.user.id && projectId) {
                                    try {
                                      await persistProject({ projectId, userId: session.user.id, title: projectTitle, prompt, code: newCode, messages, expectedUpdatedAt: projectUpdatedAt ?? undefined });
                                      const authoritative = await loadProject(projectId, session.user.id);
                                      setProjectUpdatedAt(authoritative.updated_at);
                                      setLastSyncedCode(authoritative.code);
                                      lastSyncedPromptRef.current = authoritative.prompt;
                                      lastSyncedTitleRef.current = authoritative.title;
                                      lastSyncedMessagesRef.current = JSON.stringify(authoritative.messages);
                                    } catch (error) {
                                      toast({ title: "Cloud save failed", description: error instanceof Error ? error.message : "Could not save the project to your account.", variant: "destructive" });
                                    }
                                  }
                                })();
                              }}
                            />
                          </section>
                        </ResizablePanel>
                                          </ResizablePanelGroup>
                    ) : (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <section className={cn("min-h-0 min-w-0 overflow-hidden border-b border-border/60", mobileStudioTab === "chat" ? "flex flex-1 flex-col" : "hidden")}>
                          <PromptPanel
                            prompt={prompt}
                            onPromptChange={handlePromptChange}
                            onBuild={handleBuild}
                            onDownload={handleDownload}
                            onStop={stopBuild}
                            onNewProject={newProject}
                            isBuilding={isBuilding}
                            isChatThinking={isChatThinking}
                            progressStage={progressStage}
                            buildFiles={buildFiles}
                            buildTimeline={buildTimeline}
                            messages={messages}
                            hasCode={Boolean(lastCode)}
                            workingCode={workingCode}
                            inputRef={promptInputRef}
                            activityStartedAt={activityStartedAt}
                            activityExplanation={activityExplanation}
                            resolveActivityCode={resolveActivityCode}
                            onPreviewActivity={previewActivity}
                            onRestoreActivity={restoreActivityVersion}
                            onMessageFeedback={(timestamp, feedback) => updateMessage(timestamp, { feedback })}
                            onToggleBookmark={(timestamp) => setMessages((current) => current.map((message) => message.timestamp === timestamp ? { ...message, bookmarked: !message.bookmarked } : message))}
                            onRetryBuild={() => void handleBuild()}
                          />
                        </section>
                        <section className={cn("min-h-0 min-w-0 flex-1", mobileStudioTab === "preview" ? "flex" : "hidden")}>
                          <PreviewPanel
                            isBuilding={isBuilding}
                            doc={doc}
                            code={lastCode}
                            workingCode={workingCode}
                            baseCode={changeBaseCode}
                            versions={versions}
                            onRestoreVersion={restoreVersion}
                            onDeleteVersion={deleteVersion}
                            onClearVersions={() => void clearVersions()}
                            onManualFix={manualFix}
                            fixing={manualFixing}
                            onPreviewRuntime={handlePreviewRuntime}
                            onThumbnailCapture={handleThumbnailCapture}
                            onCodeChange={(newCode) => {
                              lastReportedRef.current = "";
                              isRepairingRef.current = false;
                              runtimeIssuesRef.current = [];
                              refreshQuality({ code: newCode, runtimeErrors: [] });
                              void (async () => {
                                try {
                                  await snapshotCode(lastCode, `Before code editor save: ${prompt || "manual edit"}`);
                                } catch (error) {
                                  toast({ title: "Version snapshot failed", description: error instanceof Error ? error.message : "Could not preserve the current version.", variant: "destructive" });
                                }
                                setLastCode(newCode);
                                setWorkingCode(newCode);
                                setDoc(buildDocFromPrompt(prompt, newCode));
                                if (user && session?.user.id && projectId) {
                                  try {
                                    await persistProject({ projectId, userId: session.user.id, title: projectTitle, prompt, code: newCode, messages, expectedUpdatedAt: projectUpdatedAt ?? undefined });
                                    const authoritative = await loadProject(projectId, session.user.id);
                                    setProjectUpdatedAt(authoritative.updated_at);
                                    setLastSyncedCode(authoritative.code);
                                    lastSyncedPromptRef.current = authoritative.prompt;
                                    lastSyncedTitleRef.current = authoritative.title;
                                    lastSyncedMessagesRef.current = JSON.stringify(authoritative.messages);
                                  } catch (error) {
                                    toast({ title: "Cloud save failed", description: error instanceof Error ? error.message : "Could not save the project to your account.", variant: "destructive" });
                                  }
                                }
                              })();
                            }}
                          />
                        </section>
                                         </div>
                    )}
                    </>
                  )}
                </div>
              </>
            )}
            {view === "dashboard" && <DashboardPage userId={session?.user.id ?? null} onNavigate={navigateView} onOpenSignIn={() => setAuthOpen(true)} />}
            {view === "apps" && (
              <MyAppsPage
                onNavigate={navigateView}
                onOpenSignIn={() => setAuthOpen(true)}
                             onOpenProject={(p) => {
                  if (!session?.user.id) {
                    toast({
                      title: "Sign in required",
                      description: "Sign in to open your saved project.",
                      variant: "destructive",
                    });
                    return;
                  }

                  void (async () => {
                    try {
                      const userId = session.user.id;
                      const project = await loadProject(p.id, userId);
                      const projectVersions = await loadProjectVersions(p.id, userId);
                      const latestJob = await loadLatestBuildJob(project.id, userId);

                      let activeJob =
                        latestJob &&
                        ["paused", "queued", "running", "retrying"].includes(latestJob.status)
                          ? latestJob
                          : null;

                      // Restore the account-wide Studio pointer before resuming.
                      await saveStudioSession({
                        userId,
                        projectId: project.id,
                        title: project.title,
                        prompt: project.prompt,
                        messages: project.messages,
                        activeBuildJobId: activeJob?.id ?? null,
                      });

                      // Resume only a job that was deliberately paused.
                      if (activeJob?.status === "paused") {
                        const resumedJob = await resumeBuildJob(activeJob.id, userId);

                        if (!resumedJob) {
                          throw new Error("This paused build could not be resumed. Please try again.");
                        }

                        activeJob = resumedJob;
                      }

                      partialBuildRef.current = null;
                      saveStudioWorkspaceSnapshot();
                      openedSavedProjectRef.current = true;

                      setProjectId(project.id);
                      setProjectUpdatedAt(project.updated_at);
                      setLastSyncedCode(project.code);
                      lastSyncedPromptRef.current = project.prompt;
                      lastSyncedTitleRef.current = project.title;
                      lastSyncedMessagesRef.current = JSON.stringify(project.messages);
                      promptDirtyRef.current = false;

                      setProjectTitle(project.title);
                      setTitleManuallyEdited(true);
                      setPrompt(project.prompt);
                      setLastCode(project.code);
                      setWorkingCode(activeJob?.working_code || project.code);
                      setMessages(project.messages);
                      setVersions(projectVersions);

                      lastReportedRef.current = "";
                      isRepairingRef.current = false;
                      runtimeIssuesRef.current = [];
                      repairAttemptsRefState.current = [];

                      setQualityState(
                        buildQualityState({
                          code: project.code || "",
                          prompt: project.prompt || "",
                        }),
                      );
                      setDoc(buildDocFromPrompt(project.prompt, project.code));

                      setBuildFiles(
                        activeJob && Array.isArray(activeJob.build_files)
                          ? activeJob.build_files as unknown as BuildFileProgress[]
                          : [],
                      );
                      setBuildTimeline(
                        activeJob && Array.isArray(activeJob.build_timeline)
                          ? activeJob.build_timeline.filter(
                              (item): item is string => typeof item === "string",
                            )
                          : [],
                      );

                      setProgressStage(activeJob?.current_stage || "Planning");
                      setActivityStartedAt(
                        activeJob ? Date.parse(activeJob.created_at) : undefined,
                      );
                      durableQueueAcceptedRef.current = Boolean(activeJob);
                      setIsBuilding(Boolean(activeJob));
                      setIsGeneratingApp(Boolean(activeJob));
                      setIsChatThinking(false);

                      setSidebarPinned(true);
                      setSidebarHidden(false);
                      setSidebarOverlayOpen(false);
                      setMobileSidebarOpen(false);
                      setView("studio");
                      setSidebarActiveView("apps");
                      setMobileStudioTab(activeJob ? "chat" : "preview");

                      toast({
                        title: activeJob ? "Build restored" : "Project loaded",
                        description: activeJob
                          ? `${project.title} — continuing saved build`
                          : project.title,
                      });
                    } catch (error) {
                      toast({
                        title: "Couldn't open project",
                        description:
                          error instanceof Error
                            ? error.message
                            : "Please retry after checking your connection.",
                        variant: "destructive",
                      });
                    }
                  })();
                }} 
                   />
            )}
{view === "templates" && (
  <TemplatesPage
    onNavigate={navigateView}
    onUseTemplate={(templatePrompt) => {
      handlePromptChange(templatePrompt);
      setView("studio");
      setSidebarActiveView("studio");

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const textarea = promptInputRef.current;
          if (!textarea) return;

          textarea.focus();
          const end = textarea.value.length;
          textarea.setSelectionRange(end, end);
        });
      });
    }}
  />
)}
            {view === "api" && <ApiSettingsPage />}
            {view === "backend" && <BackendDeployPage projectId={projectId} projectTitle={projectTitle} />}
            {view === "pricing" && <PricingPage />}
          </main>
        </div>
      </div>

      <AuthModal
        open={authOpen}
        recoveryPending={recoveryPending}
        onRecoveryHandled={clearRecoveryPending}
        onClose={() => setAuthOpen(false)}
      />
      <PricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <GithubModal open={githubOpen} onClose={() => setGithubOpen(false)} code={lastCode} projectTitle={projectTitle} projectKey={chatKey} />

      <footer className="flex h-9 shrink-0 items-center justify-between border-t border-border/60 bg-background/60 px-6 text-[11px] text-muted-foreground backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success shadow-glow" />
            All systems operational
          </span>
          <span className="hidden sm:inline opacity-60">·</span>
          <span className="hidden font-mono opacity-70 sm:inline"></span>
        </div>
        <div className="font-light tracking-wide">
          © 2026 <span className="font-semibold text-foreground/80">AppiGen</span>
          <span className="mx-1.5 opacity-50">|</span>
          Powered by <span className="gradient-text font-semibold">NK</span>
        </div>
      </footer>
    </div>
  );
};

export default Index;
