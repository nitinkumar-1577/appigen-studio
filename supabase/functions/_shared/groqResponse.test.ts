import { describe, expect, it } from "vitest";
import { extractChatCompletionCode, extractGroqCode } from "./groqResponse";

describe("Groq code response parsing", () => {
  for (const model of ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]) {
    it(`extracts plain text source from ${model}`, () => {
      expect(extractGroqCode({
        choices: [{ message: { content: "  export default function App() {}  " } }],
      }, model)).toBe("export default function App() {}");
    });
  }

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

  it("rejects other incomplete completion reasons", () => {
    expect(() => extractGroqCode({
      choices: [{ finish_reason: "max_tokens", message: { content: "partial source" } }],
    }, "openai/gpt-oss-120b")).toThrow("complete code");
  });

  it("rejects empty and missing completions instead of treating them as code", () => {
    expect(() => extractGroqCode({ choices: [{ message: { content: "" } }] }, "openai/gpt-oss-20b"))
      .toThrow("returned no assistant text");
    expect(() => extractGroqCode({ choices: [] }, "openai/gpt-oss-20b"))
      .toThrow("returned no completion choices");
  });

  it("does not mistake reasoning-only output for generated code", () => {
    expect(() => extractGroqCode({
      choices: [{ message: { reasoning: "I should generate code" } }],
    }, "openai/gpt-oss-20b")).toThrow("reasoning without assistant content");
  });

  it("uses the selected provider in completion errors", () => {
    expect(() => extractChatCompletionCode({ choices: [] }, "DeepSeek", "deepseek-chat"))
      .toThrow("DeepSeek model deepseek-chat returned no completion choices");
  });
});
