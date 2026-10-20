export function isGenericFallbackCode(code: string): boolean {
  return (
    code.includes("Plan the experience") &&
    code.includes("Wire up interactions") &&
    code.includes('placeholder="Add something..."') &&
    code.includes("Generated app")
  );
}
