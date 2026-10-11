export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

export type LocalProjectDraft = {
  projectId: string | null;
  title: string;
  prompt: string;
  code: string | null;
  messages: ChatMessage[];
  versions: LocalProjectVersion[];
  updatedAt: number;
};

export type LocalProjectVersion = {
  id: string;
  code: string;
  prompt: string;
  createdAt: number;
};

const DRAFT_KEY = "appigen.project-draft.v1";
const VERSION_KEY = "appigen.project-versions.v1";

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function readProjectDraft(): LocalProjectDraft | null {
  return readJson<LocalProjectDraft | null>(DRAFT_KEY, null);
}

export function writeProjectDraft(draft: LocalProjectDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Draft persistence is best-effort when browser storage is unavailable.
  }
}

export function discardProjectDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore unavailable browser storage.
  }
}

export function readLocalVersions(): Record<string, LocalProjectVersion[]> {
  return readJson<Record<string, LocalProjectVersion[]>>(VERSION_KEY, {});
}

export function writeLocalVersion(projectKey: string, version: LocalProjectVersion) {
  try {
    const all = readLocalVersions();
    all[projectKey] = [version, ...(all[projectKey] ?? [])].slice(0, 50);
    localStorage.setItem(VERSION_KEY, JSON.stringify(all));
  } catch {
    // Version history remains available in memory for the current session.
  }
}