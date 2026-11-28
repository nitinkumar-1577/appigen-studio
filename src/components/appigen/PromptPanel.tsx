
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AlertCircle, Bookmark, CheckCircle2, ChevronRight, Clock, Copy, Eye, FileCode2, Info, Link2, ListChecks, LoaderCircle, MoreHorizontal, RotateCcw, Paperclip, Mic, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ChatMessage } from "@/lib/projects/projectStorage";
import type { BuildFileProgress } from "@/lib/projects/buildWorkflow";
import { activityDurationMs, activityStatusLabel, formatActivityDuration, type BuildActivity, type BuildActivityEvent } from "@/lib/projects/conversationActivity";
import { parseFileMarkers } from "@/lib/preview/parseFileMarkers";

interface PromptPanelProps {
  onBuild: (stage?: string) => void;
  onDownload: () => void;
  onStop: () => void;
  onNewProject: () => void;
 isBuilding: boolean;
isChatThinking: boolean;
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

const MessageActions = ({
  message,
  onFeedback,
  onToggleBookmark,
  onRestore,
}: {
  message: ChatMessage;
  onFeedback?: (timestamp: number, feedback: "up" | "down" | null) => void;
  onToggleBookmark?: (timestamp: number) => void;
  onRestore?: () => void;
}) => {
  const copy = async (value: string, kind: "text" | "link") => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }

      await navigator.clipboard.writeText(value);
      toast({ title: kind === "link" ? "Message link copied" : "Message copied" });
    } catch {
      toast({
        title: "Could not copy",
        description: "Clipboard access is blocked in this browser.",
        variant: "destructive",
      });
    }
  };

  const messageLink = () =>
    `${window.location.origin}${window.location.pathname}#message-${message.timestamp}`;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-0.5">
      <button
        type="button"
        className={cn(ICON_BUTTON, message.feedback === "up" && "text-emerald-500")}
        onClick={() =>
          onFeedback?.(message.timestamp, message.feedback === "up" ? null : "up")
        }
        aria-label="Helpful"
        aria-pressed={message.feedback === "up"}
        title="Helpful"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        className={cn(ICON_BUTTON, message.feedback === "down" && "text-destructive")}
        onClick={() =>
          onFeedback?.(message.timestamp, message.feedback === "down" ? null : "down")
        }
        aria-label="Not helpful"
        aria-pressed={message.feedback === "down"}
        title="Not helpful"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        className={ICON_BUTTON}
        onClick={() => void copy(message.content, "text")}
        aria-label="Copy message"
        title="Copy message"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        className={ICON_BUTTON}
        onClick={() => void copy(messageLink(), "link")}
        aria-label="Copy message link"
        title="Copy message link"
      >
        <Link2 className="h-3.5 w-3.5" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={ICON_BUTTON}
            aria-label="More options"
            title="More options"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem
            onSelect={() => void copy(`### AppiGen\n\n${message.content}`, "text")}
          >
            <Copy className="mr-2 h-3.5 w-3.5" />
            Copy as markdown
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => onToggleBookmark?.(message.timestamp)}>
            <Bookmark
              className={cn(
                "mr-2 h-3.5 w-3.5",
                message.bookmarked && "fill-current text-primary",
              )}
            />
            {message.bookmarked ? "Remove bookmark" : "Bookmark message"}
          </DropdownMenuItem>

          {onRestore && (
            <DropdownMenuItem onSelect={onRestore}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Revert to this version
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {message.bookmarked && (
        <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          <Bookmark className="h-3 w-3 fill-current" />
          Saved
        </span>
      )}
    </div>
  );
};

