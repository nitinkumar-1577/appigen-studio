import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  Code2,
  Eye,
  RefreshCw,
  Maximize2,
  Github as GithubIcon,
  Folder,
  FolderOpen,
  FileCode2,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { parseFileMarkers, updateProjectFile } from "@/lib/preview/parseFileMarkers";
import type { LocalProjectVersion } from "@/lib/projects/projectStorage";
import { Button } from "@/components/ui/button";

interface PreviewPanelProps {
  isBuilding: boolean;
  doc: string;
  code?: string | null;
  onPushToGithub: () => void;
  onCodeChange?: (code: string) => void;
  versions: LocalProjectVersion[];
  onRestoreVersion: (version: LocalProjectVersion) => void;
  onDeleteVersion: (version: LocalProjectVersion) => void;
  onClearVersions: () => void;
  onManualFix: () => void;
  fixing: boolean;
}

type Tab = "preview" | "code" | "github";
interface FileNode {
  name: string;
  path: string;
  children?: FileNode[];
  content?: string;
  language?: string;
}

const buildTree = (appCode: string): FileNode => {
  const files = parseFileMarkers(appCode)?.files ?? { "src/App.tsx": appCode };
  const root: FileNode = { name: "project", path: "project", children: [] };
  Object.entries(files).forEach(([path, content]) => {
    const parts = path.split("/");
    let parent = root;
    parts.forEach((part, index) => {
      const currentPath = parts.slice(0, index + 1).join("/");
      let node = parent.children?.find((item) => item.name === part);
      if (!node) {
        node = { name: part, path: currentPath, children: index < parts.length - 1 ? [] : undefined };
        parent.children?.push(node);
      }
      if (index === parts.length - 1) {
        node.content = content;
        node.language = part.endsWith(".tsx") || part.endsWith(".ts") ? "typescript" : part.endsWith(".css") ? "css" : part.endsWith(".json") ? "json" : part.endsWith(".html") ? "html" : "javascript";
      } else parent = node;
    });
  });
  const sortNodes = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      const aFolder = Boolean(a.children);
      const bFolder = Boolean(b.children);
      if (aFolder !== bFolder) return aFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => node.children && sortNodes(node.children));
  };
  sortNodes(root.children ?? []);
  return root;
};

