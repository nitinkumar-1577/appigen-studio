type ChatChoice = {
  finish_reason?: string | null;
  delta?: { content?: unknown };
  message?: { content?: unknown; refusal?: string | null; reasoning_content?: unknown };
};

type ChatResponse = {
  choices?: ChatChoice[];
};

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    let parsed: unknown = JSON.parse(value.replace(/^\uFEFF/, "").trim());
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function findResponseObject(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 4 || !value || typeof value !== "object") return null;
  if (!Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    if ("choices" in object) return object;
    for (const nested of ["data", "response", "result", "body", "output"]) {
      const found = findResponseObject(object[nested], depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const item of value) {
    const found = findResponseObject(item, depth + 1);
    if (found) return found;
  }
  return null;
}

function findJsonObjects(text: string): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const parsed = parseJsonRecord(text.slice(start, index + 1));
        if (parsed) objects.push(parsed);
        start = -1;
      }
    }
  }
  return objects;
}

function looksLikeCode(value: string): boolean {
  const text = value.trim();
  return /^```(?:tsx?|typescript|jsx?|css)?\b/i.test(text)
    || /(?:^|\n)\s*(?:import|export|const|function|interface|type)\s+[\w{]/.test(text)
    || text.includes("// FILE:");
}

function extractEncodedContent(text: string): string | null {
  const match = text.match(/"(?:content|text)"\s*:\s*"((?:\\.|[^"\\])*)"/s);
  if (!match) return null;
  try {
    const content = JSON.parse(`"${match[1]}"`);
    return typeof content === "string" && content.trim() ? content.trim() : null;
  } catch {
    return null;
  }
}

export function parseChatProviderResponse(text: string, contentType = ""): ChatResponse {
  // Some compatible gateways double-encode a completion as a JSON string.
  // Unwrap that string before looking for an OpenAI response envelope or code.
  try {
    const decoded: unknown = JSON.parse(text.replace(/^\uFEFF/, "").trim());
    if (typeof decoded === "string") {
      const nested = parseJsonRecord(decoded);
      if (nested) return (findResponseObject(nested) ?? nested) as ChatResponse;
      if (looksLikeCode(decoded)) return { choices: [{ message: { content: decoded.trim() } }] };
      const encodedContent = extractEncodedContent(decoded);
      if (encodedContent) return { choices: [{ message: { content: encodedContent } }] };
      if (decoded.trim()) return { choices: [{ message: { content: decoded.trim() } }] };
    }
  } catch {
    // Continue with the normal tolerant response parser below.
  }

  const direct = parseJsonRecord(text);
  if (direct) return (findResponseObject(direct) ?? direct) as ChatResponse;

  const objects = findJsonObjects(text);
  if (objects.length === 1) return objects[0] as ChatResponse;

  const isEventStream = /text\/event-stream/i.test(contentType) || /(?:^|\s)data:\s*/m.test(text);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const streamValues = isEventStream
    ? [...text.matchAll(/data:\s*(.*?)(?=data:|$)/gs)].map((match) => match[1].trim())
    : [];
  const streamObjects = isEventStream && streamValues.length === 0 ? objects : [];
  const isJsonLines = !isEventStream && lines.length > 1 && lines.every((line) => parseJsonRecord(line) !== null);
  if (!isEventStream && !isJsonLines) {
    if (looksLikeCode(text)) return { choices: [{ message: { content: text.trim() } }] };
    const encodedContent = extractEncodedContent(text);
    if (encodedContent) return { choices: [{ message: { content: encodedContent } }] };
    throw new Error("response was not valid JSON");
  }

  const choices: ChatChoice[] = [];
  let content = "";
  let reasoning = "";
  let refusal: string | null = null;
  let finishReason: string | null | undefined;
  let sawChunk = false;

  for (const line of (isEventStream ? (streamValues.length ? streamValues : streamObjects) : lines)) {
    const chunk = typeof line === "string" ? parseJsonRecord(line) : line;
    const value = typeof line === "string" ? line : undefined;
    if (!chunk && (!value || value === "[DONE]")) continue;
    if (!chunk && value) continue;
    if (!chunk) continue;
    sawChunk = true;
    const choice = Array.isArray(chunk.choices) ? chunk.choices[0] as ChatChoice | undefined : undefined;
    if (!choice) continue;
    const delta = choice.delta;
    content += textValue(delta?.content);
    const message = choice.message;
    if (message) {
      content += textValue(message.content);
      reasoning += textValue(message.reasoning_content);
      refusal ??= typeof message.refusal === "string" ? message.refusal : null;
    }
    if (choice.finish_reason !== undefined) finishReason = choice.finish_reason;
  }

  if (!sawChunk) throw new Error("response stream contained no valid JSON chunks");
  choices.push({
    finish_reason: finishReason,
    message: { content, reasoning_content: reasoning, refusal },
  });
  return { choices };
}
