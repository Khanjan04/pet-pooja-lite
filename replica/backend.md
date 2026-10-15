# Backend

App: `/home/user/app`. Server code in `src/server/`, routes in `src/app/api/`, migrations in
`db/migrations/`. Every rule below is enforced on the server; the browser is never trusted.

## What changed from architecture.md (and why)

| planned | built | why |
| --- | --- | --- |
| Supabase Auth | **Better Auth** (open source, tables in our own Postgres) | Supabase couldn’t be reached or run from the build session, so Supabase Auth would have shipped untested. Better Auth gives email verification, password reset, sessions, rate limits and account deletion, all exercised by the tests. One vendor fewer. |
| Supabase Realtime | **Server-Sent Events fed by Postgres `LISTEN/NOTIFY`** (`/api/v1/events`) | Same reason; works on any Postgres. Tested: a second tab sees the kitchen ticket and the freed table without reloading. |
| RLS from Supabase JWT claims | RLS from **per-transaction claims** (`set local app.claims`) under role `app_reader` | Not tied to Supabase. Server reads run as `app_reader`, so RLS filters every query by tenant and outlet. |
| Inngest | **Postgres job queue** (`jobs` table) + `/api/cron/tick` every minute | Retries with backoff, a dead-letter state, no extra account. Enough for P1 volume. |
| Drizzle | **`pg` + SQL** | The SQL schema already existed and was tested; the commands are short transactions. |
| Stripe (skill default) | **Razorpay Subscriptions** | India first: INR, UPI Autopay, GST invoices. Stripe’s Indian onboarding is restricted. |

The database host is still your choice: **Supabase or Neon in Mumbai (ap-south-1)**, or any Postgres 15+.

## You create these (I don’t sign up for anything or handle keys)

1. **Postgres**: a Supabase or Neon project in Mumbai. Copy the pooled connection string into `DATABASE_URL`. Turn on daily backups (on by default on paid plans; check it).
2. **Resend**: verify your sending domain (SPF, DKIM), create an API key → `RESEND_API_KEY`, set `EMAIL_FROM`.
3. **Razorpay (Test Mode)**: create three monthly plans (Core, Growth, Scale; price per outlet) → `RAZORPAY_PLAN_*`. Generate test API keys → `RAZORPAY_KEY_ID/SECRET`. Add a webhook to `$APP_URL/api/webhooks/razorpay` with the `subscription.*` events and a secret → `RAZORPAY_WEBHOOK_SECRET`.
4. **Optional, Google sign-in**: an OAuth client in your own Google Cloud project, redirect URI `$APP_URL/api/auth/callback/google`. Basic profile scopes only, so no Google verification review is needed.
5. Secrets: `openssl rand -base64 32` for `BETTER_AUTH_SECRET`, `openssl rand -hex 16` for `CRON_SECRET`.

Every variable is listed in `app/.env.example`, with no values.

## Run it

```bash
cp .env.example .env.local           # fill in
npm run db:migrate                   # applies db/migrations/*.sql in order, idempotent
npm run db:seed                      # optional demo restaurant (fake people), idempotent
npm run dev
npm test                             # 15 unit tests (bill maths, dates, KOT routing)
TEST_DATABASE_URL=postgres://.../kk_itest npm run test:server   # 15 integration tests, resets that db
node scripts/slice-e2e.mjs http://localhost:3000 ../replica/clone-screens   # 54 browser checks
```

Without `RESEND_API_KEY`, dev emails aren’t sent: they’re kept in the `jobs` table (that’s how the tests read
verification links). Production refuses to start without the key, unless `ALLOW_DEV_EMAIL=true` with a localhost `APP_URL`.

## Auth

- **Owners and managers:** email + password (10+ characters), verification required before creating a restaurant, password reset (1-hour link; resetting signs out every device), sign out, sign out everywhere, delete account. Optional Google sign-in. Sessions are http-only, SameSite=Lax cookies, Secure in production.
- **Tills:** a device is paired once, either by a signed-in owner (“use this browser as a till”) or with a 6-digit code (10 minutes, single use, stored hashed). The device gets a 400-day http-only cookie; only its sha256 is stored. It can be revoked from Outlets & tills.
- **Floor staff:** 4-digit PIN on a paired till only. PINs are hashed with scrypt in `staff_secrets` (never readable by clients). 5 wrong tries lock that person for 5 minutes. A PIN session lasts 12 hours, and switching user ends the previous one.
- **Roles:** member roles (owner, admin, manager, accountant) for the back office; staff roles with rights (`kot.cancel`, `bill.reprint`, …) for the till. Every command calls `need(staff, right)`.

## Account deletion

Deleting your account removes your login and sessions immediately. If you were the **only owner**, the restaurant
is closed: tills stop, the subscription is cancelled (job), and customers’ personal details are erased.
**Bills are kept**: GST law requires keeping invoices for 72 months. A purge job for closed organisations
older than that is **not built yet** (backlog). This is written in plain words on the Account page too.

## Database

- Migrations: `0001_auth.sql` (generated from the Better Auth config by `scripts/gen-auth-migration.mts`), `0002_core.sql` (from the tested `replica/schema.sql`), `0003_billing.sql`.
- **Access:** RLS on all 62 tenant tables. Clients never query the database. Server writes check the actor, then filter by `org_id`/`outlet_id` in SQL; server reads run under RLS as `app_reader`. `app_reader` has no access to auth tables, PIN hashes, pairing codes, jobs or rate limits.
- **Tested with a second user:** a second restaurant gets 0 rows of the first one’s orders, outlets, items and staff, a 403 asking for its outlet, and a 404 when its till targets the other’s order.
- **Hard constraints in the database:** one running order per table, bill numbers unique and gap-free per till series and fiscal year, bill totals must add up, audit log append-only, each Razorpay event and each aggregator order applied once.
- **Backups:** the host’s daily backups (check they’re enabled). Point-in-time recovery is worth paying for before launch.

