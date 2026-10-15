# Architecture: restaurant POS SaaS (a rebuild of Petpooja's core features)

Working name: TBD (`/replica-brand`). This plan comes from `recon.md` (46 screens,
20 flows) and `features.csv` (114 rows). Screen IDs (S01…) and flow IDs (F01…)
refer to the recon map.

**Shape:** one Next.js app with five surfaces (back office, POS, captain, KDS and
the public guest QR / website menu), one Postgres database, and one small
optional program at each outlet (the print agent). No microservices.

## Changes made during /replica-backend

The build session couldn’t reach Supabase or Razorpay, so the parts that depended on Supabase’s
own services were swapped for ones that could be built and tested here. Full reasoning is in `backend.md`.

- Auth: **Better Auth** (own Postgres tables) instead of Supabase Auth.
- Realtime: **SSE + Postgres LISTEN/NOTIFY** instead of Supabase Realtime.
- RLS claims: set per transaction (`app.claims`) under role `app_reader`, not from a Supabase JWT.
- Jobs: **Postgres queue + per-minute cron** instead of Inngest.
- ORM: plain `pg` + SQL instead of Drizzle.
- Till commands go through one endpoint, `POST /api/v1/pos/:command` (openOrder, addItem, setQty, sendKot,
  voidItem, printBill, reopenOrder, addPayment, cancelOrder), each with its own zod schema and permission check.
  This replaces the per-route list below for those commands.
- Device pairing: an http-only device cookie (hash stored), not an auth user per device.

Everything else below still stands. The database host can still be Supabase or Neon.

## Stack

| layer | choice | why |
| --- | --- | --- |
| web | Next.js (App Router) + TypeScript | one codebase serves the back office (server-rendered) and the POS/captain/KDS (client-heavy, installable PWA) |
| styling | Tailwind + tokens from `/replica-design` | large touch targets on the POS and dense tables in the back office, from one token set |
| offline store | Dexie (IndexedDB) + an outbox of commands | billing must survive the internet dropping. Menu, tables and open orders are cached on the device and commands replay in order |
| PWA | Serwist (service worker) | POS, captain and KDS install to the home screen and load with no network |
| database | Postgres on Supabase, region **ap-south-1 (Mumbai)** | one database. Gives auth, realtime, storage and RLS in one place, and keeps Indian customer data in India |
| ORM | Drizzle | SQL-first: `schema.sql` is the source of truth, `drizzle-kit pull` generates the types |
| auth | Supabase Auth + a Custom Access Token hook | owners and managers use email or phone OTP. Each terminal is paired as its own auth user. Floor staff use PINs (see Access) |
| realtime | Supabase Realtime | table states, KOTs to the KDS, online order alerts and print jobs to the print agent |
| SaaS billing | **Razorpay Subscriptions** (Stripe later, for outside India) | INR, UPI Autopay, GST invoices for subscribers. Stripe's India onboarding has been restricted, so the skill's Stripe default doesn't fit India-first |
| email | Resend | day-end summaries, report exports, invites |
| SMS / WhatsApp (P4) | MSG91 (or Gupshup) | DLT-registered templates are mandatory for SMS in India. OTP and campaigns |
| jobs | Inngest | durable cron and event jobs with retries: day-end mails, stock posting, item auto-turn-on, campaigns, webhook processing |
| files | Supabase Storage | item images, report exports, QR code PDFs |
| printing | **print agent**: a small Go binary for Windows, Linux or a Raspberry Pi, plus a browser-print fallback | browsers can't print silently to several thermal printers. See "Printing" |
| hosting | Vercel (region bom1) | next to the database. Preview deploys per pull request |
| monitoring | Sentry + Supabase logs | POS errors arrive with the device and outlet attached |

## Access

Two layers, both required:

1. **Reads: Postgres RLS** on all 59 tables (tested, see `db-tests/`). A
   policy shows a row only when `org_id = jwt.org_id` and, for outlet-scoped
   tables, the outlet is in `jwt.outlet_ids` (or `all_outlets`). Clients read
   lists and subscribe to realtime directly with their own token.
