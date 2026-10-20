import { useEffect, useRef, useState } from "react";
import { Sidebar, type ViewKey } from "@/components/appigen/Sidebar";
import { PromptPanel } from "@/components/appigen/PromptPanel";
import { PreviewPanel } from "@/components/appigen/PreviewPanel";
import { DashboardPage } from "@/components/appigen/pages/DashboardPage";
import { MyAppsPage } from "@/components/appigen/pages/MyAppsPage";
import { TemplatesPage } from "@/components/appigen/pages/TemplatesPage";
import { ApiSettingsPage } from "@/components/appigen/pages/ApiSettingsPage";
import { PricingPage } from "@/components/appigen/pages/PricingPage";
import { PlaygroundPage } from "@/components/appigen/pages/PlaygroundPage";
import { AuthModal } from "@/components/appigen/AuthModal";
import { PricingModal } from "@/components/appigen/PricingModal";
import { SettingsPanel } from "@/components/appigen/SettingsPanel";
import { NotificationsMenu } from "@/components/appigen/NotificationsMenu";
import { GithubModal } from "@/components/appigen/GithubModal";
import { useApp } from "@/components/appigen/AppContext";
import { Sparkles, Pencil, Menu, MessageSquare, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { buildDocFromPrompt } from "@/lib/preview/buildDocFromPrompt";
import { isGenericFallbackCode } from "@/lib/preview/isGenericFallbackCode";
import { normalizeFileMarkers } from "@/lib/preview/parseFileMarkers";
import { validateGeneratedCode } from "@/lib/preview/validateGeneratedCode";
import { getFunctionErrorMessage } from "@/lib/supabase/functionError";
import { createRunnableProjectZip } from "@/lib/projects/exportProject";
import { isNewAppPrompt } from "@/lib/projects/promptIntent";
import { clearLocalVersions, discardProjectDraft, readLocalVersionsForProject, readProjectDraft, writeLocalVersion, writeProjectDraft, writeProjectMessages, type ChatMessage, type LocalProjectVersion } from "@/lib/projects/projectStorage";
import { loadMostRecentProject, loadProject, loadProjectVersions, persistProject } from "@/lib/projects/projectRepository";

const VIEW_TITLES: Record<ViewKey, string> = {
  studio: "",
  dashboard: "Dashboard",
  apps: "My Apps",
  templates: "Templates",
  api: "API Settings",
  pricing: "Pricing & Credits",
  playground: "Playground",
};

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "untitled";
const BUILD_REQUEST_TIMEOUT_MS = 140_000;

const suggestProjectTitle = (promptText: string) => {
  if (promptText.trim().length < 12) return "Untitled Project";
  const title = promptText
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(please\s+)?(build|create|make|design|generate|develop)\s+(me\s+)?(a|an|the)?\s*/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .split(/\s+(?:with|including|featuring|that|which|using|and|for)\s+/i)[0]
    .replace(/[.,!?;:]+$/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 4)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return title || "Untitled Project";
};

const Index = () => {
  const [initialDraft] = useState(() => {
    const draft = readProjectDraft();
    if (!draft?.code || !isGenericFallbackCode(draft.code)) return draft;
    return { ...draft, projectId: null, title: "Untitled Project", prompt: "", code: null, messages: [], versions: [] };
  });
  const [isBuilding, setIsBuilding] = useState(false);
  const [prompt, setPrompt] = useState(initialDraft?.prompt ?? "");
  const [doc, setDoc] = useState<string>(() => buildDocFromPrompt(initialDraft?.prompt ?? "", initialDraft?.code ?? undefined));
  const [view, setView] = useState<ViewKey>("studio");
  const [authOpen, setAuthOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [projectTitle, setProjectTitle] = useState(initialDraft?.title ?? "Untitled Project");
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(Boolean(initialDraft?.title && initialDraft.title !== "Untitled Project"));
  const [editingTitle, setEditingTitle] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(initialDraft?.code ?? null);
  const [projectId, setProjectId] = useState<string | null>(initialDraft?.projectId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialDraft?.code ? initialDraft.messages ?? [] : []);
  const [versions, setVersions] = useState<LocalProjectVersion[]>(() => {
    if (!initialDraft?.code) return initialDraft?.versions ?? [];
    const storedVersions = readLocalVersionsForProject(initialDraft.projectId ?? "local:current");
    return [...new Map([...initialDraft.versions, ...storedVersions].map((version) => [version.id, version])).values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
  });
  const [progressStage, setProgressStage] = useState("Planning");
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [manualFixing, setManualFixing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const previousUserRef = useRef(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileStudioTab, setMobileStudioTab] = useState<"chat" | "preview">(initialDraft?.code ? "preview" : "chat");
  const { user, session, authReady, addNotification } = useApp();

  const chatKey = projectId || "local:current";
  useEffect(() => {
    if (authReady && !user) writeProjectMessages(chatKey, messages);
  }, [authReady, chatKey, messages, user]);
  useEffect(() => {
    if (!authReady || user) return;
    if (readProjectDraft()?.ownerId) return;
    writeProjectDraft({ projectId, title: projectTitle, prompt, code: lastCode, messages, versions, updatedAt: Date.now() });
  }, [authReady, user, projectId, projectTitle, prompt, lastCode, messages, versions]);
  const [accountProjectLoading, setAccountProjectLoading] = useState(false);
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    if (!user || !session?.user.id) {
      if (previousUserRef.current) {
        setProjectId(null);
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
    setProjectTitle("Untitled Project");
    setTitleManuallyEdited(false);
    setPrompt("");
    setLastCode(null);
    setMessages([]);
    setVersions([]);
    setDoc(buildDocFromPrompt(""));
    setAccountProjectLoading(true);
    void (async () => {
      try {
        const pendingDraft = readProjectDraft();
        const ownedPendingDraft = pendingDraft?.ownerId === session.user.id && pendingDraft.code
          ? pendingDraft
          : null;
        let pendingDraftSyncFailed = false;
        if (ownedPendingDraft) {
          try {
            await persistProject({
              projectId: ownedPendingDraft.projectId,
              userId: session.user.id,
              title: ownedPendingDraft.title,
              prompt: ownedPendingDraft.prompt,
              code: ownedPendingDraft.code,
              messages: ownedPendingDraft.messages,
            });
          } catch (error) {
            pendingDraftSyncFailed = true;
            toast({
              title: "Restored your local recovery copy",
              description: error instanceof Error ? error.message : "Cloud sync will retry when you save again.",
              variant: "destructive",
            });
          }
          if (cancelled) return;
        }
        const project = await loadMostRecentProject(session.user.id);
        if (cancelled) return;
        if (pendingDraftSyncFailed && ownedPendingDraft) {
          setProjectId(ownedPendingDraft.projectId);
          setProjectTitle(ownedPendingDraft.title);
          setTitleManuallyEdited(true);
          setPrompt(ownedPendingDraft.prompt);
          setLastCode(ownedPendingDraft.code);
          setMessages(ownedPendingDraft.messages);
          setDoc(buildDocFromPrompt(ownedPendingDraft.prompt, ownedPendingDraft.code));
          setVersions(ownedPendingDraft.versions);
          setMobileStudioTab("preview");
          previousUserRef.current = true;
          return;
        }
        if (project) {
          const projectVersions = await loadProjectVersions(project.id, session.user.id);
          if (cancelled) return;
          setProjectId(project.id);
          setProjectTitle(project.title);
          setTitleManuallyEdited(true);
          setPrompt(project.prompt);
          setLastCode(project.code);
          setMessages(project.messages.length ? project.messages : [
            { role: "user", content: project.prompt, timestamp: new Date(project.updated_at).getTime() },
            { role: "assistant", content: "Your app is ready in Preview.", timestamp: new Date(project.updated_at).getTime() },
          ]);
          setDoc(buildDocFromPrompt(project.prompt, project.code));
          setVersions(projectVersions);
          setMobileStudioTab("preview");
          previousUserRef.current = true;
        } else {
          const draft = readProjectDraft();
          if (draft?.code && !draft.projectId && window.confirm("Save your local AppiGen draft to this account?")) {
            const savedId = await persistProject({
              projectId: null,
              userId: session.user.id,
              title: draft.title,
              prompt: draft.prompt,
              code: draft.code,
              messages: draft.messages,
            });
            if (cancelled) return;
            setProjectId(savedId);
            setProjectTitle(draft.title);
            setTitleManuallyEdited(true);
            setPrompt(draft.prompt);
            setLastCode(draft.code);
            setMessages(draft.messages);
            setVersions(draft.versions);
            setDoc(buildDocFromPrompt(draft.prompt, draft.code));
            discardProjectDraft();
            previousUserRef.current = true;
            toast({ title: "Draft saved", description: draft.title });
          } else {
            previousUserRef.current = true;
          }
        }
      } catch (error) {
        if (!cancelled) toast({ title: "Couldn't restore your latest project", description: error instanceof Error ? error.message : "Please retry after checking your connection.", variant: "destructive" });
      } finally {
        if (!cancelled) setAccountProjectLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authReady, session?.user.id, user]);

  useEffect(() => {
    if (!authReady || !user || !session?.user.id || !projectId || !lastCode || !messages.length) return;
    const timeout = window.setTimeout(() => {
      void persistProject({ projectId, userId: session.user.id, title: projectTitle, prompt, code: lastCode, messages })
        .catch((error: unknown) => toast({ title: "Project auto-save failed", description: error instanceof Error ? error.message : "Your latest changes could not be saved.", variant: "destructive" }));
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [authReady, user, session?.user.id, projectId, projectTitle, prompt, lastCode, messages]);

  // Phase 9: auto-repair loop. Tracks attempts per code revision.
  const repairAttemptsRef = useRef(0);
  const lastReportedRef = useRef<string>("");
  const isRepairingRef = useRef(false);

  // Listen for runtime/compile errors from preview iframe and auto-repair
  useEffect(() => {
    const onMsg = async (ev: MessageEvent) => {
      const previewWindow = document.querySelector<HTMLIFrameElement>('iframe[title="AppiGen Sandbox Preview"]')?.contentWindow;
      if (!previewWindow || ev.source !== previewWindow) return;
      const m = ev.data;
      if (!m || typeof m !== "object" || !m.__appigen) return;
      const sig = `${m.kind}::${m.message}`;
      if (sig === lastReportedRef.current) return;
      lastReportedRef.current = sig;
      if (!lastCode || isRepairingRef.current) return;
      if (repairAttemptsRef.current >= 2) return; // max 2 auto attempts
      // Only repair on real failures
      if (!["error", "compile", "promise", "blank", "render"].includes(m.kind)) return;

      repairAttemptsRef.current += 1;
      isRepairingRef.current = true;
      toast({ title: "🔧 Auto-repairing", description: `Attempt ${repairAttemptsRef.current}/2 — ${String(m.message).slice(0, 80)}` });
      try {
        const { data, error } = await supabase.functions.invoke("Appigen", {
          body: { mode: "repair", code: lastCode, error: `${m.kind}: ${m.message}\n${m.stack || ""}` },
        });
        if (error) throw error;
        if (data?.code) {
          const repairedCode = normalizeFileMarkers(data.code);
          const validationError = validateGeneratedCode(repairedCode);
          if (validationError) throw new Error(`Repair returned an invalid project: ${validationError}`);
          lastReportedRef.current = "";
          setLastCode(repairedCode);
          setDoc(buildDocFromPrompt(prompt, repairedCode));
          toast({ title: "✅ Repair applied", description: "Re-rendering preview" });
        }
      } catch (e: unknown) {
        toast({ title: "Auto-repair failed", description: await getFunctionErrorMessage(e, "Please try again."), variant: "destructive" });
      } finally {
        isRepairingRef.current = false;
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [lastCode, prompt]);

  const handleDownload = async () => {
    try {
      const blob = await createRunnableProjectZip({ title: projectTitle, prompt: prompt || messages.filter((m) => m.role === "user").at(-1)?.content || "", code: lastCode || "" });
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

  const handleBuild = async (stage?: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast({ title: "Prompt is empty", description: "Describe the app you want to build first.", variant: "destructive" });
      return;
    }
    repairAttemptsRef.current = 0;
    lastReportedRef.current = "";
    isRepairingRef.current = false;
    const editMode = Boolean(lastCode) && !isNewAppPrompt(trimmed);
    const baseMessages = editMode ? messages : [];
    const submitted: ChatMessage = { role: "user", content: trimmed, timestamp: Date.now() };
    const nextMessages = [...baseMessages, submitted];
    let versionsAfterBuild = versions;
    setMessages(nextMessages);
    if (!editMode) {
      setVersions([]);
      setProjectTitle(suggestProjectTitle(trimmed));
      setTitleManuallyEdited(false);
    }
    setMobileStudioTab("chat");
    setProgressStage(editMode ? "Generating" : "Planning");
    setIsBuilding(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let buildTimedOut = false;
    const buildTimeout = window.setTimeout(() => {
      buildTimedOut = true;
      controller.abort();
    }, BUILD_REQUEST_TIMEOUT_MS);
    let progressTimer: number | undefined;
    try {
      progressTimer = window.setInterval(() => setProgressStage((current) => ({ Planning: "Generating", Generating: "Reviewing", Reviewing: "Validating", Validating: "Validating" }[current] || "Generating")), 18000);
      const { data, error } = await supabase.functions.invoke("Appigen", {
        body: editMode
          ? { mode: "edit", prompt: trimmed, code: lastCode, conversation: messages.slice(-12) }
          : { mode: "build", prompt: trimmed, stage },
        signal: controller.signal,
      });
      if (error) throw error;
      if (!data?.code) throw new Error("No code returned from AI");
      if (data.provider === "local-fallback" || isGenericFallbackCode(data.code)) {
        throw new Error("The AI service returned a generic sample instead of your requested app. Please try again after the AI service is available.");
      }
      const generatedCode = normalizeFileMarkers(data.code);
      const validationError = validateGeneratedCode(generatedCode, !editMode);
      if (validationError) throw new Error(`The generated project is invalid: ${validationError}`);
      if (editMode && lastCode) {
        const snapshot: LocalProjectVersion = { id: crypto.randomUUID(), code: lastCode, prompt: trimmed, createdAt: Date.now() };
        versionsAfterBuild = [snapshot, ...versions].slice(0, 50);
        setVersions(versionsAfterBuild);
        writeLocalVersion(chatKey, snapshot);
        if (user && projectId) {
          const { data: auth } = await supabase.auth.getUser();
          if (auth.user) {
            const { error: versionError } = await supabase.from("project_versions").insert({ project_id: projectId, user_id: auth.user.id, code: lastCode, prompt: trimmed });
            if (versionError) {
              toast({
                title: "Version saved locally",
                description: `Cloud version history could not be updated: ${versionError.message}`,
                variant: "destructive",
              });
            }
          }
        }
      }
      setLastCode(generatedCode);
      setDoc(buildDocFromPrompt(trimmed, generatedCode));
      const completedMessages = [...nextMessages, { role: "assistant" as const, content: editMode ? "Project updated. Your previous version is available to restore." : "Your app is ready in Preview.", timestamp: Date.now() }];
      setMessages(completedMessages);
      setPrompt("");

      const finalTitle = editMode
        ? projectTitle !== "Untitled Project" ? projectTitle : suggestProjectTitle(trimmed)
        : suggestProjectTitle(trimmed);
      if (finalTitle !== projectTitle) setProjectTitle(finalTitle);

      if (user) {
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
            });
            setProjectId(savedId);
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
        writeProjectDraft({ projectId: null, title: finalTitle, prompt: trimmed, code: generatedCode, messages: completedMessages, versions: versionsAfterBuild, updatedAt: Date.now() });
      }

      addNotification({ kind: "build", title: "App Built Successfully", description: finalTitle });
      toast({
        title: "✨ Build successful",
        description: user ? `Saved: "${finalTitle}"` : `Sign in to save: "${finalTitle}"`,
      });
    } catch (err: unknown) {
      if (buildTimedOut) {
        const msg = "The build request timed out while waiting for the AI service. Please try again; your prompt and current preview are unchanged.";
        setMessages((current) => [...current, { role: "assistant", content: `Build failed: ${msg}`, timestamp: Date.now() }]);
        toast({ title: "Build timed out", description: msg, variant: "destructive" });
        return;
      }
      if ((err instanceof Error && err.name === "AbortError") || controller.signal.aborted) {
        toast({ title: "Build stopped", description: "Your prompt is still here; you can try again." });
        return;
      }
      console.error("Build failed:", err);
      const errorMessage = await getFunctionErrorMessage(err, "Something went wrong calling the AI.");
      const staleGenerator =
        errorMessage.includes("generic sample") ||
        (errorMessage.includes("generated project is invalid") &&
          /missing src\/styles\.css|missing a focused screen|missing reusable UI|must import its app-specific|must compose a page|reusable component from src\/components/i.test(errorMessage));
      const msg = staleGenerator
        ? `The deployed Appigen Edge Function is outdated or returned a generic project. Deploy the latest function before building again. Your current preview was kept unchanged.${errorMessage.includes("generated project is invalid") ? ` Validation: ${errorMessage.replace("The generated project is invalid: ", "")}` : ""}`
        : errorMessage;
      setMessages((current) => [...current, { role: "assistant", content: `Build failed: ${msg}`, timestamp: Date.now() }]);
      toast({ title: staleGenerator ? "Generator update required" : "Build failed", description: msg, variant: "destructive" });
    } finally {
      window.clearTimeout(buildTimeout);
      if (progressTimer !== undefined) window.clearInterval(progressTimer);
      abortRef.current = null;
      setIsBuilding(false);
      setProgressStage("Planning");
    }
  };

  const stopBuild = () => abortRef.current?.abort();
  const newProject = () => {
    if (!window.confirm("Start a new project? Your current chat and code will be cleared.")) return;
    abortRef.current?.abort();
    if (chatKey === "local:current") clearLocalVersions(chatKey);
    setProjectId(null); setProjectTitle("Untitled Project"); setTitleManuallyEdited(false); setPrompt(""); setLastCode(null); setMessages([]); setVersions([]); setDoc(buildDocFromPrompt("")); setView("studio"); setMobileStudioTab("chat"); discardProjectDraft();
  };

  const restoreVersion = (version: LocalProjectVersion) => {
    setLastCode(version.code); setPrompt(version.prompt); setDoc(buildDocFromPrompt(version.prompt, version.code)); setVersionMenuOpen(false);
    if (projectId && session?.user.id) {
      void persistProject({ projectId, userId: session.user.id, title: projectTitle, prompt: version.prompt, code: version.code, messages })
        .catch((error: unknown) => toast({ title: "Version restored, save failed", description: error instanceof Error ? error.message : "Could not save the restored version.", variant: "destructive" }));
    }
    toast({ title: "Version restored" });
  };

  const manualFix = async () => {
    if (!lastCode || manualFixing) return;
    setManualFixing(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 70_000);
    try {
      const { data, error } = await supabase.functions.invoke("Appigen", {
        body: {
          mode: "repair",
          code: lastCode,
          error: "Manual Fix requested. Inspect the full project for actual syntax, import, runtime, responsive-layout, and interaction defects. Preserve the user's requested features and visual design. Fix issues in the correct source files; do not replace working features or collapse the project into one file.",
        },
        signal: controller.signal,
      });
      if (error) throw error;
      if (typeof data?.code !== "string" || !data.code.trim()) {
        throw new Error("The repair function returned no updated project code.");
      }
      const repairedCode = normalizeFileMarkers(data.code);
      const validationError = validateGeneratedCode(repairedCode);
      if (validationError) throw new Error(`The repair returned an invalid project: ${validationError}`);
      const snapshot: LocalProjectVersion = { id: crypto.randomUUID(), code: lastCode, prompt, createdAt: Date.now() };
      setVersions((current) => [snapshot, ...current].slice(0, 50));
      writeLocalVersion(chatKey, snapshot);
      setLastCode(repairedCode);
      setDoc(buildDocFromPrompt(prompt, repairedCode));

      if (user && projectId && session?.user.id) {
        try {
          await persistProject({ projectId, userId: session.user.id, title: projectTitle, prompt, code: repairedCode, messages });
        } catch (saveError) {
          toast({ title: "Fix applied, cloud save failed", description: saveError instanceof Error ? saveError.message : "Could not save the repaired project.", variant: "destructive" });
          return;
        }
      }
      toast({ title: "Fix applied", description: "The preview is refreshing. Your previous version is available to restore." });
    } catch (error: unknown) {
      const message = controller.signal.aborted
        ? "AI repair timed out. Your current preview was kept unchanged."
        : await getFunctionErrorMessage(error, "Please try again.");
      toast({ title: "Fix failed", description: message, variant: "destructive" });
    } finally {
      window.clearTimeout(timeout);
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

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          active={view}
          onChange={setView}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenSignIn={() => setAuthOpen(true)}
          onOpenPricing={() => setPricingOpen(true)}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />

        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <header className="relative z-30 flex h-14 sm:h-16 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background/40 px-3 sm:px-6 backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open menu"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground md:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              {view === "studio" ? (
                editingTitle ? (
                  <input
                    autoFocus
                    value={projectTitle}
                    onChange={(e) => { setProjectTitle(e.target.value); setTitleManuallyEdited(true); }}
                    onBlur={() => setEditingTitle(false)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingTitle(false); }}
                    className="w-full min-w-0 rounded-md border border-primary/40 bg-background/60 px-2 py-1 font-display text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:text-base"
                  />
                ) : (
                  <button onClick={() => setEditingTitle(true)} className="group flex min-w-0 items-center gap-2">
                    <h1 className="max-w-[18ch] sm:max-w-[40ch] truncate font-display text-sm sm:text-base font-semibold text-foreground">{projectTitle}</h1>
                    <Pencil className="hidden h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
                  </button>
                )
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
                <div className="flex shrink-0 items-center gap-1 border-b border-border/60 bg-background/60 p-1.5 lg:hidden">
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
                </div>

                <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                  <section
                    className={cn(
                      "min-h-0 min-w-0 overflow-y-auto border-b border-border/60 lg:w-[42%] lg:border-b-0 lg:border-r lg:flex",
                      mobileStudioTab === "chat" ? "flex flex-1 flex-col" : "hidden lg:flex"
                    )}
                  >
                    <PromptPanel
                      prompt={prompt}
                      onPromptChange={(value) => {
                        setPrompt(value);
                        if (!titleManuallyEdited) setProjectTitle(suggestProjectTitle(value));
                      }}
                      onBuild={handleBuild}
                      onDownload={handleDownload}
                      onStop={stopBuild}
                      onNewProject={newProject}
                      isBuilding={isBuilding}
                      progressStage={progressStage}
                      messages={messages}
                      hasCode={Boolean(lastCode)}
                    />
                  </section>
                  <section
                    className={cn(
                      "min-h-0 min-w-0 flex-1 lg:flex",
                      mobileStudioTab === "preview" ? "flex" : "hidden lg:flex"
                    )}
                  >
                    <PreviewPanel
                      isBuilding={isBuilding}
                      doc={doc}
                      code={lastCode}
                      versions={versions}
                      onRestoreVersion={restoreVersion}
                      onManualFix={manualFix}
                      fixing={manualFixing}
                      onPushToGithub={() => setGithubOpen(true)}
                      onCodeChange={(newCode) => {
                        repairAttemptsRef.current = 0;
                        lastReportedRef.current = "";
                        isRepairingRef.current = false;
                        setLastCode(newCode);
                        setDoc(buildDocFromPrompt(prompt, newCode));
                        if (user && session?.user.id && projectId) {
                          void (async () => {
                            try {
                              await persistProject({ projectId, userId: session.user.id, title: projectTitle, prompt, code: newCode, messages });
                            } catch (error) {
                              toast({
                                title: "Cloud save failed",
                                description: error instanceof Error ? error.message : "Could not save the project to your account.",
                                variant: "destructive",
                              });
                            }
                          })();
                        }
                      }}
                    />
                  </section>
                </div>
              </>
            )}
            {view === "dashboard" && <DashboardPage onNavigate={setView} />}
            {view === "apps" && (
              <MyAppsPage
                onNavigate={setView}
                onOpenProject={(p) => {
                  if (!session?.user.id) {
                    toast({ title: "Sign in required", description: "Sign in to open your saved project.", variant: "destructive" });
                    return;
                  }
                  void (async () => {
                    try {
                      const project = await loadProject(p.id, session.user.id);
                      const projectVersions = await loadProjectVersions(p.id, session.user.id);
                      setProjectId(project.id);
                      setProjectTitle(project.title);
                      setTitleManuallyEdited(true);
                      setPrompt(project.prompt);
                      setLastCode(project.code);
                      setMessages(project.messages);
                      setVersions(projectVersions);
                      repairAttemptsRef.current = 0;
                      lastReportedRef.current = "";
                      isRepairingRef.current = false;
                      setDoc(buildDocFromPrompt(project.prompt, project.code));
                      setView("studio");
                      setMobileStudioTab("preview");
                      toast({ title: "Project loaded", description: project.title });
                    } catch (error) {
                      toast({ title: "Couldn't open project", description: error instanceof Error ? error.message : "Please retry after checking your connection.", variant: "destructive" });
                    }
                  })();
                }}
              />
            )}
            {view === "templates" && <TemplatesPage onNavigate={setView} />}
            {view === "api" && <ApiSettingsPage />}
            {view === "pricing" && <PricingPage />}
            {view === "playground" && <PlaygroundPage />}
          </main>
        </div>
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <PricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <GithubModal open={githubOpen} onClose={() => setGithubOpen(false)} />

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
