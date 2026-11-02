// AppiGen V4 — Timeout-safe Thinking Engine pipeline (Groq)
// Local stages: 1 Intent · 2 Requirements · 3 Architecture · 4 Blueprint
// AI stages: 5 Generate (multi-file) · 6 Validate · 7 Auto-Repair · 8 Clean
// Critical: never run sequential long AI calls inside the edge request.
import { validateGeneratedCode } from "../../../src/lib/preview/validateGeneratedCode.ts";
import { createImplementationPlan } from "../../../src/lib/projects/implementationPlan.ts";
import { extractChatCompletionCode } from "../_shared/groqResponse.ts";
import { parseChatProviderResponse } from "../_shared/providerResponse.ts";
import {
  getDefaultModel,
  getProvider,
  getProviderConfig,
  ACTIVE_PROVIDER_NAMES,
  PROVIDER_NAMES,
  secretNamesFor,
  classifyProviderStatus,
  type ProviderName,
  type ProviderStatus,
} from "../_shared/providerCatalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL_FAST = "openai/gpt-oss-20b";
const MODEL_SMART = "openai/gpt-oss-120b";
const DEEPSEEK_MODEL = "deepseek-chat";
const ALLOWED_MODELS = [MODEL_FAST, MODEL_SMART] as const;

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
- Treat the design plan as a build requirement. For board games, draw the recognizable complete board with its real geometry, colored regions, paths, safe/home areas, and visible pieces; do not replace the board with a generic row/column list. For action games, make a substantial playfield with visible actors, obstacles, and feedback.
- Before returning, perform a requirement-by-requirement product review. Every requested control must cause a meaningful state change; game turns and legal moves must be represented by real domain rules, not decorative button states.
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

const REVIEW_SYSTEM = `You are AppiGen's independent senior product, UI, and implementation reviewer. Compare a complete generated React project with the user's exact request and implementation plan, then improve the full project source.

Review the visible product design, every requested interaction, the domain rules and edge cases, the complete file tree and imports, responsive behavior, accessibility, and runtime risks. Games must render a complete recognizable board or playfield with appropriate domain geometry; a narrow strip or generic list is a failed design. Improve missing or weak parts. Do not approve placeholders, dead controls, generic shells, incomplete boards, or visually empty screens.

Return the FULL source tree using the exact // FILE: <relative/path> delimiter format. Preserve working features and planned module boundaries; add focused files if needed. No prose, markdown, code fences, TODOs, or placeholders. Even when no changes are needed, return every file unchanged.`;

// ---------- helpers ----------

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type SafetyThresholds = {
  harassment: number;
  hate: number;
  explicit: number;
  dangerous: number;
};

function parseSafetyThresholds(value: unknown): SafetyThresholds {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const threshold = (key: keyof SafetyThresholds, fallback: number) => {
    const raw = input[key];
    return typeof raw === "number" && Number.isFinite(raw) ? Math.min(3, Math.max(0, Math.round(raw))) : fallback;
  };
  return {
    harassment: threshold("harassment", 2),
    hate: threshold("hate", 2),
    explicit: threshold("explicit", 3),
    dangerous: threshold("dangerous", 2),
  };
}