2. **Writes: server only.** Clients have no insert, update or delete policy
   (tested: a client insert is refused). Every write is a server command, which:
   resolves the actor, checks the actor's role rights for that command
   (`kot.cancel`, `bill.modify_after_settle`, `discount.give`, …), checks every
   referenced id belongs to the same `org_id` (foreign keys don't check
   tenancy), writes in one transaction, and appends to `audit_log`.

**Who is the actor:**

| actor | how they sign in | token claims |
| --- | --- | --- |
| owner / manager | Supabase Auth (email or phone OTP) → `org_members` row | `org_id`, `outlet_ids`, `all_outlets`, `member_role` |
| terminal | an owner pairs it with a 6-digit code (S04) and the server creates an auth user for the device | `org_id`, `outlet_ids=[its outlet]`, `device_id`, `device_kind` |
| floor staff | PIN on a paired terminal (S17) → `staff_sessions` token (12 h, hashed). Sent as `X-Staff-Session` on each command | none in the JWT. The server checks the session per command |
| guest (QR, website) | no login. The `tables.qr_token` or outlet slug identifies the outlet | none. Public server routes are rate-limited |

PIN hashes live in `staff_secrets`, which has no read policy, so no client
ever receives them.

## Schema

Tables: **59**, plus 1 view (`stock_levels`). Access rules: **RLS for reads +
server-side checks for writes.** The full SQL is in `schema.sql`, the first
migration, loaded and tested on Postgres 16.

| area | tables |
| --- | --- |
| tenancy & people | organizations, subscriptions, outlets, org_members, roles, staff, staff_secrets, staff_sessions, devices |
| menu | categories (self-parent = parent category), items, item_prices, item_taxes, variations, addon_groups, addons, item_addon_groups, combo_components, taxes, discounts, stations, printers |
| floor | areas, tables, reservations |
| orders | orders, order_tables, order_items, kots, kot_items, bills, bill_lines, bill_taxes, bill_discounts, payments, day_ends, number_series, print_jobs |
| online | channels, inbound_events |
| inventory | raw_materials, stock_settings, recipes, recipe_lines, suppliers, purchase_orders, purchases, purchase_lines, stock_transfers, stock_counts, stock_ledger |
| CRM | customers, loyalty_ledger, otp_challenges, campaigns, campaign_sends, feedback |
| plumbing | audit_log (append-only), idempotency_keys |

Conventions: uuid ids, `timestamptz` in UTC, money in **bigint paise**,
percentages in **basis points**, stock in `numeric(14,3)` of a base unit
(g / ml / pc), statuses as `text` + `check`, and every foreign key has an
explicit `on delete` rule and an index (checked: 0 unindexed foreign keys).

Hard constraints the database enforces (all tested):

```sql
-- one running order per table (merge = several rows pointing to one order)
create unique index order_tables_one_running on order_tables (table_id) where released_at is null;
-- GST invoice numbers: unique per outlet + series + fiscal year, gap-free via app.next_number()
unique (outlet_id, series_code, fiscal_year, bill_no)
-- a bill's total must add up (or be a no-charge bill with a reason)
check (total_paise = subtotal_paise - discount_paise + charges_paise + tax_paise + round_off_paise or is_nc)
-- one KOT number per outlet per business date; one day end per outlet per date
unique (outlet_id, business_date, kot_no);  unique (outlet_id, business_date)
-- aggregator orders can't be imported twice
create unique index orders_channel_uq on orders (channel_id, channel_order_id) where channel_order_id is not null;
-- stock posts once per source line
unique (ref_type, ref_id, raw_material_id, reason)   -- on stock_ledger
-- audit rows can never be changed: trigger raises on update/delete
```

Helper functions: `app.next_number()` (row-locked counter),
`app.business_date()` (local time minus `day_starts_at`, default 05:00, so a
1 a.m. bill belongs to yesterday), `app.fiscal_year()` (Indian April–March) and
`app.access_token_hook()` (the JWT claims).

