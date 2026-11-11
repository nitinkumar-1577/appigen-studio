export type ResponseLanguage = "en" | "hi" | "hinglish";
export type ConversationIntent =
  | "general_conversation"
  | "question"
  | "explanation"
  | "app_planning"
  | "new_app_creation"
  | "existing_project_edit"
  | "follow_up_modification"
  | "bug_fixing"
  | "clarification"
  | "undo_revert"
  | "feature_discussion";

export interface IntentAnalysis {
  intent: ConversationIntent;
  responseLanguage: ResponseLanguage;
  shouldBuild: boolean;
  isQuestion: boolean;
  needsClarification: boolean;
  confidence: number;
  reasons: string[];
}

const DEVANAGARI = /[\u0900-\u097F]/;
// Unambiguous Hinglish/Roman-Hindi markers (avoid words common in plain English like "is", "me", "to", "do")
const HINGLISH_MARKERS = /\b(mujhe|muje|mujhko|mera|meri|mere|kya|kyu|kyun|kaise|kese|kaisa|kaisi|krna|karna|karo|kardo|karke|krdo|kr|bana|banao|banado|banana|banega|bnao|bna|samjha|samjhao|samjho|samajh|smajh|samjh|batao|bata|btao|dikhao|dikha|wala|waala|wali|ismein|isme|usme|usko|isko|isey|ise|nahi|nhi|nai|tha|thi|abhi|ab|bhi|thoda|zyada|bahut|accha|acha|theek|thik|galat|pehle|dobara|phir|chahiye|hogya|hogaya|raha|rahi|rahe|mein|kaam|liye|dena|kehna|keh|chahta|chahti|hu|hun|baat)\b/i;

export function detectResponseLanguage(text: string): ResponseLanguage {
  const sample = text.trim();
  if (!sample) return "en";
  if (DEVANAGARI.test(sample)) return "hi";
  const isAscii = /^[\p{ASCII}]*$/u.test(sample);
  if (!isAscii) return "en";
  const strong = /\b(mujhe|muje|kya|kyu|kyun|kaise|kese|banao|banado|banana|banega|bnao|samjhao|smajh|samjha|batao|btao|dikhao|nahi|nhi|mera|meri|mere|chahiye|hogaya|raha|karna|karo|kardo|krdo|isko|usko|isme|abhi|kehna)\b/i.test(sample);
  const markers = (sample.match(new RegExp(HINGLISH_MARKERS.source, "gi")) ?? []).length;
  if (strong && markers >= 1) return "hinglish";
  if (markers >= 2) return "hinglish";
  // Common Hinglish request/question forms mixed with product words
  if (/\b(app|website|login|page|feature|backend|frontend|design|button|project|reports?|monthly|report)\b/i.test(sample) && /\b(bana|banao|bnao|samjha|smajh|batao|btao|kya|kaise|kese|dikhao|kar do|kr do|krdo|theek karo|thik karo|add kar|jod do|bhi|ab)\b/i.test(sample)) return "hinglish";
  // Short imperative Hinglish like "isko theek karo"
  if (/\b(isko|usko|isme|isey|ise)\b/i.test(sample) && /\b(theek karo|thik karo|sahi karo|badal do|hata do|jod do|add kar)\b/i.test(sample)) return "hinglish";
  return "en";
}

export function responseLanguageInstruction(language: ResponseLanguage): string {
  if (language === "hi") return "Respond in Hindi using Devanagari script. Do not switch to English or Roman Hindi unless quoting user text/code.";
  if (language === "hinglish") return "Respond in Hinglish/Roman Hindi (Hindi written in English/Latin letters), matching the user's script. Do not convert the response to Devanagari Hindi.";
  return "Respond in English, matching the user's language.";
}

