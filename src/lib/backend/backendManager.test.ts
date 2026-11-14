import { describe, expect, it } from "vitest";
import { defaultBackendMode, getBackendContext, healthCheckBackend, provisionBackend, validateModeSwitch } from "./backendManager";
import { assertNoPrivateSecretsInSource, isSensitiveKey, redactSecret, sanitizeEnvForExport } from "./secrets";

describe("backendManager (Phase 6 unified abstraction)", () => {
  it("defaults to shared backend mode", () => {
    expect(defaultBackendMode()).toBe("shared");
  });

  it("routes shared provisioning to ready/configured shared context", async () => {
    const result = await provisionBackend({ generatedAppId: "app-1", ownerId: "u1", mode: "shared" });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("ready");
    expect(getBackendContext({ generatedAppId: "app-1", mode: "shared" }).mode).toBe("shared");
  });

  it("does not fake dedicated provisioning without provider prerequisites", async () => {
    const result = await provisionBackend({ generatedAppId: "app-2", ownerId: "u1", mode: "dedicated", projectName: "demo" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("external_prerequisites_required");
    expect(result.prerequisites?.length).toBeGreaterThan(0);
    expect(result.message).toMatch(/cannot be confirmed/i);
  });

  it("requires explicit confirmation and checks for mode switch with data", () => {
    const blocked = validateModeSwitch("shared", "dedicated", { hasData: true, confirmed: false });
    expect(blocked.ok).toBe(false);
    expect(blocked.status).toBe("confirmation_required");
    const allowed = validateModeSwitch("shared", "dedicated", { hasData: true, confirmed: true });
    expect(allowed.ok).toBe(true);
  });

  it("reports dedicated health as not configured/unverified without confirmed connectivity", async () => {
    const notConfigured = await healthCheckBackend({ generatedAppId: "app-3", ownerId: "u1", mode: "dedicated", provisioningStatus: "not_configured", config: {} });
    expect(notConfigured.ok).toBe(false);
    expect(notConfigured.status).toBe("not_configured");
  });

  it("protects secrets: detection, redaction, export sanitization, and source scanning", () => {
    expect(isSensitiveKey("SUPABASE_SERVICE_ROLE_KEY")).toBe(true);
    expect(redactSecret("secret-value-1234")).toContain("••••••");
    const sanitized = sanitizeEnvForExport([
      { key: "VITE_PUBLIC_URL", isSecret: false, target: "runtime", publicValue: "https://example.com" },
      { key: "API_TOKEN", isSecret: true, target: "runtime", secretRef: "ref1" },
    ]);
    expect(sanitized.publicVars.map((v) => v.key)).toEqual(["VITE_PUBLIC_URL"]);
    expect(sanitized.blockedSecrets).toContain("API_TOKEN");
    expect(assertNoPrivateSecretsInSource('const k="sk_live_1234567890abcdef";')).toContain("private API key literal");
    expect(assertNoPrivateSecretsInSource('const ok="public";')).toEqual([]);
  });
});