## API

Conventions:
- **Commands** (POS, captain and KDS writes) are `POST /api/v1/...` route
  handlers. Each carries an `Idempotency-Key: <device_id>:<mutation_uuid>`, and
  records the clients create carry **client-generated uuids**. The offline
  outbox replays them in order, and a replay returns the stored response from
  `idempotency_keys`.
- **Back-office edits** are Next.js server actions with the same authorisation
  helper.
- **Reads** go straight to Supabase with the user's token (RLS), plus server
  routes for reports.
- Who: `owner`, `admin`, `manager` = member roles. `staff[right]` = a staff
  session holding that right. `device[kind]` = a paired terminal. `guest` =
  public.

### F01 Sign up, onboard and set up (S01–S12, S42–S43)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /api/v1/signup | create org + first outlet + owner membership + default roles and GST taxes, start trial | new auth user | org name, outlet, state, GSTIN?, scheme | org, outlet | F01 |
| action outlet.update | profile, GSTIN, FSSAI, bill format, order types, day start | owner, admin | outlet fields | outlet | F01 |
| action outlet.create | add an outlet (counts against the subscription quantity) | owner | outlet fields | outlet | F20 |
| action menu.category.upsert / delete | categories and parent categories | manager+ | name, parent, station, timing | category | F01, F11 |
| action menu.item.upsert / delete | item + prices per order type + taxes + variations + add-on groups | manager+ | item payload | item | F01, F11 |
| action menu.addon_group.upsert | add-on groups and add-ons | manager+ | group + addons | group | F01 |
| POST /api/v1/menu/import | Excel/CSV import with a dry-run diff | manager+ | file, dry_run | diff / counts | F01 |
| GET /api/v1/menu/export | export the menu as xlsx | manager+ | outlet | file | F11 |
| action tax.upsert | GST, service and packaging charges | owner, admin | tax | tax | F01 |
| action discount.upsert | discounts and coupons | manager+ | discount | discount | F01 |
| action floor.area.upsert / table.upsert | areas, tables, regenerate a QR token | manager+ | area / table | row | F01 |
| GET /api/v1/tables/qr.pdf | printable QR sheet for all tables | manager+ | outlet | pdf | F09 |
| action station.upsert / printer.upsert | stations, printers, item→station mapping | manager+ | station / printer | row | F01 |
| action role.upsert / staff.upsert / staff.set_pin | roles with rights, staff, PIN reset | owner, admin | role / staff / pin | row | F18 |
| POST /api/v1/devices/pairing-code | issue a 6-digit, 10-minute code to pair a terminal | manager+ | outlet, kind, name | code | F01 |
| POST /api/v1/devices/pair | trade a code for a device session | guest (the terminal) | code | auth session, device | F01 |
| POST /api/v1/devices/:id/revoke | revoke a lost terminal | owner, admin | — | ok | F18 |

