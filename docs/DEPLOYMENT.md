# Deployment Runbook

This runbook covers the non-payment application path. Payment provider setup is intentionally excluded until a provider is chosen.

For the separate free demo configuration, use [FREE-DEMO.md](FREE-DEMO.md).
Demo readiness is reported through `readyForDemo`; it never claims production
readiness through `readyForNonPaymentLaunch`.

## Required And Optional Services

- PostgreSQL database with backups enabled.
- First-party credential auth works without Clerk and stores sessions in PostgreSQL.
- Optional Clerk application with publishable key, secret key, and webhook secret.
- Required S3-compatible object storage and public media URL for listing media.
- Required SMTP account for transactional email.
- Edge or shared rate limiting for a multi-instance deployment. The built-in limiter is a bounded per-process safeguard.
- Optional Gemini key for primary pricing search and Groq key for pricing fallback; other AI features follow `AI_PROVIDER`.

## Environment

Set these variables in the hosting platform:

```env
DATABASE_URL=""
NEXT_PUBLIC_APP_URL=""
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
CLERK_SECRET_KEY=""
CLERK_WEBHOOK_SECRET=""

AI_PROVIDER="mock"
GEMINI_API_KEY=""
GEMINI_MODEL="gemini-3.8-flash"
GEMINI_PRICING_MODEL="gemini-3.8-flash"
GROQ_API_KEY=""
GROQ_MODEL="openai/gpt-oss-120b"
GROQ_PRICING_MODEL="openai/gpt-oss-20b"
DEEPSEEK_API_KEY=""
DEEPSEEK_MODEL="deepseek-v4-flash"
HUGGINGFACE_API_KEY=""
HUGGINGFACE_MODEL="openai/gpt-oss-20b"
AI_REQUEST_TIMEOUT_MS="15000"

STORAGE_ENDPOINT=""
STORAGE_ACCESS_KEY_ID=""
STORAGE_SECRET_ACCESS_KEY=""
STORAGE_BUCKET=""
STORAGE_REGION="auto"
STORAGE_PUBLIC_URL=""

SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
SMTP_SECURE="false"
```

## Build And Release

Run these commands in CI or the host build step. Do not run `npm run db:seed` in production:

```bash
npm ci
npm run db:generate
npm run lint
npm run typecheck
npm test
npm run build
```

Apply migrations before promoting a release:

```bash
npm run db:migrate:deploy
```

Start the app:

```bash
npm run start
```

## Post-Deploy Checks

1. Sign in as an admin account.
2. Open `/api/health/readiness`.
3. Confirm `readyForNonPaymentLaunch` is `true` or review the `warnings` list.
4. Run the provider smoke checks in [PROVIDER-SMOKE.md](./PROVIDER-SMOKE.md).
5. Run the workflow smoke runner against the deployed URL when first-party credential auth is enabled:

```bash
SMOKE_BASE_URL="https://your-host.example" npm run smoke:workflows
```

If Clerk is enabled, use browser-based auth checks instead of the first-party credential smoke runner.

## Rollback

- Roll application code back through the hosting platform.
- Do not roll back database migrations unless a migration-specific rollback has been written and tested.
- If object storage or SMTP credentials were rotated, restore the previous credential set in the host environment.
