# iHobbyWorld Role And Application Guide

## What The Application Is

iHobbyWorld is a production-oriented RC marketplace application. It is focused on remote-control vehicles and parts, including drones, helicopters, planes, cars, and related components.

The app is built as a full-stack marketplace, not just a static HTML page. It uses PostgreSQL for marketplace data, user accounts, sessions, listings, bids, offers, messages, notifications, admin actions, wallet ledger records, build planner data, repair sessions, and pricing guidance.

The current product scope covers all non-payment marketplace workflows. Real payment processing, bid holds through a payment provider, refunds, payouts, and disputes are intentionally not included yet.

## Core Marketplace Workflows

Users can browse RC listings, open listing detail pages, view listing media, search by category, place bids, make offers, save listings, message sellers, and use RC tools such as build planning, repair guidance, and pricing guidance. After a seller accepts an offer, the buyer can submit one 1-to-5 seller review for that listing.

Sellers can create listings, upload multiple listing images, edit their own eligible listings, pause or resume active inventory, archive eligible listings, receive offers, and communicate with buyers. Editing an active listing returns it to moderation so the changed sale terms can be reviewed.

Admins can moderate listings, review reports, approve seller applications, manage users, manage categories, set the application-wide currency, and inspect audit logs.

## Authentication And Accounts

The app supports first-party email/password authentication with database-backed sessions. New registrations start as `BUYER` accounts and require a password with at least 12 characters, including uppercase, lowercase, and numeric characters. Sign-in and registration attempts are rate-limited.

Seller access is not automatic. A buyer submits a seller application, and an admin must approve it before the user becomes a seller.

Admin access is assigned manually by an existing admin or platform owner. Users cannot self-register as admins.

Optional Clerk authentication is available when both the Clerk publishable and server keys are configured. Production Clerk deployments must also configure the webhook secret so account and role changes are synchronized. When Clerk is not configured, the app uses first-party authentication.

Development seed data is restricted to non-production environments. Production accounts, including administrators, must be created through controlled operational workflows; there is no demo-account sign-in route.

## Roles

### Visitor

A visitor is anyone who is not signed in.

What visitors can do:

- Browse the public marketplace.
- View RC categories such as drones, helicopters, planes, and cars.
- Open listing detail pages.
- View public listing information, images, prices, seller summary, bids, and offer counts.
- Register for a buyer account.
- Sign in to an existing account.

What visitors cannot do:

- Place bids.
- Make offers.
- Save listings to a watchlist.
- Message sellers.
- Submit one seller review after the seller accepts their offer.
- Use account dashboards.
- Create listings.
- Submit seller applications.
- Access admin screens.

Main routes:

- `/`
- `/marketplace`
- `/categories/[slug]`
- `/listings/[slug]`
- `/sign-in`
- `/sign-up`

### Buyer

A buyer is a signed-in marketplace user. New registered users start as buyers.

What buyers can do:

- Browse all public marketplace pages.
- Open the buyer dashboard.
- Place bids on eligible listings.
- Make offers on eligible listings.
- Withdraw their own pending offers.
- Save listings to a watchlist.
- View watchlist items.
- View their bids.
- View their offers.
- Message sellers.
- View and send messages in their own conversations.
- View notifications.
- View wallet and loyalty pages.
- Use AI-assisted pricing and marketplace tools.
- Use the build planner.
- Use the repair advisor.
- Apply to become a seller.

What buyers cannot do:

- Create seller listings until approved as sellers.
- Approve their own seller application.
- Access seller inventory pages.
- Access admin moderation or user-management pages.
- Accept or decline offers as a seller.

Main routes:

- `/dashboard/buyer`
- `/watchlist`
- `/bids`
- `/offers`
- `/messages`
- `/notifications`
- `/wallet`
- `/loyalty`
- `/tools/build`
- `/tools/repair`
- `/tools/pricing`
- `/account/seller-application`

### Seller

A seller is an approved user who can list RC vehicles and components for sale.

What sellers can do:

- Browse marketplace pages.
- Open the seller dashboard.
- Create new RC listings.
- Upload JPEG, PNG, or WebP listing images.
- Manage their own eligible listings: edit sale details, pause, resume, or archive them.
- View seller inventory.
- Receive buyer offers.
- Accept or decline offers on their own listings.
- Message buyers.
- View and send messages in seller conversations.
- Use pricing tools.
- View wallet, credits, and loyalty pages.
- Use AI-assisted marketplace tools.
- Save listings to a watchlist.

