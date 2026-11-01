// AppiGen V4 — Timeout-safe Thinking Engine pipeline (Groq)
// Local stages: 1 Intent · 2 Requirements · 3 Architecture · 4 Blueprint
// AI stages: 5 Generate (multi-file) · 6 Validate · 7 Auto-Repair · 8 Clean
// Critical: never run sequential long AI calls inside the edge request.
import { validateGeneratedCode } from "../_shared/validateGeneratedCode.ts";
import { extractGroqCode } from "../_shared/groqResponse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Groq's OpenAI-compatible chat completions API.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL_FAST = "openai/gpt-oss-20b";
const MODEL_SMART = "openai/gpt-oss-120b";

const FAST_GENERATION_TIMEOUT_MS = 45000;
const REPAIR_TIMEOUT_MS = 35000;

const GENERATOR_SYSTEM = `You are an elite senior frontend engineer generating a production-grade, self-contained React TypeScript application.

OUTPUT CONTRACT (STRICT — the parser depends on it):
- Output ONLY raw source code. NO markdown, NO code fences, NO prose, NO explanations.
- Split the app across MULTIPLE files using this EXACT delimiter on its own line before each file:
    // FILE: <relative/path.tsx>
  Example:
    // FILE: src/App.tsx
    import Header from "./components/Header";
    export default function App(){ ... }

    // FILE: src/components/Header.tsx
    export default function Header(){ ... }

PROJECT STRUCTURE (required for every new app):
- src/App.tsx: small application shell and page composition; default-export the root component.
- src/pages/<Feature>Page.tsx: the main screen, with additional pages only when the prompt asks for them.
- src/components/<Feature>*.tsx: reusable visual sections and controls, separate from page-level composition.
- src/styles.css: the app's own design system: CSS variables, typography, responsive rules, and custom visual details.
- src/hooks/use<Feature>.ts: put meaningful stateful workflows and interaction logic here when the app has them.
- src/lib/<feature>.ts: put non-UI domain rules, calculations, and validation here when they are meaningful.
- Add data/context files only when the requested app needs them. Do not create empty, duplicate, or ceremonial files.
- Import "./styles.css" from src/App.tsx. Keep visual styling in this file and reusable components; do not put the whole app in App.tsx.
- A simple app still needs the App, page, a reusable component, and stylesheet layers. A larger app should use more components and separate its real domain logic into hooks/lib modules.

MODULE RULES:
- Use ES module syntax: \`import X from "./path"\` and \`export default\` / \`export const\`.
- Internal imports: relative ("./components/Foo") OR alias ("@/components/Foo" -> src/*).
- External imports allowed ONLY: "react", "react-dom", "react-dom/client", "lucide-react", "react-router-dom", "recharts", "framer-motion", "date-fns", "clsx". Nothing else.
- Every relative import must resolve to a file included in this output. Never import an unavailable package.
- CSS files are supported by the preview runtime. Import "./styles.css" from src/App.tsx; Tailwind utilities are also available.
- Do NOT call ReactDOM.createRoot — the runtime mounts <App/> from src/App.tsx's default export.

CODE RULES:
- Generate valid TSX/TypeScript with correct React types, valid JSX attributes, balanced tags/braces/parentheses, and complete imports/exports. Never put TypeScript syntax inside JSX expressions or leave placeholder code.
- Keep each file syntactically self-contained: no undeclared variables, unresolved imports, invalid hooks, or incomplete JSX.
- ASCII characters only inside string literals (no smart quotes, em-dashes, or emojis in JSX text).
- Every button has an onClick. Every input is controlled with useState/useReducer.
- Wire ALL interactions to real state — no empty console.log stubs.
- Implement every explicitly requested feature and expose requested results in the UI; do not leave calculated outputs implicit in internal state or omit named summary metrics.
- Before returning, check that each requested control, calculation, edge case, and visible result is represented in the generated app.
- Include loading, empty, and error states where relevant.
- Build a distinctive, polished visual design that fits the user's app and prompt. Define app-specific design tokens and custom CSS in src/styles.css; use Tailwind for layout and utility styling where useful. Avoid generic dashboard/card boilerplate unless requested.
- Match the visual language to the product domain: games need a deliberate board/playfield, clear player identity, readable turns/status, and controls that fit the play area; dashboards need information hierarchy and usable dense data; editorial and commerce apps need their own appropriate composition.
- Validate the layout mentally at narrow mobile widths and wide desktop widths. Keep primary interactions visible, provide adequate contrast and focus states, and avoid overflow or tiny controls.
- Follow the user's requested features, constraints, visual direction, and content exactly; the user prompt is the source of truth.
- Do not invent extra user-facing features, pages, data, integrations, or business rules. When a detail is unspecified, choose the smallest neutral implementation needed to make the requested experience work.
- Never substitute a different app (such as a task manager or generic dashboard) for the app the user requested.
- When given existing source code, preserve all unrelated behavior and make only the changes requested by the user.
- Preserve explicit user wording and constraints over any inferred plan, stage, or optional hint.
- Close every JSX tag and bracket. Reference only defined variables.
- Separate the app shell, screen composition, reusable UI, styling, and meaningful state/domain logic into the project structure above. Keep each file focused; do not collapse a multi-part app into one file.

Return the complete multi-file source. Nothing else.`;

