import { describe, expect, it } from "vitest";
import { analyzeIntent, detectResponseLanguage } from "./conversationIntelligence";

const cases = [
  { name: "Hindi general question", prompt: "मुझे लॉगिन सिस्टम समझाओ", has: false, expectBuild: false, lang: "hi" },
  { name: "Hinglish general question", prompt: "Mujhe batao authentication kya hota hai?", has: false, expectBuild: false, lang: "hinglish" },
  { name: "English general question", prompt: "What is authentication?", has: false, expectBuild: false, lang: "en" },
  { name: "Hindi build instruction", prompt: "मुझे एक कैलकुलेटर ऐप बनाओ", has: false, expectBuild: true, lang: "hi" },
  { name: "Hinglish build instruction", prompt: "Mujhe ek todo app bana do", has: false, expectBuild: true, lang: "hinglish" },
  { name: "English build instruction", prompt: "Build a weather dashboard", has: false, expectBuild: true, lang: "en" },
  { name: "discussion then build context (build)", prompt: "Achha, ab ye app bana do.", has: false, expectBuild: true, lang: "hinglish" },
  { name: "existing follow-up feature", prompt: "Ab monthly reports bhi add kar do.", has: true, expectBuild: true, lang: "hinglish" },
  { name: "project issue question", prompt: "Isme kya galat hai?", has: true, expectBuild: false, lang: "hinglish" },
  { name: "ambiguous reference needs care", prompt: "isko theek karo", has: true, expectBuild: true, lang: "hinglish" },
];

describe("Phase 3 conversational-to-build acceptance scenarios", () => {
  for (const c of cases) {
    it(c.name, () => {
      const a = analyzeIntent(c.prompt, { hasExistingProject: c.has });
      expect(a.shouldBuild).toBe(c.expectBuild);
      expect(detectResponseLanguage(c.prompt)).toBe(c.lang);
    });
  }

  it("does not start build on discussion-only prompt", () => {
    const a = analyzeIntent("Mujhe ek expense tracker banana hai. Isme kya-kya ho sakta hai?", { hasExistingProject: false });
    expect(a.shouldBuild).toBe(false);
  });
});
