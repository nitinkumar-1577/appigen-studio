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

const GENERATOR_SYSTEM = `You are an elite senior frontend engineer. Generate ONE production-grade React component as a single file of JSX.

OUTPUT CONTRACT (STRICT):
- Output ONLY raw JSX/JS code. NO markdown, NO code fences, NO prose, NO comments outside code.
- DO NOT include any import statements.
- React and ReactDOM are GLOBAL. Use React.useState, React.useEffect, React.useRef, React.useMemo, React.useCallback.
- Tailwind CSS is GLOBAL (CDN). Use Tailwind classes for ALL styling.
- The component MUST be named "App".
- The file MUST END with EXACTLY this line:
  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
- ASCII-only characters. No smart quotes, no em-dashes, no emojis inside string literals that break JSX.
- Wrap risky logic in try/catch. Provide loading and empty states.
- Every button must have an onClick. Every input must be controlled.
- Mobile responsive. Dark theme by default. Glassmorphism, gradients, soft shadows.
- NEVER leave unclosed JSX tags or brackets. Validate mentally before output.

ANTI-CRASH:
- Do not reference undefined variables.
- Do not use external libraries beyond React/ReactDOM/Tailwind.
- Do not use TypeScript syntax (no type annotations, no interfaces, no "as" casts).`;

const REPAIR_SYSTEM = `You are an expert JS/JSX bug fixer. You will receive broken React code and the runtime/syntax error it produced.

RETURN ONLY the fully fixed file as raw JSX. Same rules as before:
- NO markdown, NO fences, NO prose.
- NO imports. React + ReactDOM + Tailwind are global.
- Component named App, end with: ReactDOM.createRoot(document.getElementById("root")).render(<App />);
- ASCII only. Close every tag and bracket. Define every variable referenced.
- Preserve the original intent and UI; only change what's needed to fix the error.`;

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
  // if multiple fences, extract the largest fenced block
  const fenceMatches = [...s.matchAll(/```(?:jsx|js|javascript|tsx|ts)?\s*([\s\S]*?)```/gi)];
  if (fenceMatches.length) {
    s = fenceMatches.sort((a, b) => b[1].length - a[1].length)[0][1].trim();
  }
  // remove stray "Here is..." style prose lines before first JSX/keyword
  const firstCodeIdx = s.search(/(^|\n)\s*(function\s+App|const\s+App|class\s+App|React\.)/);
  if (firstCodeIdx > 0) s = s.slice(firstCodeIdx).trimStart();
  // strip any TS type annotations on common patterns (best-effort)
  s = s.replace(/:\s*React\.FC(<[^>]*>)?/g, "");
  // ensure render call exists
  if (!/ReactDOM\.createRoot\([^)]*\)\s*\.render\(\s*<App\s*\/?>\s*\)/.test(s)) {
    s = s.replace(/[;\s]*$/, "") +
      '\nReactDOM.createRoot(document.getElementById("root")).render(<App />);';
  }
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
      const wait = Math.min(8000, 500 * 2 ** attempt) + Math.random() * 250;
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
    max_tokens: 6000,
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
    max_tokens: 6000,
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
