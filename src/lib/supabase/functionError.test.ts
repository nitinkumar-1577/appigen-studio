import { describe, expect, it } from "vitest";
import { getFunctionErrorMessage } from "./functionError";

describe("Edge Function error messages", () => {
  it("returns the server's actionable error body", async () => {
    const error = {
      message: "Edge Function returned a non-2xx status code",
      context: new Response(JSON.stringify({ error: "Groq rejected its configured credentials (HTTP 401)." }), { status: 500 }),
    };

    await expect(getFunctionErrorMessage(error, "Build failed")).resolves.toBe(
      "Groq rejected its configured credentials (HTTP 401).",
    );
  });

  it("falls back to the SDK error when no JSON error body is available", async () => {
    const error = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: new Response("not json", { status: 500 }),
    });

    await expect(getFunctionErrorMessage(error, "Build failed")).resolves.toBe(
      "Edge Function returned a non-2xx status code",
    );
  });

  it("explains how to recover from an Edge Function transport failure", async () => {
    const error = Object.assign(new Error("Failed to send a request to the Edge Function"), {
      name: "FunctionsFetchError",
      context: new TypeError("Failed to fetch"),
    });

    await expect(getFunctionErrorMessage(error, "Build failed")).resolves.toBe(
      "Could not reach the AppiGen Edge Function. Check your connection and confirm the Appigen function is deployed to the configured Supabase project (Failed to fetch).",
    );
  });
});