What sellers cannot do:

- Moderate other sellers' listings.
- Approve seller applications.
- Manage users.
- Manage categories.
- View admin audit logs.
- Access buyer-only dashboard pages unless they also have that route permission.

Main routes:

- `/dashboard/seller`
- `/sell/new`
- `/sell/listings`
- `/offers`
- `/watchlist`
- `/messages`
- `/wallet`
- `/loyalty`
- `/tools/build`
- `/tools/repair`
- `/tools/pricing`

### Admin

An admin manages marketplace operations and platform safety.

What admins can do:

- Open the admin dashboard.
- View operational marketplace metrics.
- Moderate listings.
- Approve or reject listings.
- Review reports.
- Resolve or dismiss reports.
- Review seller applications.
- Approve or reject seller applications.
- Promote approved buyers to sellers.
- Manage user profiles.
- Change user roles.
- Suspend, reactivate, or close accounts.
- Manage marketplace categories and taxonomy.
- Set the application-wide currency. This changes the denomination but does not perform exchange-rate conversion.
- View audit logs.
- View marketplace messages and operational conversations.
- Create listings when needed.
- Use AI-assisted tools.
- Access seller dashboard capabilities.

What admins should not use the app for:

- Processing real payments, refunds, payouts, or disputes. Those workflows require a payment provider that is not connected yet.

Main routes:

- `/dashboard/admin`
- `/admin/listings`
- `/admin/reports`
- `/admin/seller-applications`
- `/admin/users`
- `/admin/categories`
- `/admin/settings`
- `/admin/audit`
- `/messages`
- `/offers`
- `/sell/new`
- `/sell/listings`
- `/tools/build`
- `/tools/repair`
- `/tools/pricing`

## Seller Approval Flow

1. A registered buyer opens `/account/seller-application`.
2. The buyer submits shop details, category focus, and seller experience.
3. The application is saved in PostgreSQL.
4. An admin opens `/admin/seller-applications`.
5. The admin approves or rejects the application.
6. If approved, the user's role becomes `SELLER`; Clerk public metadata is also synchronized when Clerk is enabled.
7. The approved seller can create listings and use seller tools. Rejected applicants remain buyers and can review the persisted reviewer decision and note in the application area before submitting a new application.

## Listing Flow

1. A seller opens `/sell/new`.
2. The seller enters listing details, an active marketplace category, condition, price, attributes, and up to eight JPEG, PNG, or WebP images.
3. The listing is created as `PENDING_REVIEW`.
4. Admin moderation reviews the listing.
5. If approved, the listing becomes active in the marketplace.
6. Buyers can bid, make offers, watch, or message the seller from the listing detail page.

## Rewards And Credits

Rewards are awarded only for completed, server-authoritative milestones. Each award creates one loyalty-point event and one posted wallet-credit ledger entry in the same database transaction. Both rows share an idempotency key, so webhook redelivery, retries, or repeated moderation actions cannot grant the same reward twice.

| Milestone | Loyalty points | Wallet credits |
| --- | ---: | ---: |
| Account created | 100 | 100 |
| Seller application approved | 300 | 150 |
| Listing approved by an admin | 150 | 75 |

Users can review their current point total, tier, progress, and reward activity at `/loyalty`. Loyalty tiers are Member, Builder at 500 points, Verified at 1,500 points, and Expert at 5,000 points.

Bids and offers do not earn rewards because they can be repeated and do not prove payment or fulfillment. Transaction rewards remain out of scope until payment completion is integrated. Wallet credits are non-cash platform credits and are not a payment, payout, or withdrawable balance.

## Offer Flow

1. A buyer makes an offer on a listing.
2. The offer is saved as `PENDING`.
3. The seller can accept or decline the offer.
4. The buyer can withdraw a pending offer.
5. Concurrent offer transitions are serialized so a listing cannot end with conflicting accepted, declined, or withdrawn states.
6. Offer activity is shown in the offers pages and notifications.

## Messaging Flow

Buyers, sellers, and admins can use the message system. Conversations and message rows are persisted in the database.

Buyers and sellers see conversations where they are participants. Admins can inspect operational conversations and send messages when needed.

## Seller Reputation

Seller ratings are stored in PostgreSQL, not supplied by placeholder data. A buyer can submit one 1-to-5 review only after the seller accepts that buyer's offer for the listing. Each new review recalculates the seller's displayed average and review count.

