import { useEffect, useRef, useState } from "react";
import { ChevronDown, Wand2, Sparkles, Paperclip, Mic, Lock, Unlock, Download, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/projects/projectStorage";

interface PromptPanelProps {
  onBuild: (system?: string, stage?: string) => void;
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

const PLACEHOLDER_EXAMPLES = [
  "Build a minimalist task manager with drag-and-drop columns…",
  "Create a Ludo game playable against the computer…",
  "Design a SaaS landing page with pricing tiers…",
  "Generate a personal finance dashboard with charts…",
  "Build a markdown note app with dark theme…",
];

const CONTEXT_LIMIT = 8000;
const estimateCredits = (s: string) => Math.ceil(s.length / 4);
const DEFAULT_PROMPT_TEXT = "Build a minimalist task manager with drag-and-drop columns, calm color palette, and keyboard shortcuts.";

const STAGES = ["Sketch", "Wire up State", "Polish UI"] as const;
type Stage = typeof STAGES[number];

export const PromptPanel = ({ onBuild, onDownload, onStop, onNewProject, isBuilding, progressStage, messages, hasCode, prompt, onPromptChange }: PromptPanelProps) => {
  const [systemOpen, setSystemOpen] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [system, setSystem] = useState(
    "You are an expert product designer and full-stack engineer. Generate clean, accessible, production-ready React + Tailwind code. Prioritize delightful micro-interactions and a refined visual hierarchy."
  );
  const [stage, setStage] = useState<Stage>("Sketch");
  const [recording, setRecording] = useState(false);
  const [touched, setTouched] = useState(false);
  const [typed, setTyped] = useState("");
  const [exampleIdx, setExampleIdx] = useState(0);
  const [animPaused, setAnimPaused] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<any>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [messages, isBuilding]);

  useEffect(() => {
    // Only animate placeholder when input is empty AND not focused
    if (animPaused) return;
    const full = PLACEHOLDER_EXAMPLES[exampleIdx];
    if (typed.length < full.length) {
      const t = setTimeout(() => setTyped(full.slice(0, typed.length + 1)), 45);
      return () => clearTimeout(t);
    }
    const hold = setTimeout(() => {
      setTyped("");
      setExampleIdx((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length);
    }, 1800);
    return () => clearTimeout(hold);
  }, [typed, exampleIdx, animPaused]);

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

  const used = estimateCredits(prompt) + estimateCredits(system);
  const pct = Math.min(100, Math.round((used / CONTEXT_LIMIT) * 100));
  const barColor = pct < 60 ? "bg-gradient-primary" : pct < 85 ? "bg-warning" : "bg-danger";

  const handleAttach = () => fileRef.current?.click();
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 200_000) { toast({ title: "File too large", description: "Attach files under 200KB.", variant: "destructive" }); return; }
    const text = await f.text();
    onPromptChange(`${prompt}\n\n--- Attached: ${f.name} ---\n${text.slice(0, 4000)}`);
    toast({ title: "📎 Attached", description: f.name });
    e.target.value = "";
  };

  const toggleMic = () => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast({ title: "Voice unavailable", description: "Your browser does not support speech recognition.", variant: "destructive" }); return; }
    if (recording) { recRef.current?.stop(); return; }
    const rec = new SR(); rec.lang = "en-US"; rec.interimResults = false; rec.continuous = false;
    rec.onresult = (ev: any) => {
      const text = Array.from(ev.results).map((r: any) => r[0].transcript).join(" ");
      onPromptChange(prompt ? `${prompt} ${text}` : text);
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => { setRecording(false); toast({ title: "Mic error", variant: "destructive" }); };
    recRef.current = rec;
    try {
      rec.start();
      setRecording(true);
      toast({ title: "🎙 Listening…", description: "Speak your prompt." });
    } catch (error: any) {
      setRecording(false);
      toast({
        title: "Voice unavailable",
        description: error?.message || "Your browser blocked microphone access.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <input ref={fileRef} type="file" hidden onChange={handleFile} accept=".txt,.md,.json,.csv,.html,.css,.js,.ts,.tsx,.jsx" />

      {/* System Instruction */}
      <div className="glass overflow-hidden rounded-xl shadow-soft">
        <button onClick={() => setSystemOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-left transition-smooth hover:bg-secondary/40">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Wand2 className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                System Instruction
                {!advanced ? <Lock className="h-3 w-3 text-muted-foreground" /> : <span className="rounded bg-primary/20 px-1 text-[9px] font-bold uppercase text-primary">Modified</span>}
              </div>
              <div className="text-xs text-muted-foreground">{advanced ? "Editable — your custom persona" : "Locked — Expert Engineer persona"}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              advanced ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground")}>
              {advanced ? "Advanced" : "Locked"}
            </span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", systemOpen && "rotate-180")} />
          </div>
        </button>
        {systemOpen && (
          <div className="border-t border-border/60 animate-fade-in">
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{advanced ? "Editable" : "Read-only"}</span>
              <button
                onClick={() => setAdvanced((a) => !a)}
                className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold transition-smooth",
                  advanced ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground hover:text-foreground")}
              >
                {advanced ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                {advanced ? "Advanced Mode" : "Enable Advanced Mode"}
              </button>
            </div>
            <div className="max-h-[280px] overflow-y-auto px-4 py-3">
              <textarea
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                readOnly={!advanced}
                rows={6}
                className={cn(
                  "w-full resize-y min-h-[140px] max-h-[360px] rounded-lg border border-border/60 bg-background/40 p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
                  !advanced && "cursor-not-allowed opacity-90"
                )}
              />
              {!advanced && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Enable <span className="font-semibold text-primary">Advanced Mode</span> to customize the AI persona. Changes apply on the next Build.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Workflow chips */}
      <div className="glass rounded-xl p-3 shadow-soft">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Workflow stage</div>
        <div className="flex items-center gap-1.5">
          {STAGES.map((s) => (
            <button key={s} onClick={() => setStage(s)}
              className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-smooth",
                stage === s ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground")}>
              {stage === s && <Check className="h-3 w-3" />}
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation / scratch area */}
      <div className="glass flex min-h-24 flex-1 flex-col overflow-hidden rounded-xl shadow-soft">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{hasCode ? "Project chat" : "Generation context"}</span>
          </div>
          <Button variant="ghost" size="sm" disabled={isBuilding} onClick={onNewProject}>New project</Button>
        </div>
        <div ref={transcriptRef} aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
          {!messages.length && <div className="rounded-lg bg-secondary/40 p-3 text-muted-foreground">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-primary/80">Ready to create</div>
            Describe the experience you want. Follow-up prompts update this project without replacing unrelated work.
          </div>}
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

      {/* User Prompt */}
      <div className="glass-strong rounded-xl p-3 shadow-elevated">
        <textarea
          ref={promptRef}
          value={prompt}
          onFocus={() => { setAnimPaused(true); setTyped(""); }}
          onBlur={() => { if (!prompt) setAnimPaused(false); }}
          onChange={(e) => {
            onPromptChange(e.target.value);
            if (!touched) setTouched(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!isBuilding && prompt.trim()) onBuild(system, stage);
            }
          }}
          rows={3}
          disabled={isBuilding}
          aria-label={hasCode ? "Describe an edit to this project" : "Describe the app to build"}
          placeholder={animPaused ? "Describe the app you want to build…" : (typed || "Describe the app you want to build…")}
          className="w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
        />

        <div className="mt-1 px-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="font-mono">Context window</span>
            <span className="font-mono"><span className={pct >= 85 ? "text-destructive font-semibold" : "text-foreground"}>{used.toLocaleString()}</span> / {CONTEXT_LIMIT.toLocaleString()} credits</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
            <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between">
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
            <Button variant="secondary" onClick={onDownload} title="Download as .zip" aria-label="Download project ZIP" size="md">
              <Download className="h-3.5 w-3.5" />
              .zip
            </Button>
            {isBuilding ? <Button variant="danger" size="md" onClick={onStop}>Stop</Button> : <Button variant="primary" size="md" onClick={() => onBuild(system, stage)} disabled={!prompt.trim()} className="pulse-ring relative">
              <Sparkles className="h-4 w-4" />{hasCode ? "Update App" : "Build App"}
            </Button>}
          </div>
        </div>
      </div>
    </div>
  );
};
