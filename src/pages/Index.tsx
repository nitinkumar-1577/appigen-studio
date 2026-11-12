import { useEffect, useRef, useState } from "react";
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
import { Sparkles, Menu, MessageSquare, Eye, Github as GithubIcon } from "lucide-react";
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
import { clearLocalVersions, clearProjectChangeRecords, clearProjectMemory, deleteLocalVersion, discardProjectDraft, readProjectChangeRecords, readProjectDraft, readProjectMemory, writeLocalVersion, writeProjectChangeRecord, writeProjectDraft, writeProjectMemory, writeProjectMessages, type ChatMessage, type LocalProjectVersion } from "@/lib/projects/projectStorage";
import { computeChangeRecord, formatChangeRecord } from "@/lib/projects/changeTracking";
import { formatUnderstandingForPrompt, understandProject } from "@/lib/projects/projectUnderstanding";
import { detectConflicts, formatMemoryForPrompt, updateProjectMemory } from "@/lib/projects/projectMemory";
import { clearProjectVersions, createProjectVersion, deleteProject, deleteProjectVersion, loadProject, loadProjectVersions, persistActivity, persistProject, subscribeToProjectSync } from "@/lib/projects/projectRepository";
import { readAppPreferences, readGenerationSettings, recordActivity } from "@/lib/appPreferences";
import { trackAnonymousUsage } from "@/lib/telemetry";
import { analyzeIntent, responseLanguageInstruction } from "@/lib/projects/conversationIntelligence";
import { attemptsForIssue, buildQualityState, canAttemptRepair, createRepairAttempt, emptyQualityState, finalizeRepairAttempt, MAX_REPAIR_ATTEMPTS_PER_ISSUE, mergeRuntimeError, normalizeReviewFindings, type QualityState, type RepairAttempt, type RuntimeIssue } from "@/lib/projects/qualityEngine";

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
  const [isGeneratingApp, setIsGeneratingApp] = useState(false);
  const [prompt, setPrompt] = useState(initialState.prompt);
  const [doc, setDoc] = useState<string>(() => buildDocFromPrompt(initialState.prompt));
  const [view, setView] = useState<ViewKey>("studio");
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
  const [versions, setVersions] = useState<LocalProjectVersion[]>(initialState.versions);
  const [progressStage, setProgressStage] = useState("Planning");
  const [buildFiles, setBuildFiles] = useState<BuildFileProgress[]>([]);
  const [buildTimeline, setBuildTimeline] = useState<string[]>([]);
  const partialBuildRef = useRef<{ prompt: string; code: string; completedPaths: string[] } | null>(null);
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [manualFixing, setManualFixing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const previousUserRef = useRef(false);
  const [workspaceSidebarOpen, setWorkspaceSidebarOpen] = useState(() => {
    const hasProject = Boolean(initialState.projectId || initialState.code);
    return !hasProject;
  });
  const [mobileStudioTab, setMobileStudioTab] = useState<"chat" | "preview">(initialState.mobileTab);
  const [qualityState, setQualityState] = useState<QualityState>(emptyQualityState());
  const [qualityRunning, setQualityRunning] = useState(false);
  const runtimeIssuesRef = useRef<RuntimeIssue[]>([]);
  const repairAttemptsRefState = useRef<RepairAttempt[]>([]);
  const showPreview = Boolean(lastCode) || isGeneratingApp;
  const promptActivityTimer = useRef<number | undefined>(undefined);

  const navigateView = (next: ViewKey) => {
    if (next === "studio") {
      // Keep sidebar state as-is for studio navigation unless caller specifies; opening project flows collapse explicitly.
    } else {
      setWorkspaceSidebarOpen(true);
    }
    setView(next);
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
    const refreshActiveProject = async (changedProjectId?: string) => {
      if (!projectId || (changedProjectId && changedProjectId !== projectId)) return;
      if (document.activeElement?.id === "app-prompt") return;
      try {
        const remote = await loadProject(projectId, session.user.id);
        const remoteChanged = remote.code !== lastSyncedCode;
        const localAlsoChanged = lastCode !== lastSyncedCode;
        const remotePromptChanged = remote.prompt !== lastSyncedPromptRef.current;
        const localPromptChanged = currentPromptRef.current !== lastSyncedPromptRef.current;
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
        setPrompt(remote.prompt);
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
    if (!authReady || !user || !session?.user.id || !projectId || lastCode === null) return;
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

  const refreshQuality = (overrides: { code?: string | null; reviewFindings?: QualityState["reviewFindings"]; runtimeErrors?: RuntimeIssue[]; repairAttempts?: RepairAttempt[]; previewSummary?: string } = {}) => {
    const code = overrides.code ?? lastCode ?? "";
    const runtimeErrors = overrides.runtimeErrors ?? runtimeIssuesRef.current;
    const repairAttempts = overrides.repairAttempts ?? repairAttemptsRefState.current;
    const previewFailed = runtimeErrors.some((e) => ["error", "promise", "compile", "render", "blank"].includes(e.kind));
    const previewHealth = code ? { status: previewFailed ? "failed" as const : (runtimeErrors.length ? "failed" as const : "passed" as const), summary: previewFailed ? "Runtime/preview errors detected from live preview signals." : (runtimeErrors.length ? "Console/resource issues reported by preview runtime." : "No runtime errors reported by preview; basic render signal observed when available."), details: runtimeErrors.slice(0, 5).map((e) => `${e.kind}: ${e.message}`) } : null;
    const next = buildQualityState({ code, prompt, reviewFindings: overrides.reviewFindings ?? qualityState.reviewFindings, runtimeErrors, repairAttempts, previewHealth });
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

  // Listen for runtime/preview signals: update quality and trigger autonomous repair (max 3 attempts per issue)
  useEffect(() => {
    const onMsg = async (ev: MessageEvent) => {
      const previewWindow = document.querySelector<HTMLIFrameElement>('iframe[title="AppiGen Sandbox Preview"]')?.contentWindow;
      if (!previewWindow || ev.source !== previewWindow) return;
      const m = ev.data as { __appigen?: boolean; kind?: string; message?: string; stack?: string } | null;
      if (!m || typeof m !== "object" || !m.__appigen) return;
      const kind = String(m.kind || "");
      if (kind === "ready") {
        // preview became healthy; refresh quality signals without creating fake passes
        refreshQuality({ runtimeErrors: runtimeIssuesRef.current });
        return;
      }
      if (["error", "compile", "promise", "blank", "render", "console"].includes(kind)) {
        runtimeIssuesRef.current = mergeRuntimeError(runtimeIssuesRef.current, { kind, message: String(m.message || ""), stack: typeof m.stack === "string" ? m.stack : undefined });
        refreshQuality({ runtimeErrors: runtimeIssuesRef.current });
      }
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
    lastReportedRef.current = "";
    isRepairingRef.current = false;
    const intent = analyzeIntent(trimmed, { hasExistingProject: Boolean(lastCode) });
    const editMode = Boolean(lastCode) && !isNewAppPrompt(trimmed);
    const questionMode = !intent.shouldBuild;
    const generationSettings = readGenerationSettings();
    const buildStartedAt = Date.now();
    const baseMessages = editMode ? messages : [];
    const submitted: ChatMessage = { role: "user", content: trimmed, timestamp: Date.now() };
    const nextMessages = [...baseMessages, submitted];
    let buildMessages = nextMessages;
    let versionsAfterBuild = versions;
    setMessages(nextMessages);
    if (!editMode) {
      versionsAfterBuild = [];
      setVersions([]);
      setProjectTitle(suggestProjectTitle(trimmed));
      setTitleManuallyEdited(false);
    }
    if (!questionMode) {
      setView("studio");
      setWorkspaceSidebarOpen(false);
    }
    setMobileStudioTab(questionMode ? "chat" : "preview");
    setProgressStage("Understanding request");
    setBuildTimeline(["Understanding the request", `Intent: ${intent.intent} (${intent.responseLanguage})`]);
    const projectKey = chatKey;
    const baseCodeForEdit = lastCode;
    const understanding = (editMode || Boolean(baseCodeForEdit)) && baseCodeForEdit ? understandProject(baseCodeForEdit, projectId) : null;
    const existingMemory = (editMode || Boolean(baseCodeForEdit)) ? readProjectMemory(projectKey) : null;
    const recentChanges = (editMode || Boolean(baseCodeForEdit)) ? readProjectChangeRecords(projectKey) : [];
    const recentChangeSummary = recentChanges[0] ? formatChangeRecord(recentChanges[0]) : "";
    const memoryPreview = (editMode || Boolean(baseCodeForEdit)) ? updateProjectMemory({ existing: existingMemory, projectKey, projectId, title: projectTitle, understanding, messages: nextMessages, prompt: trimmed }) : null;
    if (understanding) setBuildTimeline((current) => [...current, `Understood project: ${understanding.architectureSummary}`]);
    if (memoryPreview?.conflicts.length) setBuildTimeline((current) => [...current, `Potential conflicts detected: ${memoryPreview.conflicts[0]}`]);
    const clarificationNeeded = (memoryPreview?.clarifications ?? []).filter((item) => !/too ambiguous/i.test(item) || trimmed.split(/\s+/).length < 4);
    if (questionMode && intent.needsClarification) clarificationNeeded.push("Please clarify what should change and where in the current project.");
    if (!questionMode && clarificationNeeded.length) {
      setMessages((current) => [...current, { role: "assistant", content: `I need clarification before making targeted changes:\n${clarificationNeeded.map((c) => `- ${c}`).join("\n")}\n\nPlease specify the target behavior/file or confirm the intended change so I can preserve unrelated functionality.`, timestamp: Date.now() }]);
      toast({ title: "Clarification needed", description: clarificationNeeded[0] });
      return;
    }
    const understandingText = understanding ? formatUnderstandingForPrompt(understanding) : "";
    const memoryText = memoryPreview ? formatMemoryForPrompt(memoryPreview, understanding) : "";
    setIsBuilding(true);
    setIsGeneratingApp(!questionMode);
    let generatedPreview = false;
    const controller = new AbortController();
    abortRef.current = controller;
    setBuildFiles([]);
    setChangeBaseCode(baseCodeForEdit);
    setWorkingCode(partialBuildRef.current?.prompt === trimmed ? partialBuildRef.current.code : baseCodeForEdit);
    let buildProvider: string = generationSettings.provider;
    try {
      assertSupabaseFunctionAccess();
      if (questionMode) {
        setProgressStage("Understanding request");
        const { data: chatData, error: chatError } = await supabase.functions.invoke("Appigen", {
          body: {
            mode: "chat",
            provider: generationSettings.provider,
            prompt: trimmed,
            code: lastCode ?? "",
            conversation: baseMessages.slice(-12),
            model: generationSettings.model,
            system: [generationSettings.systemInstructions, responseLanguageInstruction(intent.responseLanguage)].filter(Boolean).join("\n\n"),
            projectUnderstanding: understandingText,
            projectMemory: memoryText,
            changeSummary: recentChangeSummary,
            responseLanguage: intent.responseLanguage,
            intent: intent.intent,
          },
          signal: controller.signal,
        });
        if (chatError) throw chatError;
        if (typeof chatData?.answer !== "string" || !chatData.answer.trim()) {
          throw new Error("The conversation route returned no answer.");
        }
        const completedMessages = [...nextMessages, {
          role: "assistant" as const,
          content: chatData.answer.trim(),
          timestamp: Date.now(),
        }];
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
        toast({ title: "Answer ready", description: typeof chatData.provider === "string" ? `Completed by ${chatData.provider}.` : undefined });
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
          prompt: trimmed,
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
        },
        signal: controller.signal,
      });
      if (planError) throw planError;
      const implementationPlan = planData?.plan?.implementationPlan as Record<string, unknown> | undefined;
      const planSummary = formatImplementationPlan(implementationPlan);
      if (!planSummary) throw new Error("The deployed Appigen Edge Function does not support the planning route.");
      buildMessages = [...nextMessages, { role: "assistant", content: planSummary, timestamp: Date.now() }];
      setMessages(buildMessages);
      setBuildTimeline((current) => [...current, "Implementation plan ready"]);
      const canResume = partialBuildRef.current?.prompt === trimmed;
      let generatedCode = canResume
        ? partialBuildRef.current?.code ?? ""
        : editMode && lastCode ? normalizeFileMarkers(lastCode) : "";
      const blueprint = Array.isArray(implementationPlan?.fileBlueprint) ? implementationPlan.fileBlueprint as Array<{ path: string; purpose: string }> : [];
      if (!blueprint.length) throw new Error("The implementation plan did not include a file blueprint.");
      const recentlyChangedPaths = recentChanges.flatMap((record) => record.changedPaths).slice(0, 12);
      const plannedFiles = editMode && generatedCode
        ? selectFilesForEdit(generatedCode, trimmed, { understanding, recentlyChanged: recentlyChangedPaths }).map((path) => blueprint.find((file) => file.path === path) ?? ({ path, purpose: `Apply the requested change to ${path}` }))
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
              mode: "build_file", prompt: trimmed, file,
              requirements: Array.isArray(implementationPlan?.requirements) ? implementationPlan.requirements : [trimmed],
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
          setBuildFiles((current) => current.map((item) => item.path === event.path ? { ...item, ...event } : item));
          if (event.status === "generating") {
            setBuildTimeline((current) => [...current, `Creating ${event.path}`]);
            setProgressStage(`Generating ${event.path}`);
          } else if (event.status === "validating") {
            setBuildTimeline((current) => [...current, `Validating ${event.path}`]);
            setProgressStage(`Validating ${event.path}`);
          } else if (event.status === "retrying") {
            setBuildTimeline((current) => [...current, `Retrying ${event.path}${event.error ? `: ${event.error}` : ""}`]);
            setProgressStage(`Retrying ${event.path}`);
          } else if (event.status === "failed") {
            setBuildTimeline((current) => [...current, `Failed ${event.path}: ${event.error ?? "unknown error"}`]);
          }
          if (event.status === "completed") {
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

      setProgressStage("Validating");
      setBuildTimeline((current) => [...current, "Running final project validation"]);
      const validationError = validateFileTree(generatedCode, requiredPaths) || validateGeneratedCode(generatedCode, !editMode);
      if (validationError) throw new Error(`The reviewed project is invalid: ${validationError}`);
      partialBuildRef.current = null;
      if (editMode && lastCode) {
        const snapshot: LocalProjectVersion = { id: crypto.randomUUID(), code: lastCode, prompt: trimmed, createdAt: Date.now() };
        versionsAfterBuild = [snapshot, ...versions].slice(0, 50);
        setVersions(versionsAfterBuild);
        writeLocalVersion(chatKey, snapshot);
        if (user && projectId) {
          const { data: auth } = await supabase.auth.getUser();
          if (auth.user) {
            try {
              await createProjectVersion({ projectId, userId: auth.user.id, code: lastCode, prompt: trimmed, id: snapshot.id });
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
      setLastCode(generatedCode);
      setWorkingCode(generatedCode);
      setDoc(buildDocFromPrompt(trimmed, generatedCode));
      const fileCount = [...generatedCode.matchAll(/^\s*\/\/\s*FILE:/gm)].length || 1;
      const validationSummary = getValidationSummary(Boolean(reviewData?.reviewSkipped), fileCount);
      const initialQuality = buildQualityState({ code: generatedCode, prompt: trimmed, reviewFindings: aiReviewFindings, runtimeErrors: [], repairAttempts: [], previewHealth: { status: "passed", summary: "Project generated and preview updated (runtime signals pending)." } });
      setQualityState(initialQuality);
      const finalTitle = editMode
        ? projectTitle !== "Untitled Project" ? projectTitle : suggestProjectTitle(trimmed)
        : suggestProjectTitle(trimmed);
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
      const completedMessages = [...buildMessages, { role: "assistant" as const, content: editMode ? `Project updated. ${validationSummary}${changeRecord ? `\n\n${formatChangeRecord(changeRecord)}` : ""}${memoryNote} Your previous version is available to restore.` : `Your app is ready in Preview. ${validationSummary}`, timestamp: Date.now() }];
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
              const initialVersion = await createProjectVersion({ projectId: savedId, userId: uid, code: generatedCode, prompt: trimmed });
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
        writeProjectDraft({ projectId: null, title: finalTitle, prompt: trimmed, code: generatedCode, messages: completedMessages, versions: versionsAfterBuild, updatedAt: Date.now() });
        setBuildTimeline((current) => [...current, "Saved local project draft"]);
      }

      addNotification({ kind: "build", title: "App Built Successfully", description: finalTitle });
      void trackAnonymousUsage("build_completed").catch((error: unknown) => console.warn("Anonymous usage telemetry could not be recorded:", error));
      saveActivity({
        kind: editMode ? "edit" : "build",
        title: editMode ? "App updated successfully" : "App built successfully",
        detail: `${finalTitle} · ${buildProvider}`,
        durationMs: Date.now() - buildStartedAt,
        promptCharacters: trimmed.length,
      });
      toast({
        title: "✨ Build successful",
        description: user ? `Saved: "${finalTitle}"` : `Sign in to save: "${finalTitle}"`,
      });
    } catch (err: unknown) {
      if ((err instanceof Error && err.name === "AbortError") || controller.signal.aborted) {
        setBuildFiles((current) => current.map((file) => file.status === "generating" || file.status === "validating" ? { ...file, status: "failed", error: "Build stopped by user" } : file));
        setMessages((current) => [...current, { role: "assistant", content: `Build stopped. Completed files are kept and this prompt can resume safely.`, timestamp: Date.now() }]);
        toast({ title: "Build stopped", description: "Your prompt is still here; you can try again." });
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
      setMessages((current) => [...current, { role: "assistant", content: `Build failed: ${msg}`, timestamp: Date.now() }]);
      toast({ title: staleGenerator ? "Generator update required" : "Build failed", description: msg, variant: "destructive" });
    } finally {
      abortRef.current = null;
      setIsBuilding(false);
      setIsGeneratingApp(false);
      setProgressStage("Understanding request");
      if (!generatedPreview && !lastCode) setMobileStudioTab("chat");
    }
  };

  const stopBuild = () => abortRef.current?.abort();
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
  const newProject = () => {
    if (!window.confirm("Start a new project? Your current chat and code will be cleared.")) return;
    abortRef.current?.abort();
    if (chatKey === "local:current") clearLocalVersions(chatKey);
    setProjectId(null); setProjectTitle("Untitled Project"); setTitleManuallyEdited(false); setPrompt(""); setLastCode(null); setWorkingCode(null); setChangeBaseCode(null); setBuildFiles([]); setBuildTimeline([]); partialBuildRef.current = null; setMessages([]); setVersions([]); runtimeIssuesRef.current = []; repairAttemptsRefState.current = []; setQualityState(emptyQualityState()); setDoc(buildDocFromPrompt("")); setView("studio"); setMobileStudioTab("chat"); setIsGeneratingApp(false); setWorkspaceSidebarOpen(true); discardProjectDraft();
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

  const resetDeletedProject = () => {
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
    setMessages([]);
    setVersions([]);
    setDoc(buildDocFromPrompt(""));
    setView("studio");
    setMobileStudioTab("chat");
    setIsGeneratingApp(false);
    setWorkspaceSidebarOpen(true);
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

  if (!authReady || (user && accountProjectLoading)) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        Restoring your workspace…
      </div>
    );
  }

  const sidebarOverlay = view === "studio" && (Boolean(projectId) || Boolean(lastCode) || isGeneratingApp || messages.length > 0);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          active={view}
          onChange={navigateView}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenSignIn={() => setAuthOpen(true)}
          onOpenPricing={() => setPricingOpen(true)}
          isBuilding={isBuilding}
          progressStage={progressStage}
          overlay={sidebarOverlay}
          open={workspaceSidebarOpen}
          onOpenChange={setWorkspaceSidebarOpen}
        />

        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <header className="relative z-30 flex h-14 sm:h-16 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background/40 px-3 sm:px-6 backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                onClick={() => setWorkspaceSidebarOpen(true)}
                aria-label="Open workspace navigation"
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground",
                  !sidebarOverlay && "md:hidden",
                )}
              >
                <Menu className="h-5 w-5" />
              </button>
              {view === "studio" ? (
                <h1 className="max-w-[18ch] sm:max-w-[40ch] truncate font-display text-sm sm:text-base font-semibold text-foreground">{projectTitle}</h1>
              ) : (
                <h1 className="truncate font-display text-sm sm:text-base font-semibold text-foreground">{VIEW_TITLES[view]}</h1>
              )}
              {view === "studio" && (
                <span className="hidden rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary sm:inline">
                  {titleManuallyEdited ? "Draft" : "Auto title"}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
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
                {showPreview && <div className="flex shrink-0 items-center gap-1 border-b border-border/60 bg-background/60 p-1.5 lg:hidden">
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
                        progressStage={progressStage}
                        buildFiles={buildFiles}
                        buildTimeline={buildTimeline}
                        messages={messages}
                        hasCode={Boolean(lastCode)}
                      />
                    </section>
                  ) : (
                    <>
                      <ResizablePanelGroup direction="horizontal" className="hidden min-h-0 flex-1 lg:flex">
                        <ResizablePanel defaultSize={42} minSize={28} className="min-w-0">
                          <section className="flex h-full min-h-0 min-w-0 flex-col overflow-y-auto border-r border-border/60">
                            <PromptPanel
                              prompt={prompt}
                              onPromptChange={handlePromptChange}
                              onBuild={handleBuild}
                              onDownload={handleDownload}
                              onStop={stopBuild}
                              onNewProject={newProject}
                              isBuilding={isBuilding}
                              progressStage={progressStage}
                              buildFiles={buildFiles}
                              buildTimeline={buildTimeline}
                              messages={messages}
                              hasCode={Boolean(lastCode)}
                            />
                          </section>
                        </ResizablePanel>
                        <ResizableHandle withHandle className="bg-border/60" />
                        <ResizablePanel defaultSize={58} minSize={32} className="min-w-0">
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
                              quality={qualityState}
                              onRunQuality={() => void runQualityChecks()}
                              qualityRunning={qualityRunning}
                              onRollbackRepair={(attempt) => void rollbackRepairAttempt(attempt)}
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
                      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
                        <section className={cn("min-h-0 min-w-0 overflow-y-auto border-b border-border/60", mobileStudioTab === "chat" ? "flex flex-1 flex-col" : "hidden")}>
                          <PromptPanel
                            prompt={prompt}
                            onPromptChange={handlePromptChange}
                            onBuild={handleBuild}
                            onDownload={handleDownload}
                            onStop={stopBuild}
                            onNewProject={newProject}
                            isBuilding={isBuilding}
                            progressStage={progressStage}
                            buildFiles={buildFiles}
                            buildTimeline={buildTimeline}
                            messages={messages}
                            hasCode={Boolean(lastCode)}
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
                            quality={qualityState}
                            onRunQuality={() => void runQualityChecks()}
                            qualityRunning={qualityRunning}
                            onRollbackRepair={(attempt) => void rollbackRepairAttempt(attempt)}
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
                    toast({ title: "Sign in required", description: "Sign in to open your saved project.", variant: "destructive" });
                    return;
                  }
                  void (async () => {
                    try {
                      const project = await loadProject(p.id, session.user.id);
                      const projectVersions = await loadProjectVersions(p.id, session.user.id);
                      partialBuildRef.current = null;
                      setBuildFiles([]);
                      setBuildTimeline([]);
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
                      setWorkingCode(project.code);
                      setMessages(project.messages);
                      setVersions(projectVersions);
                      lastReportedRef.current = "";
                      isRepairingRef.current = false;
                      runtimeIssuesRef.current = [];
                      repairAttemptsRefState.current = [];
                      setQualityState(buildQualityState({ code: project.code || "", prompt: project.prompt || "" }));
                      setDoc(buildDocFromPrompt(project.prompt, project.code));
                      setView("studio");
                      setWorkspaceSidebarOpen(false);
                      setMobileStudioTab("preview");
                      toast({ title: "Project loaded", description: project.title });
                    } catch (error) {
                      toast({ title: "Couldn't open project", description: error instanceof Error ? error.message : "Please retry after checking your connection.", variant: "destructive" });
                    }
                  })();
                }}
              />
            )}
            {view === "templates" && <TemplatesPage onNavigate={navigateView} onUseTemplate={(templatePrompt) => { handlePromptChange(templatePrompt); setView("studio"); setWorkspaceSidebarOpen(true); }} />}
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
          <span className="hidden font-mono opacity-70 sm:inline">v1.0.0</span>
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
