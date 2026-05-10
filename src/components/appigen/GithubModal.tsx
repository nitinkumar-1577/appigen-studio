import { useState } from "react";
import { X, Github as GithubIcon, Check, Loader2, GitBranch, Lock } from "lucide-react";
import { useApp } from "./AppContext";
import { toast } from "@/hooks/use-toast";

const MOCK_REPOS = [
  { name: "appigen-experiments", visibility: "Private", updated: "2h ago" },
  { name: "portfolio-2026", visibility: "Public", updated: "yesterday" },
  { name: "chatbot-starter", visibility: "Public", updated: "3 days ago" },
  { name: "ecommerce-prototype", visibility: "Private", updated: "1 week ago" },
];

interface GithubModalProps { open: boolean; onClose: () => void; }

export const GithubModal = ({ open, onClose }: GithubModalProps) => {
  const { githubConnected, githubUser, connectGithub, disconnectGithub, addNotification } = useApp();
  const [connecting, setConnecting] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);

  if (!open) return null;

  const handleConnect = async () => {
    setConnecting(true);
    await new Promise((r) => setTimeout(r, 900));
    connectGithub("appigen-user");
    setConnecting(false);
  };

  const handlePush = async () => {
    if (!selectedRepo) return;
    setPushing(true);
    await new Promise((r) => setTimeout(r, 1200));
    setPushing(false);
    addNotification({ kind: "github", title: "GitHub Push Complete", description: `Pushed to ${githubUser}/${selectedRepo}` });
    toast({ title: "✅ Pushed to GitHub", description: `${githubUser}/${selectedRepo} · main` });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass-strong relative w-[480px] max-w-[92vw] rounded-2xl p-7 shadow-elevated">
        <button onClick={onClose} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>

        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
            <GithubIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-lg font-bold">Push to GitHub</div>
            <div className="text-xs text-muted-foreground">Export generated code to a repository</div>
          </div>
        </div>

        {!githubConnected ? (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <div className="mb-2 text-sm font-semibold">Connect your GitHub account</div>
              <p className="text-xs text-muted-foreground">AppiGen will request access to your repositories so it can push generated code on your behalf.</p>
              <ul className="mt-3 space-y-1.5 text-xs text-foreground/90">
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary" /> Read your repository list</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary" /> Create commits & branches</li>
                <li className="flex items-center gap-2"><Lock className="h-3.5 w-3.5 text-primary" /> Tokens stored securely</li>
              </ul>
            </div>
            <button onClick={handleConnect} disabled={connecting} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-smooth hover:opacity-90 disabled:opacity-70">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <GithubIcon className="h-4 w-4" />}
              {connecting ? "Authorizing…" : "Authorize GitHub"}
            </button>
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 p-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background"><GithubIcon className="h-4 w-4" /></div>
                <div>
                  <div className="text-xs font-semibold">@{githubUser}</div>
                  <div className="text-[11px] text-[hsl(140_60%_55%)]">● Connected</div>
                </div>
              </div>
              <button onClick={disconnectGithub} className="text-[11px] text-muted-foreground hover:text-destructive">Disconnect</button>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-foreground">Select target repository</div>
              <div className="max-h-[220px] space-y-1.5 overflow-auto pr-1">
                {MOCK_REPOS.map((r) => (
                  <button key={r.name} onClick={() => setSelectedRepo(r.name)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-smooth ${selectedRepo === r.name ? "border-primary bg-primary/10" : "border-border bg-secondary/30 hover:border-primary/40"}`}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">{r.name}</div>
                        <div className="text-[10px] text-muted-foreground">{r.visibility} · updated {r.updated}</div>
                      </div>
                    </div>
                    {selectedRepo === r.name && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handlePush} disabled={!selectedRepo || pushing} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-smooth hover:brightness-110 disabled:opacity-50">
              {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <GithubIcon className="h-4 w-4" />}
              {pushing ? "Pushing…" : selectedRepo ? `Push to ${selectedRepo}` : "Select a repository"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
