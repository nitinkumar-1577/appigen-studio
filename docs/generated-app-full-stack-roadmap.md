# Generated app full-stack capability roadmap

## Current boundary

AppiGen currently generates React source for an isolated browser preview. The preview runtime supplies a fixed allowlist of browser packages, and `validateGeneratedCode` rejects imports outside that list. It does not provision a database, Auth tenant, Storage bucket, Realtime publication, Edge Function, or per-app secrets. Projects stored by AppiGen are the generated source and chat history; that storage is not a generated app's application database. Generated apps that use sample arrays or browser storage are prototypes, not cloud-backed CRUD products.

## Safe delivery plan

1. **Define a backend manifest.** Extend the generation response with a validated, versioned manifest of requested tables, columns, relations, indexes, RLS rules, Auth needs, Storage buckets, Realtime topics, and server functions. Never accept arbitrary SQL or function code from a generated client.
2. **Provision isolated resources.** Create a dedicated Supabase branch or project for each generated app environment. Apply reviewed migrations there first; never run a generated migration against AppiGen's own production schema. Associate each environment with the owning AppiGen user and generated project.
3. **Generate ownership-safe migrations.** Require primary keys, explicit foreign keys, indexes for access paths, enabled RLS, and policies that preserve row ownership for every CRUD operation. Reject policies that grant broad authenticated access or allow ownership changes.
4. **Support Auth and Storage through templates.** Generate typed client setup and sign-in flows from tested templates. Create private buckets with owner-scoped policies and upload/download checks. Keep service-role and provider credentials in managed server-side secrets only.
5. **Add Realtime and Edge Functions incrementally.** Realtime subscriptions must filter by the authenticated owner's rows. Server functions must validate JWT identity, input schema, ownership, rate limits, and secrets; expose only explicitly requested operations.
6. **Gate promotion with end-to-end checks.** Apply migrations to an isolated environment, then test Auth, RLS as two different users, persistent CRUD, Storage permissions, Realtime delivery, function authorization, generated preview, and rollback. Promote only the tested manifest and code revision.

## Required generated-app test matrix

- Anonymous requests cannot read or mutate private rows or files.
- User A cannot read, update, delete, or subscribe to User B's records.
- Ownership fields cannot be changed by client updates.
- Create, read, update, and delete survive refresh and a second session.
- Auth callback and recovery URLs work on the configured preview and production domains.
- Storage rejects cross-user paths and unauthorized overwrites.
- Realtime emits only rows permitted by the same ownership policies.
- Edge Functions reject missing, expired, or wrong-user tokens and never return secrets.
- Failed migrations preserve the last working deployment and can be rolled back.

## Implementation order

Ship the manifest validator and isolated database branch workflow first. Add generated Auth plus persistent CRUD templates next, then Storage, Realtime, and server functions. Until these stages are implemented and tested, label generated apps as frontend previews and do not claim full-stack persistence.
