# Provider and environment remediation

Audit date: 2026-11-10

## Supabase project alignment

- Vercel production, the Supabase CLI link, and `supabase/config.toml` use project `kdmenojgblikqtuholkn`.
- The tracked local `.env` had three different project references across `SUPABASE_*` and `VITE_SUPABASE_*` variables. Its local copy now targets `kdmenojgblikqtuholkn` and uses that project's publishable key.
- A local, non-generative `mode=plan` request returned HTTP 200 with a plan from `kdmenojgblikqtuholkn.supabase.co`; this verified the Vite project's URL/key pairing without invoking a model.
- `.env` was already tracked and contained credentials. The local file is retained, ignored, and removed from the Git index. Its old commit history still contains prior contents, and a local key value was also included in a diagnostic tool output during this audit. Revoke/rotate the exposed AI credential in its provider console. No provider or production Supabase secret was changed here.

## Deployed provider configuration

The active production Edge Function is `Appigen` version 142. Its six provider secret names match the deployed source:

| Provider | Secret name | Base URL / protocol | Configured model | Latest known production status |
|---|---|---|---|---|
| Groq | `GROQ_API_KEY` | `https://api.groq.com/openai/v1`, OpenAI-compatible | `openai/gpt-oss-120b` before this local fix | Authentication working; generation returned request error |
| DeepSeek | `DEEPSEEK_API_KEY` (code also accepts `DEEPSEEK-API-KEY`) | `https://api.deepseek.com`, OpenAI-compatible | `deepseek-v4-pro` | Authentication working; generation quota/balance exhausted |
| OpenRouter | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1`, OpenAI-compatible | `openai/gpt-4o-mini` | Authentication working; generation quota/balance exhausted |
| Gemini | `GEMINI_API_KEY` | `https://generativelanguage.googleapis.com/v1beta`, `generateContent` | `gemini-2.5-flash` | Invalid credentials (401) |
| OpenAI | `OPENAI_API_KEY` | `https://api.openai.com/v1`, OpenAI-compatible | `gpt-4o-mini` | Invalid credentials (401) |
| NVIDIA NIM | `NVIDIA_API_KEY` | `https://integrate.api.nvidia.com/v1`, OpenAI-compatible | `mistralai/mistral-large-4-1t-a52b` | Request rejected (400) |

These are the last live health results from the previous audit; no new provider generation calls were made in this pass. The deployed Edge Function and provider secrets remain unchanged.

## Code fixes prepared locally

- The NVIDIA/DeepSeek adapter now sends the OpenAI-compatible `max_tokens` field without also sending `max_completion_tokens`; it no longer adds NVIDIA's undocumented `chat_template` field. NVIDIA's official model example uses `/v1/chat/completions`, `max_tokens`, and no `chat_template` field. The old production log recorded `Bad Request` and response field names only, so the exact rejected field cannot be proven retroactively.
- Groq's health probe now allows 64 output tokens and requests low reasoning effort. The previous 16-token probe could report a false generation failure for a reasoning model whose response budget was consumed before visible text.
- Provider failure handling now distinguishes invalid credentials (401), permission denied (403), exhausted balance (402), rate limits (429), unavailable models (404), and request errors (4xx). Sanitized provider messages include a bounded reason and redact known API-key forms before returning/logging it.
- Automatic fallback preserves the user's selected provider first, then tries Gemini and Groq (providers with free tiers) before the other configured providers. Fallback handles credential, quota, model, request, network, and timeout failures. Each failover sequence has a 105-second budget, and individual requests receive only the remaining time.
- New Groq defaults use GPT-OSS 20B, which is lower-cost than 120B for Groq Developer-tier use. No billing or paid plan was enabled. Groq credentials authenticate, but generation was not verified; Gemini is free-tier eligible but its production key is currently invalid. So a working free-quota production provider is not yet confirmed.
- A local `GEMINI_API_KEY` stays server-side. No `VITE_*API_KEY` remains in the local `.env`; a scan found no AI secret in the built client assets.

## Verification limits

- Automated provider/config tests: passed.
- Full Vitest suite: passed, 145 tests across 24 files.
- TypeScript: passed. ESLint: zero errors, 19 existing warnings. Production build: passed.
- Calculator and CRM generation were not run in this pass. Current live credentials do not identify a working free-tier generation path, and invoking another model could consume paid credits. No generation call was made.
- No production secrets, migrations, or deployments were changed. The local Edge Function fixes need a later deployment and a generation test after a working no-cost provider credential is configured.

## Provider references

- [Gemini 2.5 Flash free-tier pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Groq billing tiers](https://console.groq.com/docs/billing-faqs)
- [Groq API request fields](https://console.groq.com/docs/api-reference)
- [NVIDIA Mistral Large 4 request example](https://build.nvidia.com/mistralai/mistral-large-4-1t-a52b)
- [DeepSeek supported model IDs](https://api-docs.deepseek.com/api/list-models/)
