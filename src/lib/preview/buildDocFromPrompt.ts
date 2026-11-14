import { parseFileMarkers } from "./parseFileMarkers";
import { stripReactRenderCalls } from "./sanitizeReactSource";

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

const DEFAULT_APP_CODE = `export default function App() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100">
      <p className="text-center text-sm text-slate-400">Describe an app and build it to see your preview here.</p>
    </main>
  );
}`;
// Softer strip — keeps ES import/export so Babel's env preset can transform them.
function stripModuleSyntaxKeepImports(src: string): string {
  let out = (src || "").replace(/\r\n/g, "\n");
  out = out.replace(/^\s*```(?:jsx|tsx|js|ts|javascript|typescript)?\s*/i, "").replace(/```\s*$/i, "");
  // Remove any residual ReactDOM.createRoot(...).render(<App/>) — the loader mounts the default export.
  out = stripReactRenderCalls(out);
  return out.trim();
}
export function buildDocFromPrompt(prompt: string, code?: string) {
  const safePrompt = (prompt || "Untitled App").replace(/</g, "&lt;");
  const raw = code ?? DEFAULT_APP_CODE;

  // Multi-file mode
  const parsed = parseFileMarkers(raw);
  let files: Record<string, string>;
  let entry: string;
  if (parsed) {
    files = {};
    for (const [p, c] of Object.entries(parsed.files)) files[p] = stripModuleSyntaxKeepImports(c);
    entry = parsed.entry;
  } else {
    const standalone = stripModuleSyntaxKeepImports(raw);
    const withDefaultExport = /\bexport\s+default\b/.test(standalone)
      ? standalone
      : `${standalone}\nexport default App;`;
    files = { "src/App.tsx": withDefaultExport };
    entry = "src/App.tsx";
  }

  // Collect icon globals across all files for lucide fallbacks
  const iconGlobals = collectPotentialGlobals(Object.values(files).join("\n"));

  const runtimeShield = `
(function(){
  var hasMounted = false;
  var inspect = false;
  var hoverEl = null;
  var selectedEl = null;
  function post(payload){ try { parent.postMessage(Object.assign({ __appigen: true }, payload), '*'); } catch(e){} }
  function report(kind, message, stack){
    post({ kind: kind, message: String(message||''), stack: String(stack||'') });
    var host = document.getElementById('__appigen_err');
    if(!host){
      host = document.createElement('div');
      host.id = '__appigen_err';
      host.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:rgba(127,29,29,.95);color:#fee2e2;border:1px solid rgba(248,113,113,.6);border-radius:10px;padding:12px 14px;max-height:45vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.5);backdrop-filter:blur(8px);';
      document.body && document.body.appendChild(host);
    }
    host.replaceChildren();
    var heading = document.createElement('div');
    heading.style.cssText = 'font-weight:700;color:#fecaca;margin-bottom:4px';
    heading.textContent = '⚠ Runtime ' + kind;
    host.appendChild(heading);
    var messageNode = document.createElement('div');
    messageNode.style.cssText = 'white-space:pre-wrap;word-break:break-word';
    messageNode.textContent = String(message || '');
    host.appendChild(messageNode);
    if (stack) {
      var details = document.createElement('details');
      details.style.cssText = 'margin-top:6px;opacity:.85';
      var summary = document.createElement('summary');
      summary.style.cursor = 'pointer';
      summary.textContent = 'stack';
      var stackNode = document.createElement('pre');
      stackNode.style.whiteSpace = 'pre-wrap';
      stackNode.textContent = String(stack);
      details.appendChild(summary);
      details.appendChild(stackNode);
      host.appendChild(details);
    }
  }
  window.__appigenReport = report;
  window.addEventListener('error', function(e){ report('error', e.message, e.error && e.error.stack); });
  window.addEventListener('unhandledrejection', function(e){ var r = e.reason || {}; report('promise', r.message || r, r.stack); });
  var _ce = console.error;
  console.error = function(){ try { report('console', Array.prototype.slice.call(arguments).map(String).join(' '), ''); } catch(_){ } _ce.apply(console, arguments); };
  setTimeout(function(){
    var root = document.getElementById('root');
    if(root && !hasMounted && root.childElementCount === 0 && !document.getElementById('__appigen_err')){
      report('blank', 'Preview rendered nothing within 2.5s', '');
    }
  }, 2500);
  window.__appigenMarkMounted = function(){ hasMounted = true; post({ kind: 'ready' }); };

  function cssPath(el){
    if(!el || el.nodeType !== 1) return '';
    var parts=[];
    while(el && el.nodeType===1 && el.id !== 'root'){
      var name = el.nodeName.toLowerCase();
      if(el.id){ parts.unshift(name + '#' + el.id); break; }
      var idx = 1, sib = el;
      while((sib = sib.previousElementSibling)) if(sib.nodeName===el.nodeName) idx++;
      parts.unshift(name + ':nth-of-type(' + idx + ')');
      el = el.parentElement;
    }
    return parts.join(' > ');
  }
  function outline(el, color){
    if(!el) return;
    el.__appigenPrevOutline = el.style.outline;
    el.__appigenPrevOffset = el.style.outlineOffset;
    el.style.outline = '2px solid ' + color;
    el.style.outlineOffset = '1px';
  }
  function clearOutline(el){
    if(!el) return;
    el.style.outline = el.__appigenPrevOutline || '';
    el.style.outlineOffset = el.__appigenPrevOffset || '';
  }
  function describe(el){
    if(!el || el.nodeType !== 1) return null;
    var cs = window.getComputedStyle(el);
    var text = (el.innerText || '').trim().slice(0, 120);
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      className: (typeof el.className === 'string' ? el.className : '').slice(0, 160),
      text: text,
      path: cssPath(el),
      styles: {
        color: cs.color, backgroundColor: cs.backgroundColor, fontSize: cs.fontSize,
        fontWeight: cs.fontWeight, padding: cs.padding, margin: cs.margin,
        textAlign: cs.textAlign, width: cs.width, height: cs.height,
        borderRadius: cs.borderRadius, display: cs.display
      }
    };
  }
  function setInspect(on){
    inspect = !!on;
    if(!inspect){
      if(hoverEl){ clearOutline(hoverEl); hoverEl = null; }
      document.body.style.cursor = '';
    } else {
      document.body.style.cursor = 'crosshair';
    }
    post({ kind: 'inspect-mode', enabled: inspect });
  }
  document.addEventListener('mouseover', function(e){
    if(!inspect) return;
    var t = e.target;
    if(!(t instanceof Element) || t.closest('#__appigen_err')) return;
    if(hoverEl && hoverEl !== t && hoverEl !== selectedEl) clearOutline(hoverEl);
    hoverEl = t;
    if(t !== selectedEl) outline(t, 'rgba(96,165,250,.9)');
  }, true);
  document.addEventListener('mouseout', function(e){
    if(!inspect) return;
    var t = e.target;
    if(t && t !== selectedEl) clearOutline(t);
  }, true);
  document.addEventListener('click', function(e){
    if(!inspect) return;
    var t = e.target;
    if(!(t instanceof Element) || t.closest('#__appigen_err')) return;
    e.preventDefault(); e.stopPropagation();
    if(selectedEl && selectedEl !== t) clearOutline(selectedEl);
    selectedEl = t;
    outline(t, 'rgba(167,139,250,1)');
    post({ kind: 'visual-select', element: describe(t) });
  }, true);
  window.addEventListener('message', function(e){
    var d = e.data || {};
    if(d && d.__appigenCmd === 'inspect') setInspect(!!d.enabled);
    if(d && d.__appigenCmd === 'clear-selection'){ if(selectedEl) clearOutline(selectedEl); selectedEl = null; }
  });
})();
`;

  const filesJSON = JSON.stringify(files).replace(/</g, "\\u003c");
  const stylesJSON = JSON.stringify(Object.entries(files).filter(([path]) => path.endsWith(".css"))).replace(/</g, "\\u003c");
  const userPackages = [...Object.keys(files).flatMap((path) => [...(files[path] || "").matchAll(/(?:from\s*|require\s*\()\s*['"](@?[a-zA-Z0-9_./-]+)['"]/g)].map((match) => match[1]).filter((name) => !name.startsWith(".") && !name.startsWith("/") && !name.startsWith("@/") && !["react", "react-dom", "react-dom/client", "lucide-react", "react-router-dom", "recharts", "framer-motion", "date-fns", "clsx"].includes(name)))];
  const packagesJSON = JSON.stringify([...new Set(userPackages)]);
  const entryJSON = JSON.stringify(entry);
  const iconsJSON = JSON.stringify(iconGlobals);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>AppiGen Preview — ${safePrompt}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script crossorigin src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/prop-types@15.8.1/prop-types.min.js"></script>
  <script>React.PropTypes = PropTypes;</script>
  <script src="https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js"></script>
  <script src="https://unpkg.com/recharts@2.15.0/umd/Recharts.js"></script>
  <script src="https://unpkg.com/framer-motion@11.15.0/dist/framer-motion.js"></script>
  <script src="https://unpkg.com/date-fns@4.1.0/cdn.min.js"></script>
  <script src="https://unpkg.com/clsx@2.1.1/dist/clsx.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone@7.26.10/babel.min.js"></script>
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
  window.useState = React.useState; window.useEffect = React.useEffect;
  window.useRef = React.useRef; window.useMemo = React.useMemo;
  window.useCallback = React.useCallback; window.useReducer = React.useReducer;
  window.useContext = React.useContext; window.Fragment = React.Fragment;

  window.__appigenIcon = function(name){
    return React.forwardRef(function AppiGenIcon(props, ref){
      props = props || {};
      var size = props.size || 20, sw = props.strokeWidth || 2, cn = props.className || '';
      var rest = Object.assign({}, props); delete rest.size; delete rest.strokeWidth; delete rest.className;
      return React.createElement('svg', Object.assign({ ref: ref, xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round', className: cn, 'aria-hidden': 'true', 'data-icon': name }, rest),
        React.createElement('circle', { cx: 12, cy: 12, r: 8 }),
        React.createElement('path', { d: 'M12 8v8M8 12h8' }));
    });
  };
  ${iconsJSON}.forEach(function(n){ if(!window[n]) window[n] = window.__appigenIcon(n); });

  var lucideExports = window.lucide || {};
  var lucideProxy = new Proxy({}, { get: function(_, k){
    var key = String(k);
    if (key === '__esModule') return true;
    return window[key] || lucideExports[key] || window.__appigenIcon(key);
  }});

  var RouterContext = React.createContext({ path: '/', navigate: function(){}, params: {} });
  var RouteContext = React.createContext({ params: {} });
  function pathMatch(pattern, pathname){
    var names=[];
    var escaped=String(pattern||'*').split('').map(function(ch){var code=ch.charCodeAt(0);return [36,40,41,42,43,46,63,91,92,93,94,123,124,125].indexOf(code)>=0?'\\\\'+ch:ch;}).join('');
    var regex=new RegExp('^'+escaped.replace(/\\\\\\*|\\*/g,'.*').replace(/:([A-Za-z0-9_]+)/g,function(_,n){names.push(n);return '([^/]+)';})+'/?$');
    var match=String(pathname||'/').match(regex); if(!match) return null; var params={}; names.forEach(function(n,i){params[n]=decodeURIComponent(match[i+1]);}); return params;
  }
  function BrowserRouter(props){ var pair=React.useState(window.location.pathname), path=pair[0], setPath=pair[1]; React.useEffect(function(){ var pop=function(){setPath(window.location.pathname);}; window.addEventListener('popstate',pop); return function(){window.removeEventListener('popstate',pop);};},[]); var navigate=function(to){var next=typeof to==='number'?null:String(to); if(next===null){window.history.go(to);return;} window.history.pushState({},'',next);setPath(window.location.pathname);}; return React.createElement(RouterContext.Provider,{value:{path:path,navigate:navigate}},props&&props.children); }
  function HashRouter(props){ var pair=React.useState(window.location.hash.slice(1)||'/'), path=pair[0], setPath=pair[1]; React.useEffect(function(){var pop=function(){setPath(window.location.hash.slice(1)||'/');};window.addEventListener('hashchange',pop);return function(){window.removeEventListener('hashchange',pop);};},[]);var navigate=function(to){window.location.hash=String(to);setPath(String(to));};return React.createElement(RouterContext.Provider,{value:{path:path,navigate:navigate}},props&&props.children); }
  function Routes(props){ var ctx=React.useContext(RouterContext), children=React.Children.toArray(props&&props.children); for(var i=0;i<children.length;i++){var child=children[i];if(child&&child.props){var pattern=child.props.index?ctx.path:(child.props.path==null?'*':child.props.path); var params=pathMatch(pattern,ctx.path);if(params)return React.createElement(RouteContext.Provider,{value:{params:params}},child.props.element||child.props.children||null);}} return null; }
  function Route(props){ return props.element || props.children || null; }
  function Link(props){ var rest = Object.assign({}, props || {}); var to = rest.to || '#'; delete rest.to; var ctx=React.useContext(RouterContext); function onClick(e){ if(rest.onClick) rest.onClick(e); if(e.defaultPrevented) return; if(typeof ctx.navigate==='function'){ e.preventDefault(); ctx.navigate(String(to)); } } return React.createElement('a', Object.assign({ href: String(to), onClick:onClick }, rest), props && props.children); }
  function NavLink(props){ return React.createElement(Link, props, props && props.children); }
  function Outlet(){ return null; }
  function useNavigate(){return React.useContext(RouterContext).navigate || function(){};}
  function useLocation(){var path=React.useContext(RouterContext).path || '/'; return {pathname:path,search:window.location.search||'',hash:window.location.hash||'',state:null,key:'appigen'};}
  function useParams(){return React.useContext(RouteContext).params || {};}

  // ========= Virtual Module System =========
  function showError(msg, stack){ parent.postMessage({ __appigen: true, kind: 'compile', message: msg, stack: stack || '' }, '*'); var pre=document.createElement('pre'); pre.style.cssText='color:hsl(0 75% 60%);background:hsl(0 75% 20%);padding:16px;margin:16px;border-radius:8px;white-space:pre-wrap;font:12px ui-monospace,Menlo,monospace'; pre.textContent='Preview error: '+msg+(stack?'\\n\\n'+stack:''); document.body.appendChild(pre); }
  var FILES = ${filesJSON};
  var STYLES = ${stylesJSON};
  STYLES.forEach(function(file){
    var style = document.createElement('style');
    style.setAttribute('data-appigen-file', file[0]);
    style.textContent = file[1];
    document.head.appendChild(style);
  });
  var UNSUPPORTED_PACKAGES = ${packagesJSON};
  if (UNSUPPORTED_PACKAGES.length) { showError('Unsupported package: ' + UNSUPPORTED_PACKAGES[0] + '. This package is not available in the AppiGen preview runtime.', ''); return; }
  var CACHE = Object.create(null);

  function normalize(p){
    var parts = p.split('/'), out = [];
    for (var i=0;i<parts.length;i++){
      var s = parts[i];
      if (!s || s === '.') continue;
      if (s === '..') out.pop(); else out.push(s);
    }
    return out.join('/');
  }
  function dirname(p){ var i = p.lastIndexOf('/'); return i<0? '' : p.slice(0, i); }

  var EXT_MODULES = {
    'react': React,
    'react-dom': ReactDOM,
    'react-dom/client': ReactDOM,
    'lucide-react': lucideProxy,
    'react-router-dom': { BrowserRouter: BrowserRouter, HashRouter: HashRouter, MemoryRouter: BrowserRouter, Routes: Routes, Route: Route, Link: Link, NavLink: NavLink, Outlet: Outlet, useNavigate: useNavigate, useLocation: useLocation, useParams: useParams },
    'recharts': window.Recharts || {},
    'framer-motion': window.Motion || window.framerMotion || {},
    'date-fns': window.dateFns || {},
    'clsx': window.clsx || function(){ return Array.from(arguments).filter(Boolean).join(' '); },
  };

  function resolveSpec(fromPath, spec){
    if (spec in EXT_MODULES) return { ext: EXT_MODULES[spec] };
    if (!/^[.@]/.test(spec) && !spec.startsWith('/')) {
      throw new Error('Unsupported package: ' + spec + '. This package is not available in the AppiGen preview runtime.');
    }
    var target = spec;
    if (spec.startsWith('@/')) target = 'src/' + spec.slice(2);
    else if (spec.startsWith('./') || spec.startsWith('../')) target = normalize(dirname(fromPath) + '/' + spec);
    else if (spec.startsWith('/')) target = normalize(spec.slice(1));
    var cands = [target, target+'.tsx', target+'.ts', target+'.jsx', target+'.js', target+'.css', target+'/index.tsx', target+'/index.ts', target+'/index.jsx', target+'/index.js'];
    for (var i=0;i<cands.length;i++) if (FILES[cands[i]] != null) return { file: cands[i] };
    throw new Error('Module not found: ' + spec + ' (imported from ' + fromPath + ')');
  }

  function makeRequire(fromPath){
    return function(spec){
      var r = resolveSpec(fromPath, spec);
      if ('ext' in r) return r.ext;
      return loadFile(r.file);
    };
  }

  function loadFile(path){
    if (CACHE[path]) return CACHE[path].exports;
    var src = FILES[path];
    if (src == null) throw new Error('Module not found: '+path);
    if (/\\.css$/i.test(path)) { CACHE[path] = { exports: {} }; return CACHE[path].exports; }
    var compiled;
    try {
      var presets = [
          ['env', { modules: 'commonjs', targets: { esmodules: true } }],
          ['react', { runtime: 'classic' }],
        ];
      if (/\\.tsx?$/.test(path)) {
        presets.push(['typescript', { allExtensions: true, isTSX: /\\.tsx$/.test(path) }]);
      }
      compiled = Babel.transform(src, {
        presets: presets,
        filename: path,
        sourceType: 'module',
      }).code;
    } catch (e) {
      throw new Error('Compile error in '+path+': '+(e && e.message ? e.message : e));
    }
    var module = { exports: {} };
    CACHE[path] = module;
    var fn;
    try {
      fn = new Function('require','module','exports','React','ReactDOM', compiled);
    } catch (e) {
      throw new Error('Syntax error in '+path+': '+(e && e.message ? e.message : e));
    }
    fn(makeRequire(path), module, module.exports, React, ReactDOM);
    if (!module.exports.default && typeof module.exports.App === 'function') module.exports.default = module.exports.App;
    return module.exports;
  }

  function showError(msg, stack){
    parent.postMessage({ __appigen: true, kind: 'compile', message: msg, stack: stack || '' }, '*');
    var pre = document.createElement('pre');
    pre.style.cssText = 'color:#fecaca;background:#7f1d1d;padding:16px;margin:16px;border-radius:8px;white-space:pre-wrap;font:12px ui-monospace,Menlo,monospace';
    pre.textContent = 'Preview error: ' + msg + (stack ? '\\n\\n'+stack : '');
    document.body.appendChild(pre);
  }

  class PreviewErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { error: null }; }
    static getDerivedStateFromError(error) { return { error: error }; }
    componentDidCatch(error, info) {
      if (window.__appigenReport) window.__appigenReport('render', error.message || error, info.componentStack || error.stack || '');
    }
    render() {
      if (this.state.error) {
        return React.createElement('div', { style: { padding: 24, fontFamily: 'system-ui, sans-serif', color: '#fecaca' } },
          React.createElement('h2', null, 'Preview could not render'),
          React.createElement('pre', { style: { whiteSpace: 'pre-wrap' } }, String(this.state.error.message || this.state.error)),
          React.createElement('button', { onClick: function(){ window.location.reload(); }, style: { padding: '8px 12px', cursor: 'pointer' } }, 'Reload preview'));
      }
      return this.props.children;
    }
  }

  try {
    var entryExports = loadFile(${entryJSON});
    var App = entryExports.default || entryExports.App || entryExports;
    if (typeof App !== 'function') {
      // Entry may be a bootstrapping file that already called ReactDOM.render — that's fine.
      if (!document.getElementById('root').childElementCount) {
        throw new Error('Entry file did not export a default React component.');
      }
    } else {
      ReactDOM.createRoot(document.getElementById('root')).render(
        React.createElement(PreviewErrorBoundary, null, React.createElement(App))
      );
      if (window.__appigenMarkMounted) window.__appigenMarkMounted();
    }
  } catch (e) {
    showError(e && e.message ? e.message : String(e), e && e.stack);
  }
})();
  </script>
</body>
</html>`;
}
