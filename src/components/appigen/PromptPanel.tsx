import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AlertCircle, Bookmark, CheckCircle2, ChevronRight, Clock, Copy, Eye, FileCode2, Info, Link2, ListChecks, LoaderCircle, MoreHorizontal, RotateCcw, Sparkles, Paperclip, Mic, Download, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ChatMessage } from "@/lib/projects/projectStorage";
import type { BuildFileProgress } from "@/lib/projects/buildWorkflow";
import { activityDurationMs, activityStatusLabel, formatActivityDuration, summarizeActivityFiles, type BuildActivity } from "@/lib/projects/conversationActivity";
import { parseFileMarkers } from "@/lib/preview/parseFileMarkers";

interface PromptPanelProps {
  onBuild: (stage?: string) => void;
  onDownload: () => void;
  onStop: () => void;
  onNewProject: () => void;
  isBuilding: boolean;
  progressStage: string;
  buildFiles: BuildFileProgress[];
  buildTimeline: string[];
  messages: ChatMessage[];
  hasCode: boolean;
  prompt: string;
  onPromptChange: (v: string) => void;
  workingCode?: string | null;
  /** Lets the page restore focus to the prompt after a build finishes. */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** Start time of the in-progress build, used by the "Thought for ..." indicator. */
  activityStartedAt?: number;
  /** Short explanation shown under the activity heading. */
  activityExplanation?: string;
  /** Resolve the source snapshot for a historical activity version. */
  resolveActivityCode?: (versionId: string) => string | null;
  /** Show the preview associated with a specific activity. */
  onPreviewActivity?: (activity: BuildActivity) => void;
  /** Restore the version created by a specific activity. */
  onRestoreActivity?: (versionId: string) => void;
  onMessageFeedback?: (timestamp: number, feedback: "up" | "down" | null) => void;
  onToggleBookmark?: (timestamp: number) => void;
  /** Retry the prompt after a failed or stopped build. */
  onRetryBuild?: () => void;
}

const BUILD_STAGES = ["Planning", "Generating", "Reviewing", "Validating", "Updating preview", "Saving"] as const;
const PROMPT_IDEAS = [
  "A sleek SaaS analytics dashboard with revenue charts and a collapsible sidebar",
  "A warm, editorial online bookstore with search, genre filters, and a shopping bag",
  "A focused AI chat workspace with conversation history and streaming message states",
  "A bold creative portfolio with project case studies and a contact form",
  "A calm habit tracker with weekly progress, streaks, and encouraging insights",
  "A modern event booking experience with an interactive calendar and checkout",
];

type SpeechRecognitionResult = ArrayLike<{ transcript: string }>;

type SpeechRecognitionErrorCode =
  | "aborted"
  | "audio-capture"
  | "bad-grammar"
  | "language-not-supported"
  | "network"
  | "no-speech"
  | "not-allowed"
  | "service-not-allowed";

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<SpeechRecognitionResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: SpeechRecognitionErrorCode }) => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

export const speechRecognitionErrorMessage = (code?: string) => {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Allow microphone access for AppiGen in your browser, then try again.";
    case "audio-capture":
      return "No microphone was found. Connect a microphone and try again.";
    case "no-speech":
      return "No speech was detected. Speak closer to the microphone and try again.";
    case "network":
      return "Speech recognition could not reach the browser's voice service. Check your connection and try again.";
    case "language-not-supported":
      return "This browser does not support speech recognition for the selected language.";
    case "aborted":
      return "";
    default:
      return "Microphone input failed. Check browser microphone permission and try again.";
  }
};


