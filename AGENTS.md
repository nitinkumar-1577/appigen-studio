# Project architecture decisions

- Keep project persistence, per-project messages, drafts, and version helpers in a shared `src/lib/projects` module so Studio and My Apps use one ownership-aware contract.
- Keep preview iframe generation, package shims, and runtime validation in `src/lib/preview`, split by responsibility so preview changes do not destabilize studio pages.