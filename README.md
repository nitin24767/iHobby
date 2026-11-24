# iHobbyWorld

For the free public demonstration setup, see [Free demo deployment](docs/FREE-DEMO.md)
and the included `render.yaml`. The demo uses explicit `DEPLOYMENT_MODE=demo`,
external PostgreSQL and image storage, built-in login, mock AI and no email delivery.

iHobbyWorld is a production-oriented full-stack rebuild of the original `iHobbyWorld.html` mockup. The current product scope is intentionally RC-only and follows the mockup closely: marketplace workflows for RC vehicles and components across drones, helicopters, planes, and cars.

For future AI agents, also read [CLAUDE.md](./CLAUDE.md). It contains the detailed handoff context, implementation decisions, and current known gaps. Deployment and provider verification docs live in [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) and [docs/PROVIDER-SMOKE.md](./docs/PROVIDER-SMOKE.md).

## Current Status

The app is no longer just an HTML mockup. It is a Next.js application with PostgreSQL persistence, first-party email/password auth, database-backed sessions, Clerk-ready optional auth, database-backed marketplace data, and server actions for major workflows.

Implemented and database-backed:

- RC marketplace browsing for vehicles and components.
- Dynamic category, vehicle, and component counts from listings.
- Listing detail, bid, offer, watchlist, and message seller workflows.
- Buyer, seller, and admin dashboards with role-specific counts.
- Seller application and admin seller approval workflow.
- Seller listing creation as `PENDING_REVIEW`.
- Admin reports, listing moderation, category/taxonomy management, user lifecycle/profile controls, and persisted audit screens.
- Credits/wallet ledger.
- Build planner data.
- Repair advisor sessions.
- Pricing comparable sales and range guidance.
- Messages inbox, full message thread rendering, and DB-backed send action.
- Notification center with persisted in-app notifications and optional SMTP email delivery.
- Local media uploads with S3-compatible object storage support through environment variables.
- Prisma migration history for development and deployment.
- Admin-only readiness health report at `/api/health/readiness`.
- HTTP workflow smoke runner for public, buyer, seller, admin, and API checks.
- AI provider abstraction with mock, Groq, DeepSeek, and Hugging Face modes.

Still intentionally out of scope until a payment provider is chosen:

- Real payment processing, bid holds, refunds, and payouts.

Credential-dependent integrations are wired but must be configured and smoke-tested in the target environment: Clerk, SMTP email, S3-compatible storage, DeepSeek/Hugging Face, and production PostgreSQL.

## Tech Stack

- Next.js App Router, React, TypeScript
- Prisma 7 and PostgreSQL
- First-party email/password auth with database-backed sessions
- Optional Clerk authentication integration
- Tailwind CSS
- Zod validation
- Vitest tests
- Swappable AI provider layer for mock, DeepSeek, or Hugging Face

## Repository Layout

```text
prisma/
  schema.prisma          Database models and enums
  seed.ts                Deterministic seed data
src/app/
  page.tsx               Main RC marketplace
  marketplace/           Marketplace route alias
  listings/[slug]/       Listing detail and listing actions
  sell/new/              Seller listing creation
  sell/listings/         Seller inventory management
  dashboard/*            Buyer, seller, admin dashboards
  admin/*                Admin operations screens
  account/seller-application/
  messages/              DB-backed inbox and send action
  tools/*                Build, repair, pricing tools
  api/*                  AI, auth, health, upload, Clerk webhook endpoints
src/components/          Shared shell, cards, listings, metrics, access panel
src/lib/
  auth.ts                Clerk/local session actor resolution
  rbac.ts                Role permissions
  prisma.ts              Prisma client
  data.ts                Fallback RC data only
  server/marketplace.ts  Main server-side marketplace service layer
  server/users.ts        User sync and Clerk role helpers
  server/seller-applications.ts
  validations/*          Zod schemas
  ai/providers.ts        AI provider abstraction
tests/                   Unit and service tests
public/media/            Local SVG marketplace media
iHobbyWorld.html         Original high-fidelity mockup reference
```

## Local Setup

Install dependencies:

```bash
npm install
```

Create environment file:

```bash
copy .env.example .env.local
```

For the current local setup used during development, PostgreSQL was run on host port `5434`:

