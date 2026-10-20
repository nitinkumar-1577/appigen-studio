import { describe, expect, it } from "vitest";
import { extractGroqCode } from "./groqResponse";

describe("Groq code response parsing", () => {
  it("extracts plain text source from a chat completion", () => {
    expect(extractGroqCode({
      choices: [{ message: { content: "  export default function App() {}  " } }],
    }, "openai/gpt-oss-20b")).toBe("export default function App() {}");
  });

  it("joins text content parts", () => {
    expect(extractGroqCode({
      choices: [{ message: { content: [{ type: "text", text: "export default " }, { type: "text", text: "function App() {}" }] } }],
    }, "openai/gpt-oss-20b")).toBe("export default function App() {}");
  });

  it("reports token-limit truncation distinctly", () => {
    expect(() => extractGroqCode({
      choices: [{ finish_reason: "length", message: { content: "partial source" } }],
    }, "openai/gpt-oss-20b")).toThrow("complete code");
  });

  it("rejects empty and missing completions instead of treating them as code", () => {
    expect(() => extractGroqCode({ choices: [{ message: { content: "" } }] }, "openai/gpt-oss-20b"))
      .toThrow("returned no assistant text");
    expect(() => extractGroqCode({ choices: [] }, "openai/gpt-oss-20b"))
      .toThrow("returned no completion choices");
  });
});
