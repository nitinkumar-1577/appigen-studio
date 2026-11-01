type GroqResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: unknown;
      refusal?: string | null;
      reasoning_content?: unknown;
      reasoning?: unknown;
    };
  }>;
};

function getText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("")
    .trim();
}

export function extractChatCompletionCode(response: unknown, provider: string, model: string): string {
  const result = response as GroqResponse;
  const choice = result?.choices?.[0];
  if (choice?.finish_reason === "length" || choice?.finish_reason === "max_tokens") {
    throw new Error(`${provider} model ${model} reached its completion-token limit before returning complete code.`);
  }

  const code = getText(choice?.message?.content);
  if (code) return code;

  const reasoning = getText(choice?.message?.reasoning_content ?? choice?.message?.reasoning);
  if (reasoning && !choice?.message?.content) {
    throw new Error(`${provider} model ${model} returned reasoning without assistant content.`);
  }

  if (choice?.message?.refusal) {
    throw new Error(`${provider} model ${model} refused the code-generation request.`);
  }
  if (!choice) {
    throw new Error(`${provider} model ${model} returned no completion choices.`);
  }
  throw new Error(`${provider} model ${model} returned no assistant text.`);
}

export function extractGroqCode(response: unknown, model: string): string {
  return extractChatCompletionCode(response, "Groq", model);
}
