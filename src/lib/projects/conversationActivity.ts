import type { BuildFileProgress } from "./buildWorkflow";

export type BuildActivityStatus = "running" | "success" | "error" | "stopped";

export interface BuildActivity {
  id: string;
  status: BuildActivityStatus;
  title: string;
  stage: string;
  files: BuildFileProgress[];
  timeline: string[];
  startedAt: number;
  endedAt?: number;
  versionId?: string;
  provider?: string;
  validation: string[];
  errors: string[];
}

let activityCounter = 0;

export function createActivityId(): string {
  activityCounter += 1;
  return `activity-${Date.now()}-${activityCounter}`;
}

export function activityDurationMs(activity: BuildActivity, now = Date.now()): number {
  return Math.max(0, (activity.endedAt ?? now) - activity.startedAt);
}

export function formatActivityDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function activityStatusLabel(status: BuildActivityStatus): string {
  switch (status) {
    case "running":
      return "In progress";
    case "success":
      return "Completed";
    case "error":
      return "Failed";
    case "stopped":
      return "Stopped";
  }
}

export function summarizeActivityFiles(activity: BuildActivity) {
  const completed = activity.files.filter((file) => file.status === "completed").length;
  const failed = activity.files.filter((file) => file.status === "failed").length;
  return { completed, failed, pending: Math.max(0, activity.files.length - completed - failed), total: activity.files.length };
}

export function finalizeActivity(activity: BuildActivity, patch: Partial<BuildActivity>): BuildActivity {
  return { ...activity, ...patch };
}