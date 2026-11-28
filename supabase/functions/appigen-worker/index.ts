
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

type Json = Record<string, unknown>;
type BuildFile = { path: string; purpose: string; status: string; attempts?: number; error?: string };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: Json, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function parseFiles(source: string): Record<string, string> {
  const files: Record<string, string> = {};
  const re = /^\s*\/\/\s*FILE:\s*([^\n]+)\n([\s\S]*?)(?=^\s*\/\/\s*FILE:\s*[^\n]+\n|\s*$)/gm;
  for (const match of source.matchAll(re)) {
    const path = match[1].trim().replace(/^["'`]|["'`]$/g, "");
    if (path) files[path] = match[2].trim();
  }
  return files;
}

function formatFiles(files: Record<string, string>): string {
  return Object.entries(files).map(([path, content]) => `// FILE: ${path}\n${content}`).join("\n\n");
}

function mergeFile(source: string, path: string, content: string): string {
  if (!/^(src|public)\/[A-Za-z0-9_./-]+\.(tsx?|jsx?|css|html|json|svg)$/.test(path) || path.includes("..")) {
    throw new Error(`Unsafe planned file path: ${path}`);
  }
  const files = parseFiles(source);
  if (!Object.keys(files).length && source.trim() && path !== "src/App.tsx" && path !== "src/App.jsx") {
    throw new Error("Cannot merge a generated file into an unrecognized existing source tree.");
  }
  files[path] = content.trim();
  return formatFiles(files);
}

async function stableUuid(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function appendTimeline(items: unknown, line: string): string[] {
  const current = Array.isArray(items) ? items.filter((x): x is string => typeof x === "string") : [];
  return [...current, line].slice(-250);
}

function planSummary(plan: Json): string {
  const title = typeof plan.title === "string" ? plan.title : "Implementation plan";
  const explanation = typeof plan.explanation === "string" ? plan.explanation : "";
  const blueprint = Array.isArray(plan.fileBlueprint) ? plan.fileBlueprint as Array<{path?: string; purpose?: string}> : [];
  return [
    `Implementation plan: ${title}`,
    explanation,
    blueprint.length ? `Files: ${blueprint.map((f) => f.path).filter(Boolean).join(", ")}` : "",
  ].filter(Boolean).join("\n\n");
}

async function invokeAppigen(body: Json): Promise<Json> {
  const { data, error } = await supabase.functions.invoke("Appigen", { body });
  if (error) throw new Error(error.message || "Appigen stage failed");
  if (!data || typeof data !== "object") throw new Error("Appigen returned an invalid response");
  if (typeof (data as Json).error === "string") throw new Error((data as Json).error as string);
  return data as Json;
}

class BuildJobCancelledError extends Error {
  constructor() {
    super("Build was stopped by the user.");
    this.name = "BuildJobCancelledError";
  }
}

async function assertJobActive(id: string) {
  const { data, error } = await supabase.from("build_jobs").select("status").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "running") throw new BuildJobCancelledError();
}

async function saveJob(id: string, patch: Json) {
  const { data, error } = await supabase.from("build_jobs").update(patch)
    .eq("id", id).eq("status", "running").select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new BuildJobCancelledError();
}

async function failOrRetry(job: Json, message: string) {
  const id = String(job.id);
  const attempts = Number(job.attempt_count ?? 0) + 1;
  const maxAttempts = Number(job.max_attempts ?? 4);
  const terminal = attempts >= maxAttempts;
  await saveJob(id, {
    attempt_count: attempts,
    status: terminal ? "failed" : "retrying",
    current_stage: terminal ? "Failed" : "Retrying after temporary error",
    error: message.slice(0, 3000),
    lease_until: null,
    heartbeat_at: new Date().toISOString(),
    next_run_at: new Date(Date.now() + Math.min(60, 2 ** attempts) * 1000).toISOString(),
    build_timeline: appendTimeline(job.build_timeline, terminal ? `Build failed: ${message}` : `Temporary error; retry scheduled: ${message}`),
    ...(terminal ? { completed_at: new Date().toISOString() } : {}),
  });
}

async function processJob(job: Json) {
  const id = String(job.id);
  const userId = String(job.user_id);
  const projectId = String(job.project_id);
  const payload = (job.request_payload && typeof job.request_payload === "object" ? job.request_payload : {}) as Json;
  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  if (!prompt) throw new Error("The durable build job is missing its prompt.");

  const provider = payload.provider;
  const model = payload.model;
  const editMode = payload.existingProject === true;
  const existingCode = typeof payload.code === "string" ? payload.code : "";
  const conversation = Array.isArray(payload.conversation) ? payload.conversation : [];
  const contextFields = {
    projectUnderstanding: payload.projectUnderstanding,
    projectMemory: payload.projectMemory,
    changeSummary: payload.changeSummary,
    responseLanguage: payload.responseLanguage,
    intent: payload.intent,
    followUp: payload.followUp,
  };

 const stage = String(job.current_stage ?? "Planning");
  let plan = (job.implementation_plan && typeof job.implementation_plan === "object" ? job.implementation_plan : null) as Json | null;
  let files = (Array.isArray(job.build_files) ? job.build_files : []) as BuildFile[];
  files = files.map((file) => file.status === "generating"
    ? { ...file, status: "queued" }
    : file);
  let source = typeof job.working_code === "string" ? job.working_code : (editMode ? existingCode : "");

  if (!plan || stage === "Planning" || stage === "Queued") {
    await assertJobActive(id);
    const planData = await invokeAppigen({
      ...payload,
      mode: "plan",
      prompt,
      provider,
      model,
      existingProject: editMode,
      ...(editMode ? { code: existingCode } : {}),
      conversation,
    });
    await assertJobActive(id);
    const planObject = (planData.plan as Json | undefined)?.implementationPlan as Json | undefined;
    if (!planObject || !Array.isArray(planObject.fileBlueprint) || !planObject.fileBlueprint.length) {
      throw new Error("The planning stage did not return a valid file blueprint.");
    }
    plan = planObject;
    const blueprint = planObject.fileBlueprint as Array<{path: string; purpose?: string}>;
    files = blueprint.map((file) => ({
      path: file.path,
      purpose: typeof file.purpose === "string" ? file.purpose : "Implement planned project file",
      status: "queued",
      attempts: 0,
    }));
    const timeline = appendTimeline(job.build_timeline, "Implementation plan ready");
    await saveJob(id, {
      implementation_plan: plan,
      build_files: files,
      working_code: source,
      current_stage: "Generating files",
      progress: 10,
      status: "queued",
      attempt_count: 0,
      lease_until: null,
      error: null,
      build_timeline: timeline,
    });
    return { job_id: id, stage: "plan", next: "file_generation" };
  }

  const nextFileIndex = files.findIndex((file) => file.status === "queued" || file.status === "retrying");
  if (nextFileIndex >= 0) {
    const file = files[nextFileIndex];
    const nextFiles = files.map((item, index) => index === nextFileIndex ? { ...item, status: "generating" } : item);
    await saveJob(id, {
      build_files: nextFiles,
      current_stage: `Generating ${file.path}`,
      heartbeat_at: new Date().toISOString(),
      build_timeline: appendTimeline(job.build_timeline, `Creating ${file.path}`),
    });

    try {
      const allPaths = [...new Set(files.map((item) => item.path))];
      const architecture = [
        planSummary(plan),
        `Architecture strategy: ${(plan.architecture as Json | undefined)?.strategy ?? "adaptive"}`,
        `User architecture instructions: ${typeof payload.system === "string" ? payload.system : ""}`,
        `Response language: ${typeof payload.responseLanguage === "string" ? payload.responseLanguage : "English"}`,
      ].join("\n\n");
      await assertJobActive(id);
      const fileData = await invokeAppigen({
        mode: "build_file",
        prompt,
        file: { path: file.path, purpose: file.purpose },
        requirements: Array.isArray(plan.requirements) ? plan.requirements : [prompt],
        specification: plan.specification ?? null,
        requirementTrace: Array.isArray(plan.requirementTrace) ? plan.requirementTrace : [],
        fileTree: allPaths,
        existingSource: editMode ? existingCode.slice(0, 22000) : "",
        implementationContext: source.slice(-14000),
        architecture,
        ...contextFields,
        provider,
        model,
        temperature: payload.temperature,
        topP: payload.topP,
      });
      await assertJobActive(id);
      if (fileData.path !== file.path || typeof fileData.content !== "string" || !fileData.content.trim()) {
        throw new Error(`Invalid file response for ${file.path}`);
      }
      source = mergeFile(source, file.path, fileData.content);
      files = files.map((item, index) => index === nextFileIndex
        ? { ...item, status: "completed", error: undefined }
        : item);
      const completedCount = files.filter((item) => item.status === "completed").length;
      const progress = 10 + Math.round((completedCount / files.length) * 70);
      await saveJob(id, {
        build_files: files,
        working_code: source,
        progress,
        current_stage: completedCount === files.length ? "Reviewing" : `Completed ${file.path}`,
        status: "queued",
        attempt_count: 0,
        lease_until: null,
        heartbeat_at: new Date().toISOString(),
        error: null,
        build_timeline: appendTimeline(job.build_timeline, `Completed ${file.path}`),
      });
      return { job_id: id, stage: "file_generated", file: file.path, completed: completedCount, total: files.length };
    } catch (error) {
      if (error instanceof BuildJobCancelledError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const attempts = Number(file.attempts ?? 0) + 1;
      files = files.map((item, index) => index === nextFileIndex
        ? { ...item, attempts, status: attempts <= 1 ? "retrying" : "failed", error: message.slice(0, 1500) }
        : item);
      if (attempts <= 1) {
        await saveJob(id, {
          build_files: files,
          status: "retrying",
          current_stage: `Retrying ${file.path}`,
          lease_until: null,
          next_run_at: new Date(Date.now() + 3000).toISOString(),
          error: message.slice(0, 3000),
          build_timeline: appendTimeline(job.build_timeline, `Retrying ${file.path}: ${message}`),
        });
        return { job_id: id, stage: "file_retry", file: file.path };
      }
      await saveJob(id, {
        status: "failed",
        current_stage: "Failed",
        error: `File ${file.path} failed after retry: ${message}`.slice(0, 3000),
        lease_until: null,
        completed_at: new Date().toISOString(),
        build_files: files,
        build_timeline: appendTimeline(job.build_timeline, `Build failed: ${file.path}: ${message}`),
      });
      return { job_id: id, stage: "failed", file: file.path };
    }
  }

  if (!source.trim()) throw new Error("No project source was generated.");
  await assertJobActive(id);
  const reviewData = await invokeAppigen({
    mode: "review",
    prompt,
    code: source,
    plan,
    existingProject: editMode,
    provider,
    model,
    safety: payload.safety,
  });
  await assertJobActive(id);
  if (typeof reviewData.code !== "string" || !reviewData.code.trim()) {
    throw new Error("The review stage returned no project source.");
  }
  const finalCode = reviewData.code.trim();
  const parsedFiles = parseFiles(finalCode);
  if (!Object.keys(parsedFiles).length) throw new Error("The reviewed project has no valid // FILE: file tree.");
  if (!editMode && !parsedFiles["src/App.tsx"] && !parsedFiles["src/App.jsx"]) {
    throw new Error("The generated project is missing src/App.tsx or src/App.jsx.");
  }
  if (!editMode && !parsedFiles["src/styles.css"]) {
    throw new Error("The generated project is missing src/styles.css.");
  }

  const finalTitle = typeof plan.title === "string" && plan.title.trim()
    ? plan.title.trim().slice(0, 80)
    : (typeof payload.title === "string" && payload.title.trim() ? payload.title.trim().slice(0, 80) : "Untitled Project");
  const previousMessages = Array.isArray(payload.messages) ? payload.messages : [];
  const completedMessage = {
    role: "assistant",
    content: editMode ? "Project updated. Server-side build and review completed." : "Project generated. Server-side build and review completed.",
    timestamp: Date.now(),
  };
  const finalMessages = [...previousMessages, completedMessage];
  const { data: completed, error: completeError } = await supabase.rpc("complete_appigen_build_job", {
    p_job_id: id,
    p_project_id: projectId,
    p_user_id: userId,
    p_title: finalTitle,
    p_prompt: prompt,
    p_code: finalCode,
    p_files: parsedFiles,
    p_messages: finalMessages,
    p_build_files: files.map((file) => ({ ...file, status: "completed" })),
    p_build_timeline: appendTimeline(job.build_timeline, "Build completed and project saved"),
    p_previous_version_id: editMode && existingCode.trim() ? await stableUuid(`${id}:previous`) : null,
    p_previous_code: editMode && existingCode.trim() ? existingCode : null,
  });
  if (completeError) throw completeError;
  if (completed !== true) {
    const { data: latestJob, error: latestJobError } = await supabase
      .from("build_jobs").select("status").eq("id", id).maybeSingle();
    if (latestJobError) throw latestJobError;
    if (latestJob?.status === "queued" || latestJob?.status === "running") {
      return { job_id: id, stage: "prompt_update_pending", progress: 0 };
    }
    throw new BuildJobCancelledError();
  }
  return { job_id: id, stage: "completed", progress: 100 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const workerSecret = req.headers.get("x-worker-secret") ?? "";
  if (!workerSecret) return json({ error: "Unauthorized" }, 401);
  const { data: authorized, error: authError } = await supabase.rpc("verify_appigen_worker_secret", { p_secret: workerSecret });
  if (authError || authorized !== true) return json({ error: "Unauthorized" }, 401);

  const { data: claimed, error: claimError } = await supabase.rpc("claim_next_appigen_build_job");
  if (claimError) return json({ error: claimError.message }, 500);
  let job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job) return json({ ok: true, idle: true });

  try {
    const { data: consumedUpdate, error: consumeError } = await supabase.rpc(
      "consume_appigen_build_prompt_update",
      { p_job_id: String((job as Json).id) },
    );
    if (consumeError) throw consumeError;
    if (consumedUpdate === true) {
      const { data: refreshedJob, error: refreshError } = await supabase
        .from("build_jobs").select("*").eq("id", String((job as Json).id)).single();
      if (refreshError) throw refreshError;
      job = refreshedJob;
    }
    const result = await processJob(job as Json);
    return json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof BuildJobCancelledError) {
      return json({ ok: true, job_id: (job as Json).id, stage: "cancelled" }, 200);
    }
    const message = error instanceof Error ? error.message : String(error);
    try { await failOrRetry(job as Json, message); } catch (saveError) {
      if (!(saveError instanceof BuildJobCancelledError)) console.error("Could not persist worker failure:", saveError);
    }
    console.error("AppiGen durable worker error:", message);
    return json({ ok: false, job_id: (job as Json).id, error: message }, 200);
  }
});
