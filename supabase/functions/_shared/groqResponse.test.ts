import { assert, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractGroqCode } from "./groqResponse.ts";

Deno.test("extractGroqCode extracts plain text source from a chat completion", () => {
  const code = extractGroqCode(
    { choices: [{ message: { content: "  export default function App() {}  " } }] },
    "openai/gpt-oss-20b",
  );
  assert(code === "export default function App() {}", code);
});

Deno.test("extractGroqCode joins text content parts", () => {
  const code = extractGroqCode(
    {
      choices: [{
        message: {
          content: [{ type: "text", text: "export default " }, { type: "text", text: "function App() {}" }],
        },
      }],
    },
    "openai/gpt-oss-20b",
  );
  assert(code === "export default function App() {}", code);
});

Deno.test("extractGroqCode reports token-limit truncation distinctly", () => {
  assertThrows(
    () =>
      extractGroqCode(
        { choices: [{ finish_reason: "length", message: { content: "partial source" } }] },
        "openai/gpt-oss-20b",
      ),
    Error,
    "complete code",
  );
});

Deno.test("extractGroqCode rejects empty and missing completions", () => {
  assertThrows(
    () => extractGroqCode({ choices: [{ message: { content: "" } }] }, "openai/gpt-oss-20b"),
    Error,
    "returned no assistant text",
  );
  assertThrows(() => extractGroqCode({ choices: [] }, "openai/gpt-oss-20b"), Error, "returned no completion choices");
});
