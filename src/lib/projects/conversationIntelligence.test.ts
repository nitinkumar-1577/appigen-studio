import { describe, expect, it } from "vitest";
import { analyzeIntent, detectResponseLanguage } from "./conversationIntelligence";

describe("conversation intelligence", () => {
  it("detects Hindi Devanagari and answers without build", () => {
    expect(detectResponseLanguage("मुझे लॉगिन सिस्टम समझाओ")).toBe("hi");
    const a = analyzeIntent("मुझे लॉगिन सिस्टम समझाओ", { hasExistingProject: false });
    expect(a.shouldBuild).toBe(false);
    expect(a.isQuestion).toBe(true);
  });

  it("detects Hinglish (Roman Hindi) and preserves script intent", () => {
    expect(detectResponseLanguage("Mujhe batao authentication kya hota hai?")).toBe("hinglish");
    const a = analyzeIntent("Mujhe ek calculator banana hai, kaise banega?", { hasExistingProject: false });
    expect(a.responseLanguage).toBe("hinglish");
    expect(a.shouldBuild).toBe(false);
  });

  it("detects English questions", () => {
    expect(detectResponseLanguage("What features are in my app?")).toBe("en");
    const a = analyzeIntent("What features are in my app?", { hasExistingProject: true });
    expect(a.shouldBuild).toBe(false);
  });

  it("treats build instructions as build in all supported languages", () => {
    expect(analyzeIntent("Build a todo app", { hasExistingProject: false }).shouldBuild).toBe(true);
    expect(analyzeIntent("Isme login add kr do.", { hasExistingProject: true }).shouldBuild).toBe(true);
    expect(analyzeIntent("इसमें लॉगिन सिस्टम जोड़ दो।", { hasExistingProject: true }).shouldBuild).toBe(true);
    expect(analyzeIntent("Please add a login system.", { hasExistingProject: true }).shouldBuild).toBe(true);
  });

  it("keeps discussion-to-build transition context (discussion first)", () => {
    const discuss = analyzeIntent("Mujhe ek expense tracker banana hai. Isme kya-kya ho sakta hai?", { hasExistingProject: false });
    expect(discuss.shouldBuild).toBe(false);
    const build = analyzeIntent("Achha, ab ye app bana do.", { hasExistingProject: false });
    expect(build.shouldBuild).toBe(true);
  });

  it("treats follow-up feature addition as edit/build in existing project", () => {
    expect(analyzeIntent("Ab monthly reports bhi add kar do.", { hasExistingProject: true }).shouldBuild).toBe(true);
  });

  it("treats project issue question as conversation not build", () => {
    expect(analyzeIntent("Isme kya galat hai?", { hasExistingProject: true }).shouldBuild).toBe(false);
  });

  it("does not start build on explanation request", () => {
    expect(analyzeIntent("Mujhe iska backend samjhao.", { hasExistingProject: true }).shouldBuild).toBe(false);
  });
});
