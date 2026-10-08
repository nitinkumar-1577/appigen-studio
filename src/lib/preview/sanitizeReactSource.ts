import { stripModuleSyntax } from "./stripModuleSyntax";

const ROOT_RENDER_CALL = /ReactDOM\s*\.\s*createRoot\s*\(\s*document\s*\.\s*getElementById\s*\(\s*["']root["']\s*\)\s*\)\s*\.\s*render\s*\(\s*<App\s*\/?>\s*\)\s*;?/g;
const LEGACY_RENDER_CALL = /ReactDOM\s*\.\s*render\s*\(\s*<App\s*\/?>\s*,\s*document\s*\.\s*getElementById\s*\(\s*["']root["']\s*\)\s*\)\s*;?/g;
const BARE_CREATE_ROOT_CALL = /\bcreateRoot\s*\(\s*document\s*\.\s*getElementById\s*\(\s*["']root["']\s*\)\s*\)\s*\.\s*render\s*\(\s*<App\s*\/?>\s*\)\s*;?/g;

export function stripReactRenderCalls(src: string): string {
  return src
    .replace(ROOT_RENDER_CALL, "")
    .replace(LEGACY_RENDER_CALL, "")
    .replace(BARE_CREATE_ROOT_CALL, "");
}

export function sanitizeReactSource(src: string): string {
  const defaultExportName =
    src.match(/^\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m)?.[1] ||
    src.match(/^\s*export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\b/m)?.[1] ||
    "App";
  const body = stripModuleSyntax(src)
    .pipe?.()
    .trim();
  return `${body}\nconst __appigenDefault = typeof ${defaultExportName} !== "undefined" ? ${defaultExportName} : (typeof App !== "undefined" ? App : null);\nif (typeof __appigenDefault === "function") module.exports.default = __appigenDefault;`;
}
