import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Code2,
  Eye,
  RefreshCw,
  Maximize2,
  Folder,
  FolderOpen,
  FileCode2,
  Save,
  Sparkles,
  Trash2,
  Monitor,
  Tablet,
  Smartphone,
  MousePointerClick,
  AlertTriangle,
  X,
  ShieldCheck,
  Activity,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { parseFileMarkers, updateProjectFile } from "@/lib/preview/parseFileMarkers";
import type { LocalProjectVersion } from "@/lib/projects/projectStorage";
import { Button } from "@/components/ui/button";
import type { QualityState, CheckStatus, RepairAttempt } from "@/lib/projects/qualityEngine";
import { formatChangeRecord } from "@/lib/projects/changeTracking";

interface PreviewPanelProps {
  isBuilding: boolean;
  doc: string;
  code?: string | null;
  workingCode?: string | null;
  baseCode?: string | null;
  onCodeChange?: (code: string) => void;
  versions: LocalProjectVersion[];
  onRestoreVersion: (version: LocalProjectVersion) => void;
  onDeleteVersion: (version: LocalProjectVersion) => void;
  onClearVersions: () => void;
  onManualFix: (issue?: string) => void;
  fixing: boolean;
  quality?: QualityState | null;
  onRunQuality?: () => void;
  qualityRunning?: boolean;
  onRollbackRepair?: (attempt: RepairAttempt) => void;
}

type Tab = "preview" | "code" | "changes" | "history" | "quality";
type Device = "desktop" | "tablet" | "mobile";
const Editor = lazy(() => import("@monaco-editor/react"));
interface FileNode {
  name: string;
  path: string;
  children?: FileNode[];
  content?: string;
  language?: string;
}

interface PreviewErrorState {
  kind: string;
  message: string;
  stack?: string;
}

interface SelectedElement {
  tag: string;
  id: string;
  className: string;
  text: string;
  path: string;
  styles: Record<string, string>;
}

type FileChangeStatus = "added" | "modified" | "unchanged" | "removed";
interface FileChangeItem {
  path: string;
  status: FileChangeStatus;
  before: string;
  after: string;
}

const DEVICES: Record<Device, { label: string; width: number | "100%"; height: number | "100%"; icon: typeof Monitor }> = {
  desktop: { label: "Desktop", width: "100%", height: "100%", icon: Monitor },
  tablet: { label: "Tablet", width: 768, height: 1024, icon: Tablet },
  mobile: { label: "Mobile", width: 390, height: 844, icon: Smartphone },
};

