# AppiGen parity audit report

Audit run: 2026-11-10  
Production URL: https://appigen-studio.vercel.app/  
Production deployment: READY, commit `22d21465b0608357b7d5cb7afed80455768c0edd`

## Feature results

“PASS (automated)” means the corresponding repository tests passed; it does not claim a live third-party or cross-session test.

| Feature | Result | Evidence / limitation |
|---|---|---|
| Fresh Studio startup | PASS (local and production browser) | Both initialize as Untitled Project with an empty prompt. Local screenshot: `artifacts/appigen-local-startup.png`. |
| Existing local draft hydration on startup | PASS (code/test) | Startup no longer hydrates old drafts. Draft persistence/recovery helpers remain for autosave. |
| Studio title editing | PASS (unit/code) | Inline title editor removed; rename is available in My Apps. |
| Authentication modal, OAuth error recovery | PASS (automated) | OAuth returned errors, rejected promises, and loading recovery covered in Vitest. |
| Google/GitHub OAuth provider setup | NOT TESTED | Requires real provider credentials and callback setup; no secrets were exposed or changed. |
| Email signup/login, verification, password recovery, logout | NOT TESTED end-to-end | Existing component/unit suite passes, but no live account was created or changed. |
| Session restoration/race handling | PASS (automated) | Session restore, auth-event race, and rejection settlement tests pass. |
| Dashboard, profile, settings, notifications | NOT TESTED end-to-end | No dedicated production interaction pass performed. |
| My Apps create/open/search/sort/delete | PARTIAL | Component/repository tests pass; cloud-account workflows were not exercised in production. |
| My Apps rename | PASS (automated) | Ownership-filtered repository update and rename UI tested. |
| Templates and template-to-Studio | NOT TESTED end-to-end | No full browser workflow executed. |
| Prompt composer, chat, follow-up edits | NOT TESTED end-to-end | UI reviewed; no successful live generated app to edit. |
| Planner, multi-file generation, validation, review, repair | FAIL (live generator) | Production CRM prompt produced a plan then failed at NVIDIA NIM with HTTP 400. No finished project was generated. |
| Preview render/responsive behavior/refresh | PARTIAL | Preview and generated-code validation unit tests pass; no successful CRM output to exercise. |
| Code editor/file tree/manual edits/save | NOT TESTED end-to-end | No generated project was available. |
| Version creation/restore/delete/clear | PARTIAL | Repository/version helpers are covered by automated tests; cloud account workflow not exercised. |
| Cloud persistence/sync across sessions | NOT TESTED | Requires an authenticated test account and a second session. |
| ZIP export | PASS (automated only) | Export helper tests pass; downloaded archive not manually opened in browser. |
| GitHub workflow | NOT TESTED | No GitHub authorization or push was attempted. |
| Provider selection/model selection | PARTIAL | API settings component tests pass; live health endpoint was exercised. |
| Provider health and fallback | FAIL (live configured providers) | Endpoint returned health results, but no provider completed generation. Groq and NVIDIA returned request errors; DeepSeek/OpenRouter reported exhausted quota; Gemini/OpenAI returned invalid credentials. |
| Loading/empty/error/timeout/cancel states | PARTIAL | Existing unit tests and generator failure state were exercised; timeout/cancel were not independently triggered. |

## Automated checks

- `npm test -- --reporter=dot`: PASS, 24 test files / 141 tests.
- `npm run lint`: PASS, zero errors and 19 warnings.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS; route/editor splitting removes the former 828 KB chunk warning.
- Local Supabase Docker startup: FAIL to start in this environment, so the proposed migration was not applied or represented as production-verified.
- Local browser: clean startup passed. Local generation could not use its configured backend (HTTP 502 / invalid Groq credentials).
- Production browser: clean startup passed; provider health and one isolated CRM build were attempted. Build failed as noted above. No project was saved and no user project/data was changed.

## Changes prepared

- OAuth request failures now restore loading and report provider-specific disabled, configuration, network, and redirect errors.
- Session restoration catches failures and ignores stale results after an auth event or unmount.
- My Apps supports ownership-checked rename; Studio no longer exposes direct title editing.
- Generator Edge Function types were tightened without changing the database schema or provider behavior.
- Added route-level lazy loading and lazy Monaco loading; configured Supabase vendor chunking.
- Added GitHub Actions CI workflow for tests, lint, TypeScript, and build.
- Added `docs/generated-app-full-stack-roadmap.md` describing the current frontend-only generation boundary and staged full-stack work.
- Added migration `supabase/migrations/20261110063940_audit_rls_performance_and_trigger_acl.sql` to preserve ownership checks while wrapping `auth.uid()`, and revoke public RPC execution on the trigger function. It remains unapplied pending local database validation.

## Outstanding live blockers

1. Provider credentials/quota in the production Supabase function configuration must be repaired before the generator can produce the requested CRM. The health response identifies the affected provider categories above; configure valid credentials and sufficient provider balance in the Supabase Edge Function secrets, then rerun health and generation.
2. Supabase Auth provider settings and allowed redirect URLs must be checked in the Supabase dashboard before Google/GitHub live OAuth can be verified.
3. Local Supabase could not start, and remote migration history differs from the checked-in history. The RLS/trigger migration therefore remains unapplied.
4. Production still serves commit `22d21465b0608357b7d5cb7afed80455768c0edd`. This audit's uncommitted changes have not been deployed. The required real generation workflow failed, so promoting this build would violate the instruction not to deploy broken code.
5. Since CI has not been pushed/run by GitHub, the new workflow file is locally reviewed only; production gating still needs repository/Vercel protection configured.
