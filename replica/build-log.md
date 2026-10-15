# Build log

App: `/home/user/app` (Next.js 16, Tailwind 4). Data layer: **fake** (`src/lib/data/`, localStorage +
BroadcastChannel), with the command names and checks from `architecture.md`, so `/replica-backend`
swaps the internals without touching screens. Business rules live in `src/lib/domain/` (pure, unit-tested)
and move to the server unchanged.

Checks run on every change: `npm run lint`, `npm test` (24 unit tests), `node scripts/slice-e2e.mjs`
(40 browser checks at 1440 and 390 px, axe WCAG 2.1 AA, console errors, keyboard-only path),
`npm run design:check`.

| ID | date | status | missing | harder than expected |
| --- | --- | --- | --- | --- |
| shell | 2026-10-15 | done | — | Next 16 + Cache Components: any component reading the URL must sit inside `<Suspense>` or the build fails. Shells moved behind server layouts. |
| all 46 | 2026-10-15 | routed | 38 are stubs showing ID, purpose and phase; S20–S22 are dialogs | — |
| S17 | 2026-10-15 | done | lock-out after 5 wrong PINs (server-side in backend); real PIN hashing | — |
| S18 | 2026-10-15 | done | merge / shift / transfer tables (F08), reserved state (needs S44), long-press menu | — |
| S19 | 2026-10-15 | partial | customer (S20), discounts, split bill (S22), hold order, NC lines, per-order-type prices | Shortcode + Enter was ambiguous when the code is also a name fragment ("ch"): an exact shortcode now wins. Found by the keyboard-only test. |
| S21 | 2026-10-15 | partial | wallet and pay-later (need customers), tips, UPI QR on screen | — |
| S25 | 2026-10-15 | partial | print agent (silent ESC/POS to station printers), customer GSTIN for B2B invoices, bill-of-supply variant tested only by inspection | Browsers can’t print silently: every ticket needs a click until the agent exists. |
| S03 | 2026-10-15 | done | week-on-week deltas, outlet filter (multi-outlet is P5) | — |

## Vertical slice: done

PIN login → pick a table → add dishes (with size, add-ons, note) → send to kitchen (one ticket per
station) → print bill (GST per rate, round-off, series T1/2026-27/n) → split payment UPI + cash with
change → table frees → dashboard shows the sale. Covered end to end by `scripts/slice-e2e.mjs`.

## Bigger than it looked

- **Printing** is a project of its own (agent + installer + pairing). Until then the POS opens a
  print preview per ticket. Restaurants will not accept that in service; it gates the pilot.
- **Back-office editors** (S05–S12) are needed before a real restaurant can use the POS at all,
  because today the menu, taxes, tables and staff only come from seed data. They are next.

## /replica-backend (2026-10-15)

Real server and database behind the same client functions; see `backend.md`. New or changed screens:

| ID | status | notes |
| --- | --- | --- |
| S01 | done | sign in, sign up, check-your-email, forgot password, reset page; rate limited |
| S02 | done | one-screen onboarding, sample menu option, pairs this browser as till T1 |
| S04 | partial | tills only: pairing codes, list, remove. Multi-outlet is P5 |
| S42 | partial | trial status, plan choice, one-click cancel; checkout untested against Razorpay |
| new | done | /pos/pair (code or one click), /account (sign out everywhere, delete account) |

Harder than expected:
- Next 16 prerenders GET route handlers at build time and signals "dynamic" by throwing; a catch-all
  error wrapper swallowed it. Fixed with `unstable_rethrow`.
- A paired browser that also belongs to an owner: the till view and back-office view must never fall back
  to each other, or an unpaired till lands on "sign in" instead of "pair this device". Separate scopes now.
- Offline billing regressed from "works" (local fake) to "not yet" (needs the server). Logged as the top gap.
