
import html2canvas from "html2canvas";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Code2,
  Globe,
  Download,
  Clock,
  Maximize2,
  ExternalLink,
  PanelLeftClose,
  RefreshCw,
  Folder,
  FolderOpen,
  FileCode2,
  Save,
  Sparkles,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { parseFileMarkers, updateProjectFile } from "@/lib/preview/parseFileMarkers";
import type { LocalProjectVersion } from "@/lib/projects/projectStorage";
import { Button } from "@/components/ui/button";
import type { QualityState, RepairAttempt } from "@/lib/projects/qualityEngine";

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
  onPreviewRuntime?: (event: {
    kind: "ready" | "error";
    message?: string;
    stack?: string;
    errorKind?: string;
  }) => void;
  onThumbnailCapture?: (thumbnail: string) => void;
  onDownload?: () => void;
  onToggleChatPanel?: () => void;
}

type Tab = "preview" | "code" | "versions";

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

const buildTree = (appCode: string): FileNode => {
  const files = parseFileMarkers(appCode)?.files ?? {
    "src/App.tsx": appCode,
  };

  const root: FileNode = {
    name: "project",
    path: "project",
    children: [],
  };

  Object.entries(files).forEach(([path, content]) => {
    const parts = path.split("/");
    let parent = root;

    parts.forEach((part, index) => {
      const currentPath = parts.slice(0, index + 1).join("/");

      let node = parent.children?.find(
        (item) => item.name === part,
      );

      if (!node) {
        node = {
          name: part,
          path: currentPath,
          children:
            index < parts.length - 1 ? [] : undefined,
        };

        parent.children?.push(node);
      }

      if (index === parts.length - 1) {
        node.content = content;

        node.language = part.endsWith(".tsx") ||
          part.endsWith(".ts")
          ? "typescript"
          : part.endsWith(".css")
            ? "css"
            : part.endsWith(".json")
              ? "json"
              : part.endsWith(".html")
                ? "html"
                : "javascript";
      } else {
        parent = node;
      }
    });
  });

  const sortNodes = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      const aFolder = Boolean(a.children);
      const bFolder = Boolean(b.children);

      if (aFolder !== bFolder) {
        return aFolder ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });

    nodes.forEach((node) => {
      if (node.children) {
        sortNodes(node.children);
      }
    });
  };

  sortNodes(root.children ?? []);

  return root;
};

