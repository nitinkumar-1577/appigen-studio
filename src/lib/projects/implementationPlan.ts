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
  designDirection: string[];
  qualityChecks: string[];
  fileBlueprint: PlannedFile[];
  existingFiles: string[];
  existingDependencies: string[];
}

interface CreateImplementationPlanOptions {
  prompt: string;
  appType: string;
  domain: string;
  complexity: string;
  existingFiles?: string[];
  existingDependencies?: string[];
  hasExistingProject?: boolean;
}

function gameArchitecture(prompt: string): ProjectArchitecture {
  const normalized = prompt.toLowerCase();
  const feature = normalized.includes("ludo") ? "Ludo"
    : normalized.includes("chess") ? "Chess"
    : normalized.includes("tower defense") ? "TowerDefense"
    : normalized.includes("platformer") ? "Platformer"
    : normalized.includes("space shooter") ? "SpaceShooter"
    : normalized.includes("racing") ? "Racing"
    : "Game";
  const slug = feature.replace(/[A-Z]/g, (letter, index) => `${index ? "-" : ""}${letter.toLowerCase()}`);
  const title = feature === "TowerDefense" ? "Tower Defense" : feature === "SpaceShooter" ? "Space Shooter" : feature;

  return {
    pages: [`src/pages/${feature}Page.tsx`],
    components: [
      { path: `src/components/${feature}Board.tsx`, purpose: `Render a complete, recognizable ${title} playfield with its real board geometry` },
      { path: "src/components/GameControls.tsx", purpose: "Expose functional game controls, legal actions, and clear turn feedback" },
      { path: "src/components/PlayerStatus.tsx", purpose: "Show each player, score, status, and current turn at a glance" },
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
  existingDependencies = [],
  hasExistingProject = existingFiles.length > 0,
}: CreateImplementationPlanOptions): { architecture: ProjectArchitecture; implementationPlan: ImplementationPlan } {
  const architecture: ProjectArchitecture = appType === "game"
    ? gameArchitecture(prompt)
    : {
      pages: ["src/pages/MainPage.tsx"],
      components: [],
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
    ? ["Plan the requested changes against the existing file tree and recent conversation", "Generate only the focused files needed for this request", "Preserve unrelated behavior and project structure", "Review the implementation against each requirement", "Validate imports, project structure, and the rendered preview before saving"]
    : ["Plan the user flows, visual hierarchy, app structure, and important edge cases", "Generate the complete app shell, focused screens, reusable UI, styles, and real domain logic", "Review the rendered product against the request and improve missing or weak details", "Validate imports, project structure, runtime rendering, and key interactions before saving"];
  const designDirection = appType === "game"
    ? [
      "Make the primary game board or playfield the visual focus; render its complete recognizable geometry instead of a list or narrow strip of cells.",
      "Use a deliberate game-specific palette, clear player colors, readable score/turn status, and controls placed beside or below the playfield.",
      "Fit the complete play area into desktop and mobile layouts without cropping important controls or hiding the game state.",
    ]
    : [
      "Choose a visual concept that fits the requested product domain, then define its hierarchy, palette, typography, spacing, and responsive behavior before coding.",
      "Give the primary user task a clear focal area and make every requested result visible in the interface.",
      "Use complete, believable sample content only where the app needs it; avoid generic dashboard shells and placeholder-looking controls.",
    ];
  const qualityChecks = [
    "Map every explicit requirement to a visible interface element and a working interaction or result.",
    "Review the complete source tree and confirm every import resolves and each module has a focused purpose.",
    "Check the actual rendered layout at desktop and mobile widths for clipping, low contrast, empty panels, and unusable controls.",
    appType === "game"
      ? "Check the game's real rules, legal actions, turn changes, win/loss conditions, and visible token or object movement against the requested game."
      : "Exercise the primary user flow, empty/error states, and relevant calculations before calling the app complete.",
  ];
  const normalizedPrompt = prompt.toLowerCase();
  const needsReusableUI = appType === "game" || /\b(multiple pages|multi-page|reusable|components|component library|sidebar|navigation|modal|dialog)\b/.test(normalizedPrompt);
  const requestedDataLogic = /\b(calculat|formula|scoring|rules|validation|workflow|crm|inventory|booking|cart|checkout|filter|search|sort|track|tracker)\b/.test(normalizedPrompt);
  const featureSlug = (domain || appType).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";
  const adaptiveComponents = needsReusableUI && architecture.components.length === 0
    ? [{ path: "src/components/MainView.tsx", purpose: "Reusable composition for the requested screens and interactions" }]
    : architecture.components;
  const adaptiveUtils = appType !== "game" && requestedDataLogic && !architecture.utils.length
    ? [{ path: `src/lib/${featureSlug}.ts`, purpose: "Focused domain calculations and validation for the requested workflows" }]
    : architecture.utils;
  const fileBlueprint: PlannedFile[] = [
    { path: "src/App.tsx", purpose: "Application shell and entry point" },
    ...architecture.pages.map((path) => ({ path, purpose: `Primary ${appType === "game" ? "game" : "app"} screen composition` })),
    { path: "src/styles.css", purpose: "Responsive app-specific design system" },
    ...(needsReusableUI ? adaptiveComponents : []),
    ...architecture.hooks,
    ...adaptiveUtils,
  ];

  return {
    architecture,
    implementationPlan: {
      intent: `${appType} for ${domain} (${complexity})`,
      requirements,
      steps,
      designDirection,
      qualityChecks,
      fileBlueprint,
      existingFiles,
      existingDependencies,
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
  if (Array.isArray(plan.designDirection) && plan.designDirection.length) {
    lines.push("", "Design plan:");
    for (const item of plan.designDirection) if (typeof item === "string") lines.push(`- ${item}`);
  }
  if (Array.isArray(plan.qualityChecks) && plan.qualityChecks.length) {
    lines.push("", "Review and validation checklist:");
    for (const item of plan.qualityChecks) if (typeof item === "string") lines.push(`- ${item}`);
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
  if (Array.isArray(plan.existingDependencies) && plan.existingDependencies.length) {
    lines.push("", `Existing dependencies to preserve: ${plan.existingDependencies.filter((name): name is string => typeof name === "string").join(", ")}`);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}
