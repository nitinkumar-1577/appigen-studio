export function stripModuleSyntax(src: string): string {
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