### F02–F04, F07, F08 POS core loop (S17–S25)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /api/v1/staff/login | PIN → staff session (5 tries, then a 5-minute lock) | device[pos,captain,kds] | staff_id, pin | session token, rights | F02 |
| POST /api/v1/staff/logout | end the session | staff | — | ok | F02 |
| GET /api/v1/pos/bootstrap | everything the terminal caches: menu, taxes, discounts, tables, stations, printers, open orders, the staff list (no PINs) | device | since (etag) | snapshot | F02 |
| POST /api/v1/orders | open an order (client uuid), seat it on tables | staff | id, type, table_ids, pax, customer | order | F02–F04 |
| POST /api/v1/orders/:id/items | add lines (client uuids). Server recomputes prices from the menu, the client total is advisory | staff | lines | order | F02 |
| PATCH /api/v1/orders/:id/items/:itemId | change qty or note before KOT | staff | qty, note | line | F02 |
| POST /api/v1/orders/:id/kot | fire unsent lines → one KOT per station, numbered, plus print jobs | staff | kot ids per station | kots | F02, F05 |
| POST /api/v1/orders/:id/items/:itemId/void | void after KOT → void KOT + audit (flagged) | staff[kot.cancel] | qty, reason | void kot | F02 |
| POST /api/v1/orders/:id/customer | attach or create a customer by phone | staff | phone, name, address, gstin | customer | F02, F16 |
| POST /api/v1/orders/:id/discount | apply a discount or coupon | staff[discount.give] or a coupon | discount_id / code / manual + reason | order totals | F02 |
| POST /api/v1/orders/:id/bill | compute and freeze bill(s): taxes, charges, round-off, bill number from the device series | staff | bill id(s), split spec | bills | F02, F07 |
| POST /api/v1/bills/:id/print | print or reprint (reprint is audited) | staff[bill.reprint] after the first print | — | print job | F02 |
| POST /api/v1/bills/:id/payments | add payment(s): cash, card, UPI, wallet or due. Settles when paid ≥ total | staff | payment ids, method, amount, ref | bill | F02, F07 |
| POST /api/v1/bills/:id/modify | change a settled bill (payment method, customer, discount) | staff[bill.modify_after_settle] | change + reason | bill | F02 |
| POST /api/v1/bills/:id/cancel | cancel a bill | staff[bill.cancel] | reason | bill | F02 |
| POST /api/v1/bills/:id/nc | mark no-charge (complimentary) | staff[bill.nc] | reason | bill | F02 |
| POST /api/v1/orders/:id/cancel | cancel an un-billed order | staff[order.cancel] | reason | order | F02 |
| POST /api/v1/orders/:id/hold, /resume | park and resume a counter order | staff | — | order | F03 |
| POST /api/v1/tables/move | shift an order to another table | staff[table.shift] | order, from, to | order | F08 |
| POST /api/v1/tables/merge | merge orders → one (others `merged`) | staff[table.shift] | order ids | order | F08 |
| POST /api/v1/orders/:id/transfer-items | move some lines to another order or table | staff[table.shift] | line ids, target | orders | F08 |
| POST /api/v1/dues/:customerId/settle | collect a pending due later | staff | amount, method | payment | F04 |
| POST /api/v1/sync | replay the outbox: an ordered batch of the commands above | device | [{key, path, body}] | per-command results | offline |

### F05, F06 Captain and kitchen (S26–S27)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| (same order routes) | the captain view uses the order and KOT commands above | staff on device[captain] | — | — | F05 |
| POST /api/v1/orders/:id/request-bill | captain asks the counter to print the bill | staff | — | notification | F05 |
| GET realtime `kds:{station_id}` | KOT cards for a station | device[kds] | — | stream | F06 |
| POST /api/v1/kots/:id/status | preparing / ready / served / recall | device[kds] | status | kot | F06 |
| POST /api/v1/kot-items/:id/ready | mark one line ready | device[kds] | — | kot item | F06 |

### F09 QR scan & order, F10 online orders (S24, S28–S29)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| GET /q/:qrToken | guest menu for that table (cached for 60 s, sold-out items hidden) | guest | — | page | F09 |
| POST /api/v1/public/qr/:qrToken/orders | submit a round → pending order + 4-digit validation code | guest (rate-limited per IP and table) | lines, note, phone? | code | F09 |
| POST /api/v1/orders/:id/qr-validate | staff confirm the code → lines join the running order, KOT fires | staff | code | order | F09 |
| GET /o/:outletSlug | own online-ordering website (P4) | guest | — | page | F10 |
| POST /api/v1/public/outlets/:slug/orders | website order + Razorpay order for prepayment | guest | cart, customer, address | payment intent | F10 |
| POST /api/v1/online/orders/:id/accept | accept with a prep time → KOT | staff or auto-accept job | prep_minutes | order | F10 |
| POST /api/v1/online/orders/:id/reject | reject with a reason | staff | reason | order | F10 |
| POST /api/v1/online/orders/:id/status | ready / dispatched / delivered | staff | status | order | F10 |
| POST /api/v1/outlets/:id/online-status | store on/off, with a turn-on time | staff[online.manage] | status, turn_on_at, reason | outlet | F10 |
| POST /api/v1/items/stock | items on/off, with an auto turn-on time | staff[menu.stock] | item ids, in_stock, turn_on_at | items | F10, F11 |

