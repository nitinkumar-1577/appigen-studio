# AppiGen release verification — 2026-11-13

## Implemented in this release candidate

- Restricts active AI providers to Groq, NVIDIA NIM, and Gemini, with server-side secret lookup and configured-provider failover.
- Raises generation output budgets to avoid truncating full app builds; keeps model-attempt fallback and reports the actual model used.
- Strengthens generator instructions for professional visual hierarchy, subject-matched imagery, functional controls, and meaningful loading/error/empty states.
- Replaces the small template list with 20 image-led, category-filterable templates.
- Wires preview screenshot capture into project persistence so My Apps displays real saved thumbnails.
- Removes the sidebar's understanding/build-progress panel and the redundant "Understood" chat filler; removes the Preview "Fix with AI" control while retaining manual code editing.
- Adds 24-hour notification retention.
- Uses the SECURITY INVOKER dashboard usage RPC for lifetime app count, lifetime prompt characters, average build time, and completed builds; recent activity is filtered to the last 24 hours.
- Keeps AI provider secrets server-side in Supabase Edge Function secrets. `.env.example` contains empty secret placeholders only.

## Verification

- Vitest: 36 test files, 235 tests passed.
- TypeScript app check passed.
- Vite production build passed.
- ESLint: 0 errors, 25 warnings.
- Production dependency audit: 0 vulnerabilities.
- Generated e-commerce smoke-test project: 6 source files, Vite production build passed.
- Live provider health: Groq, NVIDIA NIM (Nemotron 3.5 Lightning 30B), and Gemini each returned `generation=working`.
- Supabase Edge Function `Appigen` version 184 is ACTIVE with JWT verification enabled.

## Deployment note

This release candidate was built from the repository working tree. The connected GitHub integration has returned 403 for write operations, so GitHub `main` still needs the verified changes committed. Production deployment is only considered complete after the new Vercel deployment is ready and smoke-tested.
