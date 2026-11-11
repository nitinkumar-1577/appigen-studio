import { describe, expect, it, vi } from "vitest";

const single = vi.hoisted(() => vi.fn(async () => ({ data: null, error: null })));
const maybeSingle = vi.hoisted(() => vi.fn(async () => ({ data: null, error: null })));
const order = vi.hoisted(() => vi.fn(async () => ({ data: [], error: null })));
function makeChain(): Record<string, (...args: unknown[]) => unknown> {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  chain.eq = vi.fn(() => chain);
  chain.order = order;
  chain.single = single;
  chain.maybeSingle = maybeSingle;
  chain.select = vi.fn(() => chain);
  return chain;
}
const select = vi.hoisted(() => vi.fn(() => makeChain()));
const insert = vi.hoisted(() => vi.fn(() => ({ select: vi.fn(() => ({ single })) })));
const update = vi.hoisted(() => vi.fn(() => makeChain()));
const del = vi.hoisted(() => vi.fn(() => makeChain()));
const upsert = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const from = vi.hoisted(() => vi.fn(() => ({ select, insert, upsert, update, delete: del })));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));

import { sharedCreateRecord, sharedDeleteRecord, sharedListRecords, sharedUpdateRecord, upsertBackendConfig } from "./generatedAppRepository";

describe("generatedAppRepository shared-backend tenant-isolated CRUD helpers", () => {
  it("calls generated_app_data with app+owner scoped payloads (RLS-enforced at DB)", async () => {
    single.mockResolvedValueOnce({ data: { id: "r1", collection: "todos", record: { t: 1 }, created_at: "", updated_at: "" }, error: null });
    const created = await sharedCreateRecord("appA", "user1", "todos", { t: 1 });
    expect(from).toHaveBeenCalledWith("generated_app_data");
    expect(created).toEqual({ id: "r1", collection: "todos", record: { t: 1 }, created_at: "", updated_at: "" });

    single.mockResolvedValueOnce({ data: { id: "r1", collection: "todos", record: { t: 2 }, created_at: "", updated_at: "" }, error: null });
    await sharedUpdateRecord("r1", "appA", "user1", { t: 2 });
    await sharedDeleteRecord("r1", "appA", "user1");
    await sharedListRecords("appA", "user1", "todos");
  });

  it("upserts backend config metadata (no secrets)", async () => {
    await upsertBackendConfig({ generatedAppId: "appA", ownerId: "user1", mode: "shared", provisioningStatus: "ready", config: { note: "ok" } });
    expect(from).toHaveBeenCalledWith("generated_app_backend_configs");
  });
});