function getSafetyViolation(prompt: string, thresholds: SafetyThresholds): string | null {
  const text = prompt.toLowerCase();
  const mandatoryBlocks: [RegExp, string][] = [
    [/\b(?:how to|instructions? to|steps? to|build|make|create)\b.{0,80}\b(?:bomb|explosive|poison|weapon|shoot|stab|kill|murder)\b/i, "violent or weapon-building instructions"],
    [/\b(?:suicide|self[- ]harm)\b.{0,80}\b(?:method|how to|instructions?|ways to|plan)\b/i, "instructions for self-harm"],
    [/\b(?:child|minor|underage)\b.{0,80}\b(?:sexual|nude|porn|explicit)\b/i, "sexual content involving minors"],
    [/\b(?:steal|exfiltrate|dump)\b.{0,60}\b(?:passwords?|credentials?|private keys?)\b/i, "credential theft"],
  ];
  for (const [pattern, reason] of mandatoryBlocks) {
    if (pattern.test(text)) return reason;
  }

  const filters: [keyof SafetyThresholds, number, RegExp, string][] = [
    ["harassment", 1, /\b(?:dox|doxx|swat|stalk)\b/i, "targeted harassment"],
    ["harassment", 2, /\b(?:harass|threaten|intimidate)\b.{0,60}\b(?:person|user|employee|classmate|neighbor|group)\b/i, "targeted harassment"],
    ["harassment", 3, /\b(?:create|build|organize|launch)\b.{0,60}\b(?:harassment|intimidation|stalking|doxxing)\b/i, "targeted harassment"],
    ["hate", 1, /\b(?:promote|encourage|organize|recruit for)\b.{0,70}\b(?:racial violence|ethnic cleansing|genocide|supremacist attack)\b/i, "hateful or extremist violence"],
    ["hate", 2, /\b(?:dehumanize|incite violence against|attack)\b.{0,70}\b(?:race|ethnicity|religion|nationality|protected group)\b/i, "hateful or extremist violence"],
    ["hate", 3, /\b(?:create|write|design|promote)\b.{0,70}\b(?:hate propaganda|supremacist content|dehumanizing content)\b/i, "hateful or extremist content"],
    ["explicit", 1, /\b(?:generate|create|write|design)\b.{0,60}\b(?:pornographic|graphic sexual|explicit sexual)\b/i, "sexually explicit content"],
    ["explicit", 2, /\b(?:generate|create|write|design)\b.{0,60}\b(?:adult porn|sexual roleplay|erotic content)\b/i, "sexually explicit content"],
    ["explicit", 3, /\b(?:generate|create|write|design)\b.{0,60}\b(?:porn|sexual fantasy|explicit content)\b/i, "sexually explicit content"],
    ["dangerous", 1, /\b(?:instructions?|guide|tutorial|steps?)\b.{0,70}\b(?:weapon construction|homemade explosive|poison synthesis|evade law enforcement)\b/i, "dangerous instructions"],
    ["dangerous", 2, /\b(?:how to|instructions? for|guide to)\b.{0,60}\b(?:build a weapon|make an explosive|synthesize poison|bypass safety mechanisms)\b/i, "dangerous instructions"],
    ["dangerous", 3, /\b(?:build|make|construct|synthesize)\b.{0,60}\b(?:weapon|explosive|poison|incendiary device)\b/i, "dangerous instructions"],
  ];
  for (const [category, minimumLevel, pattern, reason] of filters) {
    if (thresholds[category] >= minimumLevel && pattern.test(text)) return reason;
  }
  return null;
}

