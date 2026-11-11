import { useEffect, useState } from "react";
import { X, Github as GithubIcon, Check, Loader2, GitBranch, Lock, Plus } from "lucide-react";
import { useApp } from "./AppContext";
import { toast } from "@/hooks/use-toast";
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import { recordActivity } from "@/lib/appPreferences";
import { getRunnableProjectFiles } from "@/lib/projects/exportProject";
import { persistActivity } from "@/lib/projects/projectRepository";
import { trackAnonymousUsage } from "@/lib/telemetry";
import { readGeneratedBackendState } from "@/lib/backend/generatedAppBackendStorage";

interface GithubModalProps {
  open: boolean;
  onClose: () => void;
  code: string | null;
  projectTitle: string;
  projectKey?: string;
}

interface GithubRepo {
  full_name: string;
  name: string;
  private: boolean;
  default_branch: string;
}

interface GithubUser { login: string; }

const apiRequest = async <T,>(token: string, path: string, init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "message" in body ? String(body.message) : response.statusText;
    throw new Error(`GitHub request failed (${response.status}): ${message}`);
  }
  return body as T;
};

export const GithubModal = ({ open, onClose, code, projectTitle, projectKey = "local:current" }: GithubModalProps) => {
  const { session, addNotification } = useApp();
  const token = session?.provider_token;
  const [username, setUsername] = useState("");
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [newRepoName, setNewRepoName] = useState("");
  const [makePrivate, setMakePrivate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [profile, repoList] = await Promise.all([
          apiRequest<GithubUser>(token, "/user"),
          apiRequest<GithubRepo[]>(token, "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator"),
        ]);
        if (cancelled) return;
        setUsername(profile.login);
        setRepos(repoList);
      } catch (error) {
        if (!cancelled) toast({ title: "GitHub connection failed", description: error instanceof Error ? error.message : "Could not load GitHub repositories.", variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, token]);

  if (!open) return null;

  const connectGithub = async () => {
    try {
      sessionStorage.setItem("appigen.github.connect.pending", "true");
      if (session) {
        const { error } = await supabase.auth.linkIdentity({
          provider: "github",
          options: { scopes: "repo", redirectTo: window.location.href },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "github",
          options: { scopes: "repo", redirectTo: window.location.href },
        });
        if (error) throw error;
      }
    } catch (error) {
      sessionStorage.removeItem("appigen.github.connect.pending");
      toast({ title: "GitHub connection unavailable", description: error instanceof Error ? error.message : "Check that GitHub OAuth is enabled in Supabase Auth.", variant: "destructive" });
    }
  };

  const createRepo = async () => {
    if (!token || !newRepoName.trim()) return;
    setLoading(true);
    try {
      const repo = await apiRequest<GithubRepo>(token, "/user/repos", {
        method: "POST",
        body: JSON.stringify({ name: newRepoName.trim(), private: makePrivate, auto_init: true }),
      });
      setRepos((existing) => [repo, ...existing.filter((item) => item.full_name !== repo.full_name)]);
      setSelectedRepo(repo.full_name);
      setNewRepoName("");
      toast({ title: "Repository created", description: repo.full_name });
    } catch (error) {
      toast({ title: "Could not create repository", description: error instanceof Error ? error.message : "Please try another repository name.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const pushProject = async () => {
    if (!token || !code || !selectedRepo) return;
    const target = repos.find((repo) => repo.full_name === selectedRepo);
    if (!target) return;
    setPushing(true);
    try {
      const backendState = readGeneratedBackendState(projectKey);
      const publicEnv: Record<string, string> = {};
      for (const v of backendState?.envVars ?? []) {
        if (!v.isSecret && v.publicValue) publicEnv[v.key] = v.publicValue;
      }
      const safeFiles = Object.entries(await getRunnableProjectFiles({
        title: projectTitle,
        prompt: "",
        code,
        backend: {
          mode: backendState?.mode ?? "shared",
          generatedAppId: backendState?.generatedAppId ?? projectKey,
          supabaseUrl: SUPABASE_URL || undefined,
          supabaseAnonKey: SUPABASE_PUBLISHABLE_KEY || undefined,
          publicEnv,
        },
      }));
      if (!safeFiles.length) throw new Error("The generated project does not contain any safe files to push.");

      const ref = await apiRequest<{ object: { sha: string } }>(token, `/repos/${target.full_name}/git/ref/heads/${encodeURIComponent(target.default_branch)}`);
      const blobs = await Promise.all(safeFiles.map(async ([path, content]) => {
        const blob = await apiRequest<{ sha: string }>(token, `/repos/${target.full_name}/git/blobs`, {
          method: "POST",
          body: JSON.stringify({ content, encoding: "utf-8" }),
        });
        return { path, sha: blob.sha };
      }));
      const tree = await apiRequest<{ sha: string }>(token, `/repos/${target.full_name}/git/trees`, {
        method: "POST",
        body: JSON.stringify({
          base_tree: ref.object.sha,
          tree: blobs.map(({ path, sha }) => ({ path, mode: "100644", type: "blob", sha })),
        }),
      });
      const commit = await apiRequest<{ sha: string }>(token, `/repos/${target.full_name}/git/commits`, {
        method: "POST",
        body: JSON.stringify({ message: `AppiGen: ${projectTitle}`, tree: tree.sha, parents: [ref.object.sha] }),
      });
      await apiRequest(token, `/repos/${target.full_name}/git/refs/heads/${encodeURIComponent(target.default_branch)}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
      if (session?.user.id) {
        const activity = recordActivity(session.user.id, { kind: "github", title: "Project pushed to GitHub", detail: target.full_name });
        void persistActivity(session.user.id, activity).catch((error: unknown) => {
          toast({ title: "Push succeeded; activity did not sync", description: error instanceof Error ? error.message : "The activity could not be saved to your account.", variant: "destructive" });
        });
      }
      void trackAnonymousUsage("project_pushed").catch((error: unknown) => console.warn("Anonymous usage telemetry could not be recorded:", error));
      addNotification({ kind: "github", title: "GitHub Push Complete", description: `Pushed ${projectTitle} to ${target.full_name}` });
      toast({ title: "Pushed to GitHub", description: `${target.full_name} · ${target.default_branch}` });
      onClose();
    } catch (error) {
      toast({ title: "GitHub push failed", description: error instanceof Error ? error.message : "Could not push the generated files.", variant: "destructive" });
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()} className="glass-strong relative max-h-[90dvh] w-[520px] max-w-[92vw] overflow-auto rounded-2xl p-6 shadow-elevated">
        <button onClick={onClose} aria-label="Close GitHub publishing dialog" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background"><GithubIcon className="h-5 w-5" /></div>
          <div><div className="font-display text-lg font-bold">Push to GitHub</div><div className="text-xs text-muted-foreground">Publish {projectTitle} to a repository</div></div>
        </div>

        {!token ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <div className="mb-2 text-sm font-semibold">Connect your GitHub account</div>
              <p className="text-xs text-muted-foreground">Authorize repository access through GitHub OAuth. AppiGen uses the OAuth session token only for this publish flow and does not save it separately.</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-foreground/90"><Check className="h-3.5 w-3.5 text-primary" /> Create a new repository or push to an existing one</div>
              <div className="mt-2 flex items-center gap-2 text-xs text-foreground/90"><Lock className="h-3.5 w-3.5 text-primary" /> Repository access is granted by you in GitHub</div>
            </div>
            <button onClick={() => void connectGithub()} disabled={!code} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-smooth hover:opacity-90 disabled:opacity-50">
              <GithubIcon className="h-4 w-4" />{session ? "Authorize GitHub repository access" : "Sign in with GitHub"}
            </button>
            {!code && <p className="text-center text-xs text-muted-foreground">Build an app before publishing it.</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 p-3">
              <div className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background"><GithubIcon className="h-4 w-4" /></div><div><div className="text-xs font-semibold">@{username || "GitHub user"}</div><div className="text-[11px] text-success">Authorized for this session</div></div></div>
              <span className="text-[10px] text-muted-foreground">OAuth token is not copied to AppiGen storage</span>
            </div>

            <div className="space-y-2 rounded-xl border border-border/70 bg-background/25 p-3">
              <div className="text-xs font-semibold">Create a new repository</div>
              <div className="flex gap-2">
                <input value={newRepoName} onChange={(event) => setNewRepoName(event.target.value)} placeholder="repository-name" className="min-w-0 flex-1 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none" />
                <button onClick={() => void createRepo()} disabled={!newRepoName.trim() || loading} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Create</button>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground"><input type="checkbox" checked={makePrivate} onChange={(event) => setMakePrivate(event.target.checked)} /> Private repository</label>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-foreground">Or select an existing repository</div>
              <div className="max-h-44 space-y-1.5 overflow-auto pr-1">
                {loading ? <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading repositories…</div> : repos.length ? repos.map((repo) => (
                  <button key={repo.full_name} onClick={() => setSelectedRepo(repo.full_name)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-smooth ${selectedRepo === repo.full_name ? "border-primary bg-primary/10" : "border-border bg-secondary/30 hover:border-primary/40"}`}>
                    <div className="flex min-w-0 items-center gap-2.5"><GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><div className="truncate text-xs font-medium">{repo.full_name}</div><div className="text-[10px] text-muted-foreground">{repo.private ? "Private" : "Public"} · {repo.default_branch}</div></div></div>
                    {selectedRepo === repo.full_name && <Check className="h-4 w-4 text-primary" />}
                  </button>
                )) : <div className="py-4 text-center text-xs text-muted-foreground">No repositories found. Create one above.</div>}
              </div>
            </div>

            <button onClick={() => void pushProject()} disabled={!selectedRepo || pushing || !code} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-smooth hover:brightness-110 disabled:opacity-50">
              {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <GithubIcon className="h-4 w-4" />}{pushing ? "Creating commit and pushing…" : selectedRepo ? `Push to ${selectedRepo}` : "Select a repository"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
