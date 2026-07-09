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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface PreviewPanelProps {
  isBuilding: boolean;
  doc: string;
  code?: string | null;
  onPushToGithub: () => void;
  onCodeChange?: (code: string) => void;
}

type Tab = "preview" | "code" | "github";

interface FileNode {
  name: string;
  path: string;
  children?: FileNode[];
  content?: string;
  language?: string;
}

const buildTree = (appCode: string): FileNode => ({
  name: "project",
  path: "project",
  children: [
    {
      name: "src",
      path: "src",
      children: [
        {
          name: "components",
          path: "src/components",
          children: [
            { name: "App.jsx", path: "src/components/App.jsx", content: appCode, language: "javascript" },
          ],
        },
        { name: "hooks", path: "src/hooks", children: [
          { name: "useApp.js", path: "src/hooks/useApp.js", content: "// custom hooks", language: "javascript" },
        ]},
        { name: "lib", path: "src/lib", children: [
          { name: "utils.js", path: "src/lib/utils.js", content: "export const cn = (...c) => c.filter(Boolean).join(' ');", language: "javascript" },
        ]},
        { name: "main.jsx", path: "src/main.jsx", content: "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './components/App';\n\nReactDOM.createRoot(document.getElementById('root')).render(<App />);", language: "javascript" },
      ],
    },
    { name: "index.html", path: "index.html", content: "<!doctype html>\n<html><body><div id=\"root\"></div></body></html>", language: "html" },
    { name: "package.json", path: "package.json", content: "{\n  \"name\": \"appigen-app\",\n  \"version\": \"1.0.0\"\n}", language: "json" },
  ],
});

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
          open ? <FolderOpen className="h-3.5 w-3.5 text-amber-400/80" /> : <Folder className="h-3.5 w-3.5 text-amber-400/80" />
        ) : (
          <FileCode2 className="h-3.5 w-3.5 text-sky-400/80" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isFolder && open && node.children?.map((c) => (
        <FileTreeItem key={c.path} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
};

export const PreviewPanel = ({ isBuilding, doc, code, onPushToGithub, onCodeChange }: PreviewPanelProps) => {
  const [tab, setTab] = useState<Tab>("preview");
  const [nonce, setNonce] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const tree = useMemo(() => buildTree(code || "// Build an app to see generated code here"), [code]);
  const [selectedPath, setSelectedPath] = useState<string>("src/components/App.jsx");
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
    setEditorContent(currentFile?.content || "");
    setDirty(false);
  }, [currentFile, code]);

  const srcDoc = useMemo(() => doc, [doc, nonce]);
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
    if (selectedPath === "src/components/App.jsx" && onCodeChange) {
      onCodeChange(editorContent);
      toast({ title: "💾 Saved", description: "Preview updated with your edits." });
      setDirty(false);
    } else {
      toast({ title: "Saved locally", description: "Only App.jsx updates the preview." });
      setDirty(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-3 pl-0 sm:p-5 sm:pl-0">
      <div className="glass-strong flex h-full min-h-0 flex-col overflow-hidden rounded-xl shadow-elevated">
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
          {isBuilding && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in">
              <div className="flex flex-col items-center gap-3">
                <div className="relative h-12 w-12">
                  <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                  <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
                </div>
                <div className="text-sm font-medium text-foreground">Rendering preview…</div>
                <div className="text-xs text-muted-foreground">Streaming components from AppiGen</div>
              </div>
            </div>
          )}

          {tab === "preview" && (
            <iframe
              ref={iframeRef}
              key={previewKey}
              title="AppiGen Sandbox Preview"
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
              className="h-full w-full border-0 bg-white animate-fade-in"
            />
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
                  {dirty && <span className="text-amber-400">● unsaved</span>}
                </div>
                <div className="flex-1 min-h-0">
                  <Editor
                    height="100%"
                    theme="vs-dark"
                    language={currentFile?.language || "javascript"}
                    value={editorContent}
                    onChange={(v) => { setEditorContent(v ?? ""); setDirty(true); }}
                    onMount={(editor, monaco) => {
                      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, handleSave);
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