function numericSetting(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
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

function validatePlannedFiles(source: string, implementationPlan: any): string | null {
  const expected = Array.isArray(implementationPlan?.fileBlueprint)
    ? implementationPlan.fileBlueprint.map((file: any) => typeof file?.path === "string" ? file.path : "").filter(Boolean)
    : [];
  if (!expected.length) return "The implementation plan has no project file blueprint.";
  const actual = new Set([...source.matchAll(/^\s*\/\/\s*FILE:\s*([^\n]+)\s*$/gm)].map((match) => match[1].trim()));
  const missing = expected.filter((path: string) => !actual.has(path));
  return missing.length ? `The generated project is missing planned files: ${missing.join(", ")}.` : null;
}



async function completeChat(
  provider: ProviderName,
  apiKey: string,
  body: Record<string, unknown>,
  { retries = 0, timeoutMs = 55000 } = {},
): Promise<any> {
  const config = getProviderConfig(provider);
  const model = typeof body.model === "string" ? body.model : getDefaultModel(provider);
  const isGemini = config.protocol === "gemini";
  let lastErr: ProviderRequestError | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      const url = isGemini
        ? `${config.baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
        : `${config.baseUrl}/chat/completions`;
      const requestBody = isGemini
        ? {
            contents: Array.isArray(body.messages)
              ? body.messages.filter((message: any) => message?.role !== "system").map((message: any) => ({
                role: message.role === "assistant" ? "model" : "user",
                parts: [{ text: String(message.content ?? "") }],
              }))
              : [{ role: "user", parts: [{ text: String(body.prompt ?? "") }] }],
            systemInstruction: Array.isArray(body.messages)
              ? { parts: [{ text: String(body.messages.find((message: any) => message?.role === "system")?.content ?? "") }] }
              : undefined,
            generationConfig: {
              temperature: body.temperature,
              topP: body.top_p,
              maxOutputTokens: body.max_completion_tokens,
            },
          }
        : provider === "groq"
          ? { ...body, stream: false, include_reasoning: false }
          : body;
      res = await fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      if (controller.signal.aborted) {
        lastErr = new ProviderRequestError(provider, undefined, "TIMEOUT", "request exceeded its timeout");
        if (attempt < retries) continue;
        throw lastErr;
      }
      throw new ProviderRequestError(provider, undefined, "NETWORK_ERROR", "request could not reach provider");
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    const responseContentType = res.headers.get("content-type") ?? "";
    if (res.ok) {
      try {
        const parsed = isGemini
          ? JSON.parse(text.replace(/^\uFEFF/, "").trim())
          : parseChatProviderResponse(text, responseContentType);
        if (!parsed || typeof parsed !== "object") {
          throw new ProviderRequestError(provider, res.status, "INVALID_RESPONSE", "response JSON was not an object");
        }
        return isGemini ? normalizeGeminiResponse(parsed) : parsed;
      } catch (error) {
        if (error instanceof ProviderRequestError) throw error;
        const parserDetail = error instanceof Error && /response (?:was not valid JSON|stream contained no valid JSON chunks)/i.test(error.message)
          ? error.message : "response parse failed";
        throw new ProviderRequestError(provider, res.status, "INVALID_RESPONSE", `${parserDetail} (content-type: ${responseContentType || "missing"}; length: ${text.length}; shape: ${responseShape(text)})`);
      }
    }
    const metadata = providerErrorMetadata(text);
    lastErr = new ProviderRequestError(
      provider,
      res.status,
      providerErrorCode(res.status, metadata),
      metadata,
    );
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      if (attempt >= retries) {
        throw lastErr;
      }
      let wait = Math.min(1200, 400 * 2 ** attempt) + Math.random() * 150;
      const m = text.match(/try again in ([\d.]+)s/i);
      if (m) wait = Math.min(2500, Math.ceil(parseFloat(m[1]) * 1000) + 250);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw lastErr;
  }
  throw lastErr ?? new ProviderRequestError(provider, undefined, "NETWORK_ERROR", "request failed");
}

const providerLabel = (provider: ProviderName) => getProviderConfig(provider).label;

type ProviderErrorCode =
  | "INVALID_CREDENTIALS"
  | "PERMISSION_DENIED"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "MODEL_UNAVAILABLE"
  | "PROVIDER_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "REQUEST_REJECTED";

class ProviderRequestError extends Error {
  constructor(
    readonly provider: ProviderName,
    readonly httpStatus: number | undefined,
    readonly code: ProviderErrorCode,
    detail: string,
  ) {
    super(`${providerLabel(provider)} ${httpStatus ?? "network"} [${code}]${detail ? `: ${detail}` : ""}`);
    this.name = "ProviderRequestError";
  }
}

export function providerErrorCode(status: number, metadata = ""): ProviderErrorCode {
  if (status === 401) return "INVALID_CREDENTIALS";
  if (status === 403) return "PERMISSION_DENIED";
  if (status === 402) return "QUOTA_EXCEEDED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 413 && metadata.includes("provider_code=rate_limit_exceeded") && metadata.includes("provider_type=tokens")) {
    return "RATE_LIMITED";
  }
  if (status === 404) return "MODEL_UNAVAILABLE";
  if (status >= 500) return "PROVIDER_ERROR";
  return "REQUEST_REJECTED";
}

export const incrementalReviewResponse = (code: string) => ({
  code,
  mode: "review" as const,
  reviewSkipped: true,
  reviewReason: "incremental_edit_token_saving" as const,
});

function providerErrorMetadata(text: string): string {
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    const nested = payload.error && typeof payload.error === "object"
      ? payload.error as Record<string, unknown>
      : undefined;
    const code = typeof payload.code === "string"
      ? payload.code
      : typeof nested?.code === "string" ? nested.code : undefined;
    const type = typeof payload.type === "string"
      ? payload.type
      : typeof nested?.type === "string" ? nested.type : undefined;
    const keys = Object.keys(payload).slice(0, 8).join(",");
    return [code && `provider_code=${code}`, type && `provider_type=${type}`, keys && `response_keys=${keys}`]
      .filter(Boolean)
      .join(" ");
  } catch {
    return "response was not JSON";
  }
}

function isProviderUnavailable(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return err instanceof ProviderRequestError
    ? err.code === "RATE_LIMITED" || err.code === "PROVIDER_ERROR" || err.code === "TIMEOUT" || err.code === "NETWORK_ERROR"
    : /429|5\d\d|rate limit|timed out|temporary/i.test(msg);
}

function providerFailure(provider: string, error: unknown): string {
  if (error instanceof ProviderRequestError) {
    return `${provider} ${error.httpStatus ?? "network"} [${error.code}]${error.message.includes(": ") ? `: ${error.message.split(": ").slice(1).join(": ")}` : ""}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  const status = message.match(/\b(\d{3})\b/)?.[1];
  if (status === "401" || status === "403") return `${provider} rejected its configured credentials (HTTP ${status}).`;
  if (status === "429") return `${provider} is rate limited or out of quota (HTTP 429).`;
  if (status && Number(status) >= 500) return `${provider} is currently unavailable (HTTP ${status}).`;
  if (status === "404") return `${provider} returned HTTP 404; the model is unavailable or not enabled for this provider account.`;
  if (status === "400") return `${provider} rejected the request (HTTP 400): ${message.slice(0, 240)}`;
  if (/timed out|timeout|abort/i.test(message)) return `${provider} timed out.`;
  if (/non-json/i.test(message)) return `${provider} returned an invalid response.`;
  return message.slice(0, 300);
}

function errorCodeFromMessage(message: string): ProviderErrorCode {
  const match = message.match(/\[([A-Z_]+)\]/)?.[1];
  if (match) return match as ProviderErrorCode;
  if (/timed out|timeout|abort/i.test(message)) return "TIMEOUT";
  if (/network/i.test(message)) return "NETWORK_ERROR";
  return "PROVIDER_ERROR";
}

function httpStatusForErrorCode(code: ProviderErrorCode): number {
  if (code === "INVALID_CREDENTIALS") return 401;
  if (code === "PERMISSION_DENIED") return 403;
  if (code === "QUOTA_EXCEEDED") return 402;
  if (code === "RATE_LIMITED") return 429;
  if (code === "MODEL_UNAVAILABLE") return 404;
  if (code === "TIMEOUT") return 504;
  if (code === "NETWORK_ERROR" || code === "PROVIDER_ERROR") return 502;
  return 400;
}

function normalizeGeminiResponse(data: any): { choices: Array<{ message: { content: string } }> } {
  const content = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("") ?? "";
  if (!content.trim()) {
    throw new ProviderRequestError("gemini", 200, "INVALID_RESPONSE", "response contained no candidate text");
  }
  return { choices: [{ message: { content } }] };
}

function responseShape(text: string): string {
  const body = text.trimStart();
  if (!body) return "empty";
  if (body.startsWith("<")) return "html";
  if (/^(?:data:|event:)/m.test(body)) return "event-stream";
  if (body.startsWith("{") || body.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (Array.isArray(parsed)) return `valid-json-array (${parsed.length} items)`;
      if (parsed && typeof parsed === "object") return `valid-json-object (${Object.keys(parsed).slice(0, 8).join(",") || "no keys"})`;
      return `valid-json-${parsed === null ? "null" : typeof parsed}`;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "parse error";
      const position = detail.match(/position (\d+)/i)?.[1];
      return `malformed-json${/unexpected end/i.test(detail) ? " (truncated)" : ""}${position ? ` at ${position}` : ""}`;
    }
  }
  if (/^```|^\s*\/\/\s*FILE:/m.test(body)) return "code-like";
  return "plain-text";
}

// ---------- pipeline ----------

// ============================================================
// THINKING ENGINE — staged reasoning before any code is written.
// Stages: 1 Intent · 2 Requirements · 3 Architecture · 4 Blueprint
// Each stage enriches a shared `plan` object. Cheap models for
// reasoning, smart model reserved for generation + repair.
// ============================================================

async function groqJSON(apiKey: string, model: string, sys: string, user: string, maxTokens = 900) {
  const data = await completeChat("groq", apiKey, {
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

function enhanceAndPlan(_apiKey: string, userPrompt: string, stage?: string, existingCode?: string) {
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
  const existingFiles = existingCode
    ? [...existingCode.matchAll(/^\s*\/\/\s*FILE:\s*([^\n]+)/gm)].map((match) => match[1].trim())
    : [];
  const { architecture: arch, implementationPlan } = createImplementationPlan({
    prompt: userPrompt,
    appType,
    domain,
    complexity,
    existingFiles,
    hasExistingProject: Boolean(existingCode),
  });

  const components = arch.components.map((c) => `${c.path} — ${c.purpose}`);
  const hooks = arch.hooks.map((h) => `${h.path} — ${h.purpose}`);
  const contexts = arch.contexts.map((c) => `${c.path} — ${c.purpose}`);
  const utils = arch.utils.map((u) => `${u.path} — ${u.purpose}`);

  const enhancedPrompt = [
    `User specification (authoritative): ${userPrompt}`,
    `Generation stage (implementation guidance only): ${stage ?? "polish"}`,
    `Implementation roadmap: ${implementationPlan.steps.join(" -> ")}`,
    `Feature file blueprint: ${implementationPlan.fileBlueprint.map((file) => `${file.path} — ${file.purpose}`).join("; ")}`,
    `Visual design direction: ${implementationPlan.designDirection.join(" ")}`,
    `Acceptance checklist: ${implementationPlan.qualityChecks.join(" ")}`,
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
    implementationPlan,
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
  deepseekKey?: string;
  openrouterKey?: string;
  geminiKey?: string;
  openaiKey?: string;
  nvidiaKey?: string;
}

const providerKey = (providers: Providers, provider: ProviderName) =>
  ({
    groq: providers.groqKey,
    deepseek: providers.deepseekKey,
    openrouter: providers.openrouterKey,
    gemini: providers.geminiKey,
    openai: providers.openaiKey,
    nvidia: providers.nvidiaKey,
  }[provider]);

function configuredSecret(name: string, fallbackName?: string): string | undefined {
  return Deno.env.get(name) || (fallbackName ? Deno.env.get(fallbackName) : undefined) || undefined;
}

type ConversationTurn = { role: "user" | "assistant"; content: string };

function readProviderKeys(): Providers {
  return {
    groqKey: configuredSecret("GROQ_API_KEY"),
    deepseekKey: configuredSecret("DEEPSEEK-API-KEY", "DEEPSEEK_API_KEY"),
    openrouterKey: configuredSecret("OPENROUTER_API_KEY"),
    geminiKey: configuredSecret("GEMINI_API_KEY"),
    openaiKey: configuredSecret("OPENAI_API_KEY"),
    nvidiaKey: configuredSecret("NVIDIA_API_KEY"),
  };
}

function redactSecret(text: string, secret?: string): string {
  return secret ? text.split(secret).join("[REDACTED]") : text;
}

async function fetchProviderResource(
  provider: ProviderName,
  apiKey: string,
  url: string,
  init: RequestInit,
  timeoutMs = 12000,
): Promise<{ response?: Response; status: ProviderStatus; detail?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { response, status: classifyProviderStatus(response.status) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: controller.signal.aborted ? "timeout" : "network_error",
      detail: redactSecret(detail, apiKey),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function testProvider(provider: ProviderName, apiKey?: string) {
  const config = getProviderConfig(provider);
  const result: {
    provider: ProviderName;
    label: string;
    configured: boolean;
    authentication: { status: ProviderStatus; detail?: string };
    generation: { model: string; status: ProviderStatus; detail?: string };
    models: { status: ProviderStatus; ids: string[]; detail?: string };
  } = {
    provider,
    label: config.label,
    configured: Boolean(apiKey),
    authentication: { status: apiKey ? "request_error" : "missing" },
    generation: { model: getDefaultModel(provider), status: apiKey ? "request_error" : "missing" },
    models: { status: apiKey ? "request_error" : "missing", ids: [] },
  };
  if (!apiKey) return result;

  const authUrl = config.protocol === "gemini"
    ? `${config.baseUrl}/models?key=${encodeURIComponent(apiKey)}`
    : `${config.baseUrl}/models`;
  const auth = await fetchProviderResource(provider, apiKey, authUrl, {
    headers: config.protocol === "gemini"
      ? { "Content-Type": "application/json" }
      : { "Authorization": `Bearer ${apiKey}` },
  });
  result.authentication = { status: auth.status, detail: auth.detail };

  if (auth.response?.ok) {
    try {
      const payload = await auth.response.json();
      const rawModels = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
      result.models = {
        status: "working",
        ids: rawModels.map((model: any) => String(model.id ?? model.name ?? "")).filter(Boolean).slice(0, 100),
      };
    } catch (error) {
      result.models = { status: "request_error", ids: [], detail: "Provider returned invalid model-list JSON." };
    }
  } else if (!config.supportsModelListing) {
    result.models = { status: "request_error", ids: [], detail: "Provider does not support model listing." };
  } else {
    result.models = { status: auth.status, ids: [], detail: auth.detail };
  }

  try {
    const data = await completeChat(provider, apiKey, {
      model: result.generation.model,
      messages: [{ role: "user", content: "Reply with the single word OK." }],
      temperature: 0,
      top_p: 1,
      max_completion_tokens: 16,
    }, { timeoutMs: 12000 });
    const content = data?.choices?.[0]?.message?.content;
    result.generation = {
      model: result.generation.model,
      status: typeof content === "string" && content.length > 0 ? "working" : "request_error",
      ...(typeof content !== "string" ? { detail: "Provider returned no generated content." } : {}),
    };
  } catch (error) {
    const message = redactSecret(error instanceof Error ? error.message : String(error), apiKey);
    const statusCode = message.match(/\b(\d{3})\b/)?.[1];
    const status: ProviderStatus = error instanceof ProviderRequestError && error.code === "INVALID_RESPONSE"
      ? "request_error"
      : statusCode ? classifyProviderStatus(Number(statusCode)) : /timeout/i.test(message) ? "timeout" : "network_error";
    result.generation = {
      model: result.generation.model,
      status,
      detail: message.slice(0, 240),
    };
  }
  return result;
}

async function generateCode(
  providers: Providers,
  provider: ProviderName,
  plan: any,
  system?: string,
  stage?: string,
  existingCode?: string,
  conversation: ConversationTurn[] = [],
  generation: { model: string; temperature: number; topP: number } = {
    model: MODEL_SMART,
    temperature: 0.2,
    topP: 1,
  },
) {
  const failures: string[] = [];
  let invalidCandidate: { code: string; provider: string } | undefined;
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

REQUIRED FILE LAYOUT (create every focused file in this blueprint with the // FILE: delimiter):
${plan.implementationPlan.fileBlueprint.map((file: { path: string; purpose: string }) => `- ${file.path} — ${file.purpose}`).join("\n")}

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
    {
      role: "system",
      content: `${GENERATOR_SYSTEM}${system ? `\n\nUSER CONFIGURED SYSTEM INSTRUCTIONS (follow where consistent with the strict output contract):\n${system}` : ""}`,
    },
    { role: "user", content: blueprint },
  ];

  const configuredModels = getProviderConfig(provider).models.map((model) => model.id);
  const preferredModel = configuredModels.includes(generation.model)
    ? generation.model
    : getDefaultModel(provider);
  const modelOrder = [preferredModel, ...configuredModels.filter((model) => model !== preferredModel)];
  const apiKey = providerKey(providers, provider);
  if (apiKey) {
    for (const model of modelOrder) {
      try {
        const data = await completeChat(provider, apiKey, {
          model,
          messages,
          temperature: generation.temperature,
          top_p: generation.topP,
          // Keep requests within Groq's per-request token budget while leaving
          // enough room for a multi-file app and its focused domain logic.
          max_completion_tokens: 7000,
          reasoning_effort: "low",
        }, { retries: 0, timeoutMs: FAST_GENERATION_TIMEOUT_MS });
        const code = cleanCode(extractChatCompletionCode(data, providerLabel(provider), model));
        const validationError = validateGeneratedCode(code, !existingCode) || (!existingCode ? validatePlannedFiles(code, plan.implementationPlan) : null);
        if (!validationError) return { code, provider: `${provider}:${model}` };
        if (code) invalidCandidate = { code, provider: `${provider}:${model}` };
        failures.push(`${providerLabel(provider)} ${model} returned invalid project code: ${validationError}`);
      } catch (err) {
        const reason = providerFailure(`${providerLabel(provider)} ${model}`, err);
        console.warn(`${providerLabel(provider)} model ${model} failed:`, reason);
        failures.push(reason);
      }
    }
  }

  if (invalidCandidate) return invalidCandidate;
  throw new Error(`AI code generation failed: all configured ${providerLabel(provider)} models failed. ${failures.join(" ") || `Set ${secretNamesFor(provider)[0]} in Supabase Edge Function secrets.`}`);
}

async function repairCode(providers: Providers, provider: ProviderName, brokenCode: string, errorMsg: string, requireArchitecture = false) {
  const failures: string[] = [];
  const messages = [
    { role: "system", content: REPAIR_SYSTEM },
    { role: "user", content: `ERROR:\n${errorMsg}\n\nBROKEN CODE (preserve every file):\n${brokenCode}\n\nReturn the FULL fixed multi-file source using // FILE: delimiters.` },
  ];

  const apiKey = providerKey(providers, provider);
  if (apiKey) {
    try {
      const model = getDefaultModel(provider);
      const data = await completeChat(provider, apiKey, {
        model,
        messages,
        temperature: 0.2,
        max_completion_tokens: 9000,
        reasoning_effort: "low",
      }, { retries: 0, timeoutMs: REPAIR_TIMEOUT_MS });
      const fixed = cleanCode(extractChatCompletionCode(data, providerLabel(provider), model));
      const validationError = validateGeneratedCode(fixed, requireArchitecture);
      if (!validationError) return fixed;
      failures.push(`${providerLabel(provider)} repair returned invalid project code: ${validationError}`);
    } catch (err) {
      failures.push(providerFailure(`${providerLabel(provider)} repair`, err));
      if (isProviderUnavailable(err)) {
        console.warn(`${providerLabel(provider)} repair unavailable:`, err instanceof Error ? err.message : String(err));
      } else {
        throw err;
      }
    }
  }
  throw new Error(`${providerLabel(provider)} code repair failed. ${failures.join(" ") || `Set ${secretNamesFor(provider)[0]} in Supabase Edge Function secrets.`}`);
}

