const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SYSTEM_PROMPT = `
You are a world-class AI app builder like Lovable, V0, and Google Studio.

Your job is to generate COMPLETE production-ready React + Vite apps.

IMPORTANT RULES:

- Generate MULTIPLE FILES
- Return VALID JSON only
- Do NOT return markdown
- Do NOT use \`\`\`

Project must contain:

src/
  components/
  pages/
  hooks/
  lib/
  utils/
  styles/

Files required:
- src/App.jsx
- src/main.jsx
- src/components/
- src/pages/
- src/hooks/
- src/lib/
- src/utils/
- package.json
- index.html

UI REQUIREMENTS:
- Modern UI like Lovable
- Beautiful gradients
- Rounded cards
- Responsive layout
- Smooth animations
- Proper spacing
- Professional typography
- Sidebar if needed
- Navbar if needed
- Dark mode design
- Tailwind CSS
- Mobile responsive

GAME REQUIREMENTS:
- Real playable game
- Proper board rendering
- Game logic complete
- Animations
- Sound support if needed
- Score system
- Restart button
- Game over screen

RETURN FORMAT:

{
  "files": {
    "src/App.jsx": "...code...",
    "src/main.jsx": "...code...",
    "src/components/GameBoard.jsx": "...code...",
    "src/components/Dice.jsx": "...code...",
    "src/pages/Home.jsx": "...code...",
    "package.json": "...code..."
  }
}

Return ONLY valid JSON.
;

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