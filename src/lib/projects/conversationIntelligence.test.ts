import { describe, expect, it } from "vitest";
import { analyzeIntent, detectResponseLanguage, intentSummary, responseLanguageInstruction } from "./conversationIntelligence";

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

  it("does not start build on normal conversational statements", () => {
    expect(analyzeIntent("Ab main ek baat kehna chahta hu", { hasExistingProject: false }).shouldBuild).toBe(false);
    expect(analyzeIntent("Ab main ek baat kehna chahta hu", { hasExistingProject: true }).shouldBuild).toBe(false);
  });

  it("keeps discussion-to-build transition context (discussion first)", () => {
    const discuss = analyzeIntent("Mujhe ek expense tracker banana hai. Isme kya-kya ho sakta hai?", { hasExistingProject: false });
    expect(discuss.shouldBuild).toBe(false);
    const build = analyzeIntent("Achha, ab ye app bana do.", { hasExistingProject: false });
    expect(build.shouldBuild).toBe(true);
  });

  it("treats follow-up feature addition as edit/build in existing project", () => {
    const a = analyzeIntent("Ab monthly report add kar do.", { hasExistingProject: true });
    expect(a.shouldBuild).toBe(true);
    expect(["existing_project_edit", "follow_up_modification", "bug_fixing"]).toContain(a.intent);
  });

  it("asks clarification for unclear references instead of blind build", () => {
    const a = analyzeIntent("Isko theek karo", { hasExistingProject: true });
    expect(a.shouldBuild).toBe(false);
    expect(a.needsClarification).toBe(true);
  });

  it("understands real-world Hinglish spelling variations", () => {
    expect(analyzeIntent("Mujhe smajh nhi aa rha, login kese kaam karega?", { hasExistingProject: true }).shouldBuild).toBe(false);
    expect(detectResponseLanguage("mujhe btao ye kese chalega")).toBe("hinglish");
    expect(analyzeIntent("ab login page bnao", { hasExistingProject: false }).shouldBuild).toBe(true);
    expect(analyzeIntent("isme button color change krdo", { hasExistingProject: true }).shouldBuild).toBe(true);
  });

  it("preserves user language/script in response instructions", () => {
    expect(responseLanguageInstruction("hi")).toContain("Devanagari");
    expect(responseLanguageInstruction("hinglish")).toContain("Roman");
    expect(responseLanguageInstruction("en")).toContain("English");
  });
});

describe("intentSummary", () => {
  it("describes what the user asked for in a short sentence", () => {
    expect(intentSummary("new_app_creation")).toContain("new app");
    expect(intentSummary("existing_project_edit")).toContain("existing project");
    expect(intentSummary("bug_fixing")).toContain("bug");
  });
});

describe("follow-up resolution", () => {
  it("detects previous-file and undo references", async () => {
    const { resolveFollowUp } = await import("./conversationIntelligence");
    const undo = resolveFollowUp("Pichla change undo karo", { hasExistingProject: true, recentFiles: ["src/App.tsx"] });
    expect(undo.undo).toBe(true);
    expect(undo.referencesPrevious).toBe(true);

    const fileRef = resolveFollowUp("Ab isme image add karo", { hasExistingProject: true, recentFiles: ["src/components/Hero.tsx"] });
    expect(fileRef.referencesPrevious).toBe(false);
    expect(fileRef.mentionedFiles).toEqual([]);

    const named = resolveFollowUp("Hero.tsx me image add karo", { hasExistingProject: true, recentFiles: ["src/components/Hero.tsx"] });
    expect(named.mentionedFiles).toEqual(["src/components/Hero.tsx"]);
    expect(named.referencesPrevious).toBe(true);
  });
});

describe("vague new-app prompts", () => {
  it("asks for clarification when there is no target or context", async () => {
    const { isVagueNewAppPrompt } = await import("./conversationIntelligence");
    expect(isVagueNewAppPrompt("bnao isko")).toBe(true);
    expect(isVagueNewAppPrompt("design karo")).toBe(true);
    expect(isVagueNewAppPrompt("build it")).toBe(true);
    expect(isVagueNewAppPrompt("")).toBe(false);
  });

  it("does not block prompts that name a product", async () => {
    const { isVagueNewAppPrompt } = await import("./conversationIntelligence");
    expect(isVagueNewAppPrompt("Mere liye ek expense tracker banao")).toBe(false);
    expect(isVagueNewAppPrompt("Build a todo app with categories")).toBe(false);
    expect(isVagueNewAppPrompt("Isko professional banao")).toBe(true);
  });
});
