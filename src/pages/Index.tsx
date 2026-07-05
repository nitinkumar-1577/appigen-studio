import { useEffect, useRef, useState } from "react";
import { Sidebar, type ViewKey } from "@/components/appigen/Sidebar";
import { PromptPanel } from "@/components/appigen/PromptPanel";
import { PreviewPanel } from "@/components/appigen/PreviewPanel";
import { DashboardPage } from "@/components/appigen/pages/DashboardPage";
import { MyAppsPage } from "@/components/appigen/pages/MyAppsPage";
import { TemplatesPage } from "@/components/appigen/pages/TemplatesPage";
import { ApiSettingsPage } from "@/components/appigen/pages/ApiSettingsPage";
import { PricingPage } from "@/components/appigen/pages/PricingPage";
import { AuthModal } from "@/components/appigen/AuthModal";
import { PricingModal } from "@/components/appigen/PricingModal";
import { SettingsPanel } from "@/components/appigen/SettingsPanel";
import { NotificationsMenu } from "@/components/appigen/NotificationsMenu";
import { GithubModal } from "@/components/appigen/GithubModal";
import { useApp } from "@/components/appigen/AppContext";
import { Sparkles, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import JSZip from "jszip";

const VIEW_TITLES: Record<ViewKey, string> = {
  studio: "",
  dashboard: "Dashboard",
  apps: "My Apps",
  templates: "Templates",
  api: "API Settings",
  pricing: "Pricing & Credits",
};

const DEFAULT_PROMPT =
  "Build a minimalist task manager with drag-and-drop columns, calm color palette, and keyboard shortcuts.";

const ROOT_RENDER_CALL = /ReactDOM\s*\.\s*createRoot\s*\(\s*document\s*\.\s*getElementById\s*\(\s*["']root["']\s*\)\s*\)\s*\.\s*render\s*\(\s*<App\s*\/?>\s*\)\s*;?/g;
const LEGACY_RENDER_CALL = /ReactDOM\s*\.\s*render\s*\(\s*<App\s*\/?>\s*,\s*document\s*\.\s*getElementById\s*\(\s*["']root["']\s*\)\s*\)\s*;?/g;
const BARE_CREATE_ROOT_CALL = /\bcreateRoot\s*\(\s*document\s*\.\s*getElementById\s*\(\s*["']root["']\s*\)\s*\)\s*\.\s*render\s*\(\s*<App\s*\/?>\s*\)\s*;?/g;

function stripModuleSyntax(src: string): string {
  let out = (src || "").replace(/\r\n/g, "\n");
  out = out.replace(/^\s*```(?:jsx|tsx|js|ts|javascript|typescript)?\s*/i, "").replace(/```\s*$/i, "");
  out = out.replace(/^\s*import\s+["'][^"']+["']\s*;?\s*$/gm, "");
  out = out.replace(/^\s*import\s+(?:type\s+)?[\s\S]*?\s+from\s*["'][^"']+["']\s*;?\s*$/gm, "");
  out = out.replace(/^\s*import\s*\([\s\S]*?\)\s*;?\s*$/gm, "");
  out = out.replace(/\bimport\s*\(\s*(["'`])(?:\\.|(?!\1)[\s\S])*?\1\s*\)/g, "Promise.resolve({})");
  out = out.replace(/^\s*export\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s*["'][^"']+["']\s*;?\s*$/gm, "");
  out = out.replace(/^\s*export\s*\{[\s\S]*?\}\s*;?\s*$/gm, "");
  out = out.replace(/^\s*export\s+default\s+(?=(?:async\s+)?function\b|class\b)/gm, "");
  out = out.replace(/^\s*export\s+default\s+[^;\n]+;?\s*$/gm, "");
  out = out.replace(/^\s*export\s+(?=(?:const|let|var|function|class)\b)/gm, "");
  out = out.replace(/\bimport\s+(?:type\s+)?[^;\n]*?\bfrom\s*["'][^"']+["']\s*;?/g, "");
  out = out.replace(/(^|[;\n])\s*export\s+(?:default\s+)?/g, "$1");
  return out.trim();
}

function sanitizeReactSource(src: string): string {
  const body = stripModuleSyntax(src)
    .replace(ROOT_RENDER_CALL, "")
    .replace(LEGACY_RENDER_CALL, "")
    .replace(BARE_CREATE_ROOT_CALL, "")
    .trim();
  return `${body}\nReactDOM.createRoot(document.getElementById("root")).render(<App />);`;
}

function escapeScriptText(src: string): string {
  return src.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
}

function collectPotentialGlobals(src: string): string[] {
  const names = new Set<string>([
    "Activity", "AlertCircle", "ArrowLeft", "ArrowRight", "BarChart3", "Bell", "BookOpen", "Bot", "Calendar", "Camera",
    "Check", "CheckCircle", "ChevronDown", "ChevronLeft", "ChevronRight", "ChevronUp", "Circle", "Clock", "Code", "Copy",
    "CreditCard", "Database", "Download", "Edit", "ExternalLink", "Eye", "File", "Filter", "Folder", "Github", "Globe",
    "Heart", "Home", "Image", "Info", "Layers", "LayoutDashboard", "LineChart", "Link", "List", "Lock", "Mail", "MapPin",
    "Menu", "MessageCircle", "Mic", "Minus", "Moon", "MoreHorizontal", "MoreVertical", "PanelLeft", "Paperclip", "Pause", "Pencil",
    "Play", "Plus", "RefreshCw", "Rocket", "Save", "Search", "Send", "Settings", "Share", "Shield", "ShoppingCart",
    "Sparkles", "Star", "Sun", "Trash", "TrendingUp", "Upload", "User", "Users", "Wand2", "X", "Zap"
  ]);
  for (const match of src.matchAll(/<\s*([A-Z][A-Za-z0-9_]*)\b/g)) {
    if (match[1] !== "App" && match[1] !== "React.Fragment") names.add(match[1]);
  }
  return Array.from(names).sort();
}

function buildDocFromPrompt(prompt: string, code?: string) {
  const safePrompt = (prompt || "Untitled App").replace(/</g, "&lt;");
  const reactSource = sanitizeReactSource(
    code ??
    `function App() {
  const [tasks, setTasks] = React.useState([
    { id: 1, title: "Sketch the layout", done: true },
    { id: 2, title: "Wire up state", done: false },
    { id: 3, title: "Polish the UI", done: false },
  ]);
  const toggle = (id) =>
    setTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-xl mx-auto">
        <div className="text-xs uppercase tracking-widest text-indigo-400">Generated by AppiGen</div>
        <h1 className="mt-1 text-3xl font-bold">${safePrompt}</h1>
        <p className="mt-2 text-sm text-slate-400">A live React component running inside a sandboxed iframe.</p>
        <ul className="mt-6 space-y-2">
          {tasks.map(t => (
            <li key={t.id}
              onClick={() => toggle(t.id)}
              className={"flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 cursor-pointer transition hover:border-indigo-500/60 " + (t.done ? "opacity-60" : "")}>
              <span className={"h-5 w-5 rounded-md border-2 flex items-center justify-center " + (t.done ? "bg-indigo-500 border-indigo-500" : "border-slate-700")}>
                {t.done && <span className="text-[11px]">\u2713</span>}
              </span>
              <span className={t.done ? "line-through" : ""}>{t.title}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);`
  );
  const iconGlobals = collectPotentialGlobals(reactSource);


  // Phase 10/15: runtime error capture + visible overlay + parent postMessage
  const runtimeShield = `
(function(){
  function report(kind, message, stack){
    try { parent.postMessage({ __appigen: true, kind: kind, message: String(message||''), stack: String(stack||'') }, '*'); } catch(e){}
    var host = document.getElementById('__appigen_err');
    if(!host){
      host = document.createElement('div');
      host.id = '__appigen_err';
      host.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:rgba(127,29,29,.95);color:#fee2e2;border:1px solid rgba(248,113,113,.6);border-radius:10px;padding:12px 14px;max-height:45vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.5);backdrop-filter:blur(8px);';
      document.body && document.body.appendChild(host);
    }
    host.innerHTML = '<div style="font-weight:700;color:#fecaca;margin-bottom:4px">\u26A0 Runtime '+kind+'</div><div style="white-space:pre-wrap;word-break:break-word">'+(message||'')+'</div>'+(stack?'<details style="margin-top:6px;opacity:.85"><summary style="cursor:pointer">stack</summary><pre style="white-space:pre-wrap">'+stack+'</pre></details>':'');
  }
  window.addEventListener('error', function(e){ report('error', e.message, e.error && e.error.stack); });
  window.addEventListener('unhandledrejection', function(e){ var r = e.reason || {}; report('promise', r.message || r, r.stack); });
  var _ce = console.error;
  console.error = function(){ try { report('console', Array.prototype.slice.call(arguments).map(String).join(' '), ''); } catch(_){ } _ce.apply(console, arguments); };
  setTimeout(function(){
    var root = document.getElementById('root');
    if(root && root.childElementCount === 0 && !document.getElementById('__appigen_err')){
      report('blank', 'Preview rendered nothing within 2.5s', '');
    }
  }, 2500);
})();
`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>AppiGen Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    html, body { background: #020617; color: #e2e8f0; margin: 0; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 999px; }
  </style>
  <script>${runtimeShield}</script>
</head>
<body>
  <div id="root"></div>
  <script>
(function(){
  window.React = window.React;
  window.ReactDOM = window.ReactDOM;
  window.useState = window.React.useState;
  window.useEffect = window.React.useEffect;
  window.useRef = window.React.useRef;
  window.useMemo = window.React.useMemo;
  window.useCallback = window.React.useCallback;
  window.useReducer = window.React.useReducer;
  window.useContext = window.React.useContext;
  window.Fragment = window.React.Fragment;
  window.__appigenDisabledImport = function(){ return Promise.resolve({}); };
  window.__appigenIcon = function(name){
    return window.React.forwardRef(function AppiGenIcon(props, ref){
      props = props || {};
      var size = props.size || 20;
      var strokeWidth = props.strokeWidth || 2;
      var className = props.className || '';
      var rest = Object.assign({}, props);
      delete rest.size; delete rest.strokeWidth; delete rest.className;
      return window.React.createElement('svg', Object.assign({ ref: ref, xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', className: className, 'aria-hidden': 'true', focusable: 'false' }, rest),
        window.React.createElement('circle', { cx: 12, cy: 12, r: 8 }),
        window.React.createElement('path', { d: 'M12 8v8M8 12h8' })
      );
    });
  };
  ${JSON.stringify(iconGlobals)}.forEach(function(name){ if (!window[name]) window[name] = window.__appigenIcon(name); });
  window.require = function(name){
    if (name === 'react') return window.React;
    if (name === 'react-dom' || name === 'react-dom/client') return window.ReactDOM;
    if (name === 'lucide-react') {
      return new Proxy({}, { get: function(_, key){ return window[String(key)] || window.__appigenIcon(String(key)); } });
    }
    return {};
  };
})();
  </script>
  <script id="__appigen_source" type="text/plain">${escapeScriptText(reactSource)}</script>
  <script>
(function(){
  function hardStripModules(src){
    var out = String(src || '').replace(/\\r\\n/g, '\\n');
    out = out.replace(/^\\s*\\x60\\x60\\x60(?:jsx|tsx|js|ts|javascript|typescript)?\\s*/i, '').replace(/\\x60\\x60\\x60\\s*$/i, '');
    out = out.replace(/^\\s*import\\s+["'][^"']+["']\\s*;?\\s*$/gm, '');
    out = out.replace(/^\\s*import\\s+(?:type\\s+)?[\\s\\S]*?\\s+from\\s*["'][^"']+["']\\s*;?\\s*$/gm, '');
    out = out.replace(/^\\s*import\\s*\\([\\s\\S]*?\\)\\s*;?\\s*$/gm, '');
    out = out.replace(/\\bimport\\s*\\([\\s\\S]*?\\)/g, 'Promise.resolve({})');
    out = out.replace(/^\\s*export\\s+(?:type\\s+)?(?:\\*|\\{[\\s\\S]*?\\})\\s+from\\s*["'][^"']+["']\\s*;?\\s*$/gm, '');
    out = out.replace(/^\\s*export\\s*\\{[\\s\\S]*?\\}\\s*;?\\s*$/gm, '');
    out = out.replace(/^\\s*export\\s+default\\s+(?=(?:async\\s+)?function\\b|class\\b)/gm, '');
    out = out.replace(/^\\s*export\\s+default\\s+[^;\\n]+;?\\s*$/gm, '');
    out = out.replace(/^\\s*export\\s+(?=(?:const|let|var|function|class)\\b)/gm, '');
    out = out.replace(/\\bimport\\s+(?:type\\s+)?[^;\\n]*?\\bfrom\\s*["'][^"']+["']\\s*;?/g, '');
    out = out.replace(/(^|[;\\n])\\s*export\\s+(?:default\\s+)?/g, '$1');
    return out.trim();
  }
  function showCompileError(e){
    parent.postMessage({ __appigen: true, kind: 'compile', message: e && e.message, stack: e && e.stack }, '*');
    var pre = document.createElement('pre');
    pre.style.cssText = 'color:#fecaca;background:#7f1d1d;padding:16px;margin:16px;border-radius:8px;white-space:pre-wrap;font:12px ui-monospace,Menlo,monospace';
    pre.textContent = 'Compile error: ' + (e && e.message ? e.message : e);
    document.body.appendChild(pre);
  }
  try {
    var raw = document.getElementById('__appigen_source').textContent || '';
    var source = hardStripModules(raw);
    if (/(^|[;\\n])\\s*(?:import(?:\\s|\\()|export\\s)/.test(source)) throw new Error('Module syntax blocked before compile');
    var compiled = window.Babel.transform(source, { presets: [['react', { runtime: 'classic' }]], sourceType: 'script' }).code;
    if (/(^|[;\\n])\\s*(?:import(?:\\s|\\()|export\\s)/.test(compiled)) throw new Error('Module syntax blocked before execution');
    var runner = document.createElement('script');
    runner.type = 'text/javascript';
    runner.text = compiled;
    document.body.appendChild(runner);
  } catch (e) {
    showCompileError(e);
  }
})();
  </script>
</body>
</html>`;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "untitled";

const Index = () => {
  const [isBuilding, setIsBuilding] = useState(false);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [doc, setDoc] = useState<string>(() => buildDocFromPrompt(DEFAULT_PROMPT));
  const [view, setView] = useState<ViewKey>("studio");
  const [authOpen, setAuthOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [projectTitle, setProjectTitle] = useState("Untitled Project");
  const [editingTitle, setEditingTitle] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const { user, addNotification } = useApp();

  // Phase 9: auto-repair loop. Tracks attempts per code revision.
  const repairAttemptsRef = useRef(0);
  const lastReportedRef = useRef<string>("");
  const isRepairingRef = useRef(false);

  useEffect(() => {
    if (!user) {
      const t = setTimeout(() => setAuthOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [user]);

  // Reset repair counter when code revision changes
  useEffect(() => { repairAttemptsRef.current = 0; lastReportedRef.current = ""; }, [lastCode]);

  // Listen for runtime/compile errors from preview iframe and auto-repair
  useEffect(() => {
    const onMsg = async (ev: MessageEvent) => {
      const m = ev.data;
      if (!m || typeof m !== "object" || !m.__appigen) return;
      const sig = `${m.kind}::${m.message}`;
      if (sig === lastReportedRef.current) return;
      lastReportedRef.current = sig;
      if (!lastCode || isRepairingRef.current) return;
      if (repairAttemptsRef.current >= 2) return; // max 2 auto attempts
      // Only repair on real failures
      if (!["error", "compile", "promise", "blank"].includes(m.kind)) return;

      repairAttemptsRef.current += 1;
      isRepairingRef.current = true;
      toast({ title: "🔧 Auto-repairing", description: `Attempt ${repairAttemptsRef.current}/2 — ${String(m.message).slice(0, 80)}` });
      try {
        const { data, error } = await supabase.functions.invoke("Appigen", {
          body: { mode: "repair", code: lastCode, error: `${m.kind}: ${m.message}\n${m.stack || ""}` },
        });
        if (error) throw error;
        if (data?.code) {
          setLastCode(data.code);
          setDoc(buildDocFromPrompt(prompt, data.code));
          toast({ title: "✅ Repair applied", description: "Re-rendering preview" });
        }
      } catch (e: any) {
        toast({ title: "Auto-repair failed", description: e?.message || "Unknown", variant: "destructive" });
      } finally {
        isRepairingRef.current = false;
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [lastCode, prompt]);

  const handleDownload = async () => {
    try {
      const zip = new JSZip();
      zip.file("index.html", doc);
      if (lastCode) zip.file("app.jsx", lastCode);
      zip.file("README.md", `# ${projectTitle}\n\nGenerated by AppiGen Studio.\n\n## Prompt\n${prompt}\n`);
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${slugify(projectTitle)}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "📦 ZIP ready", description: `${slugify(projectTitle)}.zip` });
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
  };

  const handleBuild = async (system?: string, stage?: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast({ title: "Prompt is empty", description: "Describe the app you want to build first.", variant: "destructive" });
      return;
    }
    setIsBuilding(true);
    try {
      const { data, error } = await supabase.functions.invoke("Appigen", { body: { prompt: trimmed, system, stage } });
      if (error) throw error;
      if (!data?.code) throw new Error("No code returned from AI");
      setLastCode(data.code);
      setDoc(buildDocFromPrompt(trimmed, data.code));

      // Auto-derive title if user kept default
      const finalTitle =
        projectTitle && projectTitle !== "Untitled Project"
          ? projectTitle
          : trimmed.split(/\s+/).slice(0, 6).join(" ").slice(0, 60) || "Untitled Project";
      if (finalTitle !== projectTitle) setProjectTitle(finalTitle);

      if (user) {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (uid) {
          const { error: insertErr } = await supabase.from("projects").insert({
            user_id: uid, title: finalTitle, prompt: trimmed, code: data.code, thumbnail: null,
          });
          if (insertErr) console.error("Save project failed:", insertErr);
        }
      }

      addNotification({ kind: "build", title: "App Built Successfully", description: finalTitle });
      toast({
        title: "✨ Build successful",
        description: user ? `Saved: "${finalTitle}"` : `Sign in to save: "${finalTitle}"`,
      });
    } catch (err: any) {
      console.error("Build failed:", err);
      toast({ title: "Build failed", description: err?.message || "Something went wrong calling the AI.", variant: "destructive" });
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          active={view}
          onChange={setView}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenSignIn={() => setAuthOpen(true)}
          onOpenPricing={() => setPricingOpen(true)}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="relative z-30 flex h-16 shrink-0 items-center justify-between border-b border-border/60 bg-background/40 px-6 backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-3">
              {view === "studio" ? (
                editingTitle ? (
                  <input
                    autoFocus
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    onBlur={() => setEditingTitle(false)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingTitle(false); }}
                    className="rounded-md border border-primary/40 bg-background/60 px-2 py-1 font-display text-base font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                ) : (
                  <button onClick={() => setEditingTitle(true)} className="group flex items-center gap-2">
                    <h1 className="max-w-[40ch] truncate font-display text-base font-semibold text-foreground">{projectTitle}</h1>
                    <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                )
              ) : (
                <h1 className="font-display text-base font-semibold text-foreground">{VIEW_TITLES[view]}</h1>
              )}
              {view === "studio" && (
                <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">Draft</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <NotificationsMenu />
              <button
                onClick={() => setPricingOpen(true)}
                className="flex h-9 items-center gap-2 rounded-lg bg-gradient-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-glow transition-smooth hover:brightness-110"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Upgrade
              </button>
            </div>
          </header>

          <main className="relative z-0 flex flex-1 flex-col overflow-hidden">
            {view === "studio" && (
              <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                <section className="min-h-0 shrink-0 overflow-y-auto border-b border-border/60 lg:w-[42%] lg:border-b-0 lg:border-r">
                  <PromptPanel
                    prompt={prompt}
                    onPromptChange={setPrompt}
                    onBuild={handleBuild}
                    onDownload={handleDownload}
                    isBuilding={isBuilding}
                  />
                </section>
                <section className="min-h-[60vh] flex-1 lg:min-h-0">
                  <PreviewPanel
                    isBuilding={isBuilding}
                    doc={doc}
                    code={lastCode}
                    onPushToGithub={() => setGithubOpen(true)}
                    onCodeChange={(newCode) => {
                      setLastCode(newCode);
                      setDoc(buildDocFromPrompt(prompt, newCode));
                    }}
                  />
                </section>
              </div>
            )}
            {view === "dashboard" && <DashboardPage onNavigate={setView} />}
            {view === "apps" && (
              <MyAppsPage
                onNavigate={setView}
                onOpenProject={(p) => {
                  setProjectTitle(p.title);
                  setPrompt(p.prompt);
                  setLastCode(p.code);
                  setDoc(buildDocFromPrompt(p.prompt, p.code));
                  setView("studio");
                  toast({ title: "📂 Project loaded", description: p.title });
                }}
              />
            )}
            {view === "templates" && <TemplatesPage onNavigate={setView} />}
            {view === "api" && <ApiSettingsPage />}
            {view === "pricing" && <PricingPage />}
          </main>
        </div>
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <PricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <GithubModal open={githubOpen} onClose={() => setGithubOpen(false)} />

      <footer className="flex h-9 shrink-0 items-center justify-between border-t border-border/60 bg-background/60 px-6 text-[11px] text-muted-foreground backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[hsl(140_60%_55%)] shadow-[0_0_8px_hsl(140_60%_55%)]" />
            All systems operational
          </span>
          <span className="hidden sm:inline opacity-60">·</span>
          <span className="hidden font-mono opacity-70 sm:inline">v1.0.0</span>
        </div>
        <div className="font-light tracking-wide">
          © 2026 <span className="font-semibold text-foreground/80">AppiGen</span>
          <span className="mx-1.5 opacity-50">|</span>
          Powered by <span className="gradient-text font-semibold">NK</span>
        </div>
      </footer>
    </div>
  );
};

export default Index;