const ActivityFileList = ({
  files,
  contents,
  expanded,
  onToggle,
}: {
  files: BuildFileProgress[];
  contents: Record<string, string>;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) => {
  if (!files.length) return null;

  return (
    <ul className="space-y-1">
      {files.map((file) => {
        const open = expanded.has(file.path);
        const pending = ["queued", "generating", "retrying", "validating"].includes(file.status);
        const content = contents[file.path];

        return (
          <li
            key={file.path}
            className={cn(
              "overflow-hidden rounded-lg border bg-background/40",
              file.status === "failed" ? "border-destructive/50" : "border-border/60",
            )}
          >
            <button
              type="button"
              onClick={() => onToggle(file.path)}
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} details for ${file.path}`}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] transition hover:bg-secondary/40"
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-90",
                )}
              />
              <FileCode2
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  file.status === "failed"
                    ? "text-destructive"
                    : pending
                      ? "text-muted-foreground"
                      : "text-emerald-500",
                )}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-mono",
                  pending ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {file.path}
              </span>
              {file.status === "completed" ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              ) : file.status === "failed" ? (
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
              ) : (
                <LoaderCircle
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-primary",
                    file.status === "generating" && "animate-spin",
                  )}
                />
              )}
            </button>

            {open && (
              <div className="space-y-1.5 border-t border-border/50 px-3 py-2 text-[11px]">
                <p className="text-muted-foreground">
                  {file.purpose || "No description provided."}
                </p>
                {file.error && <p className="text-destructive">{file.error}</p>}

                {content ? (
                  <pre className="max-h-56 overflow-auto rounded-md bg-[#0b0d14] p-2 font-mono text-[10px] leading-relaxed text-white/80">
                    {content}
                  </pre>
                ) : (
                  <p className="text-muted-foreground">
                    {pending
                      ? "Content is still being generated…"
                      : "Content snapshot is not available for this file."}
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

function thoughtSteps(activity: BuildActivity): string[] {
  const steps = activity.timeline
    .map((event) => {
      if (/inspect|understand/i.test(event)) {
        return "Understanding your request and existing project";
      }
      if (/plan|blueprint|architecture/i.test(event)) {
        return "Planning the app structure and visual direction";
      }
      if (/generat|completed|validat|retry|failed/i.test(event)) {
        return "Building and checking the app";
      }
      if (/review/i.test(event)) {
        return "Reviewing the finished experience";
      }
      if (/preview|updating/i.test(event)) {
        return "Preparing the live preview";
      }
      if (/sav/i.test(event)) {
        return "Saving your project";
      }
      return "";
    })
    .filter(Boolean);

  return [...new Set(steps)];
}


const ActivityCard = ({
  activity,
  contents,
  expanded,
  onToggleFile,
  onPreview,
  onRestore,
  onRetry,
  explanation,
  live = false,
  now,
}: {
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
  const durationMs = activityDurationMs(activity, now);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const completedCount = activity.files.filter(
    (file) => file.status === "completed",
  ).length;

  return (
    <section
      aria-label={`Activity: ${activity.title}`}
      aria-live={live ? "polite" : undefined}
      className={cn(
        "mr-auto w-full overflow-hidden rounded-xl border bg-surface-elevated/80 shadow-soft",
        activity.status === "error"
          ? "border-destructive/50"
          : "border-border/60",
      )}
    >
      <div className="space-y-3 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-foreground">
              {activity.title}
            </h3>
          <p className="mt-1 text-[10px] text-muted-foreground">
  {activityStatusLabel(activity.status)}
</p>
{activity.stage && (
  <p className="text-[10px] text-muted-foreground">
    {activity.stage}
  </p>
)}          </div>
          {onPreview && (
            <button
              type="button"
              onClick={onPreview}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[10px] font-medium hover:bg-secondary"
            >
              <Eye className="h-3 w-3" />
              Preview
            </button>
          )}
        </div>

        {explanation && (
          <p className="text-[11px] text-muted-foreground">{explanation}</p>
        )}

        {activity.files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-medium text-foreground">Files</span>
              <span className="text-muted-foreground">
                {completedCount}/{activity.files.length} files
              </span>
            </div>
            <ActivityFileList
              files={activity.files}
              contents={contents}
              expanded={expanded}
              onToggle={onToggleFile}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((open) => !open)}
            className="rounded-md border border-border/60 px-2 py-1 text-[10px] font-medium hover:bg-secondary"
          >
            Details
          </button>

          {onRestore && (
            <button
              type="button"
              onClick={onRestore}
              className="rounded-md border border-border/60 px-2 py-1 text-[10px] font-medium hover:bg-secondary"
            >
              Restore version
            </button>
          )}

          {onRetry &&
            (activity.status === "error" || activity.status === "stopped") && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20"
              >
                <RotateCcw className="h-3 w-3" />
                Try again
              </button>
            )}
        </div>

        {detailsOpen && (
          <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-2.5 text-[10px]">
            {activity.validation.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-foreground">Validation</p>
                {activity.validation.map((item, index) => (
                  <p key={`${index}-${item}`} className="text-muted-foreground">
                    {item}
                  </p>
                ))}
              </div>
            )}

            {activity.errors.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-destructive">Errors</p>
                {activity.errors.map((item, index) => (
                  <p key={`${index}-${item}`} className="text-destructive">
                    {item}
                  </p>
                ))}
              </div>
            )}

            {activity.timeline.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-foreground">Activity timeline</p>
                <ol className="space-y-1 text-muted-foreground">
                  {activity.timeline.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ol>
              </div>
            )}

            {!activity.validation.length &&
              !activity.errors.length &&
              !activity.timeline.length && (
                <p className="text-muted-foreground">
                  No additional details available.
                </p>
              )}
          </div>
        )}

        <details className="rounded-lg border border-border/60 bg-background/40 px-2.5 py-2 text-[10px] text-muted-foreground">
          <summary className="flex cursor-pointer select-none items-center gap-1.5 font-medium">
            <Clock className="h-3 w-3" />
            Thought for {formatActivityDuration(durationMs)}
          </summary>
          <ol className="mt-1.5 max-h-32 space-y-0.5 overflow-auto border-t border-border/50 pt-1.5">
            {thoughtSteps(activity).map((event) => (
              <li key={event} className="break-words">
                {event}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </section>
  );
};

export const PromptPanel = ({
  onBuild,
  onStop,
  isBuilding,
 isChatThinking,
  progressStage,
  buildFiles,
  buildTimeline,
  messages,
  hasCode,
  prompt,
  onPromptChange,
  workingCode,
  inputRef,
  activityStartedAt,
  activityExplanation,
  resolveActivityCode,
  onPreviewActivity,
  onRestoreActivity,
  onMessageFeedback,
  onToggleBookmark,
  onRetryBuild,
}: PromptPanelProps) => {
  const [recording, setRecording] = useState(false);
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState("");
  const [thinkingStage, setThinkingStage] = useState(0);

 const isBuildThinking =
  isBuilding &&
  buildFiles.length === 0 &&
  ["Planning", "Inspecting existing files"].includes(progressStage);
useEffect(() => {
  if (!isChatThinking && !isBuildThinking) {
    setThinkingStage(0);
    return;
  }

  const timer = window.setInterval(() => {
    setThinkingStage((current) => (current + 1) % 3);
  }, 1800);

  return () => window.clearInterval(timer);
}, [isChatThinking, isBuildThinking]);

const thinkingLabels = isBuildThinking
  ? [
      "Understanding your app requirements",
      "Planning the app structure",
      "Preparing the implementation",
    ]
  : [
      "Understanding your question",
      "Preparing a helpful response",
      "Putting the answer together",
    ];
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => new Set());

  const fileRef = useRef<HTMLInputElement>(null);
  const localPromptRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = inputRef ?? localPromptRef;
 const focusPrompt = () => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const textarea = promptRef.current;
      if (!textarea) return;

      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  });
};

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const isChatActive = hasCode || isBuilding || messages.length > 0;
 

  useEffect(() => {
    if (!isBuilding) return;

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isBuilding]);

  // Animated Lovable-style placeholder suggestions.
  useEffect(() => {
    if (hasCode || prompt.trim() || isBuilding) {
      setAnimatedPlaceholder("");
      return;
    }

    let ideaIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timer: number;

    const type = () => {
      const idea = PROMPT_IDEAS[ideaIndex];

      if (!deleting) {
        charIndex++;
        setAnimatedPlaceholder(idea.slice(0, charIndex));

        if (charIndex >= idea.length) {
          deleting = true;
          timer = window.setTimeout(type, 1600);
          return;
        }
      } else {
        charIndex--;
        setAnimatedPlaceholder(idea.slice(0, charIndex));

        if (charIndex <= 0) {
          deleting = false;
          ideaIndex = (ideaIndex + 1) % PROMPT_IDEAS.length;
        }
      }

      timer = window.setTimeout(type, deleting ? 25 : 45);
    };

    timer = window.setTimeout(type, 500);

    return () => window.clearTimeout(timer);
  }, [hasCode, prompt, isBuilding]);

  useEffect(
    () => () => {
      recRef.current?.abort?.();
      recRef.current = null;
    },
    [],
  );

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

    const addedUser =
      messages.length > prevMsgCountRef.current &&
      messages[messages.length - 1]?.role === "user";

    prevMsgCountRef.current = messages.length;

    if (addedUser) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
        updateScrollState();
      });
      return;
    }

    if (userNearBottom) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
        updateScrollState();
      });
    } else {
      updateScrollState();
    }
  }, [messages, isBuilding, buildFiles, buildTimeline]);

  // Ctrl/Cmd + I focuses the prompt.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "i") {
        event.preventDefault();
        promptRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [promptRef]);

  const activeBuildStage = BUILD_STAGES.indexOf(
    progressStage as (typeof BUILD_STAGES)[number],
  );

  const liveActivity = useMemo<BuildActivity>(
    () => ({
      id: "live-activity",
      status: "running",
      title: progressStage || BUILD_STAGES[activeBuildStage] || "Planning",
      stage: progressStage || BUILD_STAGES[activeBuildStage] || "Planning",
      files: buildFiles,
      timeline: buildTimeline,
      startedAt: activityStartedAt ?? now,
      validation: [],
      errors: [],
    }),
    [
      activityExplanation,
      progressStage,
      buildFiles,
      buildTimeline,
      activityStartedAt,
      activeBuildStage,
      now,
    ],
  );

  const versionContents = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    if (!resolveActivityCode) return map;

    for (const message of messages) {
      const versionId = message.activity?.versionId;
      if (!versionId || map.has(versionId)) continue;

      const code = resolveActivityCode(versionId);
      if (!code) {
        map.set(versionId, {});
        continue;
      }

      try {
        map.set(versionId, parseFileMarkers(code)?.files ?? {});
      } catch {
        map.set(versionId, {});
      }
    }

    return map;
  }, [messages, resolveActivityCode]);

  const activityContents = (activity: BuildActivity): Record<string, string> =>
    (activity.versionId ? versionContents.get(activity.versionId) : undefined) ?? {};

  const previewActivity = (activity: BuildActivity) => {
    if (onPreviewActivity) onPreviewActivity(activity);
  };

  const completedFileCount = buildFiles.filter(
    (file) => file.status === "completed",
  ).length;

  const activeFilePath = buildFiles.find(
    (file) => !["completed", "failed"].includes(file.status),
  )?.path;

  const fileContents = useMemo(() => {
    if (!workingCode) return null;

    try {
      return parseFileMarkers(workingCode)?.files ?? null;
    } catch {
      return null;
    }
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

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 200_000) {
      toast({
        title: "File too large",
        description: "Attach files under 200KB.",
        variant: "destructive",
      });
      return;
    }

    const text = await file.text();
    const attachment = `\n\n--- Attached: ${file.name} ---\n${text}`;

    onPromptChange(`${prompt}${attachment}`);
    toast({ title: "📎 Attached", description: file.name });
    event.target.value = "";
  };

  const toggleMic = () => {
    const speechWindow = window as SpeechRecognitionWindow;
    const SpeechRecognitionConstructor =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) {
      toast({
        title: "Voice unavailable",
        description: "Your browser does not support speech recognition.",
        variant: "destructive",
      });
      return;
    }

    if (recording) {
      recRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    recognition.lang =
      typeof navigator !== "undefined" && navigator.language
        ? navigator.language
        : "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ");

      onPromptChange(prompt ? `${prompt} ${text}` : text);
    };

    recognition.onerror = (event) => {
      setRecording(false);
      recRef.current = null;

      const description = speechRecognitionErrorMessage(event.error);

      if (description) {
        toast({
          title: "Mic error",
          description,
          variant: "destructive",
        });
      }
    };

    recognition.onend = () => {
      setRecording(false);
      recRef.current = null;
    };

    recRef.current = recognition;

    try {
      recognition.start();
      setRecording(true);
      toast({ title: "🎙 Listening…", description: "Speak your prompt." });
    } catch (error: unknown) {
      setRecording(false);
      toast({
        title: "Voice unavailable",
        description:
          error instanceof Error
            ? error.message
            : "Your browser blocked microphone access.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-1.5 sm:p-2">
      <input
        ref={fileRef}
        type="file"
        hidden
        onChange={handleFile}
        accept=".txt,.md,.json,.csv,.html,.css,.js,.ts,.tsx,.jsx"
      />

      {/* Chat conversation: no extra Project Chat / New Project / ZIP header. */}
      {isChatActive && (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden ">
          <div
            ref={transcriptRef}
            onScroll={updateScrollState}
            aria-live="polite"
            className="relative min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 py-2 text-sm"
          >
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
                    onPreview={
                      onPreviewActivity
                        ? () => previewActivity(activity)
                        : undefined
                    }
                    onRestore={
                      activity.versionId && onRestoreActivity
                        ? () => onRestoreActivity(activity.versionId!)
                        : undefined
                    }
                    onRetry={onRetryBuild}
                    explanation={message.explanation}
                    now={now}
                  />
                );
              }

              return (
                <article
                  key={`${message.timestamp}-${index}`}
                  className={cn(
                    "max-w-[94%] whitespace-pre-wrap break-words rounded-[14px] border px-3 py-2.5 shadow-soft",
                    message.role === "user"
                      ? "ml-auto border-0 bg-gradient-primary text-primary-foreground"
                      : "mr-auto border-border/60 bg-surface-elevated text-foreground",
                  )}
                >
                  {message.role === "user" && (
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground/75">
                      You
                    </div>
                  )}

                  {message.content}

                  {message.role === "assistant" && (
                    <MessageActions
                      message={message}
                      onFeedback={onMessageFeedback}
                      onToggleBookmark={onToggleBookmark}
                      onRestore={
                        message.versionId && onRestoreActivity
                          ? () => onRestoreActivity(message.versionId!)
                          : undefined
                      }
                    />
                  )}
                </article>
              );
            })}
          {(isChatThinking || isBuildThinking) && (
              <div
                className="mr-auto flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" />
            <span
  key={thinkingStage}
  className="font-medium animate-pulse transition-opacity duration-300"
>
  {thinkingLabels[thinkingStage]}
</span>
                <span className="flex items-center gap-0.5" aria-hidden="true">
                  <span className="animate-pulse">.</span>
                  <span className="animate-pulse [animation-delay:150ms]">.</span>
                  <span className="animate-pulse [animation-delay:300ms]">.</span>
                </span>
              </div>
            )}
        {isBuilding && !isChatThinking && !isBuildThinking && (
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
              <button
                type="button"
                onClick={jumpToLatest}
                className="pointer-events-auto rounded-full border border-primary/40 bg-background/90 px-3 py-1 text-[11px] font-medium text-primary shadow-soft backdrop-blur hover:bg-primary/10"
              >
                Jump to latest
              </button>
            </div>
          )}
        </div>
      )}

      {/* Compact prompt composer */}
      {!isChatActive && <div className="flex-1" aria-hidden="true" />}

      <div className="glass-strong relative top-[7px] shrink-0 rounded-xl border border-primary/30 p-2 shadow-soft">
        <div
          className="mb-1 flex items-center gap-1 overflow-x-auto px-0.5"
          aria-label="Prompt ideas"
        >
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Try
          </span>

          {[0, 1, 2].map((offset) => {
            const idea = PROMPT_IDEAS[(ideaIndex + offset) % PROMPT_IDEAS.length];
            const shortIdea = idea
              .split(" with ")[0]
              .replace(/^A (?:sleek|warm, editorial|focused|bold|calm|modern) /i, "");

            return (
              <button
                key={idea}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
             onClick={() => {
                  onPromptChange(`Build ${idea.charAt(0).toLowerCase()}${idea.slice(1)}`);
                  focusPrompt();
            }}
                
                className="max-w-[46%] truncate rounded-full border border-border/70 bg-secondary/40 px-2.5 py-1 text-[10px] text-muted-foreground transition hover:border-primary/50 hover:text-primary"
              >
                {shortIdea}
              </button>
            );
          })}
        </div>

        <textarea
          ref={promptRef}
          id="app-prompt"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
         onKeyDown={(event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();

    if (prompt.trim()) {
      onBuild();
      focusPrompt();
    }
  }
}}
       
          rows={2}
          aria-label={hasCode ? "Describe a change to this project" : "Describe the app to build"}
          placeholder={
            hasCode
              ? "Describe a change to this project…"
              : animatedPlaceholder || "Describe the app you want to build…"
          }
          className="max-h-32 min-h-[60px] w-full resize-y rounded-xl border border-primary/40 bg-background/30 px-3 py-2 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground shadow-[0_0_18px_hsl(var(--primary)/0.10)] focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />

        <div className="mt-5 flex items-center justify-between border-t border-border/50 pt-1">
          <div className="flex items-center gap-1">
            <button
              onClick={handleAttach}
              disabled={isBuilding}
              aria-label="Attach file"
              title="Attach file"
              className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:opacity-50"
            >
              <Paperclip className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Attach</span>
            </button>

            <button
              onClick={toggleMic}
              title={recording ? "Stop recording" : "Voice to prompt"}
              disabled={isBuilding}
              aria-label={recording ? "Stop voice recording" : "Add voice prompt"}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-2 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:opacity-50",
                recording
                  ? "bg-destructive/20 text-destructive animate-pulse"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Mic className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">
                {recording ? "Stop" : "Voice"}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {isBuilding ? (
              <Button variant="danger" size="sm" onClick={onStop}>
                Stop
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onBuild();
                  focusPrompt();
                }}
                disabled={!prompt.trim()}
                className="pulse-ring relative"
              >
                <Send className="h-3.5 w-3.5" />
                {hasCode ? "Send" : "Build"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