const REPAIR_SYSTEM = `You are an expert React TypeScript / TSX syntax and runtime error fixer for multi-file projects.

You receive broken source (possibly multiple files delimited by "// FILE: <path>" lines) and the runtime/compile error it produced.

RETURN the FULL fixed source using the SAME "// FILE: <path>" delimiter format. Rules:
- NO markdown, NO fences, NO prose.
- Preserve every file that was present; only edit what's needed to fix the error.
- Keep ES module syntax (import/export). External imports limited to react, react-dom, react-dom/client, lucide-react, react-router-dom, recharts, framer-motion, date-fns, and clsx. Every relative import must resolve to an included file.
- Preserve CSS files such as src/styles.css and keep their imports intact; do not fold visual styles into App.tsx.
- Return valid TSX/TypeScript with complete imports, defined identifiers, valid JSX attributes, balanced tags/braces/parentheses, and no placeholders.
- Preserve the user's requested behavior and do not add unrelated features.
- src/App.tsx must default-export the root component. Do NOT call ReactDOM.createRoot.`;

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
  s = s.replace(/^\s*#\s*FILE:/gim, "// FILE:");

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
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      if (controller.signal.aborted) {
        lastErr = { status: "timeout", body: msg };
        if (attempt < retries) continue;
        throw new Error(`Groq request timed out (${timeoutMs}ms)`);
      }
      throw new Error(`Groq network request failed: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    if (res.ok) {
      try { return JSON.parse(text); }
      catch { throw new Error("Groq non-JSON: " + text.slice(0, 300)); }
    }
    lastErr = { status: res.status, body: text };
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      if (attempt >= retries) {
        throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`);
      }
      let wait = Math.min(1200, 400 * 2 ** attempt) + Math.random() * 150;
      const m = text.match(/try again in ([\d.]+)s/i);
      if (m) wait = Math.min(2500, Math.ceil(parseFloat(m[1]) * 1000) + 250);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`Groq ${res.status}: ${text.slice(0, 400)}`);
  }
  throw new Error(`Groq failed: ${JSON.stringify(lastErr).slice(0, 400)}`);
}

function isProviderUnavailable(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|5\d\d|rate limit|timed out|temporary/i.test(msg);
}

