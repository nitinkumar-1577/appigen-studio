import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import type { ActivityEntry } from "@/lib/appPreferences";
import { formatFileMarkers, parseFileMarkers } from "@/lib/preview/parseFileMarkers";
import {
  discardProjectDraft,
  readProjectDraft,
  readLocalVersionsForProject,
  writeProjectDraft,
  type ChatMessage,
  type LocalProjectVersion,
} from "./projectStorage";

export interface StoredProject {
  id: string;
  user_id: string;
  title: string;
  prompt: string;
  code: string;
  files: Record<string, string>;
  messages: ChatMessage[];
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ProjectSummary = Pick<
  StoredProject,
  "id" | "user_id" | "title" | "prompt" | "code" | "thumbnail" | "created_at" | "updated_at" | "deleted_at"
>;

const toJson = (value: unknown): Json => value as Json;

export const extractProjectFiles = (code: string): Record<string, string> => {
  const parsed = parseFileMarkers(code);
  return parsed?.files ?? { "src/App.tsx": code };
};

export const loadProject = async (projectId: string, userId: string): Promise<StoredProject> => {
  const { data, error } = await supabase
    .from("projects")
    .select("id, user_id, title, prompt, code, files, messages, thumbnail, created_at, updated_at, deleted_at")
    .eq("id", projectId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  const fileMap = typeof data.files === "object" && data.files !== null && !Array.isArray(data.files)
    ? Object.fromEntries(Object.entries(data.files).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  const parsedCode = parseFileMarkers(data.code);
  const files = Object.keys(fileMap).length ? fileMap : parsedCode?.files ?? extractProjectFiles(data.code);
  return {
    ...data,
    code: Object.keys(fileMap).length && !parsedCode ? formatFileMarkers(fileMap) : data.code,
    files,
    messages: Array.isArray(data.messages)
      ? data.messages.filter((entry): entry is ChatMessage =>
        typeof entry === "object" && entry !== null && !Array.isArray(entry) &&
        (entry.role === "user" || entry.role === "assistant") &&
        typeof entry.content === "string" && typeof entry.timestamp === "number")
      : [],
  };
};

export const loadMostRecentProject = async (userId: string): Promise<StoredProject | null> => {
  const { data, error } = await supabase
    .from("projects")
    .select("id, user_id, title, prompt, code, files, messages, thumbnail, created_at, updated_at, deleted_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return loadProject(data.id, userId);
};

export const loadProjects = async (userId: string): Promise<ProjectSummary[]> => {
  const { data, error } = await supabase
    .from("projects")
    .select("id, user_id, title, prompt, code, thumbnail, created_at, updated_at, deleted_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
};

export const persistProject = async (input: {
  projectId: string | null;
  userId: string;
  title: string;
  prompt: string;
  code: string;
  messages: ChatMessage[];
  expectedUpdatedAt?: string;
}): Promise<string> => {
  const targetId = input.projectId ?? crypto.randomUUID();
  const values = {
    title: input.title,
    prompt: input.prompt,
    code: input.code,
    files: toJson(extractProjectFiles(input.code)),
    messages: toJson(input.messages),
  };
  try {
    let data: { id: string } | null = null;
    let error: Error | null = null;
    if (input.projectId) {
      let existingQuery = supabase.from("projects")
        .select("id, updated_at, deleted_at")
        .eq("id", targetId)
        .eq("user_id", input.userId)
        .is("deleted_at", null);
      if (input.expectedUpdatedAt) existingQuery = existingQuery.eq("updated_at", input.expectedUpdatedAt);
      const result = await existingQuery.maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) {
        const latest = await supabase.from("projects")
          .select("id, title, prompt, code, messages, deleted_at")
          .eq("id", targetId)
          .eq("user_id", input.userId)
          .is("deleted_at", null)
          .maybeSingle();
        if (latest.error) throw latest.error;
        const latestData = latest.data as {
          id: string;
          title: string;
          prompt: string;
          code: string;
          messages: Json;
          deleted_at: string | null;
        } | null;
        const sameContent = latestData &&
          latestData.title === values.title &&
          latestData.prompt === values.prompt &&
          latestData.code === values.code &&
          JSON.stringify(latestData.messages) === JSON.stringify(values.messages);
        if (sameContent) return targetId;
        throw new Error("This project changed or was deleted in another session. Refresh before saving.");
      }
      const updated = await supabase.from("projects")
        .update(values)
        .eq("id", targetId)
        .eq("user_id", input.userId)
        .is("deleted_at", null)
        .select("id")
        .single();
      data = updated.data;
      error = updated.error;
    } else {
      const inserted = await supabase.from("projects")
        .insert({ ...values, id: targetId, user_id: input.userId, deleted_at: null })
        .select("id")
        .single();
      data = inserted.data;
      error = inserted.error;
    }
    if (error) throw error;
    const pendingDraft = readProjectDraft();
    if (
      pendingDraft?.ownerId === input.userId &&
      pendingDraft.projectId === targetId &&
      pendingDraft.code === input.code &&
      pendingDraft.prompt === input.prompt &&
      JSON.stringify(pendingDraft.messages) === JSON.stringify(input.messages)
    ) {
      discardProjectDraft();
    }
    return data?.id ?? targetId;
  } catch (error) {
    writeProjectDraft({
      projectId: targetId,
      ownerId: input.userId,
      title: input.title,
      prompt: input.prompt,
      code: input.code,
      messages: input.messages,
      versions: readLocalVersionsForProject(targetId),
      updatedAt: Date.now(),
    });
    throw error;
  }
};

export const persistActivity = async (userId: string, entry: ActivityEntry): Promise<void> => {
  const { error } = await supabase.from("user_activity").insert({
    id: entry.id,
    user_id: userId,
    kind: entry.kind,
    title: entry.title,
    detail: entry.detail,
    duration_ms: entry.durationMs ?? null,
    prompt_characters: entry.promptCharacters ?? null,
    created_at: new Date(entry.createdAt).toISOString(),
  });
  if (error) throw error;
};

export const loadProjectActivity = async (userId: string): Promise<ActivityEntry[]> => {
  const { data, error } = await supabase
    .from("user_activity")
    .select("id, kind, title, detail, created_at, duration_ms, prompt_characters")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((entry) => ({
    id: entry.id,
    kind: entry.kind as ActivityEntry["kind"],
    title: entry.title,
    detail: entry.detail,
    createdAt: new Date(entry.created_at).getTime(),
    ...(entry.duration_ms === null ? {} : { durationMs: entry.duration_ms }),
    ...(entry.prompt_characters === null ? {} : { promptCharacters: entry.prompt_characters }),
  }));
};

export const loadProjectVersions = async (projectId: string, userId: string): Promise<LocalProjectVersion[]> => {
  const { data, error } = await supabase
    .from("project_versions")
    .select("id, code, prompt, created_at")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const cloudVersions = (data ?? []).map((version) => ({
    id: version.id,
    code: version.code,
    prompt: version.prompt,
    createdAt: new Date(version.created_at).getTime(),
  }));
  return cloudVersions.length ? cloudVersions : readLocalVersionsForProject(projectId);
};

export const deleteProjectVersion = async (versionId: string, userId: string) => {
  const { error } = await supabase
    .from("project_versions")
    .delete()
    .eq("id", versionId)
    .eq("user_id", userId);
  if (error) throw error;
};

export const clearProjectVersions = async (projectId: string, userId: string) => {
  const { error } = await supabase
    .from("project_versions")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw error;
};

export const deleteProject = async (projectId: string, userId: string) => {
  const { error } = await supabase
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw error;
};

export const softDeleteProject = deleteProject;

export type ProjectSyncEvent = {
  refreshProjects: () => Promise<void>;
  refreshProject: (projectId: string) => Promise<void>;
  refreshVersions: (projectId: string) => Promise<void>;
  onDisconnected?: () => void;
};

let projectSyncChannelCounter = 0;

export const subscribeToProjectSync = (userId: string, events: ProjectSyncEvent) => {
  let disconnected = false;
  const channel = supabase.channel(`project-sync-${userId}-${++projectSyncChannelCounter}`);
  channel
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "projects", filter: `user_id=eq.${userId}` }, () => void events.refreshProjects())
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "projects", filter: `user_id=eq.${userId}` }, (payload) => {
      const projectId = typeof payload.new?.id === "string" ? payload.new.id : typeof payload.old?.id === "string" ? payload.old.id : "";
      if (projectId) void events.refreshProject(projectId);
      void events.refreshProjects();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "project_versions", filter: `user_id=eq.${userId}` }, (payload) => {
      const projectId = typeof payload.new?.project_id === "string" ? payload.new.project_id : "";
      if (projectId) void events.refreshVersions(projectId);
    });
  channel.subscribe((status) => {
      disconnected = status !== "SUBSCRIBED";
      if (disconnected) events.onDisconnected?.();
      else void events.refreshProjects();
    });
  const interval = window.setInterval(() => {
    if (disconnected) void events.refreshProjects();
  }, 15000);
  return () => {
    window.clearInterval(interval);
    void supabase.removeChannel(channel);
  };
};
