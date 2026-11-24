# Railway demo deployment

This configuration runs the Next.js application in explicit demo mode, with the
existing Neon PostgreSQL database and S3-compatible image storage. Payments and
email are unavailable; AI uses the mock provider. Use test information only.

## Source and runtime

The application source is `nitin198/iHobby` on `main`. The deployment fork is
`nitin24767/iHobby`; its `codex/main-demo-update` branch combines upstream main
with the hosting configuration, proxy-safe authentication redirects, and the
optional isolated demo fixtures. The current update includes upstream commit
`c0e743d` (currency settings and market pricing research).

Future pushes to upstream `main` must be merged into the deployment branch and
verified before Railway can deploy them. Railway watches the fork branch; it
does not automatically merge upstream changes.

| Railway field | Value |
| --- | --- |
| Repository | `nitin24767/iHobby` |
| Branch | `codex/main-demo-update` |
| Builder | Railpack |
| Node | `RAILPACK_NODE_VERSION=24.22.1` |
| Install | `RAILPACK_INSTALL_CMD=npm ci --include=dev` |
| Build | `npm run db:generate && npm run build` |
| Start | `npm run start:demo` |
| Public target port | `3000`, with `PORT=3000` |
| Health check | `/api/health` |
| Serverless/sleep | Enabled |

Keep `NODE_ENV=production`, `DEPLOYMENT_MODE=demo`,
`NEXT_TELEMETRY_DISABLED=1`, and `AI_PROVIDER=mock`. Preserve the existing secret
`DATABASE_URL` and all six storage variables. Do not put credentials in GitHub.
No additional database, volume, worker, or paid service is required for this
update. Check the account's current credit allowance and service status in
Railway; a trial deployment is not a promise of indefinite free hosting.

Startup applies pending Prisma migrations, runs the existing non-destructive
admin/category bootstrap, optionally seeds the fixtures below, then starts
Next.js. Prisma and tsx must remain installed at runtime. Do not use
`prisma db push`, reset the database, or run the development seed on this host.

## Authentication redirects

Form POST responses use HTTP 303 with a relative `Location` such as
`/dashboard/buyer?status=registered`. The browser retains the public origin even
when the application server sees `0.0.0.0:3000` behind the hosting proxy.
Registration, sign-in success/errors, rate limits, and logout share this helper.
The destinations do not trust request Host or forwarded-host headers.

If registration previously saved the account but then redirected to
`0.0.0.0:3000`, sign in with that account after deploying the fix. Do not register
the same email again. A `NEXT_PUBLIC_APP_URL` change is not required for this fix.

## Optional sample data

The normal bootstrap preserves the owner administrator and creates missing RC
categories. A separate `npm run demo:seed-data` command adds test accounts and
sample workflows only when both `DEPLOYMENT_MODE=demo` and
`DEMO_SEED_DATA=true` are set.

For the first successful run, add three different, fresh secret passwords in
Railway. Each must contain 12–128 characters with uppercase, lowercase, a digit,
and a symbol. There are no built-in or published passwords.

| Account | Email | First-run secret variable |
| --- | --- | --- |
| Buyer | `buyer.demo@ihobbyworld.local` | `DEMO_BUYER_PASSWORD` |
| Seller | `seller.demo@ihobbyworld.local` | `DEMO_SELLER_PASSWORD` |
| Test administrator | `admin.demo@ihobbyworld.local` | `DEMO_TEST_ADMIN_PASSWORD` |

These `.local` addresses are sign-in identifiers only, not inboxes. The test
administrator has the application's normal admin permissions: keep its password
private. It is separate from the owner's administrator account.

After all three passwords are saved, set `DEMO_SEED_DATA=true` and deploy. The
start script runs `demo:bootstrap` before `demo:seed-data`. Successful logs say
`Demo sample data created` followed by record counts; they never print passwords.

The fixture set contains:

- Three test accounts; four active RC vehicles, five active components, and one
  component pending moderation, with bundled illustrations and example INR prices.
- Two bids, a pending offer, watchlists, conversations, messages, notifications,
  and nonmonetary test credit/loyalty entries.
- A build configuration, repair examples, pricing comparables and mock pricing
  history, one moderation report, and a pending seller application.

All fixtures use the `demo-v1-` namespace and visible demo labels. The operation
inserts one transaction protected by an advisory lock and an audit marker
(`demo.sample-data.v1`). It never updates, deletes, claims, promotes, or resets
existing accounts or marketplace data. A reserved-name collision aborts the
transaction instead of overwriting anything. No email or external AI is invoked.

After verifying success, remove all three password variables and remove or set
`DEMO_SEED_DATA=false`, then apply the changes. Password hashes and fixture data
remain in PostgreSQL. If the flag stays enabled, subsequent runs recognize the
marker and preserve the existing records without requiring passwords. This is
not a reset command: actions taken in the demo persist, and the auction expires
seven days after its initial creation.

## Verification

1. Confirm the deployment's source commit includes the intended upstream main
   update and that migration, bootstrap, and startup all finish successfully.
2. Open `/api/health` and `/api/health/database`; expect a healthy server and
   `connected: true`. After seeding there should be nine active sample listings.
3. Sign in with each test account. Verify the correct buyer, seller, or admin
   dashboard and that all redirects stay on the public hostname. Logout should
   return to the public homepage.
4. Confirm active listings appear, the buyer has bids/offers/watchlists, the
   seller owns the sample inventory, and the admin can see the pending listing
   and application. Avoid approving the sample buyer's seller application if
   you want that account to retain its buyer role.
5. Check bundled images and separately test an uploaded image when needed.
   Fixture images are local application assets, so their presence does not prove
   an authenticated object-storage upload works.
6. Confirm a later restart preserves accounts and interactions without creating
   another fixture set. Owner credentials and pre-existing registrations must
   continue to work.
