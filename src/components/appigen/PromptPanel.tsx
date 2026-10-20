import { useEffect, useRef, useState } from "react";
import { Sparkles, Paperclip, Mic, Download, Check, Send } from "lucide-react";
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

const CONTEXT_LIMIT = 8000;

const STAGES = ["Sketch", "Wire up State", "Polish UI"] as const;
type Stage = typeof STAGES[number];

type SpeechRecognitionResult = ArrayLike<{ transcript: string }>;

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<SpeechRecognitionResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

export const PromptPanel = ({ onBuild, onDownload, onStop, onNewProject, isBuilding, progressStage, messages, hasCode, prompt, onPromptChange }: PromptPanelProps) => {
  const [stage, setStage] = useState<Stage>("Sketch");
  const [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const isChatActive = hasCode || isBuilding || messages.length > 0;

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [messages, isBuilding]);

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
  const pct = Math.min(100, Math.round((used / CONTEXT_LIMIT) * 100));
  const barColor = pct < 60 ? "bg-gradient-primary" : pct < 85 ? "bg-warning" : "bg-danger";

  const handleAttach = () => fileRef.current?.click();
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 200_000) { toast({ title: "File too large", description: "Attach files under 200KB.", variant: "destructive" }); return; }
    const text = await f.text();
    const attachment = `\n\n--- Attached: ${f.name} ---\n${text.slice(0, 4000)}`;
    if (prompt.length + attachment.length > CONTEXT_LIMIT) {
      toast({ title: "Prompt limit reached", description: "There is not enough room to attach this file within the 8,000-character limit.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    onPromptChange(`${prompt}${attachment}`);
    toast({ title: "📎 Attached", description: f.name });
    e.target.value = "";
  };

  const toggleMic = () => {
    const speechWindow = window as SpeechRecognitionWindow;
    const SR = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SR) { toast({ title: "Voice unavailable", description: "Your browser does not support speech recognition.", variant: "destructive" }); return; }
    if (recording) { recRef.current?.stop(); return; }
    const rec = new SR(); rec.lang = "en-US"; rec.interimResults = false; rec.continuous = false;
    rec.onresult = (ev) => {
      const text = Array.from(ev.results).map((result) => result[0]?.transcript ?? "").join(" ");
      onPromptChange(prompt ? `${prompt} ${text}` : text);
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => { setRecording(false); toast({ title: "Mic error", variant: "destructive" }); };
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
    <div className="flex h-full min-h-0 flex-col gap-4 p-5">
      <input ref={fileRef} type="file" hidden onChange={handleFile} accept=".txt,.md,.json,.csv,.html,.css,.js,.ts,.tsx,.jsx" />

      {/* Workflow stage */}
      {!isChatActive && <div className="glass shrink-0 rounded-xl p-3 shadow-soft">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Choose a workflow stage</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {STAGES.map((s) => (
            <button key={s} type="button" onClick={() => setStage(s)}
              className={cn("flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-smooth",
                stage === s ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground")}>
              {stage === s && <Check className="h-3 w-3" />}
              {s}
            </button>
          ))}
        </div>
      </div>}

      {isChatActive && (
        <div className="glass flex min-h-16 flex-1 flex-col overflow-hidden rounded-xl shadow-soft">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{hasCode ? "Project chat" : "Build progress"}</span>
            </div>
            <div className="flex items-center gap-1">
              {hasCode && <Button variant="ghost" size="sm" onClick={onDownload} title="Download project ZIP"><Download className="mr-1 h-3.5 w-3.5" /> .zip</Button>}
              <Button variant="ghost" size="sm" disabled={isBuilding} onClick={onNewProject}>New project</Button>
            </div>
          </div>
          <div ref={transcriptRef} aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {messages.map((message, index) => <article key={`${message.timestamp}-${index}`} className={cn("max-w-[92%] whitespace-pre-wrap break-words rounded-lg px-3 py-2.5", message.role === "user" ? "ml-auto bg-primary/15 text-foreground" : "mr-auto border border-border/60 bg-surface-elevated text-foreground")}>
              <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">{message.role === "user" ? "You" : "AppiGen"}</div>
              {message.content}
            </article>)}
            {isBuilding && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 animate-fade-in" role="status">
                <div className="flex items-center gap-2 text-xs font-medium text-primary">
                  <span className="h-1.5 w-1.5 animate-blink rounded-full bg-primary" />
                  {progressStage}…
                </div>
                <div className="mt-2 space-y-1.5">
                  {["Planning", "Generating", "Reviewing", "Validating"].map((s, i) => (
                    <div key={s} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="h-1 w-1 animate-blink rounded-full bg-primary" style={{ animationDelay: `${i * 0.2}s` }} />
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Prompt */}
      {!isChatActive && <div className="flex-1" aria-hidden="true" />}
      <div className="glass-strong shrink-0 rounded-2xl border border-border/70 p-3 shadow-elevated">
        <textarea
          ref={promptRef}
          id="app-prompt"
          value={prompt}
          onChange={(e) => {
            onPromptChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!isBuilding && prompt.trim() && used <= CONTEXT_LIMIT) onBuild(stage);
            }
          }}
          rows={3}
          maxLength={CONTEXT_LIMIT}
          disabled={isBuilding}
          aria-label={hasCode ? "Describe an edit to this project" : "Describe the app to build"}
          placeholder="Ask anything or describe a change..."
          className="max-h-40 min-h-[76px] w-full resize-y bg-transparent px-2 py-1.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
        />

        <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-2">
          <div className="flex items-center gap-1">
            <button onClick={handleAttach} disabled={isBuilding} aria-label="Attach file" title="Attach file" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:opacity-50"><Paperclip className="h-4 w-4" /></button>
            <button onClick={toggleMic} title={recording ? "Stop recording" : "Voice to prompt"}
              disabled={isBuilding}
              aria-label={recording ? "Stop voice recording" : "Add voice prompt"}
              className={cn("flex h-10 w-10 items-center justify-center rounded-lg transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:opacity-50",
                recording ? "bg-destructive/20 text-destructive animate-pulse" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}>
              <Mic className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {isBuilding ? <Button variant="danger" size="md" onClick={onStop}>Stop</Button> : <Button variant="primary" size="md" onClick={() => onBuild(stage)} disabled={!prompt.trim() || used > CONTEXT_LIMIT} className="pulse-ring relative">
              <Send className="h-4 w-4" />{hasCode ? "Send" : "Build"}
            </Button>}
          </div>
        </div>
        <div className="mt-1 px-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="font-mono">Prompt credits</span>
            <span className="font-mono"><span className={used > CONTEXT_LIMIT ? "text-destructive font-semibold" : "text-foreground"}>{used.toLocaleString()}</span> / {CONTEXT_LIMIT.toLocaleString()} credits</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
            <div className={cn("h-full rounded-full transition-all", used > CONTEXT_LIMIT ? "bg-danger" : barColor)} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
};