### F12–F14 Inventory (S30–S36)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| action inventory.material.upsert | raw materials, units, min levels | manager+ | material | row | F12 |
| action inventory.recipe.upsert | recipe for an item, variation, add-on or semi-finished material | manager+ | recipe + lines | recipe | F12 |
| action supplier.upsert | suppliers | manager+ | supplier | row | F13 |
| action po.create / po.send / po.cancel | purchase orders (supplier or central kitchen) | manager+ | po | po | F13 |
| action purchase.post | post a GRN → stock_ledger +, supplier due | manager+ | purchase + lines | purchase | F13 |
| action transfer.request / dispatch / receive / reject | indents and transfers between outlets | manager+ (sender or receiver outlet) | lines | transfer | F14 |
| action stock_count.post | post a physical count → adjustments | manager+ | lines | count | F12 |
| action wastage.post | wastage with a reason | staff[stock.wastage] / manager | material, qty, reason | ledger row | F12 |
| GET /api/v1/reports/stock/:key | consumption, closing stock, variance, low stock, expiry, food cost | manager+ | filters | rows / file | F12 |

### F15, F17 Day end, reports, audit (S03, S13–S16)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| GET /api/v1/day-end/preview | open orders, expected cash by biller and method | staff[day_end] | business_date | summary | F15 |
| POST /api/v1/day-end | close the day with the counted cash → freeze the summary, email the owner | staff[day_end] | counted cash, notes | day_end | F15 |
| GET /api/v1/dashboard | today vs the same day last week: sales, orders, payment split, top items, per outlet | member | outlet(s), date | tiles | F17 |
| GET /api/v1/reports | the catalogue (keys, groups, filters) | member | — | list | F17 |
| GET /api/v1/reports/:key | run a report (sales, item, category, tax/GST, payment, discount, cancelled, staff, captain, CRM) | member with report right | filters, format=json/csv/xlsx/pdf | rows / file | F17 |
| POST /api/v1/reports/:key/export | async export of a large range → emailed link | member | filters | job id | F17 |
| GET /api/v1/audit | leakage panel: flagged actions | owner, admin, manager | filters | rows | F17 |

### F16, F19 CRM and loyalty (S37–S40)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| action crm.customer.update / erase | edit, or erase PII (keeps bills) | manager+ | fields | customer | F19 |
| action loyalty.settings.update | points rate, expiry, caps, recharge offers | owner, admin | settings | org | F16 |
| POST /api/v1/loyalty/otp | send a redemption OTP to the customer | staff | customer_id, purpose | challenge id | F16 |
| POST /api/v1/bills/:id/redeem | redeem points or wallet after the OTP | staff | challenge id, code, amount | payment | F16 |
| POST /api/v1/wallet/recharge | top up a wallet (+ bonus) | staff | customer, amount, method | ledger rows | F16 |
| action campaign.create / schedule / cancel | segment + template + schedule | owner, admin, manager | campaign | campaign | F19 |
| GET /f/:billToken + POST /api/v1/public/feedback | guest feedback after the bill | guest | rating, comment | ok | F19 |

### F20 Subscription (S42)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /api/v1/billing/checkout | create a Razorpay subscription (plan + add-ons × outlets) | owner | plan, addons, outlets | checkout data | F20 |
| POST /api/v1/billing/change | change plan or outlet quantity | owner | plan, qty | subscription | F20 |
| GET /api/v1/billing/invoices | list invoices | owner | — | invoices | F20 |

### Webhooks

In:
- `POST /api/webhooks/razorpay`: subscription.activated, charged, halted and cancelled; payment.captured for website orders. HMAC verified, stored in `inbound_events` with `unique(source, external_id)`, then processed by a job.
- `POST /api/webhooks/channels/:provider` (P4, optional): orders from an aggregator middleware, if the user signs up with one (UrbanPiper-style). Same inbox pattern, mapped to `orders` with `orders_channel_uq`.
- `POST /api/webhooks/sms/:provider`: delivery reports and opt-outs (DND).

