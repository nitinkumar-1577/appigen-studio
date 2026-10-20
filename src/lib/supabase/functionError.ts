export async function getFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === "object" && "context" in error && error.context instanceof Response) {
    try {
      const body: unknown = await error.context.clone().json();
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
        return body.error;
      }
    } catch {
      // Fall back to the SDK message when the response body is not JSON.
    }
  }

  if (error && typeof error === "object" && "name" in error && error.name === "FunctionsFetchError") {
    const cause =
      "context" in error && error.context instanceof Error && error.context.message
        ? ` (${error.context.message})`
        : "";
    return `Could not reach the AppiGen Edge Function. Check your connection and confirm the Appigen function is deployed to the configured Supabase project${cause}.`;
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