function providerFailure(provider: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.match(/\bGroq\s+(\d{3})\b/)?.[1];
  if (status === "401" || status === "403") return `${provider} rejected its configured credentials (HTTP ${status}).`;
  if (status === "429") return `${provider} is rate limited or out of quota (HTTP 429).`;
  if (status && Number(status) >= 500) return `${provider} is currently unavailable (HTTP ${status}).`;
  if (status === "404") return `${provider} returned HTTP 404; the model is unavailable or not enabled for this Groq account.`;
  if (status === "400") return `${provider} rejected the request (HTTP 400): ${message.slice(0, 240)}`;
  if (/timed out|timeout|abort/i.test(message)) return `${provider} timed out.`;
  if (/non-json/i.test(message)) return `${provider} returned an invalid response.`;
  return message.slice(0, 300);
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
    max_completion_tokens: maxTokens,
    reasoning_effort: "low",
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

function localArchitecture() {
  return {
    pages: [],
    components: [],
    hooks: [],
    contexts: [],
    utils: [],
    dataModel: "Only entities explicitly requested by the user",
    stateStrategy: "Use the simplest state strategy that implements the requested interactions",
  };
}

function enhanceAndPlan(_apiKey: string, userPrompt: string, stage?: string) {
  const appType = inferAppType(userPrompt);
  const domain = inferDomain(userPrompt, appType);
  const complexity = userPrompt.length > 900 || /multi|auth|database|payment|realtime|ai|advanced|full/.test(userPrompt.toLowerCase()) ? "complex" : "moderate";
  const intent = { goal: userPrompt, appType, domain, complexity };
  const reqs = {
    functional: [
      "Implement only the user-requested features and interactions",
      "Use production-ready React + Tailwind code",
      "Do not add features, content, or behavior not specified by the user",
    ],
    nonFunctional: ["responsive layout", "accessible controls", "stable event handlers", "fast first render"],
    edgeCases: ["Handle only edge cases directly relevant to the requested features"],
    uxStates: ["Include states relevant to the requested experience"],
  };
  const arch = localArchitecture();

  const components = (arch.components || []).map((c: any) => `${c.path} — ${c.purpose}`);
  const hooks = (arch.hooks || []).map((h: any) => `${h.path} — ${h.purpose}`);
  const contexts = (arch.contexts || []).map((c: any) => `${c.path} — ${c.purpose}`);
  const utils = (arch.utils || []).map((u: any) => `${u.path} — ${u.purpose}`);

  const enhancedPrompt = [
    `User specification (authoritative): ${userPrompt}`,
    `Generation stage (implementation guidance only): ${stage ?? "polish"}`,
    "Accuracy requirement: Treat the user's original prompt as the exact product specification. Implement every explicit requirement and do not invent additional functionality, sections, or assumptions.",
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

interface Providers {
  groqKey?: string;
}

type ConversationTurn = { role: "user" | "assistant"; content: string };

async function generateCode(
  providers: Providers,
  plan: any,
  system?: string,
  stage?: string,
  existingCode?: string,
  conversation: ConversationTurn[] = [],
) {
  const failures: string[] = [];
  const existingPaths = existingCode
    ? [...existingCode.matchAll(/^\s*\/\/\s*FILE:\s*([^\n]+)/gm)].map((match) => match[1].trim())
    : [];
  const recentConversation = conversation.length
    ? `RECENT PROJECT CONVERSATION (use as context; the current prompt is authoritative):\n${conversation.map((turn) => `${turn.role.toUpperCase()}:\n${turn.content}`).join("\n\n")}`
    : "";
  const blueprint = `BUILD BRIEF
App type: ${plan.appType || "app"}
Complexity: ${plan.complexity || "moderate"}
Pages/sections: ${(plan.pages || []).join(", ") || "(single page)"}
Stage: ${stage || "polish"}

REQUIRED FILE LAYOUT (create each file with the // FILE: delimiter):
- src/App.tsx (small root shell; imports ./styles.css)
- src/pages/MainPage.tsx (main screen, own page composition)
- src/components/MainView.tsx (reusable visual UI, separate from the root shell)
- src/styles.css (app-specific design tokens, responsive CSS, and visual polish)
${(plan.pages || []).map((p: string) => `- src/pages/${p} (route/screen)`).join("\n") || "- (no additional pages)"}
${(plan.components || []).map((c: string) => `- ${c}`).join("\n") || "- (infer minimal components)"}
${(plan.hooks || []).map((h: string) => `- ${h}`).join("\n")}
${(plan.contexts || []).map((c: string) => `- ${c}`).join("\n")}
${(plan.utils || []).map((u: string) => `- ${u}`).join("\n")}

For any app with meaningful interactions or state, also create a focused src/hooks/use<Feature>.ts module for the workflow and src/lib/<feature>.ts for reusable domain calculations/validation when applicable. Keep presentational components free of business rules. Add more screen/component/data files only to match the actual requested scope; do not create filler files.

DETAILED SPEC:
${plan.enhancedPrompt || ""}

${existingCode ? `INCREMENTAL UPDATE ROADMAP
1. Read the existing project file tree and source below before changing anything.
2. Identify only the files required for this request; preserve unrelated features and established architecture.
3. Implement the smallest coherent changes, adding focused modules when the new behavior needs them.
4. Return complete source for every project file so the live preview can rebuild consistently.
Existing file tree: ${existingPaths.join(", ") || "(single-file project)"}

EXISTING PROJECT SOURCE (authoritative starting point; preserve all unrelated behavior):
${existingCode}` : ""}

${recentConversation}

${system ? "EXTRA SYSTEM HINTS:\n" + system : ""}

IMPORTANT: Output complete valid TSX/TypeScript/CSS for every file. Do NOT truncate or use placeholders. Close every JSX tag, bracket, and CSS block. Every local import MUST resolve to a file you emit or an allowed runtime module (react, react-dom, react-dom/client, lucide-react, react-router-dom, recharts, framer-motion, date-fns, clsx). The design must be intentionally specific to the requested app, not a generic sample. Preserve exactly the user's specified requirements; do not invent additional features.${existingCode ? " For this edit, apply only the requested changes to the existing source and return the complete updated project, preserving the established file structure." : ""}`.trim();

  const messages = [
    { role: "system", content: GENERATOR_SYSTEM },
    { role: "user", content: blueprint },
  ];

  // Try the faster Groq model first, then use the larger model if needed.
  if (providers.groqKey) {
    for (const model of [MODEL_FAST, MODEL_SMART]) {
      try {
        const data = await groq(providers.groqKey, {
          model,
          messages,
          temperature: 0.2,
          max_completion_tokens: 16000,
          reasoning_effort: "low",
        }, { retries: 0, timeoutMs: FAST_GENERATION_TIMEOUT_MS });
        const code = cleanCode(extractGroqCode(data, model));
        const validationError = validateGeneratedCode(code, !existingCode);
        if (!validationError) return { code, provider: `groq:${model}` };
        failures.push(`Groq ${model} returned invalid project code: ${validationError}`);
      } catch (err) {
        const reason = providerFailure(`Groq ${model}`, err);
        console.warn(`Groq model ${model} failed:`, reason);
        failures.push(reason);
      }
    }
  }

  throw new Error(`AI code generation failed: all configured Groq models failed. ${failures.join(" ") || "Set GROQ_API_KEY in Supabase Edge Function secrets."}`);
}

async function repairCode(providers: Providers, brokenCode: string, errorMsg: string, requireArchitecture = false) {
  const failures: string[] = [];
  const messages = [
    { role: "system", content: REPAIR_SYSTEM },
    { role: "user", content: `ERROR:\n${errorMsg}\n\nBROKEN CODE (preserve every file):\n${brokenCode}\n\nReturn the FULL fixed multi-file source using // FILE: delimiters.` },
  ];

  if (providers.groqKey) {
    try {
      const data = await groq(providers.groqKey, {
        model: MODEL_FAST,
        messages,
        temperature: 0.2,
        max_completion_tokens: 9000,
        reasoning_effort: "low",
      }, { retries: 0, timeoutMs: REPAIR_TIMEOUT_MS });
      const fixed = cleanCode(extractGroqCode(data, MODEL_FAST));
      const validationError = validateGeneratedCode(fixed, requireArchitecture);
      if (!validationError) return fixed;
      failures.push(`Groq repair returned invalid project code: ${validationError}`);
    } catch (err) {
      failures.push(providerFailure("Groq repair", err));
      if (isProviderUnavailable(err)) {
        console.warn("Groq repair unavailable:", err instanceof Error ? err.message : String(err));
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Groq code repair failed. ${failures.join(" ") || "Set GROQ_API_KEY in Supabase Edge Function secrets."}`);
}

// ---------- handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const providers: Providers = {
    groqKey: Deno.env.get("GROQ_API_KEY") || undefined,
  };
  if (!providers.groqKey) {
    return jsonResponse({ error: "Groq is not configured. Set GROQ_API_KEY in Supabase Edge Function secrets." }, 500);
  }

  let body: any;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

  const mode: "build" | "edit" | "repair" = body?.mode === "repair" ? "repair" : body?.mode === "edit" ? "edit" : "build";

  try {
    if (mode === "repair") {
      const code = typeof body.code === "string" ? body.code : "";
      const errorMsg = typeof body.error === "string" ? body.error : "";
      if (!code || !errorMsg) return jsonResponse({ error: "Missing code or error for repair" }, 400);
      const fixed = await repairCode(providers, code, errorMsg);
      if (!fixed) return jsonResponse({ error: "Repair produced empty code" }, 502);
      const validationError = validateGeneratedCode(fixed);
      if (validationError) {
        return jsonResponse({ error: `Repaired project is still invalid: ${validationError}` }, 502);
      }
      return jsonResponse({ code: fixed, mode });
    }

    // build or edit mode
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return jsonResponse({ error: "Prompt missing" }, 400);
    if (prompt.length > 8000) return jsonResponse({ error: "Prompt too long (max 8000 chars)" }, 400);
    const existingCode = mode === "edit" && typeof body.code === "string" ? body.code : undefined;
    if (mode === "edit" && !existingCode) return jsonResponse({ error: "Existing project code missing for edit" }, 400);

    const stage = typeof body.stage === "string" ? body.stage : undefined;
    const system = typeof body.system === "string" ? body.system : undefined;
    const conversation: ConversationTurn[] = [];
    let remainingContext = 12000;
    if (Array.isArray(body.conversation)) {
      for (const turn of body.conversation.slice(-12)) {
        if ((turn?.role !== "user" && turn?.role !== "assistant") || typeof turn.content !== "string") continue;
        const content = turn.content.slice(0, Math.min(2400, remainingContext));
        if (!content) break;
        conversation.push({ role: turn.role, content });
        remainingContext -= content.length;
        if (remainingContext <= 0) break;
      }
    }

    const plan = enhanceAndPlan("", prompt, stage);
    const { code: generatedCode, provider } = await generateCode(providers, plan, system, stage, existingCode, conversation);
    let code = generatedCode;

    const validationError = validateGeneratedCode(code);
    if (validationError) {
      code = await repairCode(providers, code, `Generated project validation failed: ${validationError}`, !existingCode);
      const repairedValidationError = validateGeneratedCode(code, !existingCode);
      if (repairedValidationError) {
        return jsonResponse({ error: `Generated project failed validation after automatic repair: ${repairedValidationError}` }, 502);
      }
    }
    if (!code) return jsonResponse({ error: "Generator returned empty code" }, 502);

    return jsonResponse({ code, plan, provider, mode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Appigen pipeline error:", msg);
    let status = 502;
    if (/Groq 429\b/.test(msg)) status = 429;
    else if (/timed out/i.test(msg)) status = 504;
    return jsonResponse({ error: msg }, status);
  }
});