Out:
- Order status callbacks to a connected channel (accept, reject, ready), retried with backoff.
- Item stock and store status pushed to connected channels.

### Jobs (Inngest)

| job | schedule / trigger | what it does |
| --- | --- | --- |
| item-auto-turn-on | every 5 min | `in_stock = true` where `auto_turn_on_at <= now()`. Same for `outlets.online_turn_on_at` |
| post-stock-for-kot | event `kot.created` / `kot.voided` | recipe explosion → `stock_ledger` rows (idempotent by kot_item) |
| low-stock-alerts | hourly + after each posting | compare `stock_levels` with `min_level` → notifications |
| day-end-mail | event `day_end.closed` | summary email (and WhatsApp in P4) to owners |
| auto-day-end-reminder | daily 03:30 local per outlet | warn if yesterday is still open |
| online-auto-accept | event `order.online.new` | accept channels with `auto_accept` after 10 s |
| channel-callbacks | event, retry 5× | push status and stock to channels |
| process-inbound-events | event + every minute sweep | handle webhooks exactly once |
| loyalty-expiry | daily 02:00 IST | write `expire` rows for lapsed points |
| birthday / anniversary / lapsed campaigns | daily 10:00 IST | build sends for matching customers (opt-in only) |
| report-exports | event | build a large export, upload to Storage, email a signed link |
| subscription-enforcement | daily | past_due > 7 days → org `read_only` (POS keeps billing offline-safe, back-office edits blocked) |
| print-job-reaper | every minute | re-queue `sent` jobs with no ack after 60 s, alert after 3 failures |
| cleanup | daily | delete `idempotency_keys` > 30 days, expired staff sessions and OTPs |

## Printing

```
POS (browser) ──command──▶ server ──insert print_jobs──▶ Realtime channel print:{outlet}
                                                              │
                                     print agent (outlet LAN) ◀┘ ESC/POS over TCP 9100 / USB
POS offline:  POS ──http://localhost:9180──▶ print agent on the same PC ──▶ printer
No agent:     POS ──window.print() with 58/80 mm CSS──▶ the system print dialog
```

The server renders print jobs as structured lines (not raw ESC/POS), and the
agent turns them into ESC/POS, so the template lives in one place. The agent
acks each job, and the reaper retries unacked jobs. In P1 the agent can be a
50-line Node script. A signed installer comes before launch.

## The parts that bite