async function reviewAndImproveCode(
  providers: Providers,
  provider: ProviderName,
  prompt: string,
  code: string,
  plan: unknown,
  model?: string,
) {
  const apiKey = providerKey(providers, provider);
  if (!apiKey) throw new Error(`${providerLabel(provider)} is not configured for the review stage.`);
  const modelIds = getProviderConfig(provider).models.map((entry) => entry.id);
  const reviewModel = typeof model === "string" && modelIds.includes(model) ? model : getDefaultModel(provider);
  const brief = [
    "ORIGINAL USER REQUEST (authoritative):",
    prompt,
    "\nIMPLEMENTATION PLAN:",
    typeof plan === "string" ? plan : JSON.stringify(plan ?? {}),
    "\nFULL CURRENT PROJECT SOURCE:",
    code,
    "\nCompare the complete implementation with the requested product. Fix missing behavior, weak layout, generic styling, incomplete game boards or rules, inaccessible controls, broken imports, and mobile overflow. Return the full corrected project source, not a review summary.",
  ].join("\n");
  const data = await completeChat(provider, apiKey, {
    model: reviewModel,
    messages: [
      { role: "system", content: `${GENERATOR_SYSTEM}\n\n${REVIEW_SYSTEM}` },
      { role: "user", content: brief },
    ],
    temperature: 0.15,
    top_p: 1,
    max_completion_tokens: 16000,
    reasoning_effort: "low",
  }, { timeoutMs: 38000 });
  return cleanCode(extractChatCompletionCode(data, providerLabel(provider), reviewModel));
}