const FileTreeItem = ({
  node,
  depth = 0,
  selected,
  onSelect,
}: { node: FileNode; depth?: number; selected: string; onSelect: (n: FileNode) => void }) => {
  const [open, setOpen] = useState(true);
  const isFolder = !!node.children;
  const isSelected = selected === node.path;

  return (
    <div>
      <button
        onClick={() => (isFolder ? setOpen((o) => !o) : onSelect(node))}
        className={cn(
          "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[12px] transition-colors hover:bg-secondary/60",
          isSelected && !isFolder && "bg-primary/15 text-primary"
        )}
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        {isFolder ? (
          open ? <FolderOpen className="h-3.5 w-3.5 text-warning" /> : <Folder className="h-3.5 w-3.5 text-warning" />
        ) : (
          <FileCode2 className="h-3.5 w-3.5 text-primary" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isFolder && open && node.children?.map((c) => (
        <FileTreeItem key={c.path} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
};

export const PreviewPanel = ({ isBuilding, doc, code, onPushToGithub, onCodeChange, versions, onRestoreVersion, onDeleteVersion, onClearVersions, onManualFix, fixing }: PreviewPanelProps) => {
  const [tab, setTab] = useState<Tab>("preview");
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handleSaveRef = useRef<() => void>(() => {});

  const tree = useMemo(() => buildTree(code || "// Build an app to see generated code here"), [code]);
  const entryPath = useMemo(() => parseFileMarkers(code || "")?.entry || "src/App.tsx", [code]);
  const [selectedPath, setSelectedPath] = useState<string>("src/App.tsx");
  const [editorContent, setEditorContent] = useState<string>(code || "");
  const [dirty, setDirty] = useState(false);

  // Find current file
  const currentFile = useMemo(() => {
    const find = (n: FileNode): FileNode | null => {
      if (n.path === selectedPath && !n.children) return n;
      for (const c of n.children || []) { const r = find(c); if (r) return r; }
      return null;
    };
    return find(tree);
  }, [tree, selectedPath]);

  useEffect(() => {
    const find = (n: FileNode): boolean => n.path === selectedPath && !n.children || !!n.children?.some(find);
    if (!find(tree)) setSelectedPath(entryPath);
  }, [tree, entryPath, selectedPath]);

  useEffect(() => {
    setEditorContent(currentFile?.content || "");
    setDirty(false);
  }, [currentFile, code]);

  const srcDoc = doc;
  const previewKey = useMemo(() => `${nonce}-${doc.length}-${doc.slice(0, 128)}`, [doc, nonce]);
  const handleRefresh = () => setNonce((n) => n + 1);
  const handleFullscreen = async () => {
    try {
      if (!iframeRef.current?.requestFullscreen) return;
      await iframeRef.current.requestFullscreen();
    } catch (error) {
      toast({
        title: "Fullscreen unavailable",
        description: "Your browser blocked fullscreen for this preview.",
        variant: "destructive",
      });
    }
  };

  const handleSave = () => {
    if (!onCodeChange || !currentFile) return;
    try {
      const updatedCode = updateProjectFile(code || "", selectedPath, editorContent);
      onCodeChange(updatedCode);
      toast({ title: "💾 Saved", description: "Preview updated with your edits." });
      setDirty(false);
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not update this project file.",
        variant: "destructive",
      });
    }
  };
  handleSaveRef.current = handleSave;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col p-3 sm:p-5 lg:pl-0">
      <div className="glass-strong flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl shadow-elevated">
        {/* Top bar - tabs left aligned */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-surface/60 px-3 py-2">
          <div className="flex items-center rounded-lg border border-border/60 bg-background/40 p-0.5">
            <button
              onClick={() => setTab("preview")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-smooth",
                tab === "preview" ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </button>
            <button
              onClick={() => setTab("code")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-smooth",
                tab === "code" ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Code2 className="h-3.5 w-3.5" />
              Code
            </button>
            <button
              onClick={() => { setTab("github"); onPushToGithub(); }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-smooth",
                tab === "github" ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <GithubIcon className="h-3.5 w-3.5" />
              GitHub Push
            </button>
          </div>

          <div className="ml-auto flex items-center gap-1">
            {tab === "code" && (
              <button
                onClick={handleSave}
                disabled={!dirty}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold transition-smooth",
                  dirty
                    ? "border-primary/50 bg-primary/15 text-primary hover:bg-primary/25"
                    : "border-border bg-secondary/40 text-muted-foreground"
                )}
                title="Save (Ctrl/Cmd+S)"
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </button>
            )}
            <div className="relative">
              <Button variant="secondary" size="sm" onClick={() => setVersionMenuOpen((open) => !open)} aria-expanded={versionMenuOpen}>Versions ({versions.length})</Button>
              {versionMenuOpen && <div className="absolute right-0 top-11 z-20 max-h-72 w-[min(20rem,calc(100vw-2rem))] overflow-auto rounded-lg border border-border bg-surface-elevated p-1 shadow-elevated">
                <button type="button" onClick={onClearVersions} className="mb-1 w-full rounded-md px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-destructive hover:bg-destructive/10">Clear all versions</button>
                {versions.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">No saved versions</div>
                ) : versions.map((version) => (
                  <div key={version.id} className="flex min-h-10 items-center gap-2 rounded-md px-2 py-1 hover:bg-secondary">
                    <button onClick={() => onRestoreVersion(version)} className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-1 py-1 text-left text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="truncate">{version.prompt}</span><time className="shrink-0 text-muted-foreground">{new Date(version.createdAt).toLocaleString()}</time>
                    </button>
                    <button
                      onClick={() => onDeleteVersion(version)}
                      aria-label={`Delete version ${version.prompt}`}
                      title="Delete version"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>}
            </div>
            {tab === "preview" && code && <Button variant="secondary" size="sm" onClick={onManualFix} loading={fixing}>Fix with AI</Button>}
            <button
              onClick={handleRefresh}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground"
              title="Reload preview"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleFullscreen}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground"
              title="Fullscreen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="relative flex min-h-0 flex-1 overflow-hidden bg-background/40">
          {tab === "preview" && (
            <div className="flex min-h-0 w-full flex-1 flex-col gap-2 overflow-auto p-2 sm:p-3">
              <div className="flex min-h-[260px] flex-1 justify-center overflow-auto rounded-xl border border-border bg-[#0b0d14] p-1.5 shadow-soft">
                {!code && !isBuilding && <PreviewEmptyState />}
                {code && !isBuilding && (
                  <iframe
                    ref={iframeRef}
                    key={previewKey}
                    title="AppiGen Sandbox Preview"
                    srcDoc={srcDoc}
                    sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin allow-downloads"
                    style={{ width: "100%" }}
                    className="h-full min-h-[260px] max-w-full shrink-0 rounded-lg border-0 bg-background animate-fade-in"
                  />
                )}
                {isBuilding && <PreviewEmptyState loading />}
              </div>
            </div>
          )}

          {tab === "code" && (
            <div className="flex h-full w-full min-h-0">
              {/* File tree */}
              <aside className="hidden sm:flex w-52 shrink-0 flex-col overflow-y-auto border-r border-border/60 bg-background/50 py-2">
                <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Explorer</div>
                <div className="px-1">
                  <FileTreeItem node={tree} selected={selectedPath} onSelect={(n) => setSelectedPath(n.path)} />
                </div>
              </aside>
              {/* Editor */}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
                  <span className="font-mono truncate">{selectedPath}</span>
                  {dirty && <span className="text-warning">● unsaved</span>}
                </div>
                <div className="flex-1 min-h-0">
                  <Editor
                    height="100%"
                    theme="vs-dark"
                    language={currentFile?.language || "javascript"}
                    value={editorContent}
                    onChange={(v) => { setEditorContent(v ?? ""); setDirty(true); }}
                    onMount={(editor, monaco) => {
                      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => handleSaveRef.current());
                    }}
                    options={{
                      fontSize: 12,
                      minimap: { enabled: false },
                      wordWrap: "on",
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {tab === "github" && (
            <div className="flex h-full w-full items-center justify-center p-6 text-center">
              <div className="max-w-sm">
                <GithubIcon className="mx-auto h-10 w-10 text-foreground/70" />
                <h3 className="mt-3 text-base font-semibold text-foreground">Push to GitHub</h3>
                <p className="mt-1 text-xs text-muted-foreground">Opening the GitHub publish dialog…</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const PreviewEmptyState = ({ loading = false }: { loading?: boolean }) => (
  <div className="relative flex h-full min-h-[360px] w-full items-center justify-center overflow-hidden bg-[#0b0d14] p-4 sm:p-8" role={loading ? "status" : undefined} aria-label={loading ? "App preview loading" : "Empty app preview"}>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_15%,rgba(129,104,255,0.16),transparent_60%)]" />
    <div className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-violet-300/20 bg-violet-300/[0.08] px-2.5 py-1 text-[10px] font-medium tracking-wide text-violet-100/75 shadow-[0_0_24px_rgba(139,92,246,0.12)] backdrop-blur">
      <Sparkles className="h-3 w-3 text-violet-300" /> AppiGen Generated
    </div>
    <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-white/[0.09] bg-[#10131c]/90 shadow-[0_28px_100px_rgba(0,0,0,0.48)]">
      <div className="flex h-10 items-center gap-2 border-b border-white/[0.07] px-4">
        <span className="h-2 w-2 rounded-full bg-white/15" /><span className="h-2 w-2 rounded-full bg-white/15" /><span className="h-2 w-2 rounded-full bg-white/15" />
        <div className="mx-auto h-5 w-[42%] rounded-md border border-white/[0.06] bg-white/[0.025]" />
      </div>
      <div className="grid min-h-[310px] grid-cols-[68px_1fr] sm:grid-cols-[152px_1fr]">
        <div className="space-y-5 border-r border-white/[0.06] p-3 sm:p-5">
          <div className="h-6 w-6 rounded-lg bg-violet-300/15 sm:w-24" />
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((line) => <div key={line} className={`h-2 rounded-full bg-white/[0.07] ${line === 0 ? "w-full bg-violet-300/20" : "w-4/5"}`} />)}
          </div>
          <div className="hidden h-16 rounded-xl border border-white/[0.05] bg-white/[0.025] sm:block" />
        </div>
        <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="w-2/3 space-y-2"><div className="h-4 w-3/5 rounded bg-white/10" /><div className="h-2.5 w-4/5 rounded bg-white/[0.055]" /></div>
            <div className="h-8 w-20 rounded-lg bg-violet-400/20" />
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {[0, 1, 2].map((card) => <div key={card} className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5 sm:p-3.5"><div className="h-2 w-3/4 rounded bg-white/[0.07]" /><div className="h-4 w-1/2 rounded bg-white/10" /><div className="h-1.5 w-full rounded bg-emerald-300/15" /></div>)}
          </div>
          <div className="grid grid-cols-[1fr_0.7fr] gap-3">
            <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 sm:p-4">
              <div className="h-2.5 w-1/3 rounded bg-white/10" />
              <div className="flex h-24 items-end gap-1.5 sm:h-32 sm:gap-2">{[32, 48, 39, 67, 52, 82, 62, 92, 69, 78, 56, 86].map((height, index) => <div key={index} className="flex-1 rounded-t-sm bg-gradient-to-t from-violet-500/20 to-violet-300/40" style={{ height: `${height}%`, animationDelay: `${index * 75}ms` }} />)}</div>
            </div>
            <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 sm:p-4">
              <div className="h-2.5 w-2/3 rounded bg-white/10" />
              <div className="mx-auto mt-2 h-16 w-16 rounded-full border-[7px] border-violet-300/30 border-r-cyan-300/20 sm:h-20 sm:w-20" />
              <div className="mx-auto h-2 w-2/3 rounded bg-white/[0.07]" />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div className="absolute bottom-7 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#171923]/95 px-4 py-2.5 shadow-xl backdrop-blur-md">
      <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400" /></span>
      <span className="whitespace-nowrap text-xs font-medium text-white/80">{loading ? "Building your live preview…" : "Your generated app will appear here"}</span>
    </div>
  </div>
);