const QUESTION_CUES = /^(?:\s*(?:why|how|what|where|which|when|who|can|could|would|should|is|are|do|does|did|will|explain|tell me|show me|describe|help me understand)\b)|\b(kya|kyu|kyun|kaise|kese|kaisa|kaisi|kab|kahan|kaun|batao|bata|btao|samjhao|samjha|samajh|smajh|samjh|explain karo|bata do|kaam kaise|kaise kaam|kese kaam)\b|[?？]\s*$|क्या|क्यों|कैसे|कैसा|कैसी|कब|कहाँ|कौन|बताओ|समझाओ/i;
const EXPLICIT_BUILD = /\b(build|create|generate|develop|scaffold|implement|code|make me|make a|create a|build a|develop a|start building|app bana|website bana|project bana|app banao|bana do|banado|bnao|bna do|bana ke do|create kar do|implement kar do|add kar do|add kr do|add krdo|feature bana|login bana|system bana|page bana)\b|ऐप बनाओ|बना दो|बनाइए|तैयार करो|इम्प्लीमेंट करो|जोड़ दो|लागू करो/i;
const EDIT_FOLLOWUP = /\b(add|change|update|modify|edit|fix|remove|delete|replace|adjust|improve|refine|polish|refactor|rename|move|integrate|include|also add|now add|abhi|isme|is mein|is me|usko|usme|isko|isey|ise|pehle wala|ye|yahan|wahan|button|page|feature|login|signup|auth|design|color|theme|layout|responsive|bug|error|issue|crash|not working|working nahi|nahi ho raha|nhi ho raha|theek karo|thik karo|sahi karo|kr do|krdo|kar do|kardo)\b|ठीक करो|बदल दो|जोड़ दो|हटा दो|सुधारो|डिज़ाइन/i;
const PLANNING_DISCUSS = /\b(kya-kya|kya kya|features?|suggest|idea|plan|scope|options?|ho sakta hai|possible|should i|recommend|soch raha|discuss|charcha|batao kya)\b|बताओ क्या|क्या-क्या|सुझाव|योजना/i;
const UNDO_REVERT = /\b(undo|revert|rollback|roll back|go back|restore|previous version|pehle jaisa|wapis|wapas|hata do last|pichla)\b|वापस|पिछला|रिवर्ट/i;
const BUG_REPORT = /\b(bug|error|issue|broken|crash|not working|doesn'?t work|fails?|failing|glitch|problem|kuch nahi ho raha|click par|galat hai|theek karo|thik karo)\b|काम नहीं|गलत|दिक्कत|एरर/i;
const NEW_APP_EXPLICIT = /^(?:please\s+)?(?:start\s+(?:a\s+)?new\s+app|start\s+from\s+scratch|create\s+a\s+brand[-\s]?new\s+project|create\s+a\s+separate\s+website)\b|(?:naya app|nayi website|bilkul naya|scratch se)\b/i;
const CLARIFY_SHORT = /^(?:hmm+|ok|okay|theek hai|haan|han|yes|no|nahi|sure|acha|accha|ठीक है|हाँ|नहीं)[.! ]*$/i;

function isQuestionLike(text: string): boolean {
  return QUESTION_CUES.test(text);
}

export function analyzeIntent(prompt: string, options: { hasExistingProject: boolean }): IntentAnalysis {
  const text = prompt.trim();
  const lower = text.toLowerCase();
  const responseLanguage = detectResponseLanguage(text);
  const reasons: string[] = [`lang:${responseLanguage}`];
  if (!text) return { intent: "general_conversation", responseLanguage, shouldBuild: false, isQuestion: false, needsClarification: false, confidence: 1, reasons: ["empty"] };

  if (CLARIFY_SHORT.test(text)) {
    return { intent: "clarification", responseLanguage, shouldBuild: false, isQuestion: false, needsClarification: false, confidence: 0.7, reasons: [...reasons, "short-ack"] };
  }

  const isQuestion = isQuestionLike(text) || (PLANNING_DISCUSS.test(lower) && !/\b(ab|abhi|now)\b.*\b(bana|banao|bnao|build|create|add)\b/i.test(lower));
  const wantsUndo = UNDO_REVERT.test(lower);
  const wantsBuild = EXPLICIT_BUILD.test(lower);
  const wantsEdit = EDIT_FOLLOWUP.test(lower);
  const bug = BUG_REPORT.test(lower);
  const explicitNew = NEW_APP_EXPLICIT.test(lower);
  const conversationalStatement = /\b(main|mein|mai|ek baat|baat kehna|bat kehna|kehna chahta|kehna chahti|bolna chahta|bolna chahti|kuch kehna|kuch bolna|sunna|sun lo|share karna)\b/i.test(lower)
    && !isQuestionLike(text) && !EXPLICIT_BUILD.test(lower) && !/\b(add|change|update|modify|edit|fix|remove|delete|replace|adjust|improve|refine|polish|refactor|rename|move|integrate|theek karo|thik karo|sahi karo|jod do|जोड़ दो|ठीक करो|बदल दो|हटा दो|सुधारो)\b/i.test(lower) && !BUG_REPORT.test(lower) && !UNDO_REVERT.test(lower);

  // "explain how login will work" / "Mujhe iska backend samjhao" -> question/explanation even if contains feature words
  const explanationAsk = /\b(explain|samjha|samjhao|batao|kaise kaam|how .* work|how will|what is|meaning|matlab|understand)\b/i.test(lower) && !/\b(add kar|bana do|banado|implement|fix kar|change kar|update kar|लागू करो|जोड़ दो)\b/i.test(lower);

  let intent: ConversationIntent = "general_conversation";
  if (conversationalStatement) intent = "general_conversation";
  else if (wantsUndo && options.hasExistingProject) intent = "undo_revert";
  else if (explanationAsk && isQuestion) intent = "explanation";
  else if (isQuestion && options.hasExistingProject && (/\b(app|project|feature|button|code|isme|is me|is project|mere app)\b/i.test(lower) || /\b(क्या|कैसे|क्यों)\b/.test(text))) intent = "question";
  else if (isQuestion) intent = PLANNING_DISCUSS.test(lower) ? "feature_discussion" : "question";
  else if (explicitNew || (wantsBuild && !options.hasExistingProject)) intent = "new_app_creation";
  else if (wantsBuild && PLANNING_DISCUSS.test(lower) && !/\b(ab|abhi|now|bana do|banado|bnao)\b/i.test(lower)) intent = "app_planning";
  else if (options.hasExistingProject && bug && wantsEdit) intent = "bug_fixing";
  else if (options.hasExistingProject && (wantsEdit || wantsBuild)) intent = "follow_up_modification";
  else if (wantsBuild) intent = options.hasExistingProject ? "existing_project_edit" : "new_app_creation";
  else if (options.hasExistingProject && wantsEdit) intent = "follow_up_modification";
  else intent = PLANNING_DISCUSS.test(lower) ? "feature_discussion" : "general_conversation";

  reasons.push(`intent:${intent}`);

  // Build only on explicit implementation/change intent, never on pure questions/discussion/explanation/statements
  let shouldBuild = (intent === "new_app_creation" || intent === "existing_project_edit" || intent === "follow_up_modification" || intent === "bug_fixing" || intent === "undo_revert")
    && !explanationAsk && !conversationalStatement
    && (wantsBuild || wantsEdit || wantsUndo || intent === "follow_up_modification" || intent === "bug_fixing");

  // For "Mujhe ek calculator banana hai, kaise banega?" user is asking -> question/discussion, not build
  if (isQuestion && /kaise ban|kese ban|कैसे बनेगा|how to build|how would you build/.test(lower) && !/\b(ab bana|bana do|banado|bnao|build it now|start building)\b/i.test(lower)) {
    return { intent: intent === "feature_discussion" || PLANNING_DISCUSS.test(lower) ? "feature_discussion" : "question", responseLanguage, shouldBuild: false, isQuestion: true, needsClarification: false, confidence: 0.85, reasons: [...reasons, "how-to-question-no-build"] };
  }

  const vagueReference = /\b(isko|usko|isey|ise|ye|wo|wahi|that|this|it|same|yeh)\b/i.test(lower);
  const hasConcreteTarget = /\b(button|page|screen|color|theme|text|title|header|footer|login|form|report|monthly|chart|table|menu|navbar|sidebar|image|icon|font|background|layout|section|card|modal|api|database|auth|error|bug)\b/i.test(lower) || /[.#][a-zA-Z][\w-]*/.test(text);
  let needsClarification = options.hasExistingProject && (intent === "follow_up_modification" || intent === "bug_fixing") && vagueReference && !hasConcreteTarget && !/\b(add|create|build|banao|bana|bnao|lagao|laga)\b/i.test(lower);
  // Unclear fix/change requests like "Isko theek karo" without target -> ask clarification instead of blind build.
  if (options.hasExistingProject && (intent === "follow_up_modification" || intent === "bug_fixing") && vagueReference && !hasConcreteTarget && /\b(fix|theek|thik|sahi|repair|correct|change|badlo|badal)\b/i.test(lower) && text.split(/\s+/).length <= 6) {
    needsClarification = true;
    shouldBuild = false;
    intent = "clarification";
    reasons.push("unclear-reference-needs-clarification");
  }
  if (conversationalStatement) {
    intent = "general_conversation";
    shouldBuild = false;
  }

  return { intent, responseLanguage, shouldBuild, isQuestion: isQuestion || explanationAsk, needsClarification, confidence: 0.8, reasons };
}

export function languageName(language: ResponseLanguage) {
  return language === "hi" ? "Hindi (Devanagari)" : language === "hinglish" ? "Hinglish (Roman Hindi)" : "English";
}
