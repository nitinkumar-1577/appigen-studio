
export type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
  score: number | null;
  publishedDate: string | null;
};

export type TavilySearchResponse = {
  query: string;
  results: TavilySearchResult[];
  credits: number | null;
};

export class TavilySearchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "TavilySearchError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function searchTavily(
  query: string,
  apiKey: string,
  requestSignal?: AbortSignal,
): Promise<TavilySearchResponse> {
  const cleanQuery = query.trim();

  if (!cleanQuery || cleanQuery.length > 500) {
    throw new TavilySearchError("Search query must be between 1 and 500 characters.");
  }

  if (!apiKey.trim()) {
    throw new TavilySearchError("Tavily API key is not configured.", 503);
  }

  const controller = new AbortController();
  const abortFromRequest = () => controller.abort();

  if (requestSignal?.aborted) {
    controller.abort();
  } else {
    requestSignal?.addEventListener("abort", abortFromRequest, { once: true });
  }

  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: cleanQuery,
        search_depth: "basic",
        topic: "general",
        max_results: 5,
        chunks_per_source: 2,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_favicon: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 401) {
        throw new TavilySearchError("Tavily rejected the API key.", status);
      }
      if (status === 429 || status === 432) {
        throw new TavilySearchError("Tavily search quota or rate limit reached.", status);
      }
      throw new TavilySearchError(
        `Tavily search request failed with status ${status}.`,
        status,
      );
    }

    const payload: unknown = await response.json();

    if (!isRecord(payload) || !Array.isArray(payload.results)) {
      throw new TavilySearchError("Tavily returned an invalid search response.");
    }

    const results = payload.results
      .filter(isRecord)
      .map((item): TavilySearchResult | null => {
        const title = typeof item.title === "string" ? item.title.trim() : "";
        const url = typeof item.url === "string" ? item.url.trim() : "";
        const content = typeof item.content === "string" ? item.content.trim() : "";

        try {
          const parsedUrl = new URL(url);
          if (!["http:", "https:"].includes(parsedUrl.protocol)) return null;
        } catch {
          return null;
        }

        if (!title || !content) return null;

        return {
          title: title.slice(0, 300),
          url,
          content: content.slice(0, 1800),
          score: typeof item.score === "number" ? item.score : null,
          publishedDate: typeof item.published_date === "string"
            ? item.published_date
            : null,
        };
      })
      .filter((item): item is TavilySearchResult => item !== null)
      .slice(0, 5);

    return {
      query: cleanQuery,
      results,
      credits: isRecord(payload.usage) && typeof payload.usage.credits === "number"
        ? payload.usage.credits
        : null,
    };
  } catch (error) {
    if (error instanceof TavilySearchError) throw error;

    if (controller.signal.aborted) {
      throw new TavilySearchError(
        requestSignal?.aborted
          ? "Search was cancelled."
          : "Tavily search timed out.",
        504,
      );
    }
export function shouldSearchWeb(prompt: string): boolean {
  const text = prompt.trim().toLowerCase();

  if (!text) return false;

  return /\b(search the web|search online|search internet|web search|google search|look up online|find online|latest|current|today|breaking news|recent news|news today)\b/i.test(text)
    || /\b(internet par search|web par search|online search|latest news|aaj ki news|taaza khabar|abhi ki jankari)\b/i.test(text);
}
    throw new TavilySearchError("Could not connect to Tavily.");
  } finally {
    clearTimeout(timeout);
    requestSignal?.removeEventListener("abort", abortFromRequest);
  }
}
