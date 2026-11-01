import { describe, expect, it } from "vitest";
import { parseChatProviderResponse } from "./providerResponse";

describe("chat provider response parsing", () => {
  it("parses a normal JSON response", () => {
    expect(parseChatProviderResponse('{"choices":[{"message":{"content":"OK"}}]}').choices?.[0]?.message?.content).toBe("OK");
  });

  it("parses SSE JSON chunks into one completion", () => {
    const response = parseChatProviderResponse(
      'data: {"choices":[{"delta":{"content":"export default "}}]}\n'
      + 'data: {"choices":[{"delta":{"content":"function App() {}"},"finish_reason":"stop"}]}\n'
      + "data: [DONE]\n",
      "text/event-stream",
    );
    expect(response.choices?.[0]?.message?.content).toBe("export default function App() {}");
    expect(response.choices?.[0]?.finish_reason).toBe("stop");
  });

  it("parses newline-delimited JSON chunks", () => {
    const response = parseChatProviderResponse(
      '{"choices":[{"delta":{"content":"hello "}}]}\n{"choices":[{"delta":{"content":"world"}}]}',
      "application/json",
    );
    expect(response.choices?.[0]?.message?.content).toBe("hello world");
  });

  it("extracts a JSON response surrounded by transport text", () => {
    const response = parseChatProviderResponse(
      "upstream response:\n{\"choices\":[{\"message\":{\"content\":\"OK\"}}]}\nend",
      "text/plain",
    );
    expect(response.choices?.[0]?.message?.content).toBe("OK");
  });

  it("parses concatenated SSE chunks without line breaks", () => {
    const response = parseChatProviderResponse(
      'data: {"choices":[{"delta":{"content":"hello "}}]}data: {"choices":[{"delta":{"content":"world"},"finish_reason":"stop"}]}data: [DONE]',
      "application/json",
    );
    expect(response.choices?.[0]?.message?.content).toBe("hello world");
    expect(response.choices?.[0]?.finish_reason).toBe("stop");
  });

  it("unwraps a JSON-encoded provider response", () => {
    const response = parseChatProviderResponse(
      JSON.stringify('{"choices":[{"message":{"content":"OK"}}]}'),
    );
    expect(response.choices?.[0]?.message?.content).toBe("OK");
  });

  it("accepts a code-only provider response", () => {
    expect(parseChatProviderResponse("export default function App() { return null; }")
      .choices?.[0]?.message?.content).toContain("function App");
  });

  it("finds a chat response nested in a transport envelope", () => {
    const response = parseChatProviderResponse(
      '{"data":{"result":[{"choices":[{"message":{"content":"OK"}}]}]}}',
    );
    expect(response.choices?.[0]?.message?.content).toBe("OK");
  });

  it("preserves valid JSON without choices for downstream validation", () => {
    expect(parseChatProviderResponse('{"status":"ok"}')).toEqual({ status: "ok" });
  });

  it("extracts content from a malformed JSON wrapper", () => {
    const response = parseChatProviderResponse('prefix {"choices":[{"message":{"content":"export default App"}}');
    expect(response.choices?.[0]?.message?.content).toBe("export default App");
  });

  it("rejects malformed non-stream responses", () => {
    expect(() => parseChatProviderResponse("<html>error</html>", "text/html"))
      .toThrow("response was not valid JSON");
  });
});