```env
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5434/ihobbyworld"
```

If you need a new local PostgreSQL container, one workable command is:

```bash
docker run --name ihobbyworld-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ihobbyworld -p 5434:5432 -d postgres:16
```

Generate Prisma client, apply migrations, and seed data:

```bash
npm run db:generate
npm run db:migrate:dev
npm run db:seed
```

For production or CI deployments, use:

```bash
npm run db:migrate:deploy
```

Start the app:

```bash
npm run dev
```

If port `3000` is occupied, use the port that has been used in this workspace:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3001
```

Health check:

```text
http://127.0.0.1:3001/api/health/database
```

Expected healthy response:

```json
{"connected":true,"label":"DB live","listingCount":12}
```

Admin readiness check:

```text
http://127.0.0.1:3001/api/health/readiness
```

Local workflow smoke check:

```bash
npm run smoke:workflows
```

## Environment Variables

See [.env.example](./.env.example).

Important variables:

- `DATABASE_URL`: PostgreSQL connection string.
- `NEXT_PUBLIC_APP_URL`: Public app URL.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk browser key.
- `CLERK_SECRET_KEY`: Clerk server key.
- `CLERK_WEBHOOK_SECRET`: Clerk webhook verification secret.
- `AI_PROVIDER`: `mock`, `groq`, `deepseek`, or `huggingface`.
- `GROQ_API_KEY`, `GROQ_MODEL`: Groq provider configuration.
- `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`: DeepSeek provider config.
- `HUGGINGFACE_API_KEY`, `HUGGINGFACE_MODEL`: Hugging Face provider config.
- `STORAGE_*`: S3-compatible object storage settings. `STORAGE_PUBLIC_URL` is required for production media delivery.
- `SMTP_*`: SMTP settings for production notifications.

The app runs without Clerk or AI keys. Without Clerk keys, `/sign-in` uses first-party email/password auth and the `AuthSession` table. Without AI keys, AI routes return deterministic mock guidance. Production readiness blocks local media storage and mock email delivery.

## Development Seed Data

`npm run db:seed` is restricted to non-production environments and creates sample marketplace data plus local-only test accounts. Production users, roles, and marketplace content must be created through controlled operational workflows, not by running the development seed.

Sign in at:

```text
/sign-in
```

The authenticated local account is stored in an HTTP-only `ihw_session` cookie with the session hash persisted in PostgreSQL. If Clerk is configured, role comes from Clerk metadata and/or the synced Prisma user record.

Registration:

- First-party mode: `/sign-up` creates a new Prisma `User`, hashes the password with scrypt, signs the user in, and starts the account as `BUYER`.
- Clerk mode: `/sign-up` uses Clerk. The webhook sync creates or updates the Prisma `User` row and new users start as `BUYER`.
- Seller access: buyer submits `/account/seller-application`; admin approves it at `/admin/seller-applications`.
- User management: admins manage profiles, roles, and account status at `/admin/users`.

## Role Logic

Roles are defined in `src/types/domain.ts` and enforced through `src/lib/rbac.ts`.

Visitor:

- Can browse public marketplace data.
- Must sign in for account workflows.

Buyer:

- Can bid, offer, watch, message, use tools, manage credits, and apply to sell.

Seller:

- Can create listings, manage inventory, receive offers/messages, use pricing tools, and track credits/payouts.

Admin:

- Can moderate listings/reports, approve sellers, inspect users, manage taxonomy views, use messages, and view audit information.

Seller approval flow:

1. Buyer submits `/account/seller-application`.
2. Application is persisted in `SellerApplication`.
3. Admin reviews at `/admin/seller-applications`.
4. Approval updates the Prisma user role to `SELLER`.
5. If Clerk is configured, approval also syncs Clerk public metadata.

## Data Model Summary

Core Prisma models:

- `User`
- `HobbyCategory`
- `Listing`, `ListingMedia`
- `Bid`
- `Offer`
- `WatchlistItem`
- `Conversation`, `ConversationParticipant`, `Message`
- `Report`
- `ModerationAction`
- `SellerApplication`
- `AuditLog`
- `AiJob`
- `LoyaltyEvent`
- `CreditLedgerEntry`
- `BuildConfiguration`, `BuildPart`
- `RepairSession`
- `PricingComparable`

Seed data includes:

- Seeded buyer, seller, admin users.
- RC categories for drones, helicopters, planes, and cars.
- 4 vehicle listings and 5 component listings.
- Bids, offers, watchlist, reports, seller application.
- Wallet ledger entries for buyer, seller, admin.
- Build planner data and parts.
- Repair sessions.
- Pricing comparable sales.
- Buyer/seller and admin/seller conversations with persisted message rows.

## Main Routes

Public and marketplace:

- `/`
- `/marketplace`
- `/categories/[slug]`
- `/listings/[slug]`

Account:

- `/sign-in`
- `/sign-up`
- `/wallet`
- `/loyalty`
- `/messages`
- `/watchlist`
- `/bids`
- `/offers`

Seller:

- `/account/seller-application`
- `/dashboard/seller`
- `/sell/new`
- `/sell/listings`

Buyer:

- `/dashboard/buyer`
- `/tools/build`
- `/tools/repair`
- `/tools/pricing`

Admin:

- `/dashboard/admin`
- `/admin/listings`
- `/admin/reports`
- `/admin/seller-applications`
- `/admin/users`
- `/admin/categories`
- `/admin/audit`

APIs:

- `/api/auth/sign-in`
- `/api/auth/register`
- `/api/logout`
- `/api/health/database`
- `/api/health/readiness`
- `/api/ai/listing-assistant`
- `/api/ai/pricing`
- `/api/upload`
- `/api/webhooks/clerk`

## Server Data Flow

Most database work should go through server-side service modules, especially:

- `src/lib/server/marketplace.ts`
- `src/lib/server/seller-applications.ts`
- `src/lib/server/users.ts`

Important patterns:

- Pages call server services directly.
- Mutations use server actions in route-local `actions.ts` files.
- Services enforce RBAC and ownership checks.
- Fallback data in `src/lib/data.ts` is only for DB-unavailable fallback, not the desired product state.
- New work should prefer Prisma rows over adding more static arrays.

## Implemented Mutation Paths

- `src/app/sell/new/actions.ts`: creates listing drafts as `PENDING_REVIEW`.
- `src/app/listings/[slug]/actions.ts`: bid, offer, watch, message seller.
- `src/app/messages/actions.ts`: sends a message to an existing conversation.
- `src/app/account/seller-application/actions.ts`: submits seller application.
- `src/app/admin/seller-applications/actions.ts`: approves/rejects seller applications.
- `scripts/smoke-workflows.ts`: checks public, buyer, seller, admin, health, AI, and notification routes against a running server.

## AI Provider Layer

AI calls go through `src/lib/ai/providers.ts`.

Supported provider IDs:

- `mock`
- `groq`
- `deepseek`
- `huggingface`

Current AI API routes:

- `POST /api/ai/listing-assistant`
- `POST /api/ai/pricing`

Both routes validate input with Zod, enforce `ai:use`, and rate-limit by actor ID.

## Validation

Run all quality gates before handing off or deploying:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

With the dev server running, run the HTTP smoke checks:

```bash
npm run smoke:workflows
```

Current latest validation during handoff:

- `npm test`: 19 files, 68 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run smoke:workflows`: passed against `http://127.0.0.1:3001`.

## Production Checklist

Before real launch:

- Configure production PostgreSQL and backups.
- Configure Clerk keys and webhook endpoint.
- Confirm role metadata sync and admin assignment process.
- Configure S3-compatible object storage and verify upload/public URL delivery.
- Configure SMTP and verify delivery for messages, bids, offers, approvals, and moderation events.
- Add payment provider for bid holds, credits, payouts, refunds, and disputes.
- Run `npm run smoke:workflows` against first-party credential auth, or equivalent browser auth smoke checks when Clerk is enabled.

## Notes for Future Development

- Keep the app RC-only unless the product scope changes.
- Treat `iHobbyWorld.html` as the visual/product reference, not executable source.
- Do not reintroduce dashboard role switching.
- Do not add static arrays for new features when a Prisma model exists.
- First-party local auth and product workflows should write to the database.
- Admin should see operational data across the marketplace.
- Buyer and seller screens should be scoped to the signed-in account.
