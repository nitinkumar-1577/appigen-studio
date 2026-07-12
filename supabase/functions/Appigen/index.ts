// AppiGen V4 — Timeout-safe Thinking Engine pipeline (Groq)
// Local stages: 1 Intent · 2 Requirements · 3 Architecture · 4 Blueprint
// AI stages: 5 Generate (multi-file) · 6 Validate · 7 Auto-Repair · 8 Clean
// Critical: never run sequential long AI calls inside the edge request.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Primary provider: Lovable AI Gateway (OpenAI-compatible). Reliable, high quota.
const LOVABLE_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_MODEL_SMART = "google/gemini-2.5-flash";
const LOVABLE_MODEL_FAST = "google/gemini-2.5-flash-lite";

// Optional fallback: Groq (kept for resilience; often rate-limited on free tier).
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL_FAST = "llama-3.1-8b-instant";
const MODEL_SMART = "llama-3.3-70b-versatile";

const PRIMARY_GENERATION_TIMEOUT_MS = 90000;
const FAST_GENERATION_TIMEOUT_MS = 60000;
const REPAIR_TIMEOUT_MS = 60000;

const GENERATOR_SYSTEM = `You are an elite senior frontend engineer generating a production-grade React application in the LOVABLE MULTI-FILE style.

OUTPUT CONTRACT (STRICT — the parser depends on it):
- Output ONLY raw source code. NO markdown, NO code fences, NO prose, NO explanations.
- Split the app across MULTIPLE files using this EXACT delimiter on its own line before each file:
    // FILE: <relative/path.jsx>
  Example:
    // FILE: src/App.jsx
    import Header from "./components/Header";
    export default function App(){ ... }

    // FILE: src/components/Header.jsx
    export default function Header(){ ... }

DIRECTORY STRUCTURE (use whichever apply):
- src/App.jsx                (required — default-exports the root <App/> component)
- src/components/*.jsx       (reusable UI: buttons, cards, modals, lists)
- src/pages/*.jsx            (route-level views if the app has multiple screens)
- src/hooks/use*.js          (custom hooks)
- src/context/*.jsx          (React Context providers)
- src/utils/*.js             (pure helpers)

MODULE RULES:
- Use ES module syntax: \`import X from "./path"\` and \`export default\` / \`export const\`.
- Internal imports: relative ("./components/Foo") OR alias ("@/components/Foo" -> src/*).
- External imports allowed ONLY: "react", "react-dom", "lucide-react". Nothing else.
- Do NOT import CSS files. Tailwind is preloaded globally.
- Do NOT call ReactDOM.createRoot — the runtime mounts <App/> from src/App.jsx's default export.

CODE RULES:
- Plain JSX only. NO TypeScript syntax (no type annotations, interfaces, "as" casts, generics).
- ASCII characters only inside string literals (no smart quotes, em-dashes, or emojis in JSX text).
- Every button has an onClick. Every input is controlled with useState/useReducer.
- Wire ALL interactions to real state — no empty console.log stubs.
- Include loading, empty, and error states where relevant.
- Mobile-first responsive Tailwind. Dark theme by default. Glassmorphism, gradients, soft shadows, smooth transitions (transition-all duration-200, hover:scale-[1.02], etc.).
- Close every JSX tag and bracket. Reference only defined variables.
- Split logic aggressively: aim for 3-8 files for anything non-trivial.

Return the complete multi-file source. Nothing else.`;

const REPAIR_SYSTEM = `You are an expert JS/JSX bug fixer for multi-file React projects.

You receive broken source (possibly multiple files delimited by "// FILE: <path>" lines) and the runtime/compile error it produced.

RETURN the FULL fixed source using the SAME "// FILE: <path>" delimiter format. Rules:
- NO markdown, NO fences, NO prose.
- Preserve every file that was present; only edit what's needed to fix the error.
- Keep ES module syntax (import/export). External imports limited to react, react-dom, lucide-react.
- No TypeScript syntax. ASCII strings. Close every tag and bracket. Define every referenced variable.
- src/App.jsx must default-export the root component. Do NOT call ReactDOM.createRoot.`;