const unifiedLines = (before: string, after: string) => {
  const oldLines = before.split("\n").slice(0, 180);
  const newLines = after.split("\n").slice(0, 180);
  const table = Array.from({ length: oldLines.length + 1 }, () => new Uint16Array(newLines.length + 1));
  for (let i = oldLines.length - 1; i >= 0; i--) for (let j = newLines.length - 1; j >= 0; j--) {
    table[i][j] = oldLines[i] === newLines[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const output: string[] = [];
  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) { output.push(`  ${oldLines[i]}`); i++; j++; }
    else if (i < oldLines.length && (j >= newLines.length || table[i + 1][j] >= table[i][j + 1])) output.push(`− ${oldLines[i++]}`);
    else output.push(`+ ${newLines[j++]}`);
  }
  if (before.split("\n").length > oldLines.length || after.split("\n").length > newLines.length) output.push("… diff truncated after 180 lines");
  return output.join("\n");
};

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyVisualEdit(source: string, selectedPath: string, element: SelectedElement, patch: { text?: string; style?: { prop: string; value: string } }): { code: string; file: string } | { error: string } {
  const parsed = parseFileMarkers(source);
  const files = parsed?.files ?? { [selectedPath]: source };
  const candidates = [selectedPath, "src/App.tsx", "src/App.jsx", ...Object.keys(files)].filter((p, i, arr) => files[p] && arr.indexOf(p) === i);

  const tryInFile = (path: string): string | null => {
    const content = files[path];
    if (!content) return null;
    if (patch.text !== undefined) {
      const needle = element.text.trim();
      if (!needle || needle.length < 2 || needle.length > 80) return null;
      // avoid replacing in obviously wrong contexts by requiring it appears as JSX text/attribute value
      const patterns = [
        new RegExp(`(>\\s*)${escapeRegExp(needle)}(\\s*<)`),
        new RegExp(`(["'\`])${escapeRegExp(needle)}\\1`),
      ];
      for (const re of patterns) {
        const m = re.exec(content);
        if (m) return content.slice(0, m.index) + m[0].replace(needle, patch.text) + content.slice(m.index + m[0].length);
      }
      // fallback: unique plain occurrence
      const idx = content.indexOf(needle);
      if (idx !== -1 && content.indexOf(needle, idx + needle.length) === -1) {
        return content.slice(0, idx) + patch.text + content.slice(idx + needle.length);
      }
      return null;
    }
    if (patch.style) {
      const { prop, value } = patch.style;
      if (!value.trim()) return null;
      const classToken = element.className.split(/\s+/).find((c) => c && c.length > 2);
      if (classToken) {
        // try to inject/replace inline style in a tag that contains this class token
        const tagRe = new RegExp(`(<${element.tag}\\b[^>]*\\bclassName=["'\`][^"'\`]*\\b${escapeRegExp(classToken)}\\b[^"'\`]*["'\`][^>]*)(>)`);
        const tm = tagRe.exec(content);
        if (tm) {
          const tag = tm[1];
          if (/style=\{\{[^}]*\}\}/.test(tag)) {
            const updatedTag = tag.replace(/style=\{\{([^}]*)\}\}/, (_m, inner) => {
              const cleaned = inner.replace(new RegExp(`${prop}\\s*:\\s*[^,}]+,?\\s*`), "").replace(/,\s*$/, "");
              const sep = cleaned.trim() ? ", " : "";
              return `style={{ ${cleaned.trim()}${sep}${prop}: "${value}" }}`;
            });
            return content.slice(0, tm.index) + updatedTag + tm[2] + content.slice(tm.index + tm[0].length);
          }
          return content.slice(0, tm.index) + `${tag} style={{ ${prop}: "${value}" }}${tm[2]}` + content.slice(tm.index + tm[0].length);
        }
      }
      return null;
    }
    return null;
  };

  for (const path of candidates) {
    const updated = tryInFile(path);
    if (updated != null && updated !== files[path]) {
      if (parsed) return { code: formatFileMarkers({ ...files, [path]: updated }), file: path };
      return { code: updated, file: path };
    }
  }
  return { error: "Could not safely map this element to source. Edit the related file in Code view." };
}

function formatFileMarkers(files: Record<string, string>): string {
  return Object.entries(files).map(([path, content]) => `// FILE: ${path}\n${content}`).join("\n\n");
}

