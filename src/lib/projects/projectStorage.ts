import type { ProjectMemory } from "./projectMemory";
import type { ChangeRecord } from "./changeTracking";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

export type LocalProjectDraft = {
  projectId: string | null;
  ownerId?: string | null;
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
const CHAT_KEY = "appigen.project-chats.v1";
const MEMORY_KEY = "appigen.project-memory.v1";
const CHANGES_KEY = "appigen.project-changes.v1";

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

export function readLocalVersionsForProject(projectKey: string): LocalProjectVersion[] {
  return readLocalVersions()[projectKey] ?? [];
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

export function deleteLocalVersion(projectKey: string, versionId: string) {
  try {
    const all = readLocalVersions();
    all[projectKey] = (all[projectKey] ?? []).filter((version) => version.id !== versionId);
    localStorage.setItem(VERSION_KEY, JSON.stringify(all));
  } catch {
    // Version history remains available in memory for the current session.
  }
}

export function clearLocalVersions(projectKey: string) {
  try {
    const all = readLocalVersions();
    delete all[projectKey];
    localStorage.setItem(VERSION_KEY, JSON.stringify(all));
  } catch {
    // Version history can remain available in memory for the current session.
  }
}

export function readProjectMessages(projectKey: string): ChatMessage[] {
  const all = readJson<Record<string, ChatMessage[]>>(CHAT_KEY, {});
  return all[projectKey] ?? [];
}

export function writeProjectMessages(projectKey: string, messages: ChatMessage[]) {
  try {
    const all = readJson<Record<string, ChatMessage[]>>(CHAT_KEY, {});
    all[projectKey] = messages;
    localStorage.setItem(CHAT_KEY, JSON.stringify(all));
  } catch {
    // Chat history remains available in memory for the current session.
  }
}

export function readProjectMemory(projectKey: string): ProjectMemory | null {
  const all = readJson<Record<string, ProjectMemory>>(MEMORY_KEY, {});
  const memory = all[projectKey];
  return memory && memory.projectKey === projectKey ? memory : null;
}

export function writeProjectMemory(projectKey: string, memory: ProjectMemory) {
  try {
    const all = readJson<Record<string, ProjectMemory>>(MEMORY_KEY, {});
    all[projectKey] = { ...memory, projectKey, updatedAt: Date.now() };
    localStorage.setItem(MEMORY_KEY, JSON.stringify(all));
  } catch {
    // Project memory is best-effort and remains available in memory for the current session.
  }
}

export function clearProjectMemory(projectKey: string) {
  try {
    const all = readJson<Record<string, ProjectMemory>>(MEMORY_KEY, {});
    delete all[projectKey];
    localStorage.setItem(MEMORY_KEY, JSON.stringify(all));
  } catch {
    // Ignore unavailable browser storage.
  }
}

export function readProjectChangeRecords(projectKey: string): ChangeRecord[] {
  const all = readJson<Record<string, ChangeRecord[]>>(CHANGES_KEY, {});
  return Array.isArray(all[projectKey]) ? all[projectKey] : [];
}

export function writeProjectChangeRecord(projectKey: string, record: ChangeRecord) {
  try {
    const all = readJson<Record<string, ChangeRecord[]>>(CHANGES_KEY, {});
    all[projectKey] = [record, ...(all[projectKey] ?? [])].slice(0, 50);
    localStorage.setItem(CHANGES_KEY, JSON.stringify(all));
  } catch {
    // Change tracking is best-effort and remains available in memory for the current session.
  }
}

export function clearProjectChangeRecords(projectKey: string) {
  try {
    const all = readJson<Record<string, ChangeRecord[]>>(CHANGES_KEY, {});
    delete all[projectKey];
    localStorage.setItem(CHANGES_KEY, JSON.stringify(all));
  } catch {
    // Ignore unavailable browser storage.
  }
}