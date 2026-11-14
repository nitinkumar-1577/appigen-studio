import { describe, expect, it } from "vitest";
import { isGenericFallbackCode } from "./isGenericFallbackCode";

describe("generic generator fallback detection", () => {
  it("recognizes the old hard-coded task app", () => {
    expect(isGenericFallbackCode(`
      <p>Generated app</p>
      <input placeholder="Add something..." />
      <li>Plan the experience</li>
      <li>Wire up interactions</li>
    `)).toBe(true);
  });

  it("does not reject a user-generated app", () => {
    expect(isGenericFallbackCode(`
      export default function App() {
        return <main><h1>Snake Game</h1><button>Start</button></main>;
      }
    `)).toBe(false);
  });
});
