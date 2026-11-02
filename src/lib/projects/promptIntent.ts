const EXPLICIT_NEW_APP_PREFIX =
  /^(?:please\s+)?(?:start\s+(?:a\s+)?new\s+app|start\s+from\s+scratch|create\s+a\s+brand[-\s]?new\s+project|create\s+a\s+separate\s+website)\b/i;

const EXISTING_PROJECT_SCOPE =
  /\b(?:in|for|on|inside)\s+(?:this|the|my|current|existing)\s+(?:app|project|page|screen|website)\b/i;

const EDIT_PREFIX =
  /^(?:please\s+)?(?:add|change|update|modify|edit|fix|remove|delete|replace|adjust|improve|refine|polish|make\s+(?:it|this|the|my)\b)/i;

export function isNewAppPrompt(prompt: string): boolean {
  const normalized = prompt.trim();
  if (!normalized || EDIT_PREFIX.test(normalized) || EXISTING_PROJECT_SCOPE.test(normalized)) return false;
  return EXPLICIT_NEW_APP_PREFIX.test(normalized);
}
