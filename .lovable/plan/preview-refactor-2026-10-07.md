# Preview Refactor

## Scope
Refactor `Index.tsx` preview helpers into `src/lib/preview/` modules and apply the requested iframe, retry, viewport, CDN, and error-boundary fixes without changing the existing interface.

## Implementation
- Extract `buildDocFromPrompt`, `stripModuleSyntax`, `sanitizeReactSource`, `parseFileMarkers`, and `buildErrorDoc` into focused preview modules, updating `Index.tsx` imports.
- Verify preview error messages originate from the current preview iframe; render overlay details with `textContent` and reset retry de-duplication after successful repair.
- Switch the root viewport utility to `h-dvh` and pin React, React DOM, and Babel CDN URLs to exact versions.
- Add an app-level ErrorBoundary with a clean failure card and Reload action.

## Technical details
Use React class-boundary lifecycle methods (`getDerivedStateFromError` and `componentDidCatch`) and the existing Button component for reload. Keep all other UI and styles unchanged.
