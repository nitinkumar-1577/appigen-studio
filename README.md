# AppiGen Studio

AppiGen generates and repairs React apps through the Groq API from the Supabase
`Appigen` Edge Function. The Groq API key stays server-side and must not be
added to the Vite client environment.

## Configure AI generation

Set `GROQ_API_KEY` in the Supabase project's Edge Function secrets, then deploy
the function:

```sh
supabase secrets set GROQ_API_KEY=your-groq-api-key --project-ref your-project-ref
supabase functions deploy Appigen --project-ref your-project-ref
```

The function tries Groq's GPT-OSS 20B model first and GPT-OSS 120B as the
generation fallback. Repairs use Groq as well.

## Authentication and project storage

AppiGen supports Supabase email OTP, email/password, GitHub OAuth, and Google
OAuth. Enable the social providers you want to offer in Supabase Auth and add
your local and deployed app URLs to the Auth redirect allow list. Apply the
database migrations with `supabase db push`; projects and their generated file
maps, conversations, and version history are scoped to the signed-in user by
row-level security.

If a signed-in save cannot reach Supabase, AppiGen keeps an owner-scoped local
recovery copy and attempts to sync it the next time that account opens the app.

## Generated app structure

New builds are generated as a small, purpose-built project rather than one
large component: `src/App.tsx` composes a page, `src/pages/` contains screens,
`src/components/` contains reusable UI, and `src/styles.css` holds app-specific
design tokens and styles. Stateful workflows and domain rules are separated
into `src/hooks/` and `src/lib/` when the prompt needs them. The preview loads
the generated CSS and lists all generated files in Code view. Edits preserve
the existing project's structure.

## Build and test

```sh
npm install
npm test
npm run build
```