function providerFallbackOrder(providers: Providers, requested: ProviderName): ProviderName[] {
  void requested;
  return ACTIVE_PROVIDER_NAMES.filter((candidate) => Boolean(providerKey(providers, candidate)));
}

// ---------- handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const providers = readProviderKeys();

  let body: any;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

  const mode: "build" | "edit" | "repair" | "review" | "plan" | "health" =
    body?.mode === "health" ? "health"
      : body?.mode === "repair" ? "repair"
        : body?.mode === "review" ? "review"
          : body?.mode === "edit" ? "edit"
            : body?.mode === "plan" ? "plan"
              : "build";
  const provider = getProvider(body?.provider);

  try {
    if (mode === "health") {
      const requestedProviders = body?.provider
        ? [provider]
        : PROVIDER_NAMES;
      const results = [];
      for (const candidate of requestedProviders) {
        results.push(await testProvider(candidate, providerKey(providers, candidate)));
      }
      return jsonResponse({
        testedAt: new Date().toISOString(),
        results,
      });
    }

    if (mode === "plan") {
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) return jsonResponse({ error: "Prompt missing" }, 400);
      if (prompt.length > 8000) return jsonResponse({ error: "Prompt too long (max 8000 chars)" }, 400);
      const safetyViolation = getSafetyViolation(prompt, parseSafetyThresholds(body.safety));
      if (safetyViolation) return jsonResponse({ error: `This request was blocked by AppiGen's safety filters (${safetyViolation}). Revise the prompt to continue.` }, 400);
      const existingCode = typeof body.code === "string" ? body.code : undefined;
      if (body.existingProject === true && !existingCode) return jsonResponse({ error: "Existing project code missing for plan" }, 400);
      const stage = typeof body.stage === "string" ? body.stage : undefined;
      const plan = enhanceAndPlan("", prompt, stage, existingCode);
      return jsonResponse({ plan: { implementationPlan: plan.implementationPlan } });
    }

    if (mode !== "plan" && providerFallbackOrder(providers, provider).length === 0) {
      return jsonResponse({
        error: `${providerLabel(provider)} is not configured. Set ${secretNamesFor(provider)[0]} in Supabase Edge Function secrets.`,
      }, 500);
    }

    if (mode === "repair") {
      const code = typeof body.code === "string" ? body.code : "";
      const errorMsg = typeof body.error === "string" ? body.error : "";
      if (!code || !errorMsg) return jsonResponse({ error: "Missing code or error for repair" }, 400);
      let fixed = "";
      const repairFailures: string[] = [];
      for (const candidate of providerFallbackOrder(providers, provider)) {
        try {
          fixed = await repairCode(providers, candidate, code, errorMsg);
          if (fixed) break;
        } catch (error) {
          repairFailures.push(providerFailure(`${providerLabel(candidate)} repair`, error));
        }
      }
      if (!fixed) throw new Error(repairFailures.join(" ") || "No configured provider could repair the project.");
      if (!fixed) return jsonResponse({ error: "Repair produced empty code" }, 502);
      const validationError = validateGeneratedCode(fixed);
      if (validationError) {
        return jsonResponse({ error: `Repaired project is still invalid: ${validationError}` }, 502);
      }
      return jsonResponse({ code: fixed, mode });
    }

    if (mode === "review") {
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      const code = typeof body.code === "string" ? body.code : "";
      if (!prompt || !code) return jsonResponse({ error: "Review requires the original prompt and complete project source" }, 400);
      if (prompt.length > 8000) return jsonResponse({ error: "Prompt too long (max 8000 chars)" }, 400);
      const safetyViolation = getSafetyViolation(prompt, parseSafetyThresholds(body.safety));
      if (safetyViolation) return jsonResponse({ error: `This request was blocked by AppiGen's safety filters (${safetyViolation}). Revise the prompt to continue.` }, 400);
      if (body.existingProject === true) {
        return jsonResponse(incrementalReviewResponse(code));
      }

      let reviewedCode = "";
      const reviewFailures: string[] = [];
      const requireArchitecture = body.existingProject !== true;
      for (const candidate of providerFallbackOrder(providers, provider)) {
        try {
          reviewedCode = await reviewAndImproveCode(providers, candidate, prompt, code, body.plan, body.model);
          let reviewValidation = validateGeneratedCode(reviewedCode, requireArchitecture) || (requireArchitecture ? validatePlannedFiles(reviewedCode, body.plan) : null);
          if (reviewValidation) {
            reviewedCode = await repairCode(providers, candidate, reviewedCode, `Reviewed project validation failed: ${reviewValidation}`, requireArchitecture);
            reviewValidation = validateGeneratedCode(reviewedCode, requireArchitecture) || (requireArchitecture ? validatePlannedFiles(reviewedCode, body.plan) : null);
          }
          if (!reviewValidation) break;
          reviewedCode = "";
          reviewFailures.push(`${providerLabel(candidate)} review returned invalid project code: ${reviewValidation}`);
        } catch (error) {
          reviewFailures.push(providerFailure(`${providerLabel(candidate)} review`, error));
        }
      }
      if (!reviewedCode) throw new Error(reviewFailures.join(" ") || "No configured provider could review the generated project.");
      return jsonResponse({ code: reviewedCode, mode });
    }

    // build or edit mode
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return jsonResponse({ error: "Prompt missing" }, 400);
    if (prompt.length > 8000) return jsonResponse({ error: "Prompt too long (max 8000 chars)" }, 400);
    const safetyViolation = getSafetyViolation(prompt, parseSafetyThresholds(body.safety));
    if (safetyViolation) return jsonResponse({ error: `This request was blocked by AppiGen's safety filters (${safetyViolation}). Revise the prompt to continue.` }, 400);
    const existingCode = mode === "edit" && typeof body.code === "string" ? body.code : undefined;
    if (mode === "edit" && !existingCode) return jsonResponse({ error: "Existing project code missing for edit" }, 400);

    const stage = typeof body.stage === "string" ? body.stage : undefined;
    const system = typeof body.system === "string" ? body.system.slice(0, 4000) : undefined;
    const configuredModels = getProviderConfig(provider).models.map((entry) => entry.id);
    const model = configuredModels.includes(body.model) ? body.model : getDefaultModel(provider);
    const temperature = numericSetting(body.temperature, 0.2, 0, 2);
    const topP = numericSetting(body.topP, 1, 0, 1);
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

    const plan = enhanceAndPlan("", prompt, stage, existingCode);
    let generatedCode = "";
    let usedProvider = "";
    const generationFailures: string[] = [];
    for (const candidate of providerFallbackOrder(providers, provider)) {
      try {
        const generated = await generateCode(providers, candidate, plan, system, stage, existingCode, conversation, { model, temperature, topP });
        generatedCode = generated.code;
        usedProvider = generated.provider;
        break;
      } catch (error) {
        generationFailures.push(providerFailure(providerLabel(candidate), error));
      }
    }
    if (!generatedCode) {
      throw new Error(generationFailures.join(" ") || "No configured provider could generate the project.");
    }
    let code = generatedCode;

    const validationError = validateGeneratedCode(code) || (!existingCode ? validatePlannedFiles(code, plan.implementationPlan) : null);
    if (validationError) {
      code = await repairCode(providers, provider, code, `Generated project validation failed: ${validationError}`, !existingCode);
      const repairedValidationError = validateGeneratedCode(code, !existingCode) || (!existingCode ? validatePlannedFiles(code, plan.implementationPlan) : null);
      if (repairedValidationError) {
        return jsonResponse({ error: `Generated project failed validation after automatic repair: ${repairedValidationError}` }, 502);
      }
    }
    if (!code) return jsonResponse({ error: "Generator returned empty code" }, 502);

    return jsonResponse({ code, plan, provider: usedProvider, mode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Appigen pipeline error:", msg);
    const code = errorCodeFromMessage(msg);
    return jsonResponse({ error: msg, code }, httpStatusForErrorCode(code));
  }
});
