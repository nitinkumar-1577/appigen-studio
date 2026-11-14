# AppiGen: reliable AI builds and cloud versions

## User-visible changes
- Make AppiGen use Lovable AI by default, so building does not require the user to supply or repair a provider API key.
- Improve generation and editing instructions for polished, complete apps, and keep AI failure messages clear rather than returning placeholder output.
- Give every saved app a numbered version history. Save each successful build/edit, and make restore/delete persist to the signed-in account across devices.
- Animate the “Describe a change…” prompt hint while keeping the actual prompt empty and editable.
- Fix the project data fields and version-delete permissions the current app needs, then test the real signed-in build and version flows where access allows.

## Implementation outline
1. Check the built-in AI catalog, use its supported powerful chat model through a server-only Lovable Cloud function, and keep all credentials off the browser. Preserve direct-provider options while making Lovable AI the usable default.
2. Strengthen the app-generation/review instructions, and expose progress/error states already supported by the Studio.
3. Add the missing project sync fields and owner-only version deletion. Have the database record numbered snapshots on initial save and each code change; update the app to refresh, restore, and delete that shared history without duplicating snapshots.
4. Add a focus-safe animated edit hint and targeted tests. Validate a real demanding app prompt, browser preview, cloud read-back, and the required viewport sizes.

## Technical notes
- Continue the existing React/Vite client and Supabase Edge Function boundary; call Lovable AI with its managed server secret and supported Responses endpoint/model.
- Use one transactionally applied migration for additive project columns, ordered version numbers, the snapshot trigger, and owner-scoped grants/policies. Regenerate database types after it applies.
- Keep project synchronization and version contracts in `src/lib/projects`, and generated-preview helpers in `src/lib/preview`.
