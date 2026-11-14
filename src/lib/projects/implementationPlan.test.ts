import { describe, expect, it } from "vitest";
import { createImplementationPlan, formatImplementationPlan } from "./implementationPlan";

describe("universal implementation planning", () => {
  it("builds a rich, traceable specification for a complex multi-feature request", () => {
    const prompt = "Create a booking dashboard for a clinic. Receptionists must sign in, manage patient appointments, filter by doctor and date, record visit notes, and see today's totals.";
    const { implementationPlan } = createImplementationPlan({ prompt });
    const spec = implementationPlan.specification;

    expect(implementationPlan.requirements.length).toBeGreaterThanOrEqual(4);
    expect(implementationPlan.requirementTrace.map((item) => item.id)).toEqual(
      implementationPlan.requirements.map((_, index) => `REQ-${index + 1}`),
    );
    expect(spec.explicitRequirements).toEqual(implementationPlan.requirements);
    expect(spec.functionalFeatures.length).toBeGreaterThanOrEqual(4);
    expect(spec.workflows.length).toBeGreaterThanOrEqual(4);
    expect(implementationPlan.architecture.strategy).toBe("modular-multi-screen");
    expect(implementationPlan.fileBlueprint.some((file) => file.path === "src/App.tsx")).toBe(true);
    expect(implementationPlan.fileBlueprint.some((file) => file.path === "src/styles.css")).toBe(true);
    expect(implementationPlan.fileBlueprint.every((file) => (file.requirementIds?.length ?? 0) > 0)).toBe(true);
    expect(implementationPlan.qualityCriteria.length).toBeGreaterThan(0);
  });

  it("keeps simple requests simple and avoids ceremonial modules", () => {
    const { implementationPlan, architecture } = createImplementationPlan({
      prompt: "Create a single-page countdown timer with start, pause, and reset.",
    });
    expect(implementationPlan.specification.complexity).toBe("simple");
    expect(architecture.strategy).toBe("single-screen");
    expect(implementationPlan.fileBlueprint.map((file) => file.path)).toEqual(["src/App.tsx", "src/styles.css"]);
    expect(implementationPlan.fileBlueprint.some((file) => file.path.startsWith("src/hooks/"))).toBe(false);
    expect(implementationPlan.fileBlueprint.some((file) => file.path.startsWith("src/lib/"))).toBe(false);
    expect(implementationPlan.fileBlueprint.every((file) => (file.requirementIds?.length ?? 0) > 0)).toBe(true);
  });

  it("preserves multi-clause requirement details without blind splitting", () => {
    const prompt = "Receptionists must sign in, manage patient appointments, filter by doctor and date, and record visit notes with diagnosis and prescription.";
    const { implementationPlan } = createImplementationPlan({ prompt });
    expect(implementationPlan.requirements.length).toBeGreaterThanOrEqual(3);
    expect(implementationPlan.requirements.some((item) => /\bsign in\b/i.test(item))).toBe(true);
    expect(implementationPlan.requirements.some((item) => /\bmanage patient appointments\b/i.test(item))).toBe(true);
    expect(implementationPlan.requirements.some((item) => /\bfilter by doctor and date\b/i.test(item))).toBe(true);
    expect(implementationPlan.requirements.some((item) => /\brecord visit notes with diagnosis and prescription\b/i.test(item))).toBe(true);
    expect(implementationPlan.requirements.some((item) => /\bby doctor\b/i.test(item) && !/date/i.test(item))).toBe(false);
    expect(implementationPlan.requirements.some((item) => /\bdiagnosis\b/i.test(item) && !/prescription/i.test(item))).toBe(false);
  });

  it("maps traceability to genuinely relevant modules without arbitrary fallback", () => {
    const { implementationPlan } = createImplementationPlan({
      prompt: "Build a notes app where users can add notes, search notes, and switch between light and dark theme.",
    });
    const addNote = implementationPlan.requirementTrace.find((item) => /add notes/i.test(item.text));
    const search = implementationPlan.requirementTrace.find((item) => /search notes/i.test(item.text));
    const theme = implementationPlan.requirementTrace.find((item) => /dark theme|light and dark theme/i.test(item.text));
    expect(addNote?.modules.length).toBeGreaterThan(0);
    expect(addNote?.modules.some((path) => /App\.tsx$|pages\//.test(path))).toBe(true);
    expect(search?.modules.length).toBeGreaterThan(0);
    expect(theme?.modules).toContain("src/styles.css");
    expect(theme?.modules).not.toContain("src/lib/domain.ts");
    expect(theme?.modules).not.toContain("src/lib/sample-data.ts");
    for (const trace of implementationPlan.requirementTrace) {
      expect(trace.modules.length).toBeGreaterThan(0);
      expect(trace.modules.length).toBeLessThanOrEqual(3);
      expect(trace.acceptanceCriteria.length).toBeGreaterThan(0);
      expect(trace.acceptanceCriteria.some((criterion) => criterion.toLowerCase().includes(trace.text.toLowerCase().slice(0, Math.min(20, trace.text.length))))).toBe(true);
    }
    const blueprintIds = implementationPlan.fileBlueprint.map((file) => file.requirementIds ?? []);
    expect(blueprintIds.some((ids) => ids.length !== implementationPlan.requirements.length)).toBe(true);
    expect(blueprintIds.some((ids) => ids.length < implementationPlan.requirements.length)).toBe(true);
  });

  it("produces adaptive plans across varied product categories without fixed sample outputs", () => {
    const cases = [
      { prompt: "Build a personal portfolio with hero, projects, and contact form.", expect: "content" },
      { prompt: "Build a classroom quiz app where students answer questions and see their score.", expect: "quiz" },
      { prompt: "Build a recipe finder where I can search meals and save favorites.", expect: "recipe" },
      { prompt: "Build a weather dashboard showing current conditions and a 5-day forecast.", expect: "weather" },
      { prompt: "Build a habit tracker to log daily habits and view weekly progress.", expect: "habit" },
    ];
    for (const item of cases) {
      const { implementationPlan } = createImplementationPlan({ prompt: item.prompt });
      expect(implementationPlan.specification.explicitRequirements.length).toBeGreaterThan(0);
      expect(implementationPlan.requirementTrace.length).toBe(implementationPlan.requirements.length);
      expect(implementationPlan.fileBlueprint.some((file) => file.path === "src/App.tsx")).toBe(true);
      expect(implementationPlan.intent.toLowerCase()).not.toContain("ludo");
      expect(JSON.stringify(implementationPlan).toLowerCase()).not.toContain("src/lib/ludo-rules.ts");
    }
  });

  it("retains follow-up context for existing projects and targets coherent changes", () => {
    const { implementationPlan } = createImplementationPlan({
      prompt: "Add dark mode and remember the user's preference.",
      hasExistingProject: true,
      existingFiles: ["src/App.tsx", "src/pages/MainPage.tsx", "src/styles.css", "src/lib/theme.ts"],
      conversation: [
        { role: "user", content: "Build a notes app with folders and search." },
        { role: "assistant", content: "Created a notes app with folders and search." },
      ],
    });
    expect(implementationPlan.followUpContext.isFollowUp).toBe(true);
    expect(implementationPlan.followUpContext.preservedRequirements.join(" ")).toMatch(/notes app with folders and search/i);
    expect(implementationPlan.followUpContext.preservedRequirements.join(" ")).not.toContain("Add dark mode");
    expect(implementationPlan.requirements.join(" | ")).not.toMatch(/notes app with folders and search/i);
    expect(implementationPlan.requirements.join(" | ")).toMatch(/dark mode/i);
    expect(implementationPlan.existingFiles).toContain("src/lib/theme.ts");
    expect(implementationPlan.steps.join(" ")).toMatch(/Preserve/i);
    expect(implementationPlan.fileBlueprint.length).toBeLessThanOrEqual(6);
  });

  it("separates assumptions and clarifications when important details are missing", () => {
    const { implementationPlan } = createImplementationPlan({
      prompt: "Build an app with login and payments.",
    });
    expect(implementationPlan.specification.authentication.required).toBe(true);
    expect(implementationPlan.specification.externalIntegrations.some((item) => item.kind === "payments")).toBe(true);
    expect(implementationPlan.clarificationNeeded.length).toBeGreaterThan(0);
  });

  it("formats a human-readable plan with traceability and clarifications", () => {
    const { implementationPlan } = createImplementationPlan({
      prompt: "Build a support inbox where agents can view tickets, reply, and mark them resolved.",
    });
    const formatted = formatImplementationPlan(implementationPlan);
    expect(formatted).toContain("Requirement traceability:");
    expect(formatted).toContain("Planned files:");
    expect(formatted).toContain("Review and validation checklist:");
  });
});