const ICON_BUTTON = "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const MessageActions = ({ message, onFeedback, onToggleBookmark, onRestore }: {
  message: ChatMessage;
  onFeedback?: (timestamp: number, feedback: "up" | "down" | null) => void;
  onToggleBookmark?: (timestamp: number) => void;
  onRestore?: () => void;
}) => {
  const copy = async (value: string, kind: "text" | "link") => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      toast({ title: kind === "link" ? "Message link copied" : "Message copied" });
    } catch {
      toast({ title: "Could not copy", description: "Clipboard access is blocked in this browser.", variant: "destructive" });
    }
  };
  const messageLink = () => `${window.location.origin}${window.location.pathname}#message-${message.timestamp}`;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-0.5">
      <button type="button" className={cn(ICON_BUTTON, message.feedback === "up" && "text-emerald-500")} onClick={() => onFeedback?.(message.timestamp, message.feedback === "up" ? null : "up")} aria-label="Helpful" aria-pressed={message.feedback === "up"} title="Helpful"><ThumbsUp className="h-3.5 w-3.5" /></button>
      <button type="button" className={cn(ICON_BUTTON, message.feedback === "down" && "text-destructive")} onClick={() => onFeedback?.(message.timestamp, message.feedback === "down" ? null : "down")} aria-label="Not helpful" aria-pressed={message.feedback === "down"} title="Not helpful"><ThumbsDown className="h-3.5 w-3.5" /></button>
      <button type="button" className={ICON_BUTTON} onClick={() => void copy(message.content, "text")} aria-label="Copy message" title="Copy message"><Copy className="h-3.5 w-3.5" /></button>
      <button type="button" className={ICON_BUTTON} onClick={() => void copy(messageLink(), "link")} aria-label="Copy message link" title="Copy message link"><Link2 className="h-3.5 w-3.5" /></button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={ICON_BUTTON} aria-label="More options" title="More options"><MoreHorizontal className="h-3.5 w-3.5" /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onSelect={() => void copy(`### AppiGen\n\n${message.content}`, "text")}><Copy className="mr-2 h-3.5 w-3.5" />Copy as markdown</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onToggleBookmark?.(message.timestamp)}><Bookmark className={cn("mr-2 h-3.5 w-3.5", message.bookmarked && "fill-current text-primary")} />{message.bookmarked ? "Remove bookmark" : "Bookmark message"}</DropdownMenuItem>
          {onRestore && <DropdownMenuItem onSelect={onRestore}><RotateCcw className="mr-2 h-3.5 w-3.5" />Revert to this version</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      {message.bookmarked && <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"><Bookmark className="h-3 w-3 fill-current" />Saved</span>}
    </div>
  );
};