// ---------- helpers ----------

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanCode(raw: string): string {
  let s = (raw ?? "").trim();
  // strip fenced blocks
  s = s.replace(/^```(?:jsx|js|javascript|tsx|ts)?\s*/i, "").replace(/```$/i, "").trim();
  const fenceMatches = [...s.matchAll(/```(?:jsx|js|javascript|tsx|ts)?\s*([\s\S]*?)```/gi)];
  if (fenceMatches.length) {
    s = fenceMatches.sort((a, b) => b[1].length - a[1].length)[0][1].trim();
  }

  // Multi-file mode: keep everything as-is (imports/exports are needed by the loader).
  if (/^\s*\/\/\s*FILE:/m.test(s)) {
    // Strip TS annotations best-effort
    s = s.replace(/:\s*React\.FC(<[^>]*>)?/g, "");
    // Remove any stray ReactDOM.createRoot calls (loader handles mounting)
    s = s.replace(/ReactDOM\s*\.\s*createRoot\s*\([\s\S]*?\)\s*\.\s*render\s*\([\s\S]*?\)\s*;?/g, "");
    s = s.replace(/ReactDOM\s*\.\s*render\s*\([\s\S]*?\)\s*;?/g, "");
    return s.trim();
  }

  // Legacy single-file: keep the old behavior (strip modules, append render).
  const firstCodeIdx = s.search(/(^|\n)\s*(function\s+App|const\s+App|class\s+App|React\.)/);
  if (firstCodeIdx > 0) s = s.slice(firstCodeIdx).trimStart();
  s = stripModuleSyntax(s);
  s = s.replace(/:\s*React\.FC(<[^>]*>)?/g, "");
  s = s.replace(/ReactDOM\s*\.\s*createRoot\s*\(\s*document\s*\.\s*getElementById\s*\(\s*["']root["']\s*\)\s*\)\s*\.\s*render\s*\(\s*<App\s*\/?>\s*\)\s*;?/g, "").trim();
  s = s.replace(/ReactDOM\s*\.\s*render\s*\(\s*<App\s*\/?>\s*,\s*document\s*\.\s*getElementById\s*\(\s*["']root["']\s*\)\s*\)\s*;?/g, "").trim();
  s = s.replace(/[;\s]*$/, "") +
    '\nReactDOM.createRoot(document.getElementById("root")).render(<App />);';
  return s.trim();
}

function stripModuleSyntax(src: string): string {
  let s = (src ?? "").replace(/\r\n/g, "\n");
  s = s.replace(/^\s*import\s+["'][^"']+["']\s*;?\s*$/gm, "");
  s = s.replace(/^\s*import\s+(?:type\s+)?[\s\S]*?\s+from\s*["'][^"']+["']\s*;?\s*$/gm, "");
  s = s.replace(/^\s*import\s*\([\s\S]*?\)\s*;?\s*$/gm, "");
  s = s.replace(/\bimport\s*\([\s\S]*?\)/g, "Promise.resolve({})");
  s = s.replace(/^\s*export\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s*["'][^"']+["']\s*;?\s*$/gm, "");
  s = s.replace(/^\s*export\s*\{[\s\S]*?\}\s*;?\s*$/gm, "");
  s = s.replace(/^\s*export\s+default\s+(?=(?:async\s+)?function\b|class\b)/gm, "");
  s = s.replace(/^\s*export\s+default\s+[^;\n]+;?\s*$/gm, "");
  s = s.replace(/^\s*export\s+(?=(?:const|let|var|function|class)\b)/gm, "");
  s = s.replace(/\bimport\s+(?:type\s+)?[^;\n]*?\bfrom\s*["'][^"']+["']\s*;?/g, "");
  s = s.replace(/(^|[;\n])\s*export\s+(?:default\s+)?/g, "$1");
  return s.trim();
}

function isMultiFile(src: string): boolean {
  return /^\s*\/\/\s*FILE:/m.test(src || "");
}



// Bracket balance sanity check
function bracketsBalanced(src: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let inStr: string | null = null;
  let inTpl = false;
  let inLineCmt = false;
  let inBlockCmt = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLineCmt) { if (c === "\n") inLineCmt = false; continue; }
    if (inBlockCmt) { if (c === "*" && n === "/") { inBlockCmt = false; i++; } continue; }
    if (inStr) { if (c === "\\") { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (inTpl) { if (c === "\\") { i++; continue; } if (c === "`") inTpl = false; continue; }
    if (c === "/" && n === "/") { inLineCmt = true; i++; continue; }
    if (c === "/" && n === "*") { inBlockCmt = true; i++; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === "`") { inTpl = true; continue; }
    if ("([{".includes(c)) stack.push(c);
    else if (")]}".includes(c)) { if (stack.pop() !== pairs[c]) return false; }
  }
  return stack.length === 0 && !inStr && !inTpl;
}

async function groq(
  apiKey: string,
  body: Record<string, unknown>,
  { retries = 0, timeoutMs = 55000 } = {},
): Promise<any> {
  let lastErr: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      lastErr = { status: "timeout", body: msg };
      if (attempt < retries) continue;
      throw new Error(`Groq request timed out before edge idle limit (${timeoutMs}ms)`);
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    if (res.ok) {
      try { return JSON.parse(text); }
      catch (e) { throw new Error("Groq returned non-JSON: " + text.slice(0, 300)); }
    }
    lastErr = { status: res.status, body: text };
    // Retry on 429 / 5xx with exponential backoff + jitter.
    // Important: if there are no retries left, fail immediately so the
    // caller can return a safe local fallback before the preview goes blank.
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      if (attempt >= retries) {
        const retryHint = text.match(/try again in ([\d.]+)s/i)?.[1];
        const reason = res.status === 429 ? "rate limit" : "temporary provider error";
        throw new Error(`Groq ${res.status} ${reason}${retryHint ? `; retry after ${retryHint}s` : ""}: ${text.slice(0, 240)}`);
      }
      // Honor Groq's "Please try again in Xs" hint when present
      let wait = Math.min(1200, 400 * 2 ** attempt) + Math.random() * 150;
      const m = text.match(/try again in ([\d.]+)s/i);
      if (m) wait = Math.min(2500, Math.ceil(parseFloat(m[1]) * 1000) + 250);
      const ra = res.headers.get("retry-after");
      if (ra && !isNaN(Number(ra))) wait = Math.min(2500, Math.max(wait, Number(ra) * 1000));
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    // non-retryable
    throw new Error(`Groq ${res.status}: ${text.slice(0, 400)}`);
  }
  throw new Error(`Groq failed after retries: ${JSON.stringify(lastErr).slice(0, 400)}`);
}

function isGroqUnavailable(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /Groq\s+(429|5\d\d)|rate limit|timed out|temporary provider/i.test(msg);
}

// ---------- pipeline ----------

// ============================================================
// THINKING ENGINE — staged reasoning before any code is written.
// Stages: 1 Intent · 2 Requirements · 3 Architecture · 4 Blueprint
// Each stage enriches a shared `plan` object. Cheap models for
// reasoning, smart model reserved for generation + repair.
// ============================================================

async function groqJSON(apiKey: string, model: string, sys: string, user: string, maxTokens = 900) {
  const data = await groq(apiKey, {
    model,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    temperature: 0.3,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
  }, { timeoutMs: 25000 });
  const raw = data?.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(raw); } catch { return {}; }
}

function titleCaseWord(word: string) {
  return word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word;
}

function inferAppType(prompt: string) {
  const p = prompt.toLowerCase();
  if (/game|ludo|chess|quiz|snake|tic tac|puzzle|arcade/.test(p)) return "game";
  if (/dashboard|analytics|admin|crm|chart|report/.test(p)) return "dashboard";
  if (/shop|store|ecommerce|cart|product/.test(p)) return "commerce app";
  if (/todo|task|kanban|planner|notes/.test(p)) return "productivity app";
  if (/portfolio|landing|website|agency|restaurant/.test(p)) return "website";
  return "app";
}

function inferDomain(prompt: string, appType: string) {
  const p = prompt.toLowerCase();
  if (/ludo|chess|snake|puzzle|arcade/.test(p)) return "casual gaming";
  if (/finance|stock|crypto|invoice|budget/.test(p)) return "finance";
  if (/health|fitness|habit|medical/.test(p)) return "health";
  if (/learn|course|school|education/.test(p)) return "education";
  if (/restaurant|food|recipe|menu/.test(p)) return "food";
  return appType === "app" ? "general" : appType;
}

function localArchitecture(prompt: string, appType: string) {
  const p = prompt.toLowerCase();
  const components = [
    { path: "src/components/Header.jsx", purpose: "top bar, status, primary actions" },
    { path: "src/components/ActionPanel.jsx", purpose: "main controls and contextual actions" },
    { path: "src/components/EmptyState.jsx", purpose: "friendly empty or first-run state" },
  ];
  const hooks = [{ path: "src/hooks/usePersistentState.js", purpose: "localStorage-backed state persistence" }];
  const contexts = [{ path: "src/context/AppStateContext.jsx", purpose: "shared application state and actions" }];
  const utils = [{ path: "src/utils/helpers.js", purpose: "pure helpers and validation" }];
  const pages = ["Home.jsx"];

  if (appType === "game") {
    components.push(
      { path: "src/components/GameBoard.jsx", purpose: "responsive playable board" },
      { path: "src/components/PlayerPanel.jsx", purpose: "turns, scores, and player state" },
      { path: "src/components/GameControls.jsx", purpose: "dice, reset, and game actions" },
    );
    utils.push({ path: "src/utils/gameLogic.js", purpose: "rules, turns, win checks, and safe moves" });
  } else if (/dashboard|analytics|admin|crm|chart|report/.test(p)) {
    components.push(
      { path: "src/components/MetricCard.jsx", purpose: "reusable metric summaries" },
      { path: "src/components/DataPanel.jsx", purpose: "lists, filters, and tables" },
    );
    utils.push({ path: "src/utils/mockData.js", purpose: "seed data for the generated dashboard" });
  } else if (/todo|task|kanban|planner|notes/.test(p)) {
    components.push(
      { path: "src/components/TaskCard.jsx", purpose: "editable item card" },
      { path: "src/components/BoardColumn.jsx", purpose: "grouped workflow column" },
    );
  }

  return {
    pages,
    components,
    hooks,
    contexts,
    utils,
    dataModel: appType === "game" ? "players, pieces, dice, turns, move history" : "local entities persisted to localStorage",
    stateStrategy: "React state + context + localStorage cache with guarded event handlers",
  };
}

function enhanceAndPlan(_apiKey: string, userPrompt: string, stage?: string) {
  const appType = inferAppType(userPrompt);
  const domain = inferDomain(userPrompt, appType);
  const complexity = userPrompt.length > 900 || /multi|auth|database|payment|realtime|ai|advanced|full/.test(userPrompt.toLowerCase()) ? "complex" : "moderate";
  const intent = { goal: userPrompt, appType, domain, complexity };
  const reqs = {
    functional: [
      "Build the requested experience as a real interactive React app",
      "Separate UI, state, and helper logic into multiple files",
      "Persist important state in localStorage",
      "Provide reset and primary action controls",
    ],
    nonFunctional: ["responsive layout", "accessible controls", "stable event handlers", "fast first render", "dark theme"],
    edgeCases: ["empty input", "invalid action", "refresh persistence", "reset flow", "mobile viewport"],
    uxStates: ["ready", "active", "success", "error", "empty"],
  };
  const arch = localArchitecture(userPrompt, appType);

  const components = (arch.components || []).map((c: any) => `${c.path} — ${c.purpose}`);
  const hooks = (arch.hooks || []).map((h: any) => `${h.path} — ${h.purpose}`);
  const contexts = (arch.contexts || []).map((c: any) => `${c.path} — ${c.purpose}`);
  const utils = (arch.utils || []).map((u: any) => `${u.path} — ${u.purpose}`);

  const enhancedPrompt = [
    `Goal: ${intent.goal || userPrompt}`,
    `App type: ${intent.appType || "app"} (${intent.domain || "general"})`,
    `Functional: ${(reqs.functional || []).join("; ")}`,
    `Non-functional: ${(reqs.nonFunctional || []).join("; ")}`,
    `Edge cases: ${(reqs.edgeCases || []).join("; ")}`,
    `UX states: ${(reqs.uxStates || []).join("; ")}`,
    `Data model: ${arch.dataModel || "in-memory useState"}`,
    `State strategy: ${arch.stateStrategy || "local state + context where shared"}`,
    `Stage: ${stage ?? "polish"}`,
  ].join("\n");

  return {
    enhancedPrompt,
    appType: intent.appType || "app",
    pages: arch.pages || [],
    components,
    hooks,
    contexts,
    utils,
    features: reqs.functional || [],
    complexity: intent.complexity || "moderate",
    _intent: intent,
    _requirements: reqs,
    _architecture: arch,
  };
}

function fallbackCode(prompt: string, plan: any) {
  const title = titleCaseWord((prompt.match(/[a-zA-Z0-9]+/) || ["AppiGen"])[0]) + " App";
  if (/ludo/i.test(prompt)) {
    return `// FILE: src/App.jsx
import React, { useMemo, useState } from "react";
import Header from "./components/Header";
import GameBoard from "./components/GameBoard";
import PlayerPanel from "./components/PlayerPanel";
import GameControls from "./components/GameControls";
import { createInitialPlayers, nextPlayerIndex } from "./utils/gameLogic";

export default function App() {
  const [players, setPlayers] = useState(() => createInitialPlayers());
  const [turn, setTurn] = useState(0);
  const [dice, setDice] = useState(1);
  const [message, setMessage] = useState("Roll the dice to start the match.");
  const active = players[turn];
  const winner = players.find((p) => p.home >= 4);

  const rollDice = () => {
    if (winner) return;
    const value = Math.floor(Math.random() * 6) + 1;
    setDice(value);
    setPlayers((current) => current.map((p, index) => {
      if (index !== turn) return p;
      const nextProgress = Math.min(57, p.progress + value);
      const reachedHome = nextProgress >= 57 ? Math.min(4, p.home + 1) : p.home;
      return { ...p, progress: reachedHome > p.home ? 0 : nextProgress, home: reachedHome, rolls: p.rolls + 1 };
    }));
    setMessage(active.name + " rolled " + value + (value === 6 ? " and gets another turn." : "."));
    if (value !== 6) setTurn((current) => nextPlayerIndex(current, players.length));
  };

  const resetGame = () => {
    setPlayers(createInitialPlayers());
    setTurn(0);
    setDice(1);
    setMessage("New Ludo match ready.");
  };

  const boardCells = useMemo(() => Array.from({ length: 52 }, (_, i) => i), []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <Header winner={winner} />
      <section className="mx-auto grid max-w-6xl gap-5 p-4 lg:grid-cols-[1fr_320px]">
        <GameBoard cells={boardCells} players={players} activeColor={active.color} />
        <aside className="space-y-4">
          <GameControls dice={dice} message={message} active={active} winner={winner} onRoll={rollDice} onReset={resetGame} />
          <PlayerPanel players={players} turn={turn} />
        </aside>
      </section>
    </main>
  );
}

// FILE: src/components/Header.jsx
import React from "react";

export default function Header({ winner }) {
  return (
    <header className="border-b border-slate-800 bg-slate-950/90 px-4 py-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Playable board game</p>
          <h1 className="text-2xl font-black">Ludo Arena</h1>
        </div>
        <div className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">
          {winner ? winner.name + " wins" : "Live match"}
        </div>
      </div>
    </header>
  );
}

// FILE: src/components/GameBoard.jsx
import React from "react";

export default function GameBoard({ cells, players, activeColor }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-2xl">
      <div className="grid aspect-square grid-cols-8 gap-1">
        {cells.map((cell) => {
          const piece = players.find((p) => Math.floor(p.progress) === cell && p.home < 4);
          return (
            <div key={cell} className="relative rounded-md border border-slate-700 bg-slate-800/80">
              <span className="absolute left-1 top-1 text-[10px] text-slate-500">{cell + 1}</span>
              {piece && <span className={"absolute inset-2 rounded-full border-2 border-white/70 " + piece.className} />}
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-sm text-slate-400">Current lane: <span className="font-semibold text-slate-100">{activeColor}</span></div>
    </div>
  );
}

// FILE: src/components/GameControls.jsx
import React from "react";

export default function GameControls({ dice, message, active, winner, onRoll, onReset }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">Turn</p>
          <h2 className="text-xl font-bold">{winner ? winner.name : active.name}</h2>
        </div>
        <div className="grid h-16 w-16 place-items-center rounded-xl bg-cyan-400 text-3xl font-black text-slate-950">{dice}</div>
      </div>
      <p className="mt-4 min-h-10 text-sm text-slate-300">{message}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={onRoll} disabled={!!winner} className="rounded-lg bg-cyan-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-40">Roll</button>
        <button onClick={onReset} className="rounded-lg border border-slate-700 px-4 py-3 font-bold text-slate-100">Reset</button>
      </div>
    </div>
  );
}

// FILE: src/components/PlayerPanel.jsx
import React from "react";

export default function PlayerPanel({ players, turn }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-3 font-bold">Players</h2>
      <div className="space-y-2">
        {players.map((p, index) => (
          <div key={p.name} className={"rounded-lg border p-3 " + (index === turn ? "border-cyan-300 bg-cyan-300/10" : "border-slate-800 bg-slate-950/50")}>
            <div className="flex items-center justify-between text-sm"><span className="font-semibold">{p.name}</span><span>{p.home}/4 home</span></div>
            <div className="mt-2 h-2 rounded-full bg-slate-800"><div className={"h-2 rounded-full " + p.className} style={{ width: Math.min(100, (p.progress / 57) * 100) + "%" }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// FILE: src/utils/gameLogic.js
export function createInitialPlayers() {
  return [
    { name: "Red", color: "red", className: "bg-red-500", progress: 0, home: 0, rolls: 0 },
    { name: "Blue", color: "blue", className: "bg-blue-500", progress: 13, home: 0, rolls: 0 },
    { name: "Green", color: "green", className: "bg-emerald-500", progress: 26, home: 0, rolls: 0 },
    { name: "Yellow", color: "yellow", className: "bg-yellow-400", progress: 39, home: 0, rolls: 0 },
  ];
}

export function nextPlayerIndex(current, total) {
  return (current + 1) % total;
}`;
  }

  return `// FILE: src/App.jsx
import React, { useState } from "react";
import Header from "./components/Header";
import ActionPanel from "./components/ActionPanel";
import EmptyState from "./components/EmptyState";
import { createItem } from "./utils/helpers";

export default function App() {
  const [items, setItems] = useState(() => [createItem("Plan the experience"), createItem("Wire up interactions")]);
  const [text, setText] = useState("");
  const addItem = () => {
    const value = text.trim();
    if (!value) return;
    setItems((current) => [createItem(value), ...current]);
    setText("");
  };
  const toggleItem = (id) => setItems((current) => current.map((item) => item.id === id ? { ...item, done: !item.done } : item));
  const clearDone = () => setItems((current) => current.filter((item) => !item.done));
  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100">
      <div className="mx-auto max-w-4xl space-y-5">
        <Header title=${JSON.stringify(title)} subtitle=${JSON.stringify(prompt.slice(0, 140))} />
        <ActionPanel text={text} setText={setText} onAdd={addItem} onClear={clearDone} />
        {items.length === 0 ? <EmptyState /> : (
          <section className="grid gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <button key={item.id} onClick={() => toggleItem(item.id)} className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-cyan-300">
                <div className="text-sm text-slate-400">Interactive item</div>
                <div className={"mt-1 font-semibold " + (item.done ? "text-cyan-300 line-through" : "text-slate-100")}>{item.title}</div>
              </button>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

// FILE: src/components/Header.jsx
import React from "react";
export default function Header({ title, subtitle }) {
  return <header className="rounded-xl border border-slate-800 bg-slate-900 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Generated app</p><h1 className="mt-1 text-3xl font-black">{title}</h1><p className="mt-2 text-sm text-slate-400">{subtitle}</p></header>;
}

// FILE: src/components/ActionPanel.jsx
import React from "react";
export default function ActionPanel({ text, setText, onAdd, onClear }) {
  return <section className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:flex-row"><input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }} placeholder="Add something..." className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-cyan-300" /><button onClick={onAdd} className="rounded-lg bg-cyan-400 px-4 py-2 font-bold text-slate-950">Add</button><button onClick={onClear} className="rounded-lg border border-slate-700 px-4 py-2 font-bold">Clear done</button></section>;
}

// FILE: src/components/EmptyState.jsx
import React from "react";
export default function EmptyState() {
  return <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-400">Nothing here yet. Add your first item.</div>;
}

// FILE: src/utils/helpers.js
export function createItem(title) {
  return { id: Date.now() + Math.random(), title, done: false };
}`;
}

async function generateCode(apiKey: string, plan: any, system?: string, stage?: string) {
  const blueprint = `BUILD BRIEF
App type: ${plan.appType || "app"}
Complexity: ${plan.complexity || "moderate"}
Pages/sections: ${(plan.pages || []).join(", ") || "(single page)"}
Stage: ${stage || "polish"}

REQUIRED FILE LAYOUT (create each file with the // FILE: delimiter, one responsibility per file):
- src/App.jsx (root, default export)
${(plan.pages || []).map((p: string) => `- src/pages/${p} (route/screen)`).join("\n") || "- (no additional pages)"}
${(plan.components || []).map((c: string) => `- ${c}`).join("\n") || "- (infer minimal components)"}
${(plan.hooks || []).map((h: string) => `- ${h}`).join("\n")}
${(plan.contexts || []).map((c: string) => `- ${c}`).join("\n")}
${(plan.utils || []).map((u: string) => `- ${u}`).join("\n")}

DETAILED SPEC:
${plan.enhancedPrompt || ""}

${system ? "EXTRA SYSTEM HINTS:\n" + system : ""}`.trim();

  const primaryBody = {
    model: MODEL_SMART,
    messages: [
      { role: "system", content: GENERATOR_SYSTEM },
      { role: "user", content: blueprint },
    ],
    temperature: 0.45,
    max_tokens: 4200,
  };
  try {
    const data = await groq(apiKey, primaryBody, { retries: 0, timeoutMs: PRIMARY_GENERATION_TIMEOUT_MS });
    const code = cleanCode(data?.choices?.[0]?.message?.content ?? "");
    if (code) return code;
  } catch (err) {
    console.warn("Primary generation skipped:", err instanceof Error ? err.message : String(err));
  }

  try {
    const data = await groq(apiKey, { ...primaryBody, model: MODEL_FAST, max_tokens: 3600, temperature: 0.35 }, { retries: 0, timeoutMs: FAST_GENERATION_TIMEOUT_MS });
    const code = cleanCode(data?.choices?.[0]?.message?.content ?? "");
    if (code) return code;
  } catch (err) {
    console.warn("Fast generation fallback skipped:", err instanceof Error ? err.message : String(err));
  }

  return fallbackCode(plan._intent?.goal || "Build an app", plan);
}

async function repairCode(apiKey: string, brokenCode: string, errorMsg: string) {
  try {
    const compactCode = brokenCode.length > 18000 ? brokenCode.slice(0, 18000) : brokenCode;
    const data = await groq(apiKey, {
      model: MODEL_FAST,
      messages: [
        { role: "system", content: REPAIR_SYSTEM },
        {
          role: "user",
          content: `ERROR:\n${errorMsg}\n\nBROKEN CODE:\n${compactCode}\n\nReturn the FULL fixed file only.`,
        },
      ],
      temperature: 0.2,
      max_tokens: 2200,
    }, { retries: 0, timeoutMs: REPAIR_TIMEOUT_MS });
    return cleanCode(data?.choices?.[0]?.message?.content ?? "");
  } catch (err) {
    if (isGroqUnavailable(err)) {
      console.warn("Repair skipped; provider unavailable:", err instanceof Error ? err.message : String(err));
      return cleanCode(brokenCode);
    }
    throw err;
  }
}

// ---------- handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  if (!GROQ_API_KEY) return jsonResponse({ error: "GROQ_API_KEY not configured" }, 500);

  let body: any;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

  const mode: "build" | "repair" = body?.mode === "repair" ? "repair" : "build";

  try {
    if (mode === "repair") {
      const code = typeof body.code === "string" ? body.code : "";
      const errorMsg = typeof body.error === "string" ? body.error : "";
      if (!code || !errorMsg) return jsonResponse({ error: "Missing code or error for repair" }, 400);
      let fixed = await repairCode(GROQ_API_KEY, code, errorMsg);
      if (!isMultiFile(fixed) && !bracketsBalanced(fixed)) {
        fixed = await repairCode(GROQ_API_KEY, fixed, "Brackets/JSX still unbalanced. Close every tag and bracket.");
      }
      if (!fixed) return jsonResponse({ error: "Repair produced empty code" }, 502);
      return jsonResponse({ code: fixed, mode });
    }

    // build mode
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return jsonResponse({ error: "Prompt missing" }, 400);
    if (prompt.length > 8000) return jsonResponse({ error: "Prompt too long (max 8000 chars)" }, 400);

    const stage = typeof body.stage === "string" ? body.stage : undefined;
    const system = typeof body.system === "string" ? body.system : undefined;

    const plan = await enhanceAndPlan(GROQ_API_KEY, prompt, stage);
    let code = await generateCode(GROQ_API_KEY, plan, system, stage);

    // Validator: bracket balance for single-file only (multi-file bracket check spans files).
    if (!isMultiFile(code) && !bracketsBalanced(code)) {
      code = await repairCode(GROQ_API_KEY, code, "Unbalanced brackets / unclosed JSX tags detected by validator.");
    }
    if (!code) return jsonResponse({ error: "Generator returned empty code" }, 502);

    return jsonResponse({ code, plan, mode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Appigen pipeline error:", msg);
    // Map common groq errors to friendly statuses
    let status = 500;
    if (/Groq 429/.test(msg)) status = 429;
    else if (/Groq 4\d\d/.test(msg)) status = 400;
    return jsonResponse({ error: msg }, status);
  }
});
