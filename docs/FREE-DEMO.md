# Free public demo deployment

The current hosted demo uses Railway with the existing Neon database. See
[Railway demo deployment](RAILWAY-DEMO.md) for that configuration and the
optional isolated sample-data setup. The Render instructions below describe
the alternative prepared during the initial hosting review.

This guide deploys the existing Next.js application on **Render Free** with an
external **Neon Free PostgreSQL database** and S3-compatible image storage.
The application remains a working database-backed demo with real registration,
role approvals, listings and uploads. Payments are unavailable, AI is simulated,
and email delivery is omitted. Use test information only.

## What is included in this branch

- `render.yaml`: one explicitly free Node web service in Singapore; no paid
  database, disk, worker, cron job or workspace subscription is provisioned.
- Node 24 and a build step that generates the Prisma client.
- `npm run start:demo`: checks configuration, applies migrations, runs the
  idempotent demo bootstrap, then starts Next.js on Render's assigned port.
- `npm run demo:bootstrap`: creates the first administrator and missing RC
  categories without running the development seed.
- `GET /api/health`: a public, database-independent liveness check for Render.
- Explicit demo readiness and a visible demo notice. Search indexing is disabled
  through robots metadata for demo mode; this is not an access-control mechanism.

## Services and free-plan boundaries

| Service | Selection | Boundary |
| --- | --- | --- |
| Application | Render Free Web Service | Sleeps after 15 minutes idle; the next visitor waits for startup. Shared free build/traffic allowances apply. |
| Database | Neon Free | Storage, compute, transfer and restore limits apply. Use a project owned by your account, not an unclaimed temporary database. |
| Images, preferred | Neon Free Object Storage | Use a project in a supported region and a dedicated `public_read` bucket. Verify the upload/read integration before sharing. |
| Images, alternative | Cloudflare R2 Standard | Has a free allowance but may require billing activation and can incur overages. Do not activate a paid or metered subscription as part of a strict no-spend setup without approval. |
| Login | Existing first-party auth | Clerk is optional and is left unconfigured. |
| AI | `AI_PROVIDER=mock` | No external model calls; output is simulated. |
| Email | Unconfigured | No SMTP variables or email-provider account is needed for this demo. |

As checked on 24 November 2026, Neon advertises 1 GB database storage, 100 CU-hours
per project monthly and 5 GB object storage on Free. Check the current console
limits before deploying. Free does not guarantee unlimited capacity or ongoing
availability. Do not choose an upgrade or enter payment details if a provider
requires them; stop and review that step.

## 1. Make this branch available to Render

