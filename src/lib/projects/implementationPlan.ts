export type RequirementSource = "explicit" | "inferred" | "assumption" | "suggestion";

export interface PlannedFile {
  path: string;
  purpose: string;
  requirementIds?: string[];
}

export interface RequirementTrace {
  id: string;
  text: string;
  source: RequirementSource;
  implementationSteps: string[];
  modules: string[];
  expectedBehavior: string;
  acceptanceCriteria: string[];
}

export interface ProductUser {
  role: string;
  goals: string[];
  primary: boolean;
}

export interface DomainEntity {
  name: string;
  description: string;
  fields: string[];
  relationships: string[];
}

export interface BusinessRule {
  id: string;
  description: string;
  requirementIds: string[];
}

export interface WorkflowStep {
  id: string;
  actor: string;
  action: string;
  outcome: string;
  requirementIds: string[];
}

export interface ScreenDefinition {
  id: string;
  name: string;
  purpose: string;
  primaryActions: string[];
  requirementIds: string[];
}

export interface IntegrationNeed {
  kind: "auth" | "database" | "storage" | "realtime" | "payments" | "api" | "analytics" | "other";
  description: string;
  required: boolean;
  requirementIds: string[];
}

export interface ProductSpecification {
  purpose: string;
  category: string;
  complexity: "simple" | "moderate" | "complex";
  targetUsers: ProductUser[];
  primaryGoals: string[];
  explicitRequirements: string[];
  inferredRequirements: string[];
  assumptions: string[];
  optionalSuggestions: string[];
  functionalFeatures: string[];
  workflows: WorkflowStep[];
  screens: ScreenDefinition[];
  navigation: string[];
  reusableComponents: PlannedFile[];
  domainEntities: DomainEntity[];
  dataRelationships: string[];
  businessLogic: BusinessRule[];
  stateManagement: { strategy: string; notes: string[] };
  backendRequirements: string[];
  authentication: { required: boolean; methods: string[]; notes: string[] };
  externalIntegrations: IntegrationNeed[];
  errorHandling: string[];
  edgeCases: string[];
  responsiveRequirements: string[];
  accessibilityRequirements: string[];
  technicalConstraints: string[];
  acceptanceCriteria: string[];
  clarificationNeeded: string[];
}

export interface ProjectArchitecture {
  strategy: "single-screen" | "focused-multi-file" | "modular-multi-screen";
  appShell: string;
  pages: PlannedFile[];
  components: PlannedFile[];
  hooks: PlannedFile[];
  contexts: PlannedFile[];
  utils: PlannedFile[];
  dataModel: string;
  stateStrategy: string;
  rationale: string[];
  existingFiles: string[];
  existingDependencies: string[];
}

export interface ImplementationStep {
  id: string;
  title: string;
  description: string;
  requirementIds: string[];
  targetPaths: string[];
}

export interface QualityCriterion {
  id: string;
  description: string;
  requirementIds: string[];
}

export interface ImplementationPlan {
  intent: string;
  specification: ProductSpecification;
  architecture: ProjectArchitecture;
  requirements: string[];
  requirementTrace: RequirementTrace[];
  steps: string[]; // compatibility for existing consumers
  implementationSteps: ImplementationStep[];
  designDirection: string[];
  qualityChecks: string[];
  qualityCriteria: QualityCriterion[];
  fileBlueprint: PlannedFile[];
  existingFiles: string[];
  existingDependencies: string[];
  assumptions: string[];
  clarificationNeeded: string[];
  followUpContext: {
    isFollowUp: boolean;
    preservedRequirements: string[];
    changedRequirementIds: string[];
    notes: string[];
  };
}

interface CreateImplementationPlanOptions {
  prompt: string;
  appType?: string;
  domain?: string;
  complexity?: string;
  existingFiles?: string[];
  existingDependencies?: string[];
  hasExistingProject?: boolean;
  conversation?: Array<{ role: "user" | "assistant"; content: string }>;
}

type NormalizedComplexity = "simple" | "moderate" | "complex";

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "have", "need", "want", "make", "build", "create",
  "app", "application", "website", "project", "please", "user", "users", "should", "able", "can", "will", "also",
]);

function slugify(value: string, fallback = "item") {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return slug || fallback;
}

function titleCaseWord(word: string) {
  return word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word;
}

