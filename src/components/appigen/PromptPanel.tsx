import { useEffect, useRef, useState } from "react";
import { Sparkles, Paperclip, Mic, Download, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/projects/projectStorage";

interface PromptPanelProps {
  onBuild: (stage?: string) => void;
  onDownload: () => void;
  onStop: () => void;
  onNewProject: () => void;
  isBuilding: boolean;
  progressStage: string;
  messages: ChatMessage[];
  hasCode: boolean;
  prompt: string;
  onPromptChange: (v: string) => void;
}

const BUILD_STAGES = ["Understanding request", "Planning", "Generating", "Reviewing", "Validating", "Updating preview", "Saving"] as const;
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

export const PromptPanel = ({ onBuild, onDownload, onStop, onNewProject, isBuilding, progressStage, messages, hasCode, prompt, onPromptChange }: PromptPanelProps) => {
  const [recording, setRecording] = useState(false);
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [animatedIdea, setAnimatedIdea] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const isChatActive = hasCode || isBuilding || messages.length > 0;

  useEffect(() => () => {
    recRef.current?.abort?.();
    recRef.current = null;
  }, []);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [messages, isBuilding]);

  useEffect(() => {
    if (prompt) return;
    let character = 0;
    let deleting = false;
    let timer: number;
    const tick = () => {
      const rawIdea = PROMPT_IDEAS[ideaIndex];
      const idea = hasCode ? rawIdea.replace(/^A |^An /, "").replace(/^[^,]+, /, "") : rawIdea;
      if (!deleting) {
        character += 1;
        setAnimatedIdea(idea.slice(0, character));
        if (character >= idea.length) {
          deleting = true;
          timer = window.setTimeout(tick, 900);
          return;
        }
        timer = window.setTimeout(tick, 34);
        return;
      }

      character -= 1;
      setAnimatedIdea(idea.slice(0, character));
      if (character <= 0) {
        setIdeaIndex((index) => (index + 1) % PROMPT_IDEAS.length);
        return;
      }
      timer = window.setTimeout(tick, 18);
    };

    setAnimatedIdea("");
    timer = window.setTimeout(tick, 300);
    return () => window.clearTimeout(timer);
  }, [hasCode, ideaIndex, prompt]);

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
  }, []);

  const used = prompt.length;
  const activeBuildStage = BUILD_STAGES.indexOf(progressStage as typeof BUILD_STAGES[number]);

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
        <div className="glass flex min-h-16 flex-1 flex-col overflow-hidden rounded-2xl shadow-soft">
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
          <div ref={transcriptRef} aria-live="polite" className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 text-sm">
            {messages.map((message, index) => <article key={`${message.timestamp}-${index}`} className={cn("max-w-[94%] whitespace-pre-wrap break-words rounded-[14px] border px-3 py-2.5 shadow-soft", message.role === "user" ? "ml-auto border-0 bg-gradient-primary text-primary-foreground" : "mr-auto border-border/60 bg-surface-elevated text-foreground")}>
              <div className={cn("mb-1 text-[10px] font-semibold uppercase tracking-wide", message.role === "user" ? "text-primary-foreground/75" : "text-primary")}>{message.role === "user" ? "You" : "AppiGen"}</div>
              {message.content}
            </article>)}
            {isBuilding && (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 shadow-glow animate-fade-in md:hidden" role="status" aria-live="polite">
                <div className="flex items-center gap-2 text-xs font-medium text-primary">
                  <span className="h-1.5 w-1.5 animate-blink rounded-full bg-primary" />
                  {BUILD_STAGES[activeBuildStage] || "Planning"}…
                </div>
              </div>
            )}
          </div>
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
        <div className="relative">
          {!prompt && (
            <div aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 z-10 max-w-[calc(100%-1.5rem)] truncate text-sm text-muted-foreground">
              {animatedIdea}<span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-primary align-middle" />
            </div>
          )}
          <textarea
            ref={promptRef}
            id="app-prompt"
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!isBuilding && prompt.trim()) onBuild();
              }
            }}
            rows={3}
            disabled={isBuilding}
            aria-label={hasCode ? "Describe a change to this project" : "Describe the app to build"}
            placeholder=""
            className="max-h-40 min-h-[82px] w-full resize-none rounded-2xl border border-primary/40 bg-background/30 px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground shadow-[0_0_24px_hsl(var(--primary)/0.12)] focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-wait disabled:opacity-60"
          />
        </div>

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
            {isBuilding ? <Button variant="danger" size="md" onClick={onStop}>Stop</Button> : <Button variant="primary" size="md" onClick={() => onBuild()} disabled={!prompt.trim()} className="pulse-ring relative">
              <Send className="h-4 w-4" />{hasCode ? "Send" : "Build"}
            </Button>}
          </div>
        </div>
        <div className="mt-1 px-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="font-mono">Characters</span>
            <span className="font-mono text-foreground" aria-label={`Prompt character count: ${used.toLocaleString()}`}>{used.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