The deployment repository is [nitin24767/iHobby](https://github.com/nitin24767/iHobby),
a fork of the original [nitin198/iHobby](https://github.com/nitin198/iHobby).
Publish the prepared `codex/free-demo-render` branch to this deployment fork,
either by pushing the branch or uploading the prepared changed files to that
branch through GitHub. The Blueprint points to the fork and this branch.
If using a different destination, update `repo` and `branch` in `render.yaml`
accordingly. The original upstream repository and its `main` branch remain
unchanged by this demo deployment.

If applying a supplied patch instead, start from the reviewed base commit
`c1b62b4ef4557b66bd47f1a528187d509ef06398`, apply the patch on a new branch, inspect
the changes, then commit and push. A ZIP of only changed files must be overlaid
onto the existing project; it is not a complete application archive.

## 2. Create the Neon database

1. Sign in to Neon and select an organization on the **Free** plan.
2. Create a dedicated project such as `ihobby-demo` in AWS Asia Pacific
   (Singapore), if available. This also supports Neon Object Storage.
3. Choose PostgreSQL 16 or a compatible newer version.
4. Copy a TLS connection string into Render's secret `DATABASE_URL` field.
   Keep the provider's SSL parameters; do not turn certificate checks off.
   For this single persistent Node service, a direct connection is a simple
   choice and also supports the migration and bootstrap commands. If you choose
   pooling, verify the migration/transaction advisory-lock workflow against it.
5. Keep the database's idle suspension enabled. Render health checks use
   `/api/health` and therefore do not keep the database active.

Do not put the database URL or credentials into GitHub, screenshots or chat.

## 3. Configure image storage

### Preferred: Neon Object Storage

In the same project/branch, create a bucket such as `ihobby-demo-images` with
`public_read` access. Only listing images belong in this bucket. Writes still
require a server-side credential.

Obtain the branch storage endpoint and region from Neon, then create a scoped
storage-write credential. Map the returned values as follows:

| Application variable | Neon value |
| --- | --- |
| `STORAGE_ENDPOINT` | Full `s3_endpoint`, without appending the bucket |
| `STORAGE_REGION` | Returned region, e.g. `ap-southeast-1`; do not use R2's `auto` value |
| `STORAGE_ACCESS_KEY_ID` | `token_id` / S3 Access Key ID |
| `STORAGE_SECRET_ACCESS_KEY` | `s3_secret_access_key` / S3 Secret Access Key |
| `STORAGE_BUCKET` | `ihobby-demo-images`, or your chosen bucket name |
| `STORAGE_PUBLIC_URL` | `<s3_endpoint>/<bucket-name>` |

Your app already sends path-style S3 requests. The concrete Neon integration
must be verified with a signed upload and an unauthenticated image read. If
the project's storage feature is unavailable, do not silently change to a paid
plan; use another approved free S3-compatible store or review the next step.

### Alternative: an already approved Cloudflare R2 account

Use the account's S3 endpoint, `STORAGE_REGION=auto`, a dedicated bucket, and
its access-key pair. For a demo, `STORAGE_PUBLIC_URL` can be the bucket's
development `r2.dev` URL. It is different from the authenticated S3 endpoint.
For production, replace this development URL with a domain you control.

Set storage variables **before building** because `next.config.ts` uses the
public URL to allow image loading. Rebuild after changing that URL.

## 4. Create the first admin securely

Provide these secrets in Render for the first successful startup:

- `DEMO_ADMIN_EMAIL`: an unused email address you control.
- `DEMO_ADMIN_PASSWORD`: a unique password of 12–128 characters, including
  uppercase, lowercase, a number and a symbol.
- `DEMO_ADMIN_NAME`: optional; defaults to `Demo Administrator`.

The bootstrap requires `DEPLOYMENT_MODE=demo`, obtains a database advisory lock,
and creates an admin only when no admin exists. It does not promote an existing
buyer, reset passwords, recreate accounts, or overwrite existing categories.
No public sample-account passwords are installed.

After the first successful bootstrap, remove `DEMO_ADMIN_PASSWORD` from Render.
The administrator can still sign in using the password; subsequent starts
preserve the existing account without needing the bootstrap password.

If bootstrap reports an existing email collision, use an unused admin email.
Do not bypass the development seed's production guard.

## 5. Deploy the free web service

1. Sign in to Render. Create a Blueprint from `nitin24767/iHobby`, selecting
   `codex/free-demo-render`, or create a Web Service manually from the same
   repository and branch using the settings below.
2. Confirm the service plan is **Free** before creating it.
3. Enter the secrets requested by the Blueprint. Set `NEXT_PUBLIC_APP_URL` to
   the service's assigned HTTPS address once known and redeploy if necessary.
4. Keep `DEPLOYMENT_MODE=demo`, `AI_PROVIDER=mock`, and `NODE_ENV=production`.
5. Leave all `SMTP_*`, Clerk and real AI-provider credentials unconfigured.
6. Deploy and wait until Render reports the service live.

Manual settings:

| Field | Value |
| --- | --- |
| Runtime | Node |
| Instance | Free |
| Region | Singapore |
| Node version | 24.22.1, as declared in `.node-version` and the Blueprint |
| Build | `npm ci --include=dev && npm run db:generate && npm run build` |
| Start | `npm run start:demo` |
| Health check | `/api/health` |

The Prisma CLI and `tsx` are development dependencies, so retain development
dependencies at runtime. The explicit `--include=dev` prevents production
install defaults from omitting them. Render Free has no pre-deploy command;
the controlled start script performs migration/bootstrap before listening.

## 6. Verify the hosted demo

1. Open `/api/health`; expect `{"status":"ok"}`.
2. Open `/api/health/database`; confirm `connected: true`.
3. Sign in with the administrator you created.
4. Open `/api/health/readiness`; expect `deploymentMode: "demo"` and
   `readyForDemo: true`. `readyForNonPaymentLaunch` remains false by design.
5. Register a separate test buyer, submit a seller application, and approve it
   as admin. The first administrator can also use the seller tools directly.
6. Create a test listing with an image, approve it and verify it appears in the
   marketplace. Confirm the image URL is served by the external bucket.
7. Restart the service and confirm the account, listing and image remain.
8. Check that mock AI is labelled as such and that no real emails are expected.

Never use the admin-only readiness route as Render's public health check. A
passing liveness check only means the web server is responding; it does not
prove database or storage connectivity. Readiness checks for storage validate
configuration presence, so an upload/read smoke check is still required.

The bootstrap creates categories and one admin only. Add demo listings through
the app, or explicitly enable the separate insert-only sample-data step described
in [Railway demo deployment](RAILWAY-DEMO.md#optional-sample-data).

## Reference documentation

- [Render Blueprint fields](https://render.com/docs/blueprint-spec)
- [Render Free limits](https://render.com/docs/free)
- [Render health checks](https://render.com/docs/health-checks)
- [Neon Free plan](https://neon.com/pricing)
- [Neon storage setup](https://neon.com/docs/storage/get-started)
- [Neon storage authentication](https://neon.com/docs/storage/authentication)
- [Neon public buckets](https://neon.com/docs/storage/buckets)
- [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)
