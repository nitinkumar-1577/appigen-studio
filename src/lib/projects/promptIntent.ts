import { analyzeIntent } from "./conversationIntelligence";

export { analyzeIntent, detectResponseLanguage, responseLanguageInstruction } from "./conversationIntelligence";
export type { ConversationIntent, IntentAnalysis, ResponseLanguage } from "./conversationIntelligence";

const EXPLICIT_NEW_APP_PREFIX =
  /^(?:please\s+)?(?:start\s+(?:a\s+)?new\s+app|start\s+from\s+scratch|create\s+a\s+brand[-\s]?new\s+project|create\s+a\s+separate\s+website)\b|(?:naya app|nayi website|bilkul naya|scratch se)\b/i;

const EXISTING_PROJECT_SCOPE =
  /\b(?:in|for|on|inside)\s+(?:this|the|my|current|existing)\s+(?:app|project|page|screen|website)\b/i;

const EDIT_PREFIX =
  /^(?:please\s+)?(?:add|change|update|modify|edit|fix|remove|delete|replace|adjust|improve|refine|polish|make\s+(?:it|this|the|my)\b)/i;

export function isNewAppPrompt(prompt: string): boolean {
  const normalized = prompt.trim();
  if (!normalized) return false;
  if (EDIT_PREFIX.test(normalized) || EXISTING_PROJECT_SCOPE.test(normalized)) return false;
  if (EXPLICIT_NEW_APP_PREFIX.test(normalized)) return true;
  const intent = analyzeIntent(normalized, { hasExistingProject: false });
  // Only explicit "new app from scratch/separate" signals; generic "build/create X" may be in-project edits.
  return intent.intent === "new_app_creation" && intent.shouldBuild && /\b(from scratch|new app|brand[- ]?new|separate|scratch se|naya app|nayi website|bilkul naya)\b/i.test(normalized);
}

export function isProjectQuestion(prompt: string, hasExistingProject: boolean): boolean {
  const intent = analyzeIntent(prompt, { hasExistingProject });
  return hasExistingProject && (intent.intent === "question" || intent.intent === "explanation") && !intent.shouldBuild;
}

export function isProjectConversation(prompt: string, hasExistingProject: boolean): boolean {
  const intent = analyzeIntent(prompt, { hasExistingProject });
  return !intent.shouldBuild;
}
