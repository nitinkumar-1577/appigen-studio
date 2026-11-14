# AppiGen Studio

AppiGen generates and repairs React apps through the Supabase `Appigen` Edge
Function. Provider API keys stay server-side and must not be added to the Vite
client environment.

## Configure AI generation

Configure the existing Supabase Edge Function secrets, then deploy the
function:

```sh
# Lovable AI is the default provider. Lovable Cloud manages LOVABLE_API_KEY for the project.
supabase secrets set LOVABLE_API_KEY=your-lovable-api-key --project-ref your-project-ref
supabase secrets set GROQ_API_KEY=your-groq-api-key --project-ref your-project-ref
supabase secrets set 'DEEPSEEK-API-KEY'=your-deepseek-api-key --project-ref your-project-ref
supabase secrets set OPENROUTER_API_KEY=your-openrouter-api-key --project-ref your-project-ref
supabase secrets set GEMINI_API_KEY=your-gemini-api-key --project-ref your-project-ref
supabase secrets set OPENAI_API_KEY=your-openai-api-key --project-ref your-project-ref
supabase secrets set NVIDIA_API_KEY=your-nvidia-api-key --project-ref your-project-ref
supabase functions deploy Appigen --project-ref your-project-ref
```

Lovable AI is the default provider and uses the managed server-side
`LOVABLE_API_KEY` through `https://ai.gateway.lovable.dev/v1`; its default model
is `google/gemini-3.8-flash` with `openai/gpt-5.5` available. When the Lovable
key is absent, Groq remains the first fallback (GPT-OSS 20B or 120B).
DeepSeek uses `deepseek-chat`; OpenRouter, Gemini, OpenAI, and NVIDIA NIM
are also supported. NVIDIA NIM includes
`mistralai/mistral-large-4-1t-a52b`. If a selected provider is unavailable,
generation and repair can try another configured provider without exposing
credentials. The provider selection, system-instruction, temperature, top-P,
and safety settings are sent with build requests; provider credentials,
endpoints, and model configuration remain in the Edge Function.

The Edge Function reads the exact configured names `LOVABLE_API_KEY`, `GEMINI_API_KEY`,
`OPENROUTER_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK-API-KEY`, and
`NVIDIA_API_KEY`. `DEEPSEEK_API_KEY` is accepted only as a backward-compatible
fallback; no secret rename is required. They are never included in frontend
code, browser storage, request bodies, logs, health responses, or GitHub.

### Provider health checks

POST `{ "mode": "health" }` to the `Appigen` Edge Function to run a secure
authentication/model-listing check and a small generation check for every
provider. Use `{ "mode": "health", "provider": "nvidia" }` to test one provider.
The response contains only sanitized status values (`working`, `missing`,
`invalid_key`, `quota_exhausted`, `rate_limited`, `model_unavailable`, `timeout`,
or a non-sensitive request/network status) and model identifiers; API keys and
provider response bodies are never returned.

## Authentication and project storage

AppiGen supports Supabase email OTP, email/password, GitHub OAuth, and Google
OAuth. Enable the social providers you want to offer in Supabase Auth and add
your local and deployed app URLs to the Auth redirect allow list. GitHub
publishing also requires GitHub OAuth repository access (`repo` scope); the
user authorizes access before the app reads repositories or pushes commits.
Apply the database migrations with `supabase db push`; projects, their
generated file maps, conversations, version history, and activity ledger are
scoped to the signed-in user by row-level security.

### Supabase authentication setup

Configure these values in the Supabase Dashboard; do not put OAuth secrets in
the repository, Vite environment, browser storage, or chat:

1. Open **Authentication → URL Configuration**.
2. Set the Site URL to the deployed AppiGen URL. For local Vite development use
   `http://127.0.0.1:8080`.
3. Add these redirect URLs when developing locally:
   `http://127.0.0.1:8080` and `http://localhost:8080`.
4. Add the deployed HTTPS origin as an additional redirect URL.
5. Open **Authentication → Providers**, enable **Google**, and enter the
   Google OAuth Client ID and Client Secret from Google Cloud Console.
6. In Google Cloud Console, add the exact Supabase callback URL shown by the
   provider configuration, normally
   `https://<project-ref>.supabase.co/auth/v1/callback`.
7. Enable **GitHub** in the same Supabase Providers screen. Create or edit a
   GitHub OAuth App and use the exact Supabase callback URL as its
   Authorization callback URL. Enter the GitHub Client ID and Client Secret
   only in Supabase.
8. In **Authentication → Email**, decide whether Confirm email is enabled.
   When enabled, signup shows a verification message and the user must follow
   the email link before password sign-in.
9. Configure a production SMTP provider if hosted Supabase email delivery is
   not already enabled. This is required for verification and password reset
   emails.

The frontend uses the Supabase provider identifiers `google` and `github`.
GitHub login only authenticates the AppiGen account; it does not connect a
repository. Repository authorization remains a separate action. Password
reset links return to the same allow-listed AppiGen origin and are handled by
the recovery session event.

If a signed-in save cannot reach Supabase, AppiGen keeps an owner-scoped local
recovery copy and attempts to sync it the next time that account opens the app.
General preferences and API-generation controls are saved in the current
browser. System appearance defaults to dark. The dashboard reports measured
prompt characters and build durations; a remaining credit balance is omitted
until an account quota is configured. Anonymous telemetry is opt-in and stores
only event names without prompts or account identifiers.

## Generated app structure

New builds are generated as a small, purpose-built project rather than one
large component: `src/App.tsx` composes a page, `src/pages/` contains screens,
`src/components/` contains reusable UI, and `src/styles.css` holds app-specific
design tokens and styles. Stateful workflows and domain rules are separated
into `src/hooks/` and `src/lib/` when the prompt needs them. The preview loads
the generated CSS and lists all generated files in Code view. Edits preserve
the existing project's structure.

Before each build or edit, the `Appigen` Edge Function returns a visible
implementation roadmap and file blueprint. Edits include the existing file
tree and recent conversation; generated output is validated and invalid output
is sent through the repair stage before it can replace the preview. Deploy the
latest `Appigen` function for the planning route and repair flow to be available.

## Build and test

```sh
npm install
npm test
npm run build
```
