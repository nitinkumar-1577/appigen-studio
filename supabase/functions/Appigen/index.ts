// AppiGen V3 — Core pipeline (Groq strict)
// Phases: 1 Enhancer · 2 Planner · 8 Validator · 9 Auto-Repair · 16 Output cleaning
// Plus: 429/5xx retry+backoff, strict input validation, structured errors.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL_FAST = "llama-3.1-8b-instant";
const MODEL_SMART = "llama-3.3-70b-versatile";

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
  { retries = 3 } = {},
): Promise<any> {
  let lastErr: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) {
      try { return JSON.parse(text); }
      catch (e) { throw new Error("Groq returned non-JSON: " + text.slice(0, 300)); }
    }
    lastErr = { status: res.status, body: text };
    // Retry on 429 / 5xx with exponential backoff + jitter
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      // Honor Groq's "Please try again in Xs" hint when present
      let wait = Math.min(8000, 500 * 2 ** attempt) + Math.random() * 250;
      const m = text.match(/try again in ([\d.]+)s/i);
      if (m) wait = Math.min(30000, Math.ceil(parseFloat(m[1]) * 1000) + 500);
      const ra = res.headers.get("retry-after");
      if (ra && !isNaN(Number(ra))) wait = Math.max(wait, Number(ra) * 1000);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    // non-retryable
    throw new Error(`Groq ${res.status}: ${text.slice(0, 400)}`);
  }
  throw new Error(`Groq failed after retries: ${JSON.stringify(lastErr).slice(0, 400)}`);
}

// ---------- pipeline ----------

async function enhanceAndPlan(apiKey: string, userPrompt: string, stage?: string) {
  const sys = `You are a product+architecture planner. Given a short user request, expand it into a precise build brief.
Return STRICT JSON only (no markdown, no prose) with this shape:
{
  "enhancedPrompt": string,   // 4-12 sentences. Specific features, sections, states, theme, interactions.
  "appType": string,
  "pages": string[],
  "components": string[],
  "features": string[],
  "complexity": "simple" | "moderate" | "complex"
}
Rules:
- Always include: responsive, dark mode, loading states, empty states, error states, hover/active animations.
- If the user request is vague, infer a reasonable scope (do not ask questions).
- Keep it implementable as ONE single React component file with Tailwind.`;
  const user = `User request: ${userPrompt}\nStage hint: ${stage ?? "polish"}`;
  const data = await groq(apiKey, {
    model: MODEL_FAST,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    temperature: 0.4,
    max_tokens: 900,
    response_format: { type: "json_object" },
  });
  const raw = data?.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(raw); }
  catch { return { enhancedPrompt: userPrompt, appType: "app", pages: [], components: [], features: [], complexity: "moderate" }; }
}

async function generateCode(apiKey: string, plan: any, system?: string, stage?: string) {
  const blueprint = `BUILD BRIEF
App type: ${plan.appType || "app"}
Complexity: ${plan.complexity || "moderate"}
Pages/sections: ${(plan.pages || []).join(", ") || "(single page)"}
Components: ${(plan.components || []).join(", ") || "(infer)"}
Features: ${(plan.features || []).join(", ") || "(infer)"}
Stage: ${stage || "polish"}

DETAILED PROMPT:
${plan.enhancedPrompt || ""}

${system ? "EXTRA SYSTEM HINTS:\n" + system : ""}`.trim();

  const data = await groq(apiKey, {
    model: MODEL_SMART,
    messages: [
      { role: "system", content: GENERATOR_SYSTEM },
      { role: "user", content: blueprint },
    ],
    temperature: 0.6,
    max_tokens: 3500,
  });
  return cleanCode(data?.choices?.[0]?.message?.content ?? "");
}

async function repairCode(apiKey: string, brokenCode: string, errorMsg: string) {
  const data = await groq(apiKey, {
    model: MODEL_SMART,
    messages: [
      { role: "system", content: REPAIR_SYSTEM },
      {
        role: "user",
        content: `ERROR:\n${errorMsg}\n\nBROKEN CODE:\n${brokenCode}\n\nReturn the FULL fixed file only.`,
      },
    ],
    temperature: 0.2,
    max_tokens: 3500,
  });
  return cleanCode(data?.choices?.[0]?.message?.content ?? "");
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
      if (!bracketsBalanced(fixed)) {
        // one more pass with stricter instruction
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

    // Validator: bracket balance + render call. Auto-repair once.
    if (!bracketsBalanced(code)) {
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