export const PreviewPanel = ({ isBuilding, doc, code, workingCode, baseCode, onCodeChange, versions, onRestoreVersion, onDeleteVersion, onClearVersions, onManualFix, fixing, quality, onRunQuality, qualityRunning, onRollbackRepair }: PreviewPanelProps) => {
  const [tab, setTab] = useState<Tab>("preview");
  const [device, setDevice] = useState<Device>("desktop");
  const [nonce, setNonce] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const handleSaveRef = useRef<() => void>(() => {});
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  const [previewError, setPreviewError] = useState<PreviewErrorState | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [visualText, setVisualText] = useState("");
  const [visualStyleProp, setVisualStyleProp] = useState("color");
  const [visualStyleValue, setVisualStyleValue] = useState("");

  const explorerCode = workingCode ?? code;
  const tree = useMemo(() => buildTree(explorerCode || "// Build an app to see generated code here"), [explorerCode]);
  const changes = useMemo<FileChangeItem[]>(() => {
    const current = parseFileMarkers(code || "")?.files ?? (code ? { "src/App.tsx": code } : {});
    const previous = parseFileMarkers(baseCode || "")?.files ?? (baseCode ? { "src/App.tsx": baseCode } : {});
    const currentEntries: FileChangeItem[] = Object.entries(current).map(([path, content]) => ({
      path,
      status: !(path in previous) ? "added" : previous[path] === content ? "unchanged" : "modified",
      before: previous[path] ?? "",
      after: content,
    }));
    const removedEntries: FileChangeItem[] = Object.entries(previous)
      .filter(([path]) => !(path in current))
      .map(([path, content]) => ({ path, status: "removed", before: content, after: "" }));
    return [...currentEntries, ...removedEntries];
  }, [baseCode, code]);
  const entryPath = useMemo(() => parseFileMarkers(explorerCode || "")?.entry || "src/App.tsx", [explorerCode]);
  const [selectedPath, setSelectedPath] = useState<string>("src/App.tsx");
  const [editorContent, setEditorContent] = useState<string>(explorerCode || "");
  const [dirty, setDirty] = useState(false);

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
  }, [currentFile, explorerCode]);

  // reset preview state on doc/build changes; keep device/tab/editor selection
  useEffect(() => {
    setPreviewError(null);
    setPreviewReady(false);
    setSelectedElement(null);
  }, [doc, nonce, isBuilding]);

  // listen for preview runtime messages
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.__appigen !== true) return;
      const kind = String(data.kind || "");
      if (kind === "ready") {
        setPreviewReady(true);
        setPreviewError((prev) => (prev?.kind === "blank" ? null : prev));
      } else if (["error", "promise", "compile", "render", "blank", "console"].includes(kind)) {
        setPreviewError({ kind, message: String(data.message || "Preview error"), stack: typeof data.stack === "string" ? data.stack : undefined });
      } else if (kind === "visual-select" && data.element && typeof data.element === "object") {
        const el = data.element as SelectedElement;
        setSelectedElement(el);
        setVisualText(el.text || "");
      } else if (kind === "inspect-mode") {
        setInspectMode(Boolean(data.enabled));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // observe viewport for responsive device scaling
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setViewportSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try { win.postMessage({ __appigenCmd: "inspect", enabled: inspectMode }, "*"); } catch { /* ignore */ }
  }, [inspectMode, previewReady, nonce, doc]);

  const previewKey = useMemo(() => `${nonce}-${doc.length}-${doc.slice(0, 96)}`, [doc, nonce]);
  const handleRefresh = () => {
    setNonce((n) => n + 1);
    setPreviewError(null);
    setPreviewReady(false);
  };
  const handleFullscreen = async () => {
    try {
      if (!iframeRef.current?.requestFullscreen) return;
      await iframeRef.current.requestFullscreen();
    } catch {
      toast({ title: "Fullscreen unavailable", description: "Your browser blocked fullscreen for this preview.", variant: "destructive" });
    }
  };

  const handleSave = () => {
    if (isBuilding || !onCodeChange || !currentFile) return;
    try {
      const updatedCode = updateProjectFile(explorerCode || "", selectedPath, editorContent);
      onCodeChange(updatedCode);
      toast({ title: "Saved", description: "Preview updated with your edits." });
      setDirty(false);
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "Could not update this project file.", variant: "destructive" });
    }
  };
  handleSaveRef.current = handleSave;

  const applyVisual = (patch: { text?: string; style?: { prop: string; value: string } }) => {
    if (!selectedElement || !onCodeChange || !explorerCode) {
      toast({ title: "Visual edit unavailable", description: "Select an element and ensure code is available.", variant: "destructive" });
      return;
    }
    const result = applyVisualEdit(explorerCode, selectedPath, selectedElement, patch);
    if ("error" in result) {
      toast({ title: "Safe fallback", description: result.error });
      return;
    }
    onCodeChange(result.code);
    toast({ title: "Applied to source", description: `Updated ${result.file} and refreshed preview.` });
  };

  const deviceConfig = DEVICES[device];
  const frameStyle: CSSProperties = (() => {
    if (device === "desktop" || deviceConfig.width === "100%" || deviceConfig.height === "100%") {
      return { width: "100%", height: "100%" };
    }
    const pad = 24;
    const availW = Math.max(0, viewportSize.w - pad);
    const availH = Math.max(0, viewportSize.h - pad);
    const scale = availW && availH ? Math.min(1, availW / (deviceConfig.width as number), availH / (deviceConfig.height as number)) : 1;
    return {
      width: deviceConfig.width,
      height: deviceConfig.height,
      transform: `scale(${scale})`,
      transformOrigin: "top center",
    };
  })();

  const showFrame = Boolean(code) || isBuilding;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col p-3 sm:p-5 lg:pl-0">
      <div className="glass-strong flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl shadow-elevated">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-surface/60 px-3 py-2">
          <div className="flex items-center rounded-lg border border-border/60 bg-background/40 p-0.5">
            {([
              { id: "preview" as const, label: "Preview", icon: Eye },
              { id: "code" as const, label: "Code", icon: Code2 },
              { id: "changes" as const, label: "Changes", icon: null },
              { id: "history" as const, label: `History (${versions.length})`, icon: null },
              { id: "quality" as const, label: "Quality", icon: ShieldCheck },
            ]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-smooth",
                  tab === t.id ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.icon ? <t.icon className="h-3.5 w-3.5" /> : null}
                {t.label}
              </button>
            ))}
          </div>

          {tab === "preview" && code && (
            <div className="flex items-center rounded-lg border border-border/60 bg-background/40 p-0.5" aria-label="Device preview">
              {(Object.keys(DEVICES) as Device[]).map((d) => {
                const Icon = DEVICES[d].icon;
                return (
                  <button
                    key={d}
                    onClick={() => setDevice(d)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-200",
                      device === d ? "bg-secondary text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
                    )}
                    title={DEVICES[d].label}
                    aria-label={DEVICES[d].label}
                    aria-pressed={device === d}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{DEVICES[d].label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="ml-auto flex items-center gap-1">
            {tab === "preview" && code && (
              <button
                onClick={() => setInspectMode((v) => !v)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold transition-smooth",
                  inspectMode ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
                )}
                title="Select elements in preview for visual editing"
                aria-pressed={inspectMode}
              >
                <MousePointerClick className="h-3.5 w-3.5" />
                Select
              </button>
            )}
            {tab === "code" && (
              <button
                onClick={handleSave}
                disabled={!dirty || isBuilding}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold transition-smooth",
                  dirty && !isBuilding ? "border-primary/50 bg-primary/15 text-primary hover:bg-primary/25" : "border-border bg-secondary/40 text-muted-foreground"
                )}
                title="Save (Ctrl/Cmd+S)"
              >
                <Save className="h-3.5 w-3.5" />
                Save{dirty ? " ●" : ""}
              </button>
            )}
            {tab === "preview" && code && <Button variant="secondary" size="sm" onClick={() => onManualFix()} loading={fixing}>Fix with AI</Button>}
            <button onClick={handleRefresh} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground" title="Reload preview" aria-label="Reload preview">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button onClick={handleFullscreen} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground" title="Fullscreen" aria-label="Fullscreen preview">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 overflow-hidden bg-background/40">
          {tab === "preview" && (
            <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
              {previewError && code && (
                <div className="mx-2 mt-2 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-foreground sm:mx-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-destructive">Preview {previewError.kind}</div>
                    <div className="truncate whitespace-pre-wrap break-words text-muted-foreground">{previewError.message}</div>
                    {previewError.stack ? <pre className="mt-1 max-h-24 overflow-auto text-[10px] text-muted-foreground">{previewError.stack}</pre> : null}
                  </div>
                  <button onClick={() => setPreviewError(null)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Dismiss preview error"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}
              <div ref={viewportRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-2 sm:p-3">
                <div
                  className={cn(
                    "relative flex items-center justify-center overflow-hidden rounded-xl border border-border bg-[#0b0d14] shadow-soft transition-all duration-300 ease-out",
                    device === "desktop" ? "h-full min-h-[260px] w-full" : "max-h-full max-w-full"
                  )}
                  style={device === "desktop" ? undefined : { width: frameStyle.width, height: frameStyle.height }}
                >
                  {!showFrame && !isBuilding && <PreviewEmptyState />}
                  {showFrame && (
                    <div className={cn("relative h-full w-full origin-top transition-transform duration-300 ease-out", device !== "desktop" && "mx-auto")} style={device === "desktop" ? { width: "100%", height: "100%" } : frameStyle}>
                      <iframe
                        ref={iframeRef}
                        key={previewKey}
                        title="AppiGen Sandbox Preview"
                        srcDoc={doc}
                        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin allow-downloads"
                        className="h-full w-full rounded-lg border-0 bg-background"
                        style={{ width: device === "desktop" ? "100%" : (deviceConfig.width as number), height: device === "desktop" ? "100%" : (deviceConfig.height as number) }}
                      />
                      {(isBuilding || (!previewReady && code)) && (
                        <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-4">
                          <div className="rounded-full border border-white/10 bg-[#171923]/95 px-4 py-2 text-xs font-medium text-white/80 shadow-xl backdrop-blur-md">
                            {isBuilding ? "Building and updating preview…" : "Loading preview…"}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {isBuilding && !code && <PreviewEmptyState loading />}
                </div>
              </div>
              {inspectMode && code && (
                <div className="border-t border-border/60 bg-background/60 p-3 text-xs">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold text-foreground">Visual selection</span>
                    <span className="text-[11px] text-muted-foreground">Click an element in the preview to inspect. If mapping is ambiguous, edit in Code view.</span>
                  </div>
                  {!selectedElement ? (
                    <p className="text-muted-foreground">No element selected yet.</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1 rounded-lg border border-border/60 bg-secondary/20 p-2.5">
                        <div><span className="text-muted-foreground">Tag:</span> <code>&lt;{selectedElement.tag}&gt;</code></div>
                        {selectedElement.id ? <div><span className="text-muted-foreground">ID:</span> <code>#{selectedElement.id}</code></div> : null}
                        {selectedElement.className ? <div className="truncate"><span className="text-muted-foreground">Class:</span> <code>{selectedElement.className}</code></div> : null}
                        <div className="truncate"><span className="text-muted-foreground">Path:</span> <code>{selectedElement.path || "(unavailable)"}</code></div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-1 text-[11px] text-muted-foreground">
                          <span>color: {selectedElement.styles.color}</span>
                          <span>bg: {selectedElement.styles.backgroundColor}</span>
                          <span>font: {selectedElement.styles.fontSize}/{selectedElement.styles.fontWeight}</span>
                          <span>align: {selectedElement.styles.textAlign}</span>
                        </div>
                      </div>
                      <div className="space-y-2 rounded-lg border border-border/60 bg-secondary/20 p-2.5">
                        <label className="block text-[11px] font-medium text-muted-foreground">Text content</label>
                        <div className="flex gap-2">
                          <input value={visualText} onChange={(e) => setVisualText(e.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder={selectedElement.text ? "Edit text" : "No text content"} />
                          <Button size="sm" variant="secondary" onClick={() => applyVisual({ text: visualText })} disabled={!visualText.trim() || !selectedElement.text}>Apply text</Button>
                        </div>
                        <label className="block text-[11px] font-medium text-muted-foreground">Style / layout (inline)</label>
                        <div className="flex flex-wrap gap-2">
                          <select value={visualStyleProp} onChange={(e) => setVisualStyleProp(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
                            {[
                              ["color", "Text color"],
                              ["backgroundColor", "Background"],
                              ["fontSize", "Font size"],
                              ["fontWeight", "Font weight"],
                              ["padding", "Padding"],
                              ["margin", "Margin"],
                              ["textAlign", "Text align"],
                              ["borderRadius", "Radius"],
                              ["width", "Width"],
                              ["height", "Height"],
                            ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <input value={visualStyleValue} onChange={(e) => setVisualStyleValue(e.target.value)} className="min-w-[120px] flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder="e.g. #2563eb, 16px, center" />
                          <Button size="sm" variant="secondary" onClick={() => applyVisual({ style: { prop: visualStyleProp, value: visualStyleValue } })} disabled={!visualStyleValue.trim()}>Apply style</Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Applies to matching source when confidently identifiable; otherwise reports a safe fallback.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "code" && (
            <div className="flex h-full w-full min-h-0">
              <aside className="hidden w-52 shrink-0 flex-col overflow-y-auto border-r border-border/60 bg-background/50 py-2 sm:flex">
                <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Explorer</div>
                <div className="px-1">
                  <FileTreeItem node={tree} selected={selectedPath} onSelect={(n) => setSelectedPath(n.path)} />
                </div>
              </aside>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
                  <span className="truncate font-mono">{selectedPath}</span>
                  <span className={cn(dirty ? "font-medium text-warning" : "text-muted-foreground")}>{dirty ? "● unsaved changes" : "saved"}</span>
                </div>
                <div className="min-h-0 flex-1">
                  <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading code editor…</div>}>
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
                        readOnly: isBuilding,
                        minimap: { enabled: false },
                        wordWrap: "on",
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                      }}
                    />
                  </Suspense>
                </div>
              </div>
            </div>
          )}

          {tab === "changes" && <div className="h-full w-full overflow-auto p-3 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><h3 className="text-sm font-semibold">Project changes</h3><p className="text-xs text-muted-foreground">Compared with the source before the latest build.</p></div>
              <div className="flex gap-2 text-[10px] text-muted-foreground"><span>+{changes.filter((item) => item.status === "added").length} added</span><span>~{changes.filter((item) => item.status === "modified").length} modified</span><span>{changes.filter((item) => item.status === "unchanged").length} unchanged</span></div>
            </div>
            {changes.length === 0 ? <p className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">Build a project to see its files.</p> : <div className="space-y-2">
              {changes.map((item) => <details key={item.path} className="rounded-lg border border-border/70 bg-background/40" open={item.status === "modified" || item.status === "added"}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs"><code className="min-w-0 truncate">{item.path}</code><span className={cn("shrink-0 capitalize", item.status === "added" ? "text-emerald-500" : item.status === "removed" ? "text-destructive" : "text-muted-foreground")}>{item.status}</span></summary>
                {item.status === "unchanged" ? <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">No source changes.</p> : <pre className="max-h-72 overflow-auto border-t bg-background/50 p-3 text-[11px] leading-relaxed"><code>{unifiedLines(item.before, item.after)}</code></pre>}
              </details>)}
            </div>}
          </div>}

          {tab === "quality" && <div className="h-full w-full overflow-auto p-3 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Quality dashboard</h3>
                <p className="text-xs text-muted-foreground">Deterministic checks, live preview/runtime signals, review findings, and repair outcomes. Unsupported checks are reported honestly.</p>
              </div>
              <div className="flex items-center gap-2">
                {quality && <StatusBadge status={quality.overall} label={`Overall: ${quality.overall}`} />}
                <Button variant="secondary" size="sm" onClick={onRunQuality} disabled={!code || isBuilding || qualityRunning} loading={qualityRunning}>Run checks</Button>
              </div>
            </div>
            {!code ? <p className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">Build a project to see quality results.</p> : !quality ? <p className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">No quality run yet. Click <strong>Run checks</strong> to analyze the current project.</p> : <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryCard label="Passed" value={quality.checks.filter((c)=>c.status==="passed").length} tone="ok" />
                <SummaryCard label="Failed" value={quality.checks.filter((c)=>c.status==="failed").length + quality.runtimeErrors.filter((e)=>["error","promise","compile","render","blank"].includes(e.kind)).length} tone="bad" />
                <SummaryCard label="Skipped/Unsupported" value={quality.checks.filter((c)=>c.status==="skipped"||c.status==="unsupported").length} tone="muted" />
                <SummaryCard label="Repairs" value={quality.repairAttempts.length} tone="info" />
              </div>
              {quality.unresolvedIssues.length > 0 && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs"><div className="mb-1 flex items-center gap-1.5 font-semibold text-destructive"><AlertTriangle className="h-3.5 w-3.5" />Unresolved issues</div><ul className="list-disc space-y-1 pl-4 text-muted-foreground">{quality.unresolvedIssues.map((u,i)=><li key={i}>{u}</li>)}</ul></div>}
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Checks & status</h4>
                {quality.checks.map((check) => <details key={check.id} className="rounded-lg border border-border/70 bg-background/40">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs"><span className="flex min-w-0 items-center gap-2"><StatusIcon status={check.status} /><span className="truncate font-medium">{check.label}</span><span className="shrink-0 rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">{check.category}</span></span><span className="shrink-0 capitalize text-muted-foreground">{check.status}</span></summary>
                  <div className="space-y-1 border-t px-3 py-2 text-[11px] text-muted-foreground"><p className="text-foreground/90">{check.summary}</p>{check.evidence ? <pre className="whitespace-pre-wrap text-destructive/90">{check.evidence}</pre> : null}{check.details?.length ? <ul className="list-disc space-y-0.5 pl-4">{check.details.slice(0,20).map((d,i)=><li key={i} className="break-all">{d}</li>)}</ul> : null}</div>
                </details>)}
              </section>
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Code review findings ({quality.reviewFindings.length})</h4>
                {quality.reviewFindings.length === 0 ? <p className="text-xs text-muted-foreground">No AI review findings recorded for the current run.</p> : <div className="space-y-1.5">{quality.reviewFindings.map((f,i)=><div key={i} className="rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-xs"><div className="flex items-center gap-2"><span className="font-mono text-[11px] text-primary">{f.path}</span>{f.source && <span className="rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{f.source}</span>}</div><p className="mt-0.5 text-muted-foreground">{f.issue}</p></div>)}</div>}
              </section>
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Runtime / preview errors ({quality.runtimeErrors.length})</h4>
                {quality.runtimeErrors.length === 0 ? <p className="text-xs text-muted-foreground">No runtime errors detected from the preview environment.</p> : <div className="space-y-1.5">{quality.runtimeErrors.slice(0,15).map((e,i)=><details key={i} className="rounded-lg border border-destructive/30 bg-destructive/5"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs"><span className="flex min-w-0 items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-destructive" /><span className="font-medium capitalize">{e.kind}</span><span className="truncate text-muted-foreground">{e.message}</span></span><time className="shrink-0 text-[10px] text-muted-foreground">{new Date(e.at).toLocaleTimeString()}</time></summary>{e.stack ? <pre className="max-h-40 overflow-auto border-t px-3 py-2 text-[10px] text-muted-foreground">{e.stack}</pre> : null}</details>)}</div>}
                <p className="text-[11px] text-muted-foreground">Live preview checks are based on in-browser runtime signals (errors, blank render, failed interactions observed). Browser automation and full end-to-end navigation coverage are not executed unless explicitly available.</p>
              </section>
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Repair attempts & outcomes ({quality.repairAttempts.length})</h4>
                {quality.repairAttempts.length === 0 ? <p className="text-xs text-muted-foreground">No autonomous repair attempts recorded.</p> : <div className="space-y-1.5">{[...quality.repairAttempts].reverse().map((a)=><details key={a.id} className="rounded-lg border border-border/70 bg-background/40">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs"><span className="flex min-w-0 items-center gap-2"><StatusIcon status={a.status === "succeeded" ? "passed" : a.status === "running" ? "running" : "failed"} /><span className="truncate font-medium">Attempt {a.attempt}/{a.maxAttempts}</span><span className="truncate text-muted-foreground">{a.issue}</span></span><span className="shrink-0 capitalize text-muted-foreground">{a.status}{a.rolledBack ? " (rolled back)" : ""}</span></summary>
                  <div className="space-y-2 border-t px-3 py-2 text-[11px] text-muted-foreground">
                    <p className="text-foreground/90">{a.summary}</p>
                    {a.changedPaths.length ? <div><span className="font-medium text-foreground">Changed files:</span> {a.changedPaths.join(", ")}</div> : <div>No file changes recorded for this attempt.</div>}
                    {a.changeRecord ? <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-2">{formatChangeRecord(a.changeRecord)}</pre> : null}
                    {a.status === "failed" && a.beforeCode && onRollbackRepair && <Button variant="secondary" size="sm" onClick={() => { if (window.confirm("Rollback this unsuccessful repair and restore the previous working version?")) onRollbackRepair(a); }}>Rollback to previous version</Button>}
                    {a.status === "succeeded" && a.beforeCode && onRollbackRepair && <Button variant="ghost" size="sm" onClick={() => { if (window.confirm("Restore the version before this repair?")) onRollbackRepair(a); }}>Restore pre-repair version</Button>}
                  </div>
                </details>)}</div>}
                <p className="text-[11px] text-muted-foreground">Autonomous repair: max 3 attempts per issue, targeted file changes, validation + optional re-test after repair. No automatic GitHub push/merge/deploy.</p>
              </section>
              {quality.lastRunAt && <p className="text-[11px] text-muted-foreground">Last run: {new Date(quality.lastRunAt).toLocaleString()}</p>}
            </div>}
          </div>}

          {tab === "history" && <div className="h-full w-full overflow-auto p-3 sm:p-5">
            <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold">Version history</h3><p className="text-xs text-muted-foreground">Restore a saved project state.</p></div><Button variant="ghost" size="sm" disabled={versions.length === 0} onClick={onClearVersions} className="text-destructive">Clear history</Button></div>
            {versions.length === 0 ? <p className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">No saved versions</p> : <div className="space-y-2">{versions.map((version) => <div key={version.id} className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/40 p-2">
              <button onClick={() => onRestoreVersion(version)} className="min-w-0 flex-1 rounded px-1 py-1 text-left"><span className="block truncate text-xs font-medium">{version.prompt || "Saved version"}</span><time className="text-[10px] text-muted-foreground">{new Date(version.createdAt).toLocaleString()}</time></button>
              <Button variant="ghost" size="icon" onClick={() => onDeleteVersion(version)} aria-label={`Delete version ${version.prompt}`} title="Delete version" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>)}</div>}
          </div>}
        </div>
      </div>
    </div>
  );
};


const StatusIcon = ({ status }: { status: CheckStatus | "succeeded" | "stopped" }) => {
  if (status === "passed" || status === "succeeded") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === "failed" || status === "stopped") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  if (status === "skipped" || status === "unsupported") return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  return <Activity className="h-3.5 w-3.5 text-muted-foreground" />;
};

const StatusBadge = ({ status, label }: { status: CheckStatus; label: string }) => (
  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize", status === "passed" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" : status === "failed" ? "border-destructive/40 bg-destructive/10 text-destructive" : status === "running" ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-secondary/40 text-muted-foreground")}>{label}</span>
);

const SummaryCard = ({ label, value, tone }: { label: string; value: number; tone: "ok" | "bad" | "muted" | "info" }) => (
  <div className={cn("rounded-lg border px-3 py-2", tone === "ok" ? "border-emerald-500/30 bg-emerald-500/5" : tone === "bad" ? "border-destructive/30 bg-destructive/5" : tone === "info" ? "border-primary/30 bg-primary/5" : "border-border/70 bg-background/40")}>
    <div className="text-lg font-semibold leading-none">{value}</div>
    <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
  </div>
);

const PreviewEmptyState = ({ loading = false }: { loading?: boolean }) => (
  <div className="relative flex h-full min-h-[260px] w-full items-center justify-center overflow-hidden bg-[#0b0d14] p-4 sm:p-8" role={loading ? "status" : undefined} aria-label={loading ? "App preview loading" : "Empty app preview"}>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_15%,rgba(129,104,255,0.16),transparent_60%)]" />
    <div className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-violet-300/20 bg-violet-300/[0.08] px-2.5 py-1 text-[10px] font-medium tracking-wide text-violet-100/75 shadow-[0_0_24px_rgba(139,92,246,0.12)] backdrop-blur">
      <Sparkles className="h-3 w-3 text-violet-300" /> AppiGen Generated
    </div>
    <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-white/[0.09] bg-[#10131c]/90 shadow-[0_28px_100px_rgba(0,0,0,0.48)]">
      <div className="flex h-10 items-center gap-2 border-b border-white/[0.07] px-4">
        <span className="h-2 w-2 rounded-full bg-white/15" /><span className="h-2 w-2 rounded-full bg-white/15" /><span className="h-2 w-2 rounded-full bg-white/15" />
        <div className="mx-auto h-5 w-[42%] rounded-md border border-white/[0.06] bg-white/[0.025]" />
      </div>
      <div className="grid min-h-[220px] grid-cols-[68px_1fr] sm:grid-cols-[152px_1fr] sm:min-h-[310px]">
        <div className="space-y-5 border-r border-white/[0.06] p-3 sm:p-5">
          <div className="h-6 w-6 rounded-lg bg-violet-300/15 sm:w-24" />
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((line) => <div key={line} className={cn("h-2 rounded-full bg-white/[0.07]", line === 0 ? "w-full bg-violet-300/20" : "w-4/5")} />)}
          </div>
        </div>
        <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="w-2/3 space-y-2"><div className="h-4 w-3/5 rounded bg-white/10" /><div className="h-2.5 w-4/5 rounded bg-white/[0.055]" /></div>
            <div className="h-8 w-20 rounded-lg bg-violet-400/20" />
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {[0, 1, 2].map((card) => <div key={card} className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5 sm:p-3.5"><div className="h-2 w-3/4 rounded bg-white/[0.07]" /><div className="h-4 w-1/2 rounded bg-white/10" /><div className="h-1.5 w-full rounded bg-emerald-300/15" /></div>)}
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
