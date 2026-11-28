import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activityDurationMs,
  activityStatusLabel,
  createBuildActivityEvent,
  finalizeActivity,
  formatActivityDuration,
  summarizeActivityFiles,
  updateBuildActivityEvent,
  type BuildActivity,
} from "./conversationActivity";

describe("conversation activity helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates events with generated IDs and default timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-28T10:00:00.000Z"));

    const event = createBuildActivityEvent({
      kind: "planning",
      status: "running",
      title: "Planning build",
    });

    expect(event.id).toMatch(/^activity-/);
    expect(event.startedAt).toBe(Date.now());
    expect(event.status).toBe("running");
  });

  it("preserves an explicitly supplied event timestamp", () => {
    const event = createBuildActivityEvent({
      kind: "file",
      status: "pending",
      title: "Create file",
      startedAt: 1234,
    });

    expect(event.startedAt).toBe(1234);
  });

  it("sets an end timestamp when an event reaches a final status", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-28T10:00:05.000Z"));

    const event = createBuildActivityEvent({
      kind: "file",
      status: "running",
      title: "Create file",
      startedAt: 1000,
    });

    const updated = updateBuildActivityEvent(event, {
      status: "success",
    });

    expect(updated.status).toBe("success");
    expect(updated.endedAt).toBe(Date.now());
    expect(event.status).toBe("running");
  });

  it("does not finalize pending or running events automatically", () => {
    const event = createBuildActivityEvent({
      kind: "file",
      status: "pending",
      title: "Waiting file",
      startedAt: 1000,
    });

    expect(updateBuildActivityEvent(event, { status: "running" }).endedAt)
      .toBeUndefined();
  });

  it("calculates activity duration without returning negative values", () => {
    const activity = {
      startedAt: 1000,
      files: [],
      timeline: [],
      validation: [],
      errors: [],
      id: "activity-test",
      status: "running",
      title: "Build",
      stage: "Planning",
    } satisfies BuildActivity;

    expect(activityDurationMs(activity, 4500)).toBe(3500);
    expect(activityDurationMs({ ...activity, endedAt: 500 }, 4500)).toBe(0);
  });

  it("formats durations in seconds and minutes", () => {
    expect(formatActivityDuration(0)).toBe("1s");
    expect(formatActivityDuration(1200)).toBe("1s");
    expect(formatActivityDuration(59000)).toBe("59s");
    expect(formatActivityDuration(60000)).toBe("1m");
    expect(formatActivityDuration(65000)).toBe("1m 5s");
  });

  it("maps every activity status to its display label", () => {
    expect(activityStatusLabel("running")).toBe("In progress");
    expect(activityStatusLabel("success")).toBe("Completed");
    expect(activityStatusLabel("error")).toBe("Failed");
    expect(activityStatusLabel("stopped")).toBe("Stopped");
  });

  it("summarizes completed, failed, pending, and total files", () => {
    const activity = {
      id: "activity-test",
      status: "running",
      title: "Build",
      stage: "Generating",
      startedAt: 1000,
      timeline: [],
      validation: [],
      errors: [],
      files: [
        { path: "src/App.tsx", purpose: "App", status: "completed" },
        { path: "src/main.tsx", purpose: "Entry", status: "completed" },
        { path: "src/styles.css", purpose: "Styles", status: "failed" },
        { path: "src/utils.ts", purpose: "Utils", status: "queued" },
      ],
    } satisfies BuildActivity;

    expect(summarizeActivityFiles(activity)).toEqual({
      completed: 2,
      failed: 1,
      pending: 1,
      total: 4,
    });
  });

  it("finalizes an activity without mutating the original", () => {
    const activity = {
      id: "activity-test",
      status: "running",
      title: "Build",
      stage: "Generating",
      files: [],
      timeline: [],
      startedAt: 1000,
      validation: [],
      errors: [],
    } satisfies BuildActivity;

    const finalized = finalizeActivity(activity, {
      status: "success",
      stage: "Completed",
      endedAt: 2000,
    });

    expect(finalized.status).toBe("success");
    expect(finalized.endedAt).toBe(2000);
    expect(activity.status).toBe("running");
    expect(activity.endedAt).toBeUndefined();
  });
});
