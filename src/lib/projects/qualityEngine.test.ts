import { describe, expect, it } from "vitest";
import { analyzeProjectStructure, attemptsForIssue, buildQualityState, canAttemptRepair, createRepairAttempt, finalizeRepairAttempt, issueSignature, MAX_REPAIR_ATTEMPTS_PER_ISSUE, mergeRuntimeError, normalizeReviewFindings, runStaticQualityChecks, suggestTestsForGeneratedApp } from "./qualityEngine";

const APP = `// FILE: src/App.tsx
import "./styles.css";
export default function App(){ return <main><h1>Hello</h1><button>Go</button></main>; }

// FILE: src/styles.css
body{margin:0;}`;

describe("qualityEngine", () => {
  it("analyzes project structure and detects missing tests", () => {
    const s = analyzeProjectStructure(APP);
    expect(s.files).toContain("src/App.tsx");
    expect(s.testFiles).toEqual([]);
    const checks = runStaticQualityChecks(APP);
    expect(checks.find((c) => c.id === "validation")?.status).toBe("passed");
    expect(checks.find((c) => c.id === "tests-missing")?.status).toBe("skipped");
    expect(checks.find((c) => c.id === "typescript")?.status).toBe("unsupported");
    expect(checks.find((c) => c.id === "build")?.status).toBe("unsupported");
  });

  it("reports validation failures for invalid source", () => {
    const checks = runStaticQualityChecks("// FILE: src/App.tsx\nexport default function App(){ return (<div>; }");
    expect(checks.find((c) => c.id === "validation")?.status).toBe("failed");
  });

  it("suggests relevant tests for generated app features", () => {
    const suggestions = suggestTestsForGeneratedApp(APP);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].path).toMatch(/\.test\./);
    expect(suggestions[0].content).toContain("describe");
  });

  it("limits repair attempts per issue to max 3 and tracks outcomes", () => {
    const issue = "Runtime error: Cannot read properties of undefined";
    expect(MAX_REPAIR_ATTEMPTS_PER_ISSUE).toBe(3);
    const attempts = [] as ReturnType<typeof createRepairAttempt>[];
    for (let i = 1; i <= 3; i++) {
      expect(canAttemptRepair(attempts, issue)).toBe(i <= 3);
      const a = createRepairAttempt(issue, i, APP);
      const finished = finalizeRepairAttempt(a, { success: i === 3, afterCode: i === 3 ? APP.replace("Hello", "Hi") : APP, projectKey: "p", prompt: "fix", reason: "repair" , rolledBack: i !== 3 ? false : false, error: i === 3 ? undefined : "still broken"});
      attempts.push(finished);
      if (i < 3) expect(canAttemptRepair(attempts, issue)).toBe(true);
    }
    expect(attemptsForIssue(attempts, issue)).toBe(3);
    expect(canAttemptRepair(attempts, issue)).toBe(false);
    expect(attempts[2].status).toBe("succeeded");
    expect(attempts[2].changedPaths.length).toBeGreaterThan(0);
  });

  it("marks unsuccessful final attempt as stopped and supports rollback summary", () => {
    const a = createRepairAttempt("compile: broken", 3, APP);
    const done = finalizeRepairAttempt(a, { success: false, afterCode: APP, projectKey: "p", rolledBack: true, error: "validation failed" });
    expect(done.status).toBe("stopped");
    expect(done.rolledBack).toBe(true);
    expect(done.summary).toContain("Rolled back");
  });

  it("builds quality state with runtime errors, findings and unresolved issues", () => {
    const state = buildQualityState({
      code: APP,
      reviewFindings: normalizeReviewFindings([{ path: "src/App.tsx", issue: "missing key" }]),
      runtimeErrors: mergeRuntimeError([], { kind: "error", message: "boom" }),
      repairAttempts: [],
    });
    expect(state.overall).toBe("failed");
    expect(state.reviewFindings[0].path).toBe("src/App.tsx");
    expect(state.unresolvedIssues.some((u) => u.includes("Runtime"))).toBe(true);
    expect(state.checks.length).toBeGreaterThan(0);
  });

  it("normalizes issue signatures and dedupes runtime errors", () => {
    expect(issueSignature("Error at Foo.tsx:10:2")).toBe(issueSignature("Error at Bar.tsx:99:1"));
    const errs = mergeRuntimeError(mergeRuntimeError([], { kind: "error", message: "x" }), { kind: "error", message: "x" });
    expect(errs.length).toBe(1);
  });
});