const ActivityFileList = ({ files, contents, expanded, onToggle }: {
  files: BuildFileProgress[];
  contents: Record<string, string>;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) => {
  if (!files.length) return <p className="text-[11px] text-muted-foreground">No files were generated for this activity.</p>;
  return (
    <ul className="space-y-1">
      {files.map((file) => {
        const open = expanded.has(file.path);
        const pending = ["queued", "generating", "retrying", "validating"].includes(file.status);
        const content = contents[file.path];
        return (
          <li key={file.path} className={cn("overflow-hidden rounded-lg border bg-background/40", file.status === "failed" ? "border-destructive/50" : "border-border/60")}>
            <button type="button" onClick={() => onToggle(file.path)} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} details for ${file.path}`} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] transition hover:bg-secondary/40">
              <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
              <FileCode2 className={cn("h-3.5 w-3.5 shrink-0", file.status === "failed" ? "text-destructive" : pending ? "text-muted-foreground" : "text-emerald-500")} />
              <span className={cn("min-w-0 flex-1 truncate font-mono", pending ? "text-muted-foreground" : "text-foreground")}>{file.path}</span>
              {file.status === "completed" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                : file.status === "failed" ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                : <LoaderCircle className={cn("h-3.5 w-3.5 shrink-0 text-primary", file.status === "generating" && "animate-spin")} />}
            </button>
            {open && (
              <div className="space-y-1.5 border-t border-border/50 px-3 py-2 text-[11px]">
                <p className="text-muted-foreground">{file.purpose || "No description provided."}</p>
                {file.error && <p className="text-destructive">{file.error}</p>}
                {content ? (
                  <pre className="max-h-56 overflow-auto rounded-md bg-[#0b0d14] p-2 font-mono text-[10px] leading-relaxed text-white/80">{content}</pre>
                ) : (
                  <p className="text-muted-foreground">{pending ? "Content is still being generated…" : "Content snapshot is not available for this file."}</p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

const ActivityCard = ({ activity, contents, expanded, onToggleFile, onPreview, onRestore, onRetry, explanation, live = false, now }: {
  activity: BuildActivity;
  contents: Record<string, string>;
  expanded: Set<string>;
  onToggleFile: (path: string) => void;
  onPreview?: () => void;
  onRestore?: () => void;
  onRetry?: () => void;
  explanation?: string;
  live?: boolean;
  now: number;
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const summary = summarizeActivityFiles(activity);
  const durationMs = activityDurationMs(activity, now);
  const statusTone = activity.status === "error" ? "text-destructive" : activity.status === "success" ? "text-emerald-500" : "text-primary";
  return (
    <section aria-label={`Activity: ${activity.title}`} aria-live={live ? "polite" : undefined} className={cn("mr-auto w-full overflow-hidden rounded-xl border bg-surface-elevated/80 shadow-soft", activity.status === "error" ? "border-destructive/50" : "border-border/60")}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", activity.status === "running" ? "animate-pulse bg-primary" : activity.status === "error" ? "bg-destructive" : activity.status === "stopped" ? "bg-amber-500" : "bg-emerald-500")} />
          <h3 className="truncate text-xs font-semibold text-foreground">{activity.title || "Working on your project"}</h3>
          <span className={cn("shrink-0 text-[10px] font-medium", statusTone)}>{activityStatusLabel(activity.status)}</span>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">{summary.total ? `${summary.completed}/${summary.total} files` : ""}</span>
      </header>
      <div className="space-y-2 px-3 py-2.5">
        {explanation && <p className="text-[11px] leading-relaxed text-muted-foreground">{explanation}</p>}
        {activity.stage && <p className="text-[11px] text-muted-foreground">{activity.stage}</p>}
        {detailsOpen && activity.validation.length > 0 && (
          <ul className="space-y-0.5 rounded-md border border-border/50 bg-background/40 p-2 text-[10px] text-muted-foreground">
            {activity.validation.map((item, index) => <li key={`${index}-${item}`} className="break-words">• {item}</li>)}
          </ul>
        )}
        {detailsOpen && activity.errors.length > 0 && (
          <ul className="space-y-0.5 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[10px] text-destructive">
            {activity.errors.map((item, index) => <li key={`${index}-${item}`} className="break-words">• {item}</li>)}
          </ul>
        )}
        <details className="rounded-lg border border-border/60 bg-background/40 px-2.5 py-2 text-[10px] text-muted-foreground">
          <summary className="flex cursor-pointer select-none items-center gap-1.5 font-medium text-muted-foreground"><Clock className="h-3 w-3" />Thought for {formatActivityDuration(durationMs)}</summary>
          <ol className="mt-1.5 max-h-32 space-y-0.5 overflow-auto border-t border-border/50 pt-1.5">
            {activity.timeline.length ? activity.timeline.map((event, index) => <li key={`${index}-${event}`} className="break-words">{event}</li>) : <li>No activity recorded yet.</li>}
          </ol>
        </details>
        <ActivityFileList files={activity.files} contents={contents} expanded={expanded} onToggle={onToggleFile} />
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <button type="button" onClick={() => setDetailsOpen((open) => !open)} aria-expanded={detailsOpen} className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-[10px] font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground">
            <ListChecks className="h-3 w-3" />{detailsOpen ? "Hide details" : "Details"}
          </button>
          <button type="button" onClick={onPreview} disabled={!onPreview || live || activity.status === "running"} title={live || activity.status === "running" ? "Preview is available once the build finishes" : "Preview this activity"} className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-[10px] font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
            <Eye className="h-3 w-3" />Preview
          </button>
          {onRestore && <button type="button" onClick={onRestore} className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-[10px] font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"><RotateCcw className="h-3 w-3" />Restore</button>}
          {onRetry && (activity.status === "error" || activity.status === "stopped") && <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary transition hover:bg-primary/20"><RotateCcw className="h-3 w-3" />Try again</button>}
          {detailsOpen && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Info className="h-3 w-3" />{formatActivityDuration(durationMs)} total</span>}
        </div>
      </div>
    </section>
  );
};

export const PromptPanel = ({ onBuild, onDownload, onStop, onNewProject, isBuilding, progressStage, buildFiles, buildTimeline, messages, hasCode, prompt, onPromptChange, workingCode, inputRef, activityStartedAt, activityExplanation, resolveActivityCode, onPreviewActivity, onRestoreActivity, onMessageFeedback, onToggleBookmark, onRetryBuild }: PromptPanelProps) => {
  const [recording, setRecording] = useState(false);
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const localPromptRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = inputRef ?? localPromptRef;
  const focusPrompt = () => requestAnimationFrame(() => promptRef.current?.focus());
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const isChatActive = hasCode || isBuilding || messages.length > 0;

  useEffect(() => {
    if (!isBuilding) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isBuilding]);


  useEffect(() => () => {
    recRef.current?.abort?.();
    recRef.current = null;
  }, []);

  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const [userNearBottom, setUserNearBottom] = useState(true);
  const prevMsgCountRef = useRef(messages.length);

  const updateScrollState = () => {
    const el = transcriptRef.current;
    if (!el) return;
    const threshold = 100;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
    setUserNearBottom(nearBottom);
    setShowJumpLatest(!nearBottom);
  };

  const jumpToLatest = () => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    const addedUser = messages.length > prevMsgCountRef.current && messages[messages.length - 1]?.role === "user";
    prevMsgCountRef.current = messages.length;
    if (addedUser) {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; updateScrollState(); });
      return;
    }
    if (userNearBottom) {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; updateScrollState(); });
    } else {
      updateScrollState();
    }
  }, [messages, isBuilding, buildFiles, buildTimeline]);

  // Ctrl/Cmd + I focuses prompt
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        promptRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [promptRef]);

  const activeBuildStage = BUILD_STAGES.indexOf(progressStage as typeof BUILD_STAGES[number]);
  const liveActivity = useMemo<BuildActivity>(() => ({
    id: "live-activity",
    status: "running",
    title: progressStage || BUILD_STAGES[activeBuildStage] || "Planning",
    stage: progressStage || BUILD_STAGES[activeBuildStage] || "Planning",
    files: buildFiles,
    timeline: buildTimeline,
    startedAt: activityStartedAt ?? now,
    validation: [],
    errors: [],
  }), [activityExplanation, progressStage, buildFiles, buildTimeline, activityStartedAt, activeBuildStage, now]);

  const versionContents = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    if (!resolveActivityCode) return map;
    for (const message of messages) {
      const versionId = message.activity?.versionId;
      if (!versionId || map.has(versionId)) continue;
      const code = resolveActivityCode(versionId);
      if (!code) { map.set(versionId, {}); continue; }
      try { map.set(versionId, parseFileMarkers(code)?.files ?? {}); } catch { map.set(versionId, {}); }
    }
    return map;
  }, [messages, resolveActivityCode]);

  const activityContents = (activity: BuildActivity): Record<string, string> =>
    (activity.versionId ? versionContents.get(activity.versionId) : undefined) ?? {};

  const previewActivity = (activity: BuildActivity) => {
    if (onPreviewActivity) onPreviewActivity(activity);
  };
  const completedFileCount = buildFiles.filter((file) => file.status === "completed").length;
  const activeFilePath = buildFiles.find((file) => !["completed", "failed"].includes(file.status))?.path;
  const fileContents = useMemo(() => {
    if (!workingCode) return null;
    try { return parseFileMarkers(workingCode)?.files ?? null; } catch { return null; }
  }, [workingCode]);

  useEffect(() => {
    if (!activeFilePath) return;
    setExpandedFiles((current) => {
      if (current.has(activeFilePath)) return current;
      const next = new Set(current);
      next.add(activeFilePath);
      return next;
    });
  }, [activeFilePath]);

  const toggleFile = (path: string) => {
    setExpandedFiles((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleAttach = () => fileRef.current?.click();
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 200_000) { toast({ title: "File too large", description: "Attach files under 200KB.", variant: "destructive" }); return; }
    const text = await f.text();
    const attachment = `\n\n--- Attached: ${f.name} ---\n${text}`;
    onPromptChange(`${prompt}${attachment}`);
    toast({ title: "📎 Attached", description: f.name });
    e.target.value = "";
  };

  const toggleMic = () => {
    const speechWindow = window as SpeechRecognitionWindow;
    const SR = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SR) { toast({ title: "Voice unavailable", description: "Your browser does not support speech recognition.", variant: "destructive" }); return; }
    if (recording) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (ev) => {
      const text = Array.from(ev.results).map((result) => result[0]?.transcript ?? "").join(" ");
      onPromptChange(prompt ? `${prompt} ${text}` : text);
    };
    rec.onerror = (event) => {
      setRecording(false);
      recRef.current = null;
      const description = speechRecognitionErrorMessage(event.error);
      if (description) toast({ title: "Mic error", description, variant: "destructive" });
    };
    rec.onend = () => {
      setRecording(false);
      recRef.current = null;
    };
    recRef.current = rec;
    try {
      rec.start();
      setRecording(true);
      toast({ title: "🎙 Listening…", description: "Speak your prompt." });
    } catch (error: unknown) {
      setRecording(false);
      toast({
        title: "Voice unavailable",
        description: error instanceof Error ? error.message : "Your browser blocked microphone access.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:p-4">
      <input ref={fileRef} type="file" hidden onChange={handleFile} accept=".txt,.md,.json,.csv,.html,.css,.js,.ts,.tsx,.jsx" />

      {isChatActive && (
        <div className="glass relative flex min-h-16 flex-1 flex-col overflow-hidden rounded-2xl shadow-soft">
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{hasCode ? "Project chat" : "Build progress"}</span>
            </div>
            <div className="flex items-center gap-1">
              {hasCode && <Button variant="ghost" size="sm" onClick={onDownload} title="Download project ZIP"><Download className="mr-1 h-3.5 w-3.5" /> .zip</Button>}
              <Button variant="ghost" size="sm" disabled={isBuilding} onClick={onNewProject}>New project</Button>
            </div>
          </div>
          <div ref={transcriptRef} onScroll={updateScrollState} aria-live="polite" className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 text-sm relative">
            {messages.map((message, index) => {
              if (message.kind === "activity" && message.activity) {
                const activity = message.activity;
                return (
                  <ActivityCard
                    key={`${message.timestamp}-${index}`}
                    activity={activity}
                    contents={activityContents(activity)}
                    expanded={expandedFiles}
                    onToggleFile={toggleFile}
                    onPreview={onPreviewActivity ? () => previewActivity(activity) : undefined}
                    onRestore={activity.versionId && onRestoreActivity ? () => onRestoreActivity(activity.versionId!) : undefined}
                    onRetry={onRetryBuild}
                    explanation={message.explanation}
                    now={now}
                  />
                );
              }
              return (
                <article key={`${message.timestamp}-${index}`} className={cn("max-w-[94%] whitespace-pre-wrap break-words rounded-[14px] border px-3 py-2.5 shadow-soft", message.role === "user" ? "ml-auto border-0 bg-gradient-primary text-primary-foreground" : "mr-auto border-border/60 bg-surface-elevated text-foreground")}>
                  <div className={cn("mb-1 text-[10px] font-semibold uppercase tracking-wide", message.role === "user" ? "text-primary-foreground/75" : "text-primary")}>{message.role === "user" ? "You" : "AppiGen"}</div>
                  {message.content}
                  {message.role === "assistant" && (
                    <MessageActions
                      message={message}
                      onFeedback={onMessageFeedback}
                      onToggleBookmark={onToggleBookmark}
                      onRestore={message.versionId && onRestoreActivity ? () => onRestoreActivity(message.versionId!) : undefined}
                    />
                  )}
                </article>
              );
            })}
            {isBuilding && (
              <ActivityCard
                activity={liveActivity}
                contents={fileContents ?? {}}
                explanation={activityExplanation}
                expanded={expandedFiles}
                onToggleFile={toggleFile}
                live
                now={now}
              />
            )}
          </div>
          {showJumpLatest && (
            <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
              <button type="button" onClick={jumpToLatest} className="pointer-events-auto rounded-full border border-primary/40 bg-background/90 px-3 py-1 text-[11px] font-medium text-primary shadow-soft backdrop-blur hover:bg-primary/10">Jump to latest</button>
            </div>
          )}
        </div>
      )}

      {/* User Prompt */}
      {!isChatActive && <div className="flex-1" aria-hidden="true" />}
      <div className="glass-strong shrink-0 rounded-2xl border border-primary/30 p-3 shadow-elevated">
        <div className="mb-2 flex items-center gap-1.5 overflow-x-auto px-1" aria-label="Prompt ideas">
            <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Try</span>
            {[0, 1, 2].map((offset) => {
              const idea = PROMPT_IDEAS[(ideaIndex + offset) % PROMPT_IDEAS.length];
              const shortIdea = idea.split(" with ")[0].replace(/^A (?:sleek|warm, editorial|focused|bold|calm|modern) /i, "");
              return (
                <button key={idea} type="button" onClick={() => onPromptChange(idea)} className="max-w-[46%] truncate rounded-full border border-border/70 bg-secondary/40 px-2.5 py-1 text-[10px] text-muted-foreground transition hover:border-primary/50 hover:text-primary">
                  {shortIdea}
                </button>
              );
            })}
        </div>
        <textarea
          ref={promptRef}
          id="app-prompt"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!isBuilding && prompt.trim()) {
                onBuild();
                focusPrompt();
              }
            }
          }}
          rows={3}
          aria-label={hasCode ? "Describe a change to this project" : "Describe the app to build"}
          placeholder={hasCode ? "Describe a change to this project…" : "Describe the app to build…"}
          className="max-h-40 min-h-[82px] w-full resize-none rounded-2xl border border-primary/40 bg-background/30 px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground shadow-[0_0_24px_hsl(var(--primary)/0.12)] focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />

        <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-2">
          <div className="flex items-center gap-1">
            <button onClick={handleAttach} disabled={isBuilding} aria-label="Attach file" title="Attach file" className="flex h-10 items-center gap-2 rounded-lg px-2.5 text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:opacity-50"><Paperclip className="h-4 w-4" /><span className="text-xs font-medium">Attach</span></button>
            <button onClick={toggleMic} title={recording ? "Stop recording" : "Voice to prompt"}
              disabled={isBuilding}
              aria-label={recording ? "Stop voice recording" : "Add voice prompt"}
              className={cn("flex h-10 items-center gap-2 rounded-lg px-2.5 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:opacity-50",
                recording ? "bg-destructive/20 text-destructive animate-pulse" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}>
              <Mic className="h-4 w-4" /><span className="text-xs font-medium">{recording ? "Stop" : "Voice"}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {isBuilding ? <Button variant="danger" size="md" onClick={onStop}>Stop</Button> : <Button variant="primary" size="md" onClick={() => { onBuild(); focusPrompt(); }} disabled={!prompt.trim()} className="pulse-ring relative">
              <Send className="h-4 w-4" />{hasCode ? "Send" : "Build"}
            </Button>}
          </div>
        </div>
      </div>
    </div>
  );
};