## Payments (Razorpay, test mode)

- Checkout: the server creates a subscription (plan × outlets) and sends the owner to **Razorpay’s hosted page**. We never see card or UPI details.
- One-click cancel: stops renewal at the end of the paid period; nothing to talk anyone out of.
- Webhooks: HMAC-SHA256 signature on the raw body (timing-safe), each event id stored once in `inbound_events`, out-of-order events ignored by timestamp. Status lives in our database: `active` → org active; `pending`/`halted` → past due, plus an email to owners; `cancelled`/`completed` → back office read-only. **Tills always keep billing.**
- Trials: 14 days. After that, or after 7 days past due, the back office is read-only (the cron does it).
- **Not run against Razorpay itself yet:** the build session couldn’t reach razorpay.com and there are no keys. Webhook handling is tested with signed payloads; checkout and cancel are written against the official `razorpay` SDK but have never made a real call. Do one test-mode subscription end to end before launch.

## Email and jobs

- Resend, from your own domain. Templates are our own words: verify email, reset password, payment failed. All queued in `jobs` and sent immediately; failures retry (2, 4, 8… minutes, max 5 tries), then go to `dead` with the last error kept.
- `/api/cron/tick` (Vercel Cron, every minute, `Authorization: Bearer $CRON_SECRET`): runs due jobs, turns sold-out items back on at their set time, expires trials, enforces past-due, and cleans up old sessions, codes, idempotency keys and finished jobs. **Per-minute cron needs Vercel Pro**; on Hobby, use an external pinger (e.g. a free uptime monitor) with the bearer header.
- Times are stored in UTC and shown in the outlet’s timezone. The business date cuts off at 05:00 local.

## Integrations

| integration | status | official API / scopes | review / limits |
| --- | --- | --- | --- |
| Razorpay Subscriptions | built (test mode, untested live) | REST via `razorpay` SDK; webhooks `subscription.*` | KYC for live mode; activate subscriptions on the account |
| Resend | built | REST via `resend` SDK | domain verification; 2 req/s on the free tier |
| Google sign-in | config only (off until keys exist) | OpenID `email profile` | no Google verification needed for basic scopes |
| SMS / WhatsApp (OTP, campaigns) | not built (P4) | MSG91 or Gupshup | **DLT registration in India (entity + templates) takes 1–3 weeks: start early** |
| GST e-invoice (IRN) | not built | licensed GSP/ASP API | only above the e-invoicing turnover threshold |
| Zomato / Swiggy | out of scope | partner programmes only | business deal, not an API key |

## Live updates

`/api/v1/events` streams `change` events for one outlet. Each stream holds one Postgres connection and closes after
4 minutes; the browser reconnects and refetches. At scale (hundreds of tills) this needs a pooled listener or a
pub/sub service. Fine for a pilot.

## Security checklist

- [x] secrets only in env vars; `.env*` git-ignored (only `.env.example` committed); a build check found no secret, SQL or PIN-hash code in client bundles; `server-only` guards every server module
- [x] input validated on the server with zod on every route (JSON bodies ≤ 64 KB; commands have one schema each)
- [x] authorisation on every read and write, tested with a second restaurant (RLS + per-command checks)
- [x] rate limits: sign-in/sign-up (Better Auth, 3/window/IP, tested), password-reset and verification emails (3/min), PIN (20/min per till + lockout, tested), pairing codes (10 per 10 min per IP, tested), restaurant creation (5/hour)
- [x] webhooks verify signatures (tested: bad signature → 401)
- [x] CSRF: SameSite=Lax cookies, JSON-only writes, and a cross-origin `Origin` is refused (tested); Better Auth checks origins on its own routes
- [x] security headers: nosniff, frame-ancestors none, HSTS, referrer policy, permissions policy (a full script CSP is still to do)
- [ ] uploads: none yet (item images later: size/type limits, separate bucket)
- [x] no user data in URLs or logs (logs carry messages only; the dev email log no longer prints addresses). Verification and reset tokens are in emailed URLs by design.
- [x] dependencies audited: `npm audit --omit=dev` → 0 vulnerabilities (2026-10-15)
- [ ] privacy policy listing processors: hosting (Vercel), database (Supabase/Neon), Resend, Razorpay, Google (if enabled). Write it in `/replica-launch`.
- [ ] **check on your host:** rate limits key on the first `x-forwarded-for` address. Vercel sets it, but on another host, confirm the proxy overwrites a client-supplied value.

## Known gaps (honest list)

- **Offline billing is gone for now.** The fake layer worked offline because it was local; the real one needs the network. Commands retry on dropped connections with the same idempotency key (safe), but there’s no offline queue yet. This is the top backend item for the pilot.
- Printing still goes through the browser print dialog; the print agent isn’t built.
- Phone OTP sign-in (the original’s) needs an SMS provider + DLT.
- No purge job yet for closed restaurants after the 72-month retention period.
- The back-office editors (menu, taxes, floor, staff) still don’t exist, so a restaurant runs on the sample menu or on seed data.
