import type { ChatMessage } from "./projectStorage";
import type { ProjectUnderstanding } from "./projectUnderstanding";
import { formatUnderstandingForPrompt, tokenizeIntent } from "./projectUnderstanding";

export interface ArchitecturalDecision {
  id: string;
  summary: string;
  files: string[];
  prompt: string;
  at: number;
}

export interface ProjectMemory {
  projectId: string | null;
  projectKey: string;
  title?: string;
  architectureSummary: string;
  keyModules: string[];
  decisions: ArchitecturalDecision[];
  requirements: string[];
  changeHistory: Array<{ at: number; prompt: string; summary: string; changed: string[] }>;
  conflicts: string[];
  clarifications: string[];
  updatedAt: number;
}

export function emptyProjectMemory(projectKey: string, projectId: string | null = null): ProjectMemory {
  return { projectId, projectKey, architectureSummary: "", keyModules: [], decisions: [], requirements: [], changeHistory: [], conflicts: [], clarifications: [], updatedAt: Date.now() };
}

function uniq(items: string[]) { const s = new Set<string>(); const out: string[] = []; for (const i of items) { const t = i.trim(); if (!t || s.has(t.toLowerCase())) continue; s.add(t.toLowerCase()); out.push(t); } return out; }

export function deriveRequirements(messages: ChatMessage[], limit = 12): string[] {
  const reqs: string[] = [];
  for (const m of messages.filter((m) => m.role === "user")) {
    const text = m.content.trim();
    if (!text) continue;
    reqs.push(text.length > 180 ? `${text.slice(0, 177)}...` : text);
  }
  return uniq(reqs).slice(-limit);
}

export function detectConflicts(prompt: string, memory: ProjectMemory): { conflicts: string[]; clarifications: string[] } {
  const text = prompt.toLowerCase();
  const conflicts: string[] = [];
  const clarifications: string[] = [];
  const recent = memory.changeHistory.slice(-6).map((c) => c.prompt.toLowerCase()).join(" \n ");
  const decisions = memory.decisions.slice(-8).map((d) => d.summary.toLowerCase()).join(" \n ");
  const corpus = `${recent}\n${decisions}\n${memory.requirements.join("\n").toLowerCase()}`;
  const asksRevert = /revert|undo|go back|restore|previous (design|version|state)|roll ?back|remove (the )?(last|recent) change/.test(text);
  if (asksRevert && !memory.changeHistory.length) clarifications.push("You asked to revert/restore, but no prior change history is available in this project's memory; specify which version or change to restore.");
  if (/remove (auth|login|authentication)/.test(text) && /auth|login|authentication/.test(corpus)) conflicts.push("New instruction may remove or replace previously requested authentication behavior.");
  if (/remove (dark mode|theme|styling)/.test(text) && /dark mode|theme|style/.test(corpus)) conflicts.push("New instruction may remove or replace previously established styling/theme behavior.");
  if (/replace .* with|change .* to .* instead|no longer|stop using/.test(text) && memory.decisions.length) conflicts.push("New instruction may override an earlier architectural or product decision; existing behavior should be preserved unless explicitly replaced.");
  const tokens = tokenizeIntent(prompt);
  if (tokens.length === 0) clarifications.push("The follow-up instruction is too ambiguous to target specific project behavior safely; clarify what should change and where.");
  if (/\b(that|it|this|same one|previous one|earlier)\b/.test(text) && !memory.changeHistory.length && !memory.requirements.length) {
    clarifications.push("The instruction refers to prior context, but this project has little recorded memory; clarify the target feature/file or expected behavior.");
  }
  return { conflicts: uniq(conflicts), clarifications: uniq(clarifications) };
}

export function updateProjectMemory(params: {
  existing: ProjectMemory | null;
  projectKey: string;
  projectId: string | null;
  title?: string;
  understanding: ProjectUnderstanding | null;
  messages: ChatMessage[];
  prompt: string;
  changedFiles?: string[];
  changeSummary?: string;
}): ProjectMemory {
  const base = params.existing && params.existing.projectKey === params.projectKey ? { ...params.existing } : emptyProjectMemory(params.projectKey, params.projectId);
  base.projectId = params.projectId;
  if (params.title) base.title = params.title;
  if (params.understanding) {
    base.architectureSummary = params.understanding.architectureSummary;
    base.keyModules = params.understanding.keyModules;
  }
  base.requirements = deriveRequirements(params.messages);
  const changed = params.changedFiles ?? [];
  if (params.changeSummary || changed.length) {
    base.changeHistory = [...base.changeHistory, {
      at: Date.now(),
      prompt: params.prompt.slice(0, 240),
      summary: (params.changeSummary || `Updated ${changed.join(", ") || "project files"}`).slice(0, 400),
      changed,
    }].slice(-30);
    if (params.understanding && changed.length) {
      const impacted = params.understanding.files.filter((f) => changed.includes(f.path)).map((f) => `${f.role}:${f.path.split("/").pop()}`);
      base.decisions = [...base.decisions, {
        id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        summary: (params.changeSummary || `Adjusted ${impacted.join(", ") || changed.join(", ")}`).slice(0, 220),
        files: changed.slice(0, 12),
        prompt: params.prompt.slice(0, 220),
        at: Date.now(),
      }].slice(-20);
    }
  }
  const detected = detectConflicts(params.prompt, base);
  base.conflicts = detected.conflicts;
  base.clarifications = detected.clarifications;
  base.updatedAt = Date.now();
  return base;
}

export function formatMemoryForPrompt(memory: ProjectMemory, understanding: ProjectUnderstanding | null): string {
  const parts: string[] = [`Project memory (project-scoped, do not mix with other projects):`];
  if (memory.architectureSummary) parts.push(`Architecture: ${memory.architectureSummary}`);
  if (memory.keyModules.length) parts.push(`Key modules: ${memory.keyModules.join(", ")}`);
  if (memory.requirements.length) parts.push(`Known requirements/context: ${memory.requirements.slice(-6).map((r) => `- ${r}`).join("\n")}`);
  if (memory.decisions.length) parts.push(`Recent decisions: ${memory.decisions.slice(-5).map((d) => `- ${d.summary} (${d.files.join(", ")})`).join("\n")}`);
  if (memory.changeHistory.length) parts.push(`Recent changes: ${memory.changeHistory.slice(-5).map((c) => `- ${c.summary} [${c.changed.join(", ")}]`).join("\n")}`);
  if (memory.conflicts.length) parts.push(`Potential conflicts to preserve/resolve: ${memory.conflicts.map((c) => `- ${c}`).join("\n")}`);
  if (memory.clarifications.length) parts.push(`Clarifications needed before risky assumptions: ${memory.clarifications.map((c) => `- ${c}`).join("\n")}`);
  if (understanding) parts.push(formatUnderstandingForPrompt(understanding));
  parts.push("Preserve unrelated files and existing working behavior unless the user explicitly asked to change them.");
  return parts.join("\n");
}
