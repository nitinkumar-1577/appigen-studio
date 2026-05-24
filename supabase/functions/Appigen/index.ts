const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SYSTEM_PROMPT = `
You are an elite senior frontend engineer and AI app builder better than Lovable.dev.

Your job is to generate production-grade applications with stunning UI/UX and fully working functionality.

STRICT REQUIREMENTS:
- Return ONLY valid JSX/JavaScript
- No markdown
- No explanations
- No imports
- Use React.useState and React.useEffect only
- Tailwind CSS already available
- Everything must work in ONE single file
- Component name must be App

DESIGN RULES:
- Use modern dark UI
- Use gradients
- Use glassmorphism
- Use premium spacing
- Use modern typography
- Use hover animations
- Use smooth transitions
- Use rounded corners
- Use shadows and glow effects
- Make apps visually stunning
- Mobile responsive
- Desktop responsive
- Professional SaaS quality

FUNCTIONAL RULES:
- All buttons must work
- All inputs must work
- Prevent crashes
- Prevent blank screens
- Add fallback states
- Add loading states
- Add animations
- Add polished interactions
- Use realistic layouts
- Create complete apps not demos

GAME RULES:
- Generate real playable games
- Proper boards
- Proper movement systems
- Collision detection
- Score systems
- Game over states
- Win conditions
- Smooth animations

MOST IMPORTANT:
The generated app must feel like a real polished commercial product.

End with:
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
`
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();

    const prompt = body.prompt || "";

    if (!prompt) {
      return new Response(
        JSON.stringify({
          error: "Prompt missing",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY not configured");
    }

    const finalPrompt = `
${SYSTEM_PROMPT}

User Request:
${prompt}
`;

    console.log("Starting Groq request...");

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
   model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: finalPrompt,
            },
          ],
          temperature: 0.7,
          max_tokens:8192,
        }),
      }
    );

    console.log("Groq status:", response.status);

    const rawText = await response.text();

    console.log("RAW RESPONSE:", rawText);

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: rawText,
        }),
        {
          status: response.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const data = JSON.parse(rawText);

    let code =
      data?.choices?.[0]?.message?.content || "";

    code = code
      .replace(/^```(?:jsx|javascript)?/i, "")
      .replace(/```$/i, "")
      .trim();

    if (!code) {
      throw new Error("No code returned from Groq");
    }
    if (!code.includes("function App")) {
      throw new Error("Invalid React component generated");
    }
    return new Response(
      JSON.stringify({
        code,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});