import { describe, expect, it } from "vitest";
import { NOTIFICATION_RETENTION_MS, retainRecentNotifications } from "./notifications";
describe("notification retention", () => {
  it("expires notifications older than 24 hours", () => {
    const now = 2_000_000;
    const items = [{ id: "old", createdAt: now - NOTIFICATION_RETENTION_MS - 1 }, { id: "new", createdAt: now - 1 }];
    expect(retainRecentNotifications(items, now).map((item) => item.id)).toEqual(["new"]);
  });
  it("caps storage and ignores invalid timestamps", () => {
    const now = 2_000_000;
    const items = Array.from({ length: 40 }, (_, i) => ({ id: String(i), createdAt: now - i }));
    items.push({ id: "invalid", createdAt: Number.NaN });
    expect(retainRecentNotifications(items, now)).toHaveLength(30);
  });
});
