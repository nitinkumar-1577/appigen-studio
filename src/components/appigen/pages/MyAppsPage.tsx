import { useEffect, useMemo, useState } from "react";
import { Search, ChevronDown, Play, Pencil, Plus, Loader2, Inbox, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "../AppContext";
import { toast } from "@/hooks/use-toast";

type Sort = "newest" | "name";

export type ProjectRow = {
  id: string;
  title: string;
  prompt: string;
  code: string;
  thumbnail: string | null;
  created_at: string;
};

interface MyAppsPageProps {
  onNavigate: (v: any) => void;
  onOpenProject?: (p: ProjectRow) => void;
}

const hueFromString = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

export const MyAppsPage = ({ onNavigate, onOpenProject }: MyAppsPageProps) => {
  const { user } = useApp();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ProjectRow[]>([]);

  const load = async () => {
    if (!user) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select("id, title, prompt, code, thumbnail, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Couldn't load projects", description: error.message, variant: "destructive" });
    }
    setRows((data ?? []) as ProjectRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.email]);

  const list = useMemo(() => {
    const f = rows.filter((a) => a.title.toLowerCase().includes(q.toLowerCase()));
    return f.sort((a, b) =>
      sort === "name" ? a.title.localeCompare(b.title) : b.created_at.localeCompare(a.created_at)
    );
  }, [q, sort, rows]);

  const handleDelete = async (id: string) => {
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== id));
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) {
      setRows(prev);
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "🗑️ Project deleted" });
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
                    className="relative block h-32 w-full overflow-hidden text-left"
                    style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 30%), hsl(${(hue + 30) % 360} 80% 18%))` }}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_30%,rgba(255,255,255,0.18),transparent_70%)]" />
                    <div className="absolute bottom-2 right-2 rounded-md bg-black/40 px-2 py-0.5 text-[10px] font-mono text-white/80 backdrop-blur">
                      AI Build
                    </div>
                  </button>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{a.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Created {new Date(a.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(a.id)}
                        title="Delete project"
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