function pascalFromSlug(slug: string) {
  return slug.split(/[^a-z0-9]+/i).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("") || "Main";
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function clampComplexity(value: string | undefined, prompt: string, reqCount: number, hasExisting: boolean): NormalizedComplexity {
  const normalized = (value ?? "").toLowerCase();
  if (normalized === "simple" || normalized === "moderate" || normalized === "complex") return normalized;
  const text = prompt.toLowerCase();
  if (hasExisting) return reqCount >= 5 || prompt.length > 700 ? "complex" : "moderate";
  const complexSignals = /\b(auth|authentication|login|database|payment|checkout|realtime|real-time|collaborat\w*|multi[- ]?user|admin panel|workflow|integration|api|backend)\b/.test(text);
  if (reqCount >= 6 || prompt.length > 900 || complexSignals) return "complex";
  const simpleSignals = /\b(single[- ]?page|single screen|simple|basic|minimal|counter|timer|clock|calculator|converter|toggle|stopwatch)\b/.test(text);
  if (simpleSignals && reqCount <= 6 && prompt.length < 280 && !/\b(multi[- ]?page|dashboard|admin|database|auth|payment|realtime|workflow)\b/.test(text)) return "simple";
  if (reqCount <= 2 && prompt.length < 160 && !/\b(and|with|plus|including|also)\b/.test(text)) return "simple";
  return "moderate";
}

function inferCategory(prompt: string, appType?: string): string {
  const text = prompt.toLowerCase();
  if (appType && appType !== "app") return appType;
  if (/\b(game|board game|puzzle|quiz|arcade)\b/.test(text)) return "interactive game";
  if (/\b(dashboard|analytics|report|admin)\b/.test(text)) return "dashboard";
  if (/\b(shop|store|cart|checkout|product|catalog)\b/.test(text)) return "commerce experience";
  if (/\b(todo|task|planner|notes|kanban|habit|tracker)\b/.test(text)) return "productivity tool";
  if (/\b(portfolio|landing|blog|marketing|agency|restaurant)\b/.test(text)) return "content website";
  if (/\b(chat|messag|assistant)\b/.test(text)) return "communication interface";
  if (/\b(form|survey|booking|reservation)\b/.test(text)) return "form-driven workflow";
  return "custom web application";
}

function inferDomain(prompt: string, category: string, domain?: string): string {
  if (domain && domain !== "general") return domain;
  const text = prompt.toLowerCase();
  const pairs: Array<[RegExp, string]> = [
    [/\b(health|fitness|medical|workout|diet)\b/, "health & wellness"],
    [/\b(finance|budget|invoice|expense|payment)\b/, "finance"],
    [/\b(learn|course|lesson|school|education|quiz)\b/, "education"],
    [/\b(food|recipe|restaurant|menu)\b/, "food & hospitality"],
    [/\b(travel|booking|hotel|trip)\b/, "travel"],
    [/\b(real estate|property|listing)\b/, "real estate"],
    [/\b(music|video|media|gallery)\b/, "media"],
  ];
  for (const [pattern, label] of pairs) if (pattern.test(text)) return label;
  return category;
}

export function extractExplicitRequirements(prompt: string): string[] {
  const normalized = prompt.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const bulletLines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*•\d.)]+\s+/.test(line))
    .map((line) => line.replace(/^[-*•\d.)]+\s+/, "").trim());

  const sentenceParts = normalized
    .split(/(?:\n+|;\s*|(?<=[.!?])\s+)/)
    .map((part) => part.trim())
    .filter(Boolean);

  const candidates = bulletLines.length ? bulletLines : (sentenceParts.length ? sentenceParts : [normalized]);
  const requestPrefix = /^(?:please|kindly|can you|could you|would you|i want to|i need to|i'd like to|we need to|build|create|make|design|develop)\s+/i;
  const leadingAction = /^(?:must|should|can|needs? to|has to|will|may|let(?:'s)?|sign|log|manage|add|edit|delete|remove|create|update|view|see|show|display|filter|search|sort|record|track|save|upload|download|export|import|share|send|receive|book|schedule|calculate|compute|play|start|pause|reset|submit|reply|mark|list|get|fetch|authenticate|pay|purchase|checkout)\b/i;
  const modifierStart = /^(?:with|without|including|excluding|for|so that|where|when|if|while|after|before|during|using|by|in|on|as|to)\b/i;
  const subordinateStart = /^(?:so that|where|when|if|while|after|before|because|unless|until|as long as)\b/i;
  const verbPattern = /\b(?:is|are|be|have|has|let|allow|enable|provide|support|sign|log|manage|add|edit|delete|remove|create|update|view|see|show|display|filter|search|sort|record|track|save|upload|download|export|import|share|send|receive|book|schedule|calculate|compute|play|start|pause|reset|submit|reply|mark|list|get|fetch|authenticate|pay|purchase|checkout)\b/i;
    const splitPattern = /\s*,\s+(?:and\s+)?|\s+\band\b\s+|\s+\bthen\b\s+/i;
    const relativeClause = /^(?:who|that|which|whose|whom)\b/i;

  const splitClauses = (text: string) => {
    const parts: string[] = [];
    let start = 0;
    let depthParen = 0;
    let depthBracket = 0;
    let depthBrace = 0;
    let quote: '"' | "'" | "`" | null = null;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const prev = text[i - 1];
      if (quote) {
        if (ch === quote && prev !== "\\") quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") { quote = ch as '"' | "'" | "`"; continue; }
      if (ch === "(") depthParen++;
      else if (ch === ")") depthParen = Math.max(0, depthParen - 1);
      else if (ch === "[") depthBracket++;
      else if (ch === "]") depthBracket = Math.max(0, depthBracket - 1);
      else if (ch === "{") depthBrace++;
      else if (ch === "}") depthBrace = Math.max(0, depthBrace - 1);
      if (depthParen || depthBracket || depthBrace) continue;
      const rest = text.slice(i);
      const match = rest.match(/^(?:\s*,\s+(?:and\s+)?|\s+\band\b\s+|\s+\bthen\b\s+)/i);
      if (match) {
        const after = rest.slice(match[0].length).trimStart();
        if (relativeClause.test(after)) continue;
        parts.push(text.slice(start, i));
        start = i + match[0].length;
        i = start - 1;
      }
    }
    parts.push(text.slice(start));
    return parts.map((part) => part.trim()).filter(Boolean);
  };

  const takeContext = (text: string) => {
    const actor = text.match(/^((?:(?:the|a|an)\s+)?[A-Za-z][A-Za-z0-9/_-]*(?:\s+[A-Za-z][A-Za-z0-9/_-]*){0,2})\s+(?:must|should|can|need(?:s)? to|has to|will|may)\b/i)?.[1]?.trim();
    if (actor) return actor;
    const leading = text.match(/^(.*?\b(?:for|when|if|where|while|after|before|on|in)\b[^,]{0,80}?)(?:\s+(?:must|should|can|need(?:s)? to|has to|will|may)\b)/i)?.[1]?.trim();
    return leading && leading.length <= 80 ? leading : "";
  };

  const expanded: string[] = [];
    for (const candidate of candidates) {
      const cleaned = candidate.replace(requestPrefix, "").replace(/[.]+$/g, "").trim();
      if (!cleaned) continue;
      if (!splitPattern.test(cleaned)) {
        expanded.push(cleaned);
        continue;
      }

      const clauses = splitClauses(cleaned);
      if (clauses.length <= 1) {
        expanded.push(cleaned);
        continue;
      }

      const actionable = clauses.filter((clause) => leadingAction.test(clause) || verbPattern.test(clause));
      const independent = clauses.filter((clause, index) => {
        if (subordinateStart.test(clause) || modifierStart.test(clause)) return false;
        if (leadingAction.test(clause)) return true;
        const words = clause.split(/\s+/).filter(Boolean);
        if (words.length < 2 || !verbPattern.test(clause)) return false;
        const prev = clauses[index - 1] ?? "";
        if (/^(?:and\s+)?(?:date|time|name|email|status|type|category|doctor|diagnosis|prescription|priority|notes?|totals?)\b/i.test(clause) && /\bby\b|\bwith\b|\bfor\b/i.test(prev)) return false;
        return true;
      });
      if (independent.length < 2 || actionable.length < 2) {
        expanded.push(cleaned);
        continue;
      }

      const context = takeContext(cleaned);
      let currentContext = context;
      let firstIndependentSeen = false;
      for (let i = 0; i < clauses.length; i++) {
        const clause = clauses[i];
        if (clause.length < 2) continue;
        const prev = clauses[i - 1] ?? "";
        const isComplement = /^(?:and\s+)?(?:date|time|name|email|status|type|category|doctor|diagnosis|prescription|priority|notes?|totals?)\b/i.test(clause) && /\bby\b|\bwith\b|\bfor\b/i.test(prev);
        if (isComplement) {
          if (expanded.length) expanded[expanded.length - 1] = `${expanded[expanded.length - 1]} and ${clause}`.trim();
          continue;
        }
        const isIndependent = independent.includes(clause);
        if (!isIndependent) {
          if (!firstIndependentSeen) { expanded.push(clause); continue; }
          if (expanded.length) expanded[expanded.length - 1] = `${expanded[expanded.length - 1]}, ${clause}`.trim();
          else expanded.push(clause);
          continue;
        }
        firstIndependentSeen = true;
        const actorMatch = clause.match(/^((?:(?:the|a|an)\s+)?[A-Za-z][A-Za-z0-9/_-]*(?:\s+[A-Za-z][A-Za-z0-9/_-]*){0,2})\s+(?:must|should|can|need(?:s)? to|has to|will|may)\b/i);
        if (actorMatch) currentContext = actorMatch[1].trim();
        const needsContext = currentContext && !/^(?:the|a|an)\s+[A-Za-z]/i.test(clause) && !/^(?:users?|admins?|receptionists?|players?|customers?)\b/i.test(clause) && !clause.toLowerCase().startsWith(currentContext.toLowerCase());
        const text = needsContext && !leadingAction.test(clause) ? `${currentContext} ${clause}`.trim() : clause;
        expanded.push(text);
      }
    }

  const normalizedReqs = uniqueStrings(expanded.map((part) => part.replace(/\s+/g, " ").trim()).filter((part) => part.length >= 4));
  if (!normalizedReqs.length) return [normalized];
  return normalizedReqs.slice(0, 16);
}

function detectFeatureSignals(text: string) {
  const has = (re: RegExp) => re.test(text);
  return {
    auth: has(/\b(login|logins|sign ?in|sign ?up|authentication|authenticate|account|accounts|password|passwords)\b/),
    database: has(/\b(database|databases|persist|persistent|save|saved|saving|stored?|storage|supabase|backend data|records?)\b/),
    realtime: has(/\b(realtime|real-time|live|socket|websocket|collaborat\w*|presence)\b/),
    payments: has(/\b(payment|payments|pay|checkout|stripe|billing|subscription|subscriptions|purchase)\b/),
    forms: has(/\b(form|forms|submit|input|inputs|contact|booking|bookings|survey|surveys)\b/),
    search: has(/\b(search|filter|filters|sort|sorting)\b/),
    charts: has(/\b(chart|charts|graph|graphs|analytics|metric|metrics|dashboard|dashboards)\b/),
    media: has(/\b(image|images|gallery|galleries|video|videos|audio|upload|uploads)\b/),
    game: has(/\b(game|games|board|score|scores|turn|turns|player|players|level|levels)\b/),
    multiPage: has(/\b(multi[- ]?page|pages?|navigation|navbar|route|routing|routes|tabs?)\b/),
  };
}

function extractEntities(prompt: string): DomainEntity[] {
  const text = prompt.toLowerCase();
  const entities: DomainEntity[] = [];
  const add = (name: string, description: string, fields: string[], relationships: string[]) => {
    if (!entities.some((entity) => entity.name === name)) entities.push({ name, description, fields, relationships });
  };
  if (/\b(task|todo)\b/.test(text)) add("Task", "A user-managed work item.", ["title", "status", "priority", "dueDate"], ["belongs to a list or user context"]);
  if (/\b(product|cart|checkout|order)\b/.test(text)) {
    add("Product", "An item presented or sold in the experience.", ["name", "price", "description", "image"], ["can appear in cart or orders"]);
    if (/\b(cart|checkout|order)\b/.test(text)) add("CartItem", "A selected product and quantity.", ["productId", "quantity", "subtotal"], ["references Product"]);
  }
  if (/\b(post|article|blog)\b/.test(text)) add("Post", "A content entry displayed to users.", ["title", "body", "author", "publishedAt"], ["may belong to categories or tags"]);
  if (/\b(event|booking|reservation)\b/.test(text)) add("Booking", "A scheduled reservation or event request.", ["name", "date", "time", "status"], ["belongs to a user or event"]);
  if (/\b(user|account|profile|login)\b/.test(text)) add("User", "A person interacting with the product.", ["name", "email", "role"], ["owns or interacts with domain records"]);
  if (/\b(message|chat)\b/.test(text)) add("Message", "A communication unit in a conversation.", ["sender", "content", "timestamp"], ["belongs to a conversation"]);
  return entities.slice(0, 6);
}

function identifyClarifications(prompt: string, signals: ReturnType<typeof detectFeatureSignals>, hasExisting: boolean): string[] {
  const text = prompt.trim();
  const clarifications: string[] = [];
  if (text.length < 18 || /^(make|build|create)\s+(an?\s+)?(app|website|game|dashboard)$/i.test(text)) {
    clarifications.push("Clarify the primary purpose, target users, and must-have features for this request.");
  }
  if (signals.payments && !/\b(stripe|paypal|invoice|subscription|one[- ]?time)\b/i.test(text)) {
    clarifications.push("Clarify the payment provider or checkout flow if real payments are required.");
  }
  if (signals.auth && !/\b(email|google|github|magic|otp|oauth)\b/i.test(text)) {
    clarifications.push("Clarify preferred authentication methods if account access must be production-ready.");
  }
  if (signals.database && !hasExisting && !/\b(supabase|firebase|postgres|local)\b/i.test(text)) {
    clarifications.push("Clarify whether data must persist across sessions/devices or can remain local for this version.");
  }
  return clarifications;
}

function inferAssumptions(prompt: string, signals: ReturnType<typeof detectFeatureSignals>, hasExisting: boolean, clarifications: string[]): string[] {
  const text = prompt.toLowerCase();
  const assumptions: string[] = [];
  if (clarifications.some((item) => item.includes("persist"))) {
    assumptions.push("Assuming local in-browser state is sufficient unless persistence is explicitly requested.");
  }
  if (!signals.auth && /\b(save|profile|account)\b/.test(text) && !hasExisting) {
    assumptions.push("Assuming no authentication flow is required beyond the explicitly requested experience.");
  }
  if (!/\b(dark|light|theme|color|brand)\b/.test(text)) {
    assumptions.push("Assuming visual styling should follow the requested purpose with a clean, accessible default presentation.");
  }
  return assumptions.slice(0, 4);
}

function screenNameFromRequirement(text: string, index: number): string {
  const cleaned = text.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
  const words = cleaned.split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word.toLowerCase())).slice(0, 3);
  if (!words.length) return index === 0 ? "Main Screen" : `Screen ${index + 1}`;
  return `${words.map(titleCaseWord).join(" ")} Screen`;
}

function tokenizeRequirement(text: string) {
  return uniqueStrings(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((word) => !STOP_WORDS.has(word));
}

function requirementModuleScore(requirement: string, file: PlannedFile) {
  const reqTokens = tokenizeRequirement(requirement);
  if (!reqTokens.length) return 0;
  const haystack = `${file.path} ${file.purpose}`.toLowerCase();
  let score = 0;
  for (const token of reqTokens) {
    if (haystack.includes(token)) score += 3;
    else if (token.endsWith("s") && haystack.includes(token.slice(0, -1))) score += 2;
  }
  if (/style|css|theme|responsive|layout|visual|dark|light/.test(requirement.toLowerCase()) && /styles\.css$/.test(file.path)) score += 5;
  if (/state|hook|persist|remember|toggle|filter|sort|calculate|preference/.test(requirement.toLowerCase()) && /\/hooks\/|\/lib\//.test(file.path)) score += 2;
  if (/page|screen|view|dashboard|list|form|add|create|show|display|manage|note|notes|task|item|items|search|countdown|timer/.test(requirement.toLowerCase()) && /\/pages\/|App\.(tsx|jsx)$/.test(file.path)) score += 3;
  if (/component|button|panel|card|control/.test(requirement.toLowerCase()) && /\/components\//.test(file.path)) score += 2;
  return score;
}

function modulesForRequirement(requirement: string, blueprint: PlannedFile[], isExisting: boolean) {
  const scored = blueprint
    .map((file) => ({ path: file.path, score: requirementModuleScore(requirement, file) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  if (scored.length) return uniqueStrings(scored.slice(0, 3).map((item) => item.path));

  const appEntry = blueprint.find((file) => /\/App\.(tsx|jsx)$/.test(file.path))?.path;
  const primaryUi = blueprint.find((file) => /\/pages\/|\/components\//.test(file.path))?.path;
  const stateModule = blueprint.find((file) => /\/hooks\/|\/lib\//.test(file.path))?.path;
  const styleModule = blueprint.find((file) => /styles\.css$/.test(file.path))?.path;
  const lower = requirement.toLowerCase();
  if (/style|theme|responsive|layout|color|dark|light/.test(lower) && styleModule) return uniqueStrings([styleModule, appEntry].filter((item): item is string => Boolean(item)));
  if (/state|persist|remember|calculate|validate|logic|filter|sort/.test(lower) && (stateModule || primaryUi)) return uniqueStrings([stateModule ?? primaryUi!, appEntry].filter((item): item is string => Boolean(item)));
  if (isExisting) return uniqueStrings([appEntry ?? blueprint[0]?.path].filter((item): item is string => Boolean(item)));
  return uniqueStrings([primaryUi ?? appEntry ?? blueprint[0]?.path, styleModule].filter((item): item is string => Boolean(item))).slice(0, 2);
}

function acceptanceCriteriaForRequirement(text: string, modules: string[]) {
  const criteria = [`The requested behavior is satisfied: ${text}`];
  if (modules.some((module) => /\/components\/|\/pages\/|App\.(tsx|jsx)$/.test(module))) {
    criteria.push("A visible UI affordance or result for this requirement is present and usable.");
  }
  if (/form|input|submit|save|create|edit|delete|login|sign|search|filter|sort|upload|select/i.test(text)) {
    criteria.push("Primary interactions for this requirement complete successfully without placeholder behavior.");
  }
  if (/validate|invalid|error|required|empty|loading|prevent|must|only|limit|edge/i.test(text)) {
    criteria.push("Relevant validation, empty, error, or boundary states for this requirement are handled.");
  } else {
    criteria.push("Relevant UI states affected by this requirement remain consistent after user interaction.");
  }
  if (modules.some((module) => /\/lib\/|\/hooks\//.test(module))) {
    criteria.push("Supporting logic or state for this requirement is implemented in the mapped module(s).");
  }
  return uniqueStrings(criteria).slice(0, 4);
}

function createTrace(reqs: string[], blueprint: PlannedFile[], isExisting: boolean): RequirementTrace[] {
  return reqs.map((text, index) => {
    const id = `REQ-${index + 1}`;
    const targetModules = modulesForRequirement(text, blueprint, isExisting);
    return {
      id,
      text,
      source: "explicit",
      implementationSteps: [isExisting ? `Apply ${id} to the affected module(s): ${targetModules.join(", ") || "existing project files"}.` : `Implement ${id} in: ${targetModules.join(", ") || "the planned structure"}.`, `Verify ${id} against its acceptance criteria.`],
      modules: targetModules,
      expectedBehavior: `The product satisfies this explicit requirement: ${text}`,
      acceptanceCriteria: acceptanceCriteriaForRequirement(text, targetModules),
    };
  });
}

function buildScreens(reqs: string[], category: string, signals: ReturnType<typeof detectFeatureSignals>): ScreenDefinition[] {
  if (signals.game) {
    return [{ id: "SCR-1", name: "Game Screen", purpose: `Primary ${category} play surface and controls.`, primaryActions: ["interact", "view status"], requirementIds: reqs.map((_, i) => `REQ-${i + 1}`) }];
  }
  if (signals.multiPage && reqs.length > 1) {
    return reqs.slice(0, 4).map((req, index) => ({
      id: `SCR-${index + 1}`,
      name: screenNameFromRequirement(req, index),
      purpose: `Supports: ${req}`,
      primaryActions: ["view", "interact"],
      requirementIds: [`REQ-${index + 1}`],
    }));
  }
  return [{ id: "SCR-1", name: "Main Screen", purpose: `Primary interface for the ${category}.`, primaryActions: uniqueStrings(reqs.slice(0, 4)), requirementIds: reqs.map((_, i) => `REQ-${i + 1}`) }];
}

function buildWorkflows(reqs: string[], users: ProductUser[]): WorkflowStep[] {
  const actor = users[0]?.role ?? "User";
  const workflows = reqs.slice(0, 6).map((req, index) => ({
    id: `FLOW-${index + 1}`,
    actor,
    action: req,
    outcome: `Requirement ${index + 1} is satisfied with visible feedback.`,
    requirementIds: [`REQ-${index + 1}`],
  }));
  return workflows.length ? workflows : [{ id: "FLOW-1", actor, action: "Use the primary interface", outcome: "Primary goal is completed.", requirementIds: [] }];
}

function buildBlueprint(options: {
  category: string;
  complexity: NormalizedComplexity;
  signals: ReturnType<typeof detectFeatureSignals>;
  entities: DomainEntity[];
  isExisting: boolean;
  existingFiles: string[];
  reqs: string[];
  prompt: string;
}): { architecture: ProjectArchitecture; blueprint: PlannedFile[] } {
  const { category, complexity, signals, entities, isExisting, existingFiles, reqs, prompt } = options;
  if (isExisting && existingFiles.length) {
    const existingSet = new Set(existingFiles);
    const targetPaths = uniqueStrings(reqs.flatMap((req) => modulesForRequirement(req, existingFiles.map((path) => ({ path, purpose: "" })), true)));
    const likely = targetPaths.length ? targetPaths : existingFiles.filter((path) => /src\/App\.(tsx|jsx)$|src\/styles\.css$|src\/pages\//.test(path)).slice(0, 6);
    const fallback = likely.length ? likely : existingFiles.slice(0, Math.min(6, existingFiles.length));
    const blueprint = fallback.map((path) => ({ path, purpose: "Update existing project module to satisfy the requested follow-up changes." }));
    return {
      architecture: {
        strategy: complexity === "simple" ? "focused-multi-file" : "modular-multi-screen",
        appShell: existingSet.has("src/App.tsx") ? "src/App.tsx" : existingSet.has("src/App.jsx") ? "src/App.jsx" : "src/App.tsx",
        pages: blueprint.filter((file) => /\/pages\//.test(file.path)),
        components: blueprint.filter((file) => /\/components\//.test(file.path)),
        hooks: blueprint.filter((file) => /\/hooks\//.test(file.path)),
        contexts: blueprint.filter((file) => /\/contexts?\//.test(file.path)),
        utils: blueprint.filter((file) => /\/lib\//.test(file.path)),
        dataModel: entities.length ? entities.map((entity) => entity.name).join(", ") : "Preserve existing data model",
        stateStrategy: "Preserve current state patterns; extend only where required by the follow-up request.",
        rationale: ["Follow-up edits should touch the smallest coherent set of existing files.", "Preserve unrelated behavior, structure, and dependencies."],
        existingFiles,
        existingDependencies: [],
      },
      blueprint,
    };
  }

  const combined = `${prompt} ${reqs.join(" ")}`;
  const needsDomainLogic = complexity !== "simple" && (signals.game || /\b(calculate|calculator|validate|validation|rule|rules|score|scoring|price|total|convert|formula|parse)\b/i.test(combined));
  const needsStateHook = complexity === "complex" || (complexity === "moderate" && (signals.forms || signals.search || signals.game || reqs.length >= 5 || /\b(persist|remember|save preference|localstorage|workflow|stepper)\b/i.test(combined)));
  const needsComponents = complexity !== "simple" && (signals.multiPage || signals.charts || signals.forms || signals.game || reqs.length >= 5 || complexity === "complex");
  const needsPageSplit = complexity !== "simple" && (signals.multiPage || reqs.length > 4 || (complexity === "complex" && (signals.game || signals.charts || signals.forms)));
  const multiScreen = complexity !== "simple" && (signals.multiPage || (complexity === "complex" && reqs.length > 4));

  const appFile: PlannedFile = { path: "src/App.tsx", purpose: needsPageSplit ? "Application shell and top-level composition." : "Primary application shell and screen implementation." };
  const styleFile: PlannedFile = { path: "src/styles.css", purpose: "App-specific design tokens, layout rules, and responsive styling." };
  const pageSlug = slugify(signals.game ? "game" : category, "main");
  const pageFile: PlannedFile = { path: `src/pages/${pascalFromSlug(pageSlug)}Page.tsx`, purpose: "Primary screen composition and user-visible workflow." };
  const components: PlannedFile[] = [];
  const hooks: PlannedFile[] = [];
  const utils: PlannedFile[] = [];

  if (needsComponents) {
    components.push({ path: "src/components/PrimaryView.tsx", purpose: "Reusable presentation for the main requested interface." });
  }
  if (signals.forms && (complexity !== "simple" || reqs.length >= 3)) components.push({ path: "src/components/InputPanel.tsx", purpose: "Controlled inputs and submit actions for user-entered data." });
  if (signals.charts || category.includes("dashboard")) components.push({ path: "src/components/InsightPanel.tsx", purpose: "Visual presentation of requested metrics or summaries." });
  if (signals.game && complexity !== "simple") components.push({ path: "src/components/GameControls.tsx", purpose: "User controls and status feedback for gameplay interactions." });

  if (needsStateHook) {
    hooks.push({ path: "src/hooks/useAppState.ts", purpose: "Encapsulate state transitions and interaction handlers for requested behavior." });
  }
  if (needsDomainLogic) {
    utils.push({ path: "src/lib/domain.ts", purpose: "Domain rules, calculations, and validation helpers." });
  }
  if (entities.length && complexity === "complex") {
    utils.push({ path: "src/lib/sample-data.ts", purpose: "Deterministic sample data shaped to the planned entities when needed by the UI." });
  }

  const coreFiles = needsPageSplit ? [appFile, pageFile, styleFile] : [appFile, styleFile];
  const blueprint = uniqueStrings([...coreFiles.map((f) => f.path), ...components.map((f) => f.path), ...hooks.map((f) => f.path), ...utils.map((f) => f.path)])
    .map((path) => [...coreFiles, ...components, ...hooks, ...utils].find((file) => file.path === path)!)
    .filter(Boolean);

  const strategy = multiScreen
    ? "modular-multi-screen"
    : blueprint.length <= 2
      ? "single-screen"
      : "focused-multi-file";

  return {
    architecture: {
      strategy,
      appShell: appFile.path,
      pages: needsPageSplit ? [pageFile] : [],
      components,
      hooks,
      contexts: [],
      utils,
      dataModel: entities.length ? entities.map((entity) => entity.name).join(", ") : "No persistent domain model required beyond local UI state",
      stateStrategy: hooks.length ? "Local state with dedicated hook(s) for non-trivial workflows" : "Local component state",
      rationale: [
        "Keep structure proportional to requested complexity; avoid ceremonial files.",
        needsPageSplit ? "Separate screen composition when the requested workflow or scope justifies it." : "Implement a simple request in the smallest coherent set of files.",
      ],
      existingFiles: [],
      existingDependencies: [],
    },
    blueprint,
  };
}

export function createImplementationPlan({
  prompt,
  appType,
  domain,
  complexity,
  existingFiles = [],
  existingDependencies = [],
  hasExistingProject = existingFiles.length > 0,
  conversation = [],
}: CreateImplementationPlanOptions): { architecture: ProjectArchitecture; implementationPlan: ImplementationPlan } {
  const latestPrompt = prompt.trim();
  const latestRequirements = extractExplicitRequirements(latestPrompt);
  const requirements = latestRequirements.length ? latestRequirements : [latestPrompt].filter(Boolean);
  const priorUserTurns = hasExistingProject
    ? conversation.filter((turn) => turn.role === "user").map((turn) => turn.content.trim()).filter(Boolean)
    : [];
  const preservedSourceTurns = priorUserTurns.filter((turn) => turn !== latestPrompt);
  const preservedRequirements = uniqueStrings([
    ...preservedSourceTurns.flatMap((turn) => extractExplicitRequirements(turn)),
    ...preservedSourceTurns,
  ]).slice(0, 12);
  const contextText = hasExistingProject && preservedRequirements.length
    ? `${preservedRequirements.join("\n")}\n${latestPrompt}`
    : latestPrompt;
  const signals = detectFeatureSignals(contextText.toLowerCase());
  const category = inferCategory(contextText, appType);
  const resolvedDomain = inferDomain(contextText, category, domain);
  const normalizedComplexity = clampComplexity(complexity, contextText, requirements.length, hasExistingProject);
  const entities = extractEntities(contextText);
  const clarifications = identifyClarifications(latestPrompt, signals, hasExistingProject);
  const assumptions = inferAssumptions(latestPrompt, signals, hasExistingProject, clarifications);
  const { architecture, blueprint } = buildBlueprint({ category, complexity: normalizedComplexity, signals, entities, isExisting: hasExistingProject, existingFiles, reqs: requirements, prompt: contextText });
  architecture.existingDependencies = existingDependencies;
  const trace = createTrace(requirements, blueprint, hasExistingProject);
  const requirementIds = trace.map((item) => item.id);
  const modulesByRequirement = new Map(trace.map((item) => [item.id, item.modules]));
  const requirementIdsForModules = (modules: string[]) => uniqueStrings(trace.filter((item) => item.modules.some((module) => modules.includes(module))).map((item) => item.id));
  const allRelevantRequirementIds = (ids: string[]) => (ids.length ? ids : requirementIds);
  const blueprintWithTrace = blueprint.map((file) => {
    const ids = requirementIdsForModules([file.path]);
    if (ids.length) return { ...file, requirementIds: ids };
    if (/styles\.css$/.test(file.path)) return { ...file, requirementIds: allRelevantRequirementIds(requirementIds.filter((id) => /style|theme|responsive|layout|design|ui/i.test(trace.find((t) => t.id === id)?.text ?? ""))) };
    if (/\/App\.(tsx|jsx)$/.test(file.path)) return { ...file, requirementIds: requirementIds.slice(0, Math.min(requirementIds.length, 2)) };
    return { ...file, requirementIds: [requirementIds[0]] };
  });
  const screens = buildScreens(requirements, category, signals).map((screen) => ({
    ...screen,
    requirementIds: allRelevantRequirementIds(screen.requirementIds.filter((id) => requirementIds.includes(id))),
  }));
  const workflows = buildWorkflows(requirements, [{ role: "Primary user", goals: requirements.slice(0, 3), primary: true }]).map((workflow) => ({
    ...workflow,
    requirementIds: allRelevantRequirementIds(workflow.requirementIds.filter((id) => requirementIds.includes(id))),
  }));
  const steps: ImplementationStep[] = hasExistingProject
    ? [
        { id: "STEP-1", title: "Understand follow-up in project context", description: "Review existing files, preserved behavior, and modules affected by the latest request.", requirementIds, targetPaths: blueprint.map((file) => file.path) },
        { id: "STEP-2", title: "Apply targeted changes", description: "Implement the latest requested changes in the smallest coherent set of modules.", requirementIds, targetPaths: blueprint.map((file) => file.path) },
        { id: "STEP-3", title: "Preserve and verify", description: "Preserve unrelated existing functionality and verify acceptance criteria for changed requirements.", requirementIds, targetPaths: blueprint.map((file) => file.path) },
      ]
    : [
        { id: "STEP-1", title: "Establish product specification", description: "Confirm purpose, users, explicit requirements, and acceptance criteria.", requirementIds, targetPaths: [] },
        { id: "STEP-2", title: "Implement adaptive structure", description: "Create only the modules needed for the planned screens, workflows, and logic.", requirementIds, targetPaths: blueprint.map((file) => file.path) },
        { id: "STEP-3", title: "Wire behavior and states", description: "Connect interactions, validation, and relevant loading/empty/error states.", requirementIds, targetPaths: blueprint.map((file) => file.path) },
        { id: "STEP-4", title: "Verify against requirements", description: "Check each traced requirement against visible behavior and edge cases.", requirementIds, targetPaths: blueprint.map((file) => file.path) },
      ];

  const qualityCriteria: QualityCriterion[] = [
    { id: "QC-1", description: "Every explicit requirement is traceable to implemented behavior and acceptance criteria.", requirementIds },
    { id: "QC-2", description: "Architecture remains proportional; no empty or ceremonial modules are introduced.", requirementIds },
    { id: "QC-3", description: "UI states, validation, and responsive behavior relevant to the request are handled.", requirementIds },
  ];
  const specification: ProductSpecification = {
    purpose: requirements[0] || latestPrompt || "Deliver the requested product experience.",
    category,
    complexity: normalizedComplexity,
    targetUsers: [{ role: "Primary user", goals: requirements.slice(0, 3), primary: true }],
    primaryGoals: requirements.slice(0, 5),
    explicitRequirements: requirements,
    inferredRequirements: [],
    assumptions,
    optionalSuggestions: [],
    functionalFeatures: requirements.slice(0, 12),
    workflows,
    screens,
    navigation: screens.length > 1 ? screens.map((screen) => screen.name) : ["Single-screen flow"],
    reusableComponents: architecture.components,
    domainEntities: entities,
    dataRelationships: entities.flatMap((entity) => entity.relationships).slice(0, 8),
    businessLogic: /\b(calculate|validate|score|total|rule|eligib)\b/i.test(contextText)
      ? [{ id: "RULE-1", description: "Implement the domain rules implied by explicit requirements with deterministic outcomes.", requirementIds: allRelevantRequirementIds(requirementIds.filter((id) => /calculate|validate|score|total|rule|eligib/i.test(modulesByRequirement.get(id)?.join(" ") + " " + (trace.find((item) => item.id === id)?.text ?? "")))) }]
      : [],
    stateManagement: { strategy: architecture.stateStrategy, notes: ["Prefer the simplest state model that satisfies traced requirements."] },
    backendRequirements: signals.database || signals.realtime ? ["Persist or synchronize only the data required by explicit requirements."] : [],
    authentication: { required: signals.auth, methods: signals.auth ? ["to be confirmed if not specified"] : [], notes: signals.auth ? ["Do not assume an auth provider beyond explicit request."] : [] },
    externalIntegrations: uniqueStrings([
      signals.auth ? "auth" : "",
      signals.database ? "database" : "",
      signals.realtime ? "realtime" : "",
      signals.payments ? "payments" : "",
    ]).map((kind) => ({ kind: kind as IntegrationNeed["kind"], description: `${kind} integration implied by the request`, required: true, requirementIds: allRelevantRequirementIds(requirementIds.filter((id) => new RegExp(kind, "i").test(trace.find((item) => item.id === id)?.text ?? ""))) })),
    errorHandling: ["Handle invalid input, failed actions, and unavailable data relevant to requested flows."],
    edgeCases: ["Handle empty states, boundary values, and repeated user actions where relevant."],
    responsiveRequirements: ["Support mobile and desktop layouts without loss of primary functionality."],
    accessibilityRequirements: ["Provide semantic labels, keyboard access, focus visibility, and sufficient contrast for interactive elements."],
    technicalConstraints: uniqueStrings(["Use the existing AppiGen preview/runtime constraints.", ...existingDependencies.map((dep) => `Preserve dependency: ${dep}`)]),
    acceptanceCriteria: trace.flatMap((item) => item.acceptanceCriteria).slice(0, 20),
    clarificationNeeded: clarifications,
  };

  const implementationPlan: ImplementationPlan = {
    intent: `${category} for ${resolvedDomain} (${normalizedComplexity})`,
    specification,
    architecture,
    requirements,
    requirementTrace: trace,
    steps: steps.map((step) => `${step.title}: ${step.description}`),
    implementationSteps: steps,
    designDirection: [
      "Match the visual structure to the product purpose and primary user tasks.",
      "Keep the primary workflow obvious and usable on mobile and desktop.",
      "Avoid generic placeholder UI when concrete requested content or controls are known.",
    ],
    qualityChecks: qualityCriteria.map((item) => item.description),
    qualityCriteria,
    fileBlueprint: blueprintWithTrace,
    existingFiles,
    existingDependencies,
    assumptions,
    clarificationNeeded: clarifications,
    followUpContext: {
      isFollowUp: hasExistingProject,
      preservedRequirements,
      changedRequirementIds: requirementIds,
      notes: hasExistingProject ? ["Treat the latest request as a change set against existing project context; preserve unrelated behavior."] : [],
    },
  };

  return { architecture, implementationPlan };
}

export function formatImplementationPlan(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const plan = value as Partial<ImplementationPlan>;
  const lines = ["Implementation plan"];
  if (typeof plan.intent === "string") lines[0] += ` — ${plan.intent}`;
  if (Array.isArray(plan.requirements) && plan.requirements.length) {
    lines.push("", "Requirements:");
    for (const requirement of plan.requirements) {
      if (typeof requirement === "string") lines.push(`- ${requirement.length > 240 ? `${requirement.slice(0, 237)}...` : requirement}`);
    }
  }
  if (Array.isArray(plan.requirementTrace) && plan.requirementTrace.length) {
    lines.push("", "Requirement traceability:");
    for (const trace of plan.requirementTrace) {
      if (!trace || typeof trace !== "object") continue;
      const item = trace as RequirementTrace;
      const modules = Array.isArray(item.modules) && item.modules.length ? ` [${item.modules.join(", ")}]` : "";
      if (typeof item.id === "string" && typeof item.text === "string") lines.push(`- ${item.id}: ${item.text}${modules}`);
    }
  }
  const steps = Array.isArray(plan.implementationSteps) && plan.implementationSteps.length
    ? plan.implementationSteps.map((step) => (step && typeof step === "object" && typeof (step as ImplementationStep).title === "string") ? `${(step as ImplementationStep).title}: ${(step as ImplementationStep).description}` : null).filter((step): step is string => Boolean(step))
    : Array.isArray(plan.steps) ? plan.steps.filter((step): step is string => typeof step === "string") : [];
  if (steps.length) {
    lines.push("", "Roadmap:");
    steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  }
  if (Array.isArray(plan.designDirection) && plan.designDirection.length) {
    lines.push("", "Design plan:");
    for (const item of plan.designDirection) if (typeof item === "string") lines.push(`- ${item}`);
  }
  const quality = Array.isArray(plan.qualityCriteria) && plan.qualityCriteria.length
    ? plan.qualityCriteria.map((item) => (item && typeof item === "object" ? (item as QualityCriterion).description : null)).filter((item): item is string => typeof item === "string")
    : Array.isArray(plan.qualityChecks) ? plan.qualityChecks.filter((item): item is string => typeof item === "string") : [];
  if (quality.length) {
    lines.push("", "Review and validation checklist:");
    for (const item of quality) lines.push(`- ${item}`);
  }
  if (Array.isArray(plan.fileBlueprint) && plan.fileBlueprint.length) {
    lines.push("", "Planned files:");
    for (const file of plan.fileBlueprint) {
      if (!file || typeof file !== "object") continue;
      const item = file as PlannedFile;
      if (typeof item.path === "string" && typeof item.purpose === "string") lines.push(`- ${item.path} — ${item.purpose}`);
    }
  }
  if (Array.isArray(plan.assumptions) && plan.assumptions.length) {
    lines.push("", "Assumptions:");
    for (const item of plan.assumptions) if (typeof item === "string") lines.push(`- ${item}`);
  }
  if (Array.isArray(plan.clarificationNeeded) && plan.clarificationNeeded.length) {
    lines.push("", "Clarifications that may help:");
    for (const item of plan.clarificationNeeded) if (typeof item === "string") lines.push(`- ${item}`);
  }
  if (Array.isArray(plan.existingFiles) && plan.existingFiles.length) {
    const paths = plan.existingFiles.filter((path): path is string => typeof path === "string");
    if (paths.length) lines.push("", `Existing project files to inspect: ${paths.join(", ")}`);
  }
  if (Array.isArray(plan.existingDependencies) && plan.existingDependencies.length) {
    lines.push("", `Existing dependencies to preserve: ${plan.existingDependencies.filter((name): name is string => typeof name === "string").join(", ")}`);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}
