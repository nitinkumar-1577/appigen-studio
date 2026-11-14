import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, ChevronDown, Play, Pencil, Plus, Loader2, Inbox, Trash2, Check, X } from "lucide-react";
import { useApp } from "../AppContext";
import { toast } from "@/hooks/use-toast";
import type { ViewKey } from "../Sidebar";
import { loadProjects, renameProject, softDeleteProject, subscribeToProjectSync } from "@/lib/projects/projectRepository";

type Sort = "newest" | "name";

export type ProjectRow = {
  id: string;
  title: string;
  prompt: string;
  code: string;
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
};

interface MyAppsPageProps {
  onNavigate: (v: ViewKey) => void;
  onOpenSignIn: () => void;
  onOpenProject?: (p: ProjectRow) => void;
}

const hueFromString = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

export const MyAppsPage = ({ onNavigate, onOpenSignIn, onOpenProject }: MyAppsPageProps) => {
  const { user, session } = useApp();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [savingRename, setSavingRename] = useState(false);

  const load = useCallback(async () => {
    if (!user || !session?.user.id) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      setRows(await loadProjects(session.user.id));
    } catch (error) {
      toast({ title: "Couldn't load projects", description: error instanceof Error ? error.message : "Could not load your projects.", variant: "destructive" });
      setRows([]);
    }
    setLoading(false);
  }, [session?.user.id, user]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!session?.user.id) return;
    const refresh = () => void load();
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    const unsubscribe = subscribeToProjectSync(session.user.id, {
      refreshProjects: async () => { await load(); },
      refreshProject: async () => { await load(); },
      refreshVersions: async () => {},
    });
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
    };
  }, [load, session?.user.id]);

  const list = useMemo(() => {
    const f = rows.filter((a) => a.title.toLowerCase().includes(q.toLowerCase()));
    return f.sort((a, b) =>
      sort === "name" ? a.title.localeCompare(b.title) : b.updated_at.localeCompare(a.updated_at)
    );
  }, [q, sort, rows]);

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center overflow-auto p-6">
        <div className="glass flex max-w-lg flex-col items-center gap-3 rounded-2xl p-10 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <h1 className="font-display text-xl font-semibold">Sign in to view your projects</h1>
          <p className="text-sm text-muted-foreground">Your saved apps are private to your account and will be restored when you sign in.</p>
          <button onClick={onOpenSignIn} className="mt-1 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow hover:brightness-110">Sign in</button>
        </div>
      </div>
    );
  }

  const handleDelete = async (id: string) => {
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== id));
    try {
      await softDeleteProject(id, session?.user.id ?? "");
      toast({ title: "🗑️ Project deleted" });
    } catch (error) {
      setRows(prev);
      toast({ title: "Delete failed", description: error instanceof Error ? error.message : "The project could not be deleted.", variant: "destructive" });
    }
  };

  const handleRename = async (id: string) => {
    const title = editTitle.trim();
    if (!title || !session?.user.id) return;
    const previous = rows;
    setRows((current) => current.map((row) => row.id === id ? { ...row, title } : row));
    setSavingRename(true);
    try {
      await renameProject(id, session.user.id, title);
      setEditingId(null);
      toast({ title: "Project renamed" });
    } catch (error) {
      setRows(previous);
      toast({ title: "Rename failed", description: error instanceof Error ? error.message : "The project name could not be updated.", variant: "destructive" });
    } finally {
      setSavingRename(false);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">My Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {loading ? "Loading…" : `${list.length} project${list.length !== 1 ? "s" : ""} in your workspace.`}
            </p>
          </div>
          <button
            onClick={() => onNavigate("studio")}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-smooth hover:brightness-110"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <div className="glass relative flex h-10 flex-1 min-w-[220px] items-center rounded-xl px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search projects…"
              className="ml-2 h-full flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <div className="glass relative flex h-10 items-center rounded-xl px-3">
            <span className="text-xs text-muted-foreground">Sort by</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="ml-2 cursor-pointer appearance-none bg-transparent pr-6 text-sm font-medium text-foreground focus:outline-none"
            >
              <option value="newest">Newest</option>
              <option value="name">Name</option>
            </select>
            <ChevronDown className="pointer-events-none -ml-5 h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your projects…
          </div>
        ) : !user ? (
          <div className="glass flex flex-col items-center gap-3 rounded-2xl p-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <div className="font-display text-lg font-semibold">Sign in to see your projects</div>
            <p className="max-w-md text-sm text-muted-foreground">Your builds are saved automatically once you're signed in.</p>
          </div>
        ) : list.length === 0 ? (
          <div className="glass flex flex-col items-center gap-3 rounded-2xl p-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <div className="font-display text-lg font-semibold">No projects yet</div>
            <p className="max-w-md text-sm text-muted-foreground">Hit <span className="font-semibold text-primary">Build</span> in the studio to generate your first app.</p>
            <button onClick={() => onNavigate("studio")}
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-glow hover:brightness-110">
              <Plus className="h-3.5 w-3.5" /> Start a project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((a) => {
              const hue = hueFromString(a.id);
              return (
                <div
                  key={a.id}
                  className="glass group overflow-hidden rounded-xl shadow-soft transition-smooth hover:shadow-elevated hover:-translate-y-0.5"
                >
                  <button
  onClick={() => onOpenProject?.(a)}
  className="relative block h-44 w-full overflow-hidden text-left"
  style={{
    background: `linear-gradient(135deg, hsl(${hue} 70% 30%), hsl(${(hue + 30) % 360} 80% 18%))`,
  }}
>
  {a.thumbnail && (
    <img
      src={a.thumbnail}
      alt={`${a.title} preview`}
      loading="lazy"
      className="absolute inset-0 h-full w-full object-cover object-top"
      onError={(event) => {
        event.currentTarget.style.display = "none";
      }}
    />
  )}

  {!a.thumbnail && (
    <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_30%,rgba(255,255,255,0.18),transparent_70%)]" />
  )}

  <div className="absolute bottom-2 right-2 rounded-md bg-black/50 px-2 py-1 text-[10px] font-medium text-white backdrop-blur">
    Preview
  </div>
</button>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {editingId === a.id ? (
                          <form onSubmit={(event) => { event.preventDefault(); void handleRename(a.id); }} className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={editTitle}
                              onChange={(event) => setEditTitle(event.target.value)}
                              aria-label="Project name"
                              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                            <button type="submit" disabled={!editTitle.trim() || savingRename} aria-label="Save project name" title="Save name" className="rounded p-1 text-primary disabled:opacity-50">
                              <Check className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel rename" title="Cancel" className="rounded p-1 text-muted-foreground hover:text-foreground">
                              <X className="h-4 w-4" />
                            </button>
                          </form>
                        ) : (
                          <>
                            <div className="truncate text-sm font-semibold">{a.title}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              Updated {new Date(a.updated_at).toLocaleDateString()}
                            </div>
                          </>
                        )}
                      </div>
                      {editingId !== a.id && <button
                        onClick={() => {
                          setEditingId(a.id);
                          setEditTitle(a.title);
                        }}
                        title="Rename project"
                        aria-label={`Rename ${a.title}`}
                        className="text-muted-foreground transition-smooth hover:text-primary"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>}
                      <button
                        onClick={() => handleDelete(a.id)}
                        title="Delete project"
                        aria-label={`Delete ${a.title}`}
                        className="text-muted-foreground transition-smooth hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onOpenProject?.(a)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-smooth hover:bg-primary/20"
                      >
                        <Play className="h-3.5 w-3.5" /> Open
                      </button>
                      <button
                        onClick={() => onOpenProject?.(a)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-semibold text-foreground transition-smooth hover:bg-secondary"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Re-edit
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
