import { describe, expect, it } from "vitest";
import { assessDeployPrerequisites, deployToVercel } from "./deploy";

describe("deploy integration (no fake success)", () => {
  it("reports prerequisites and does not claim provider-confirmed deployment", async () => {
    const prereq = assessDeployPrerequisites({ repoFullName: "o/r", buildValidated: true });
    expect(prereq.githubRepoAvailable).toBe(true);
    expect(prereq.buildValidated).toBe(true);
    expect(prereq.vercelTokenAvailable).toBe(false);
    expect(prereq.missing.some((m) => /provider-confirmed/i.test(m))).toBe(true);
    const result = await deployToVercel({ generatedAppId: "g1", ownerId: "u1", provider: "vercel", repoFullName: "o/r" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("external_prerequisites_required");
    expect(result.data?.status).toBe("not_deployed");
  });
});
