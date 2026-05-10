import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const SYSTEM_PROMPT = `You are an expert frontend engineer. Generate a SINGLE self-contained React component that fulfills the user's request.

STRICT RULES:
- Output ONLY raw JSX/JS code. NO markdown fences, NO explanations, NO imports, NO exports.
- React and ReactDOM are already loaded as globals. Tailwind CSS (CDN) is available.
- Define a function component named \`App\`. Wrap risky logic in try/catch and add an inline ErrorBoundary class to prevent blank screens.
- End with EXACTLY this line: ReactDOM.createRoot(document.getElementById("root")).render(<ErrorBoundary><App /></ErrorBoundary>);
- Use React.useState / React.useEffect (no destructured imports, no external libs like lucide-react — use inline SVG or unicode glyphs).
- ASCII only. NEVER use non-English variable names or comments. Always close every bracket and parenthesis.
- Make it visually polished: dark theme by default (bg-slate-950 text-slate-100), generous spacing, rounded-xl, subtle borders, indigo accents.
- Make it interactive and functional, not just static markup.
- Include this ErrorBoundary near the top:
  class ErrorBoundary extends React.Component { constructor(p){super(p); this.state={e:null}} static getDerivedStateFromError(e){return {e}} render(){return this.state.e ? React.createElement('div',{className:'p-6 text-red-400 font-mono text-sm'}, 'Runtime error: '+String(this.state.e?.message||this.state.e)) : this.props.children} }`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { prompt, system, stage } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Missing prompt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const STAGE_GUIDANCE: Record<string, string> = {
      "Sketch": "Stage=SKETCH: produce a minimal, low-fidelity but working layout. Keep code short (<150 lines). Focus on structure and core interaction only.",
      "Wire up State": "Stage=WIRE-UP: implement full state, handlers, and core logic. Medium density (150-300 lines). Working features over polish.",
      "Polish UI": "Stage=POLISH: ship a refined, production-grade UI. Rich micro-interactions, animations, accessibility, full feature set (300-600 lines). Make it stunning.",
    };
    const stageHint = stage && STAGE_GUIDANCE[stage] ? STAGE_GUIDANCE[stage] : STAGE_GUIDANCE["Wire up State"];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 8192,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: stageHint },
          ...(system ? [{ role: "system", content: `Additional guidance: ${system}` }] : []),
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("AI gateway error:", resp.status, errText);
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Workspace Settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawText = await resp.text();
    if (!rawText) {
      console.error("Empty body from AI gateway");
      return new Response(JSON.stringify({ error: "Empty response from AI. Please try again." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error("Failed to parse AI response:", rawText.slice(0, 500));
      return new Response(JSON.stringify({ error: "Malformed AI response" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const finishReason = data?.choices?.[0]?.finish_reason;
    let code: string = data?.choices?.[0]?.message?.content ?? "";
    console.log("finish_reason:", finishReason, "content length:", code.length);

    if (!code.trim()) {
      return new Response(JSON.stringify({ error: "AI returned empty content. Try a shorter prompt." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Strip accidental markdown fences
    code = code.replace(/^\s*```(?:jsx?|tsx?|javascript|react)?\s*/i, "").replace(/```\s*$/i, "").trim();

    return new Response(JSON.stringify({ code }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-app error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