const FileTreeItem = ({
  node,
  depth = 0,
  selected,
  onSelect,
}: {
  node: FileNode;
  depth?: number;
  selected: string;
  onSelect: (n: FileNode) => void;
}) => {
  const [open, setOpen] = useState(true);
  const isFolder = !!node.children;
  const isSelected = selected === node.path;

  return (
    <div>
      <button
        onClick={() =>
          isFolder ? setOpen((o) => !o) : onSelect(node)
        }
        className={cn(
          "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[12px] transition-colors hover:bg-secondary/60",
          isSelected && !isFolder && "bg-primary/15 text-primary",
        )}
        style={{
          paddingLeft: 6 + depth * 12,
        }}
      >
        {isFolder ? (
          open ? (
            <FolderOpen className="h-3.5 w-3.5 text-warning" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-warning" />
          )
        ) : (
          <FileCode2 className="h-3.5 w-3.5 text-primary" />
        )}

        <span className="truncate">{node.name}</span>
      </button>

      {isFolder &&
        open &&
        node.children?.map((child) => (
          <FileTreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
};

export const PreviewPanel = ({
  isBuilding,
  doc,
  code,
  workingCode,
  baseCode,
  onCodeChange,
  versions,
  onRestoreVersion,
  onDeleteVersion,
  onClearVersions,
  onPreviewRuntime,
  onThumbnailCapture,
  onDownload,
  onToggleChatPanel,
}: PreviewPanelProps) => {
  const [tab, setTab] = useState<Tab>("preview");

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const thumbnailCapturedRef = useRef(false);
  const handleSaveRef = useRef<() => void>(() => {});

  const [previewError, setPreviewError] =
    useState<PreviewErrorState | null>(null);

  const [previewReady, setPreviewReady] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const explorerCode = workingCode ?? code;

  const tree = useMemo(
    () =>
      buildTree(
        explorerCode || "// Build an app to see generated code here",
      ),
    [explorerCode],
  );

  const entryPath = useMemo(
    () =>
      parseFileMarkers(explorerCode || "")?.entry ||
      "src/App.tsx",
    [explorerCode],
  );

  const [selectedPath, setSelectedPath] =
    useState<string>("src/App.tsx");

  const [editorContent, setEditorContent] =
    useState<string>(explorerCode || "");

  const [dirty, setDirty] = useState(false);

  const currentFile = useMemo(() => {
    const find = (node: FileNode): FileNode | null => {
      if (node.path === selectedPath && !node.children) {
        return node;
      }

      for (const child of node.children || []) {
        const result = find(child);

        if (result) {
          return result;
        }
      }

      return null;
    };

    return find(tree);
  }, [tree, selectedPath]);

  useEffect(() => {
    const find = (node: FileNode): boolean =>
      (node.path === selectedPath && !node.children) ||
      Boolean(node.children?.some(find));

    if (!find(tree)) {
      setSelectedPath(entryPath);
    }
  }, [tree, entryPath, selectedPath]);

  useEffect(() => {
    setEditorContent(currentFile?.content || "");
    setDirty(false);
  }, [currentFile, explorerCode]);

  // Reset preview state whenever the document or build changes.
  useEffect(() => {
    setPreviewError(null);
    setPreviewReady(false);
    thumbnailCapturedRef.current = false;
  }, [doc, isBuilding]);

  // Listen for preview runtime messages.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | Record<string, unknown>
        | null;

      if (!data || data.__appigen !== true) {
        return;
      }

      const kind = String(data.kind || "");

      if (kind === "ready") {
        setPreviewReady(true);

        setPreviewError((previous) =>
          previous?.kind === "blank" ? null : previous,
        );

        onPreviewRuntime?.({
          kind: "ready",
        });

        if (
          !thumbnailCapturedRef.current &&
          onThumbnailCapture
        ) {
          thumbnailCapturedRef.current = true;

          window.setTimeout(() => {
            const previewBody =
              iframeRef.current?.contentDocument?.body;

            if (!previewBody) {
              thumbnailCapturedRef.current = false;
              return;
            }

            html2canvas(previewBody, {
              useCORS: true,
              backgroundColor: "#ffffff",
              scale: 0.5,
              logging: false,
            })
              .then((canvas) => {
                onThumbnailCapture(
                  canvas.toDataURL("image/jpeg", 0.75),
                );
              })
              .catch((error) => {
                thumbnailCapturedRef.current = false;

                console.warn(
                  "Preview thumbnail capture failed:",
                  error,
                );
              });
          }, 700);
        }
      } else if (
        [
          "error",
          "promise",
          "compile",
          "render",
          "blank",
          "console",
        ].includes(kind)
      ) {
        const message = String(
          data.message || "Preview error",
        );

        const stack =
          typeof data.stack === "string"
            ? data.stack
            : undefined;

        setPreviewError({
          kind,
          message,
          stack,
        });

        if (
          ["error", "promise", "compile", "render", "blank"].includes(
            kind,
          )
        ) {
          onPreviewRuntime?.({
            kind: "error",
            errorKind: kind,
            message,
            stack,
          });
        }
      }
    };

    window.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [onPreviewRuntime, onThumbnailCapture]);

  const previewKey = useMemo(
    () =>
      `${doc.length}-${doc.slice(0, 96)}-${refreshNonce}`,
    [doc, refreshNonce],
  );

  const handleRefresh = () => {
    setPreviewError(null);
    setPreviewReady(false);

    setRefreshNonce((value) => value + 1);
  };

  const handleFullscreen = () => {
    const frame = iframeRef.current;

    if (!frame) return;

    const request =
      frame.requestFullscreen ??
      (
        frame as HTMLIFrameElement & {
          webkitRequestFullscreen?: () => Promise<void>;
        }
      ).webkitRequestFullscreen;

    if (request) {
      void Promise.resolve(request.call(frame)).catch(() => {
        toast({
          title: "Fullscreen unavailable",
          description:
            "Your browser did not allow fullscreen preview.",
        });
      });
    }
  };

  const handleOpenPreview = () => {
    try {
      const url = URL.createObjectURL(
        new Blob([doc], {
          type: "text/html;charset=utf-8",
        }),
      );

      const opened = window.open(url, "_blank");

      if (!opened) {
        toast({
          title: "New tab blocked",
          description:
            "Allow pop-ups for AppiGen to open the preview.",
        });
      } else {
        opened.opener = null;
      }

      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
    } catch {
      toast({
        title: "Could not open preview",
        description:
          "The browser could not create a separate preview tab.",
        variant: "destructive",
      });
    }
  };

  const handleSave = () => {
    if (
      isBuilding ||
      !onCodeChange ||
      !currentFile
    ) {
      return;
    }

    try {
      const updatedCode = updateProjectFile(
        explorerCode || "",
        selectedPath,
        editorContent,
      );

      onCodeChange(updatedCode);

      toast({
        title: "Saved",
        description: "Preview updated with your edits.",
      });

      setDirty(false);
    } catch (error) {
      toast({
        title: "Save failed",
        description:
          error instanceof Error
            ? error.message
            : "Could not update this project file.",
        variant: "destructive",
      });
    }
  };

  handleSaveRef.current = handleSave;

  // Never mount a second placeholder iframe during the build.
  const showFrame = Boolean(code);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col p-0">
      <div className="glass-strong flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg shadow-soft">

        {/* Compact Preview Toolbar */}
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 bg-surface/60 px-2.5 sm:px-3">
          <div className="flex items-center rounded-lg border border-border/60 bg-background/40 p-0.5">
            {(
              [
                {
                  id: "preview" as const,
                  label: "Open preview",
                  icon: Globe,
                },
                {
                  id: "code" as const,
                  label: "Open code",
                  icon: Code2,
                },
                {
                  id: "versions" as const,
                  label: "Version history",
                  icon: Clock,
                },
              ]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-label={item.label}
                title={item.label}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md transition-smooth",
                  tab === item.id
                    ? "bg-primary text-primary-foreground shadow-soft"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
              </button>
            ))}
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-1">
            {tab === "code" && (
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || isBuilding}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold transition-smooth",
                  dirty && !isBuilding
                    ? "border-primary/50 bg-primary/15 text-primary hover:bg-primary/25"
                    : "border-border bg-secondary/40 text-muted-foreground",
                )}
                title="Save (Ctrl/Cmd+S)"
              >
                <Save className="h-3.5 w-3.5" />
                Save{dirty ? " ●" : ""}
              </button>
            )}

            <button
              type="button"
              onClick={onToggleChatPanel}
              disabled={!onToggleChatPanel}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground disabled:opacity-40"
              title="Show or hide chat panel"
              aria-label="Show or hide chat panel"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>

            {tab === "preview" && (
              <>
                <button
                  type="button"
                  onClick={handleOpenPreview}
                  disabled={!code}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground disabled:opacity-40"
                  title="Open preview in new tab"
                  aria-label="Open preview in new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleFullscreen}
                  disabled={!code}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground disabled:opacity-40"
                  title="Fullscreen preview"
                  aria-label="Fullscreen preview"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleRefresh}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground"
                  title="Reload preview"
                  aria-label="Reload preview"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </>
            )}

            {/* ZIP download belongs in the Preview toolbar. */}
            <button
              type="button"
              onClick={onDownload}
              disabled={!code || !onDownload}
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-secondary/30 px-2 text-[10px] font-semibold text-muted-foreground transition hover:border-primary/50 hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              title="Download project ZIP"
              aria-label="Download project ZIP"
            >
              <Download className="h-3.5 w-3.5" />
              ZIP
            </button>
          </div>
        </div>

        {/* Preview / Code / Versions workspace */}
        <div className="relative flex min-h-0 flex-1 overflow-hidden bg-background/40">
          {tab === "preview" && (
            <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
              {previewError && code && (
                <div className="mx-2 mt-2 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-foreground sm:mx-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />

                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-destructive">
                      Preview {previewError.kind}
                    </div>

                    <div className="truncate whitespace-pre-wrap break-words text-muted-foreground">
                      {previewError.message}
                    </div>

                    {previewError.stack && (
                      <pre className="mt-1 max-h-24 overflow-auto text-[10px] text-muted-foreground">
                        {previewError.stack}
                      </pre>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setPreviewError(null)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Dismiss preview error"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto px-1 pb-1 pt-0 sm:px-1.5 sm:pb-1.5 sm:pt-0">
               <div className="relative flex h-full min-h-[260px] w-full items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-[#0b0d14] shadow-soft">
                  {!showFrame && !isBuilding && (
                    <PreviewEmptyState />
                  )}

                  {showFrame && (
                    <div className="relative h-full w-full">
                      <iframe
                        ref={iframeRef}
                        key={previewKey}
                        title="AppiGen Sandbox Preview"
                        srcDoc={doc}
                        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin allow-downloads"
                        className="h-full w-full rounded-lg border-0 bg-background"
                      />

                      {(isBuilding || (!previewReady && code)) && (
                        <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-4">
                          <div className="rounded-full border border-white/10 bg-[#171923]/95 px-4 py-2 text-xs font-medium text-white/80 shadow-xl backdrop-blur-md">
                            {isBuilding
                              ? "Building and updating preview…"
                              : "Loading preview…"}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {isBuilding && !code && (
                    <PreviewEmptyState loading />
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "code" && (
            <div className="flex h-full w-full min-h-0">
              <aside className="hidden w-52 shrink-0 flex-col overflow-y-auto border-r border-border/60 bg-background/50 py-2 sm:flex">
                <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Explorer
                </div>

                <div className="px-1">
                  <FileTreeItem
                    node={tree}
                    selected={selectedPath}
                    onSelect={(node) => setSelectedPath(node.path)}
                  />
                </div>
              </aside>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
                  <span className="truncate font-mono">
                    {selectedPath}
                  </span>

                  <span
                    className={cn(
                      dirty
                        ? "font-medium text-warning"
                        : "text-muted-foreground",
                    )}
                  >
                    {dirty ? "● unsaved changes" : "saved"}
                  </span>
                </div>

                <div className="min-h-0 flex-1">
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        Loading code editor…
                      </div>
                    }
                  >
                    <Editor
                      height="100%"
                      theme="vs-dark"
                      language={currentFile?.language || "javascript"}
                      value={editorContent}
                      onChange={(value) => {
                        setEditorContent(value ?? "");
                        setDirty(true);
                      }}
                      onMount={(editor, monaco) => {
                        editor.addCommand(
                          monaco.KeyMod.CtrlCmd |
                            monaco.KeyCode.KeyS,
                          () => handleSaveRef.current(),
                        );
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

          {tab === "versions" && (
            <div className="h-full w-full overflow-auto p-3 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Versions</h3>
                  <p className="text-xs text-muted-foreground">
                    Restore a saved project state.
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={versions.length === 0}
                  onClick={onClearVersions}
                  className="text-destructive"
                >
                  Clear history
                </Button>
              </div>

              {versions.length === 0 ? (
                <p className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
                  No saved versions
                </p>
              ) : (
                <div className="space-y-2">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/40 p-2"
                    >
                      <button
                        onClick={() => onRestoreVersion(version)}
                        className="min-w-0 flex-1 rounded px-1 py-1 text-left"
                      >
                        <span className="block truncate text-xs font-medium">
                          {version.prompt || "Saved version"}
                        </span>

                        <time className="text-[10px] text-muted-foreground">
                          {new Date(version.createdAt).toLocaleString()}
                        </time>
                      </button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteVersion(version)}
                        aria-label={`Delete version ${version.prompt}`}
                        title="Delete version"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const PreviewEmptyState = ({
  loading = false,
}: {
  loading?: boolean;
}) => (
  <div
    className="relative flex h-full min-h-[260px] w-full items-center justify-center overflow-hidden bg-[#0b0d14] p-4 sm:p-8"
    role={loading ? "status" : undefined}
    aria-label={
      loading
        ? "App preview loading"
        : "Empty app preview"
    }
  >
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_15%,rgba(129,104,255,0.16),transparent_60%)]" />

    <div className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-violet-300/20 bg-violet-300/[0.08] px-2.5 py-1 text-[10px] font-medium tracking-wide text-violet-100/75 shadow-[0_0_24px_rgba(139,92,246,0.12)] backdrop-blur">
      <Sparkles className="h-3 w-3 text-violet-300" />
      AppiGen Generated
    </div>

    <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-white/[0.09] bg-[#10131c]/90 shadow-[0_28px_100px_rgba(0,0,0,0.48)]">
      <div className="flex h-10 items-center gap-2 border-b border-white/[0.07] px-4">
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />

        <div className="mx-auto h-5 w-[42%] rounded-md border border-white/[0.06] bg-white/[0.025]" />
      </div>

      <div className="grid min-h-[220px] grid-cols-[68px_1fr] sm:grid-cols-[152px_1fr] sm:min-h-[310px]">
        <div className="space-y-5 border-r border-white/[0.06] p-3 sm:p-5">
          <div className="h-6 w-6 rounded-lg bg-violet-300/15 sm:w-24" />

          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((line) => (
              <div
                key={line}
                className={cn(
                  "h-2 rounded-full bg-white/[0.07]",
                  line === 0
                    ? "w-full bg-violet-300/20"
                    : "w-4/5",
                )}
              />
            ))}
          </div>
        </div>

        <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="w-2/3 space-y-2">
              <div className="h-4 w-3/5 rounded bg-white/10" />
              <div className="h-2.5 w-4/5 rounded bg-white/[0.055]" />
            </div>

            <div className="h-8 w-20 rounded-lg bg-violet-400/20" />
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {[0, 1, 2].map((card) => (
              <div
                key={card}
                className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5 sm:p-3.5"
              >
                <div className="h-2 w-3/4 rounded bg-white/[0.07]" />
                <div className="h-4 w-1/2 rounded bg-white/10" />
                <div className="h-1.5 w-full rounded bg-emerald-300/15" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>

    <div className="absolute bottom-7 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#171923]/95 px-4 py-2.5 shadow-xl backdrop-blur-md">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400" />
      </span>

      <span className="whitespace-nowrap text-xs font-medium text-white/80">
        {loading
          ? "Building your live preview…"
          : "Your generated app will appear here"}
      </span>
    </div>
  </div>
);