The displayed response time is the seller's average first reply to a buyer message in a listing conversation. Replies more than seven days later are excluded, and sellers without a qualifying reply display `No reply data yet`. This metric is initialized from existing conversation history and is updated whenever a seller replies to a buyer.

## Data And Storage

Primary app data is stored in PostgreSQL. This includes users, sessions, listings, listing media metadata, bids, offers, seller reviews and response metrics, watchlists, messages, reports, moderation actions, notifications, seller applications and reviewer decisions, audit logs, wallet ledger entries, build configurations, repair sessions, and pricing comparables.

Listing image uploads use local storage under `public/uploads/listings` only for development. S3-compatible object storage plus `STORAGE_PUBLIC_URL` is intentionally pending configuration, so production media storage is not yet ready.

The email service uses SMTP whenever `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (or `SMTP_PASSWORD`), and `SMTP_FROM` are configured; otherwise it mock-logs only in development. SMTP is configured in the local ignored environment file. Production must install its own secret values; readiness reports block launch when they are missing.

AI tools use mock guidance when no AI provider is configured. DeepSeek, Groq, and Hugging Face are supported through environment variables. With Groq configured, the pricing screen uses the Compound search model to research current Indian market pages, exposes exact evidence links, distinguishes asking/retail/sold evidence, adjusts for condition, limits extreme outliers, and reports confidence.

The Marketplace Agent at `/tools/agent` uses a bounded plan-act-observe loop. Given a member goal, the model selects from approved read-only tools, inspects each observation, adapts the next step, and produces an outcome. Agent runs and their tool trace are persisted in `AiJob` for accountability. The agent can search marketplace inventory, inspect listing details, calculate pricing guidance, and read role-scoped account activity. It cannot autonomously bid, offer, message, alter listings, or perform admin mutations.

## Marketplace Tools

The build planner saves each member's latest configuration, including entered parts, measurements, cost, and calculated specification checks. It evaluates the supplied core parts, battery cell count, ESC voltage range, motor ratings, frame size, and thrust ratio; absent or insufficient specifications are marked for review rather than assumed compatible. Saving a build writes an audit record.

The repair advisor creates and saves a diagnosis session from the supplied symptoms. It stores the issue, an AI-generated safety-first diagnostic response when the configured provider is available, and a checklist that can be reused for repair or resale disclosure. If the provider is unavailable, the stored response is explicitly labelled as an automated safety fallback.

The pricing engine researches current India-market evidence and combines it with relevant persisted sold records. Current sourced evidence takes precedence because older internal records may predate a currency change. The seller's entered asking price is used only to report its variance from the evidence median and never as the estimate itself. When no credible evidence exists, the application withholds the estimate instead of fabricating a range.

## Current Production Scope

Ready within the current non-payment scope:

- Public marketplace browsing.
- Role-based dashboards.
- First-party registration and login.
- Database-backed sessions.
- Seller application workflow.
- Listing creation and moderation.
- Multiple listing image uploads.
- Listing details and image gallery.
- Bids, offers, watchlist, and messages.
- Offer accept, decline, and withdraw actions.
- Notifications.
- Transactional loyalty rewards for account creation, seller approval, and listing approval.
- Admin reports, users, categories, and audit screens.
- Persisted build planning, AI-assisted repair diagnoses, and AI-assisted pricing with refreshed comparable-sale guidance.
- Readiness and smoke-check routes.

Before a production non-payment launch, configure PostgreSQL backups, S3-compatible storage with `STORAGE_PUBLIC_URL` (currently pending), production SMTP secrets, and edge or shared rate limiting for multi-instance deployment. The built-in rate limiter is a bounded per-process safeguard, not a distributed service.

Still out of scope:

- Real payment processing.
- Payment provider bid holds.
- Refunds.
- Seller payouts.
- Payment disputes.
- Payment-grade wallet reconciliation.

Credits shown in the wallet and navigation are ledger balances, not cash, payout, or payment-provider balances.

## Quick Role Summary

| Role | Purpose | Main Access |
| --- | --- | --- |
| Visitor | Browse marketplace before signing up | Public listings, categories, sign-in, sign-up |
| Buyer | Purchase, bid, offer, message, and apply to sell | Buyer dashboard, bids, offers, watchlist, messages, tools |
| Seller | Sell approved RC inventory | Seller dashboard, new listing, my listings, offers, messages |
| Admin | Operate and moderate the marketplace | Admin dashboard, listings, reports, seller applications, users, categories, audit |