- **Offline:** the POS runs local-first. Menu and open orders live in IndexedDB, and every command goes to an outbox with a client uuid plus idempotency key, then replays in order on reconnect. Bill numbers come from a **per-device series** (`T1/2026-27/0042`), so two offline terminals never collide, and GST allows several series. Cross-device features (KDS, captain, table locks) need the LAN online. That's an accepted limitation, shown with the offline banner.
- **Races:** two staff seat the same table → the partial unique index rejects the second, and the UI shows "table taken". Two terminals add to the same order → appends, never overwrites. Bill and KOT numbers come from a row-locked counter. A payment replay → same uuid, same result.
- **Idempotency:** every device command has `Idempotency-Key`. Webhooks dedupe on `inbound_events(source, external_id)`, stock on the ledger unique key, aggregator orders on `(channel_id, channel_order_id)` and loyalty on `(bill_id, kind, entry)`.
- **Money and GST:** integer paise only. Discount applies before tax, as GST requires. Tax per bill per rate, rounded half-up to the paisa, then round-off to the rupee in `round_off_paise` (±99). Inclusive prices back the tax out per line. CGST+SGST when the place of supply = the outlet's state, IGST otherwise (rare for restaurants). Composition and unregistered outlets print a "bill of supply" with no tax. Splits recompute tax per share, and a test makes the shares sum exactly to the original.
- **Time zones:** stored in UTC, displayed in the outlet's timezone. `business_date` (05:00 cut-off by default) drives reports and KOT serials, so late-night bills land on the right day. Reports filter on `business_date`, not `created_at`. India has no daylight saving, but the outlet timezone is a column for the Middle East later.
- **Realtime:** Supabase Realtime on `orders`, `order_tables`, `kots` and `print_jobs`, filtered by `outlet_id`, with RLS applied. Clients refetch on reconnect rather than trusting missed events.
- **Multi-tenancy:** `org_id` on every row, RLS on every table, and server commands check that each referenced id is in the same org. Add a test that tries every command with ids from another tenant.
- **Rate limits:** public QR, website and feedback routes are limited per IP and per table/outlet (Upstash or Postgres). PIN login locks for 5 minutes after 5 failures. OTPs allow at most 5 attempts in a 5-minute window.
- **Search:** menu search on the POS runs client-side over the cached menu (instant, works offline). Back-office search uses Postgres `ilike` / trigram on name and phone, which is enough at this scale.
- **File limits:** item images ≤ 1 MB, resized on upload. Menu import ≤ 5,000 rows.
- **SMS deliverability:** DLT template IDs per message, a sender ID per tenant, and opt-out honoured (`marketing_opt_in`). Transactional and promotional traffic go on separate routes.
- **Data protection (DPDP Act, India):** customer erasure nulls PII on `customers` but keeps bills, which tax law requires for 6+ years. Consent is captured for marketing. Data stays in Mumbai.
- **Subscription lapse:** never stop a restaurant mid-service. A past-due org becomes `read_only` for the back office after a grace period, and the POS keeps billing with a banner.

## Build order

1. **Vertical slice (M0), ugly but end to end:** sign up → outlet with GST → 3 items → 1 table → pair a POS device → PIN login → open order → KOT (browser print) → bill with GST → cash settle → dashboard shows the sale.
   Screens S01, S02 (minimal), S06 (minimal), S10, S17, S18, S19, S21, S25, S03 (one tile).
   Tables: organizations, outlets, org_members, roles, staff, staff_secrets, staff_sessions, devices, categories, items, taxes, item_taxes, areas, tables, orders, order_tables, order_items, kots, kot_items, bills, bill_lines, bill_taxes, payments, number_series, audit_log, idempotency_keys.
   Routes: signup, devices/pairing-code + pair, staff/login, pos/bootstrap, orders, orders/:id/items, orders/:id/kot, orders/:id/bill, bills/:id/payments, dashboard.
2. **Must-haves (M1–M3, phase P1), by area:**
   - M1 menu & setup: S05–S09, S11, S12, S43. Variations, add-ons, taxes, discounts, stations, printers, roles and rights, menu import.
   - M2 POS completeness: S20, S22, S23, S25 plus the print agent. Void KOT, split, multi-payment, merge/shift/transfer, running orders, delivery and takeaway, offline outbox + `/sync`, multi-terminal realtime.
   - M3 close the loop: S13–S16, S42. Day end, core reports + export, audit/leakage panel, Razorpay subscription.
   → **Pilot with 3–5 outlets here.**
3. **Should-haves:**
   - M4 floor & kitchen (P2): S26 KDS, S27 captain, S28–S29 QR scan & order, S44 reservations.
   - M5 inventory (P3): S30–S33, S35, S36. Recipes, GRN, POs, counts, wastage, low-stock alerts.
   - M6 online & CRM basics (P4): S24 full online inbox + own website channel, S37 customers and segments, hold orders, dues, NC bills, price per order type, availability windows, combos.
   **Could-haves:** M7 growth: S38–S40 loyalty, wallet, campaigns, feedback. M8 chains (P5): S04 multi-outlet, master menu, S34 central kitchen and transfers, consolidated reports, S45 kiosk, S46 owner mobile view. Aggregator middleware is optional, behind the `channels` abstraction.
4. **Fixes from `/replica-entrepreneur`:** not run yet. Slot them in after M3, ahead of the should-haves they beat. Likely candidates from recon: self-serve onboarding, easier tax and printer setup (a pain point in reviews).
