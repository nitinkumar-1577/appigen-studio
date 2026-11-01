export interface PlannedFile {
  path: string;
  purpose: string;
}

export interface ProjectArchitecture {
  pages: string[];
  components: PlannedFile[];
  hooks: PlannedFile[];
  contexts: PlannedFile[];
  utils: PlannedFile[];
  dataModel: string;
  stateStrategy: string;
}

export interface ImplementationPlan {
  intent: string;
  requirements: string[];
  steps: string[];
  fileBlueprint: PlannedFile[];
  existingFiles: string[];
}

interface CreateImplementationPlanOptions {
  prompt: string;
  appType: string;
  domain: string;
  complexity: string;
  existingFiles?: string[];
  hasExistingProject?: boolean;
}

function gameArchitecture(prompt: string): ProjectArchitecture {
  const normalized = prompt.toLowerCase();
  const feature = normalized.includes("ludo") ? "Ludo"
    : normalized.includes("tower defense") ? "TowerDefense"
    : normalized.includes("platformer") ? "Platformer"
    : normalized.includes("space shooter") ? "SpaceShooter"
    : normalized.includes("racing") ? "Racing"
    : "Game";
  const slug = feature.replace(/[A-Z]/g, (letter, index) => `${index ? "-" : ""}${letter.toLowerCase()}`);
  const title = feature === "TowerDefense" ? "Tower Defense" : feature === "SpaceShooter" ? "Space Shooter" : feature;

  return {
    pages: [],
    components: [
      { path: "src/components/GameBoard.tsx", purpose: `Render the ${title} playfield and visible game state` },
      { path: "src/components/GameControls.tsx", purpose: "Expose the requested player controls and turn/status feedback" },
    ],
    hooks: [{ path: `src/hooks/use${feature}.ts`, purpose: `Manage ${title} state transitions and player/computer turns` }],
    contexts: [],
    utils: [{ path: `src/lib/${slug}-rules.ts`, purpose: `Implement and validate ${title} domain rules independently of the UI` }],
    dataModel: "Only entities explicitly requested by the user",
    stateStrategy: "Keep deterministic game rules separate from React state and render all legal actions explicitly",
  };
}

export function createImplementationPlan({
  prompt,
  appType,
  domain,
  complexity,
  existingFiles = [],
  hasExistingProject = existingFiles.length > 0,
}: CreateImplementationPlanOptions): { architecture: ProjectArchitecture; implementationPlan: ImplementationPlan } {
  const architecture: ProjectArchitecture = appType === "game"
    ? gameArchitecture(prompt)
    : {
      pages: [],
      components: [{ path: "src/components/MainView.tsx", purpose: "Compose the requested screen and its primary interactions" }],
      hooks: [],
      contexts: [],
      utils: [],
      dataModel: "Only entities explicitly requested by the user",
      stateStrategy: "Use the simplest state strategy that implements the requested interactions",
    };
  const requirements = prompt
    .split(/(?:\r?\n|;|(?<=[.!?])\s+)/)
    .map((requirement) => requirement.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean)
    .slice(0, 12);
  const steps = hasExistingProject
    ? ["Inspect the existing file tree and recent conversation", "Change only files needed for this request", "Preserve unrelated behavior and project structure", "Validate the complete project before preview and save"]
    : ["Identify the requested user flows and edge cases", "Create the app shell, screen, reusable UI, and app-specific styles", "Separate meaningful state and domain rules into focused modules", "Validate the complete project before preview and save"];
  const fileBlueprint: PlannedFile[] = [
    { path: "src/App.tsx", purpose: "Application shell and entry point" },
    { path: "src/pages/MainPage.tsx", purpose: "Primary screen composition" },
    { path: "src/components/MainView.tsx", purpose: "Reusable screen UI" },
    { path: "src/styles.css", purpose: "Responsive app-specific design system" },
    ...architecture.components.filter((file) => file.path !== "src/components/MainView.tsx"),
    ...architecture.hooks,
    ...architecture.utils,
  ];

  return {
    architecture,
    implementationPlan: {
      intent: `${appType} for ${domain} (${complexity})`,
      requirements,
      steps,
      fileBlueprint,
      existingFiles,
    },
  };
}

export function formatImplementationPlan(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const plan = value as Partial<ImplementationPlan>;
  const lines = ["Implementation plan"];
  if (typeof plan.intent === "string") lines[0] += ` — ${plan.intent}`;
  if (Array.isArray(plan.requirements)) {
    const requirements = plan.requirements.filter((requirement): requirement is string => typeof requirement === "string");
    if (requirements.length) {
      lines.push("", "Requirements:");
      for (const requirement of requirements) {
        const shortened = requirement.length > 240 ? `${requirement.slice(0, 237)}...` : requirement;
        lines.push(`- ${shortened}`);
      }
    }
  }
  if (Array.isArray(plan.steps)) {
    lines.push("", "Roadmap:");
    for (const [index, step] of plan.steps.entries()) {
      if (typeof step === "string") lines.push(`${index + 1}. ${step}`);
    }
  }
  if (Array.isArray(plan.fileBlueprint)) {
    const files = plan.fileBlueprint.filter((file): file is PlannedFile =>
      !!file && typeof file.path === "string" && typeof file.purpose === "string"
    );
    if (files.length) {
      lines.push("", "Planned files:");
      for (const file of files) lines.push(`- ${file.path} — ${file.purpose}`);
    }
  }
  if (Array.isArray(plan.existingFiles) && plan.existingFiles.length) {
    const paths = plan.existingFiles.filter((path): path is string => typeof path === "string");
    if (paths.length) lines.push("", `Existing project files to inspect: ${paths.join(", ")}`);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}
