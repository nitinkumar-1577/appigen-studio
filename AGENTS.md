# Project architecture decisions

- Keep project persistence, per-project messages, drafts, and version helpers in a shared `src/lib/projects` module so Studio and My Apps use one ownership-aware contract.
- Keep preview iframe generation, package shims, and runtime validation in `src/lib/preview`, split by responsibility so preview changes do not destabilize studio pages.
- Keep generated Supabase client types untouched; extend app-specific table and RPC types in `src/lib/backend/types.ts` so absent generated declarations do not weaken the automatic client types.