# Recon map: Petpooja POSS (web)

Scope: the full restaurant suite, in five build phases (see Size): POS billing
and KOT, menu, tables, kitchen display, captain ordering, QR scan & order,
online order inbox, inventory and recipes, CRM and loyalty, reports and day end,
staff rights, multi-outlet and central kitchen.
For: a multi-tenant SaaS sold to restaurants (India first: GST, UPI, INR).
Platform: web app. A back office in the browser, plus a touch POS, a captain
view, a KDS view and a guest QR menu, all as web routes that also work on tablets.
Date: 2026-10-15

> **Confidence note.** This session's network policy blocked petpooja.com,
> so no page was opened directly and no screenshots were taken. Everything below
> comes from web search over Petpooja's own pages and blog, third-party listings
> (G2, Capterra, SoftwareSuggest, Techjockey) and a public third-party profile of
> Petpooja's published Online Ordering API (v2.1.0). Screen layouts are inferred
> from feature descriptions. Before `/replica-design`, check them against the
> Play Store and App Store images and public walkthrough videos.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | marketing site, POS | https://www.petpooja.com/poss | the core loop in their words: orders, bills, KOTs, split bills, merged tables, discounts |
| 2 | pricing | https://www.petpooja.com/poss/pricing | Core / Growth / Scale, priced per outlet per year. "80+ reports", in-built CRM, KDS and loyalty as add-ons. Prices vary by source |
| 3 | pricing, third party | https://www.softwaresuggest.com/petpooja/pricing | Scale tier: KDS, scan & order, captain app, loyalty, virtual wallet, kiosk |
| 4 | pricing, third party | https://www.g2.com/products/petpooja-poss/pricing | Core $50 / Growth $95 / Scale $135 per location per month |
| 5 | feature roundup (vendor blog) | https://blog.petpooja.com/operations-workflows/must-try-features-petpooja-pos/ | "200+ features, nine modules": billing, KOT, menu, inventory, online orders, CRM, reports, aggregator centre, dashboard |
| 6 | older feature roundup | https://blog.petpooja.com/poss/must-try-features-petpooja-pos/ | day end, 80+ reports, purchase invoices, low and expiry stock alerts, suppliers hub, user rights, auto-accept app |
| 7 | menu management | https://www.petpooja.com/restaurant-menu-management-software | variations, add-ons, shortcodes, item on/off, availability time |
| 8 | menu sync blog | https://blog.petpooja.com/industry-business-guides/pos-features-for-menu-management/ | edit once and push to Swiggy and Zomato. Outlet on/off across apps |
| 9 | inventory | https://www.petpooja.com/poss/restaurant-inventory-management-software | central kitchen, request/supply stock, suppliers, returns, POs, multi-stage recipes |
| 10 | inventory blog | https://blog.petpooja.com/procurement-cost-control/features-for-inventory-management-system/ | consumption, wastage, transfer and low-stock reports |
| 11 | online orders | https://www.petpooja.com/poss/online-order-management-software | aggregator, website and WhatsApp orders on one screen. Auto-accept |
| 12 | online ordering glossary | https://blog.petpooja.com/glossary/online-food-ordering-integration/ | how the order flow works |
| 13 | public API profile | https://github.com/api-evangelist/petpooja | menu / save_order / update_item_stock / update_store_status schemas. Strong data-model evidence |
| 14 | split bill | https://blog.petpooja.com/glossary/split-bill/ | equal, item-wise and custom-amount splits. GST per share. Mixed payment modes |
| 15 | captain app | https://www.petpooja.com/captain-ordering-app | Android, offline, syncs with POS |
| 16 | captain app blog | https://blog.petpooja.com/industry-business-guides/petpooja-captain-ordering-reduces-order-errors/ | station routing, modification log with staff name and time, offline up to 5 days |
| 17 | captain app, iOS | https://apps.apple.com/us/app/-/id6470435905 | iPad build exists |
| 18 | scan & order | https://www.petpooja.com/poss/scan-and-order | QR per table, validation code, rounds append to the running bill |
| 19 | QR setup guide | https://blog.petpooja.com/industry-business-guides/set-up-qr-code-ordering-restaurant-guide/ | setup steps |
| 20 | KDS vs KOT | https://blog.petpooja.com/industry-business-guides/kds-vs-paper-kot-why-busy-kitchens-going-screen-first/ | card per order, tap to mark ready, station routing |
| 21 | kiosk | https://www.petpooja.com/poss/self-service-kiosk | kiosk orders go to POS and KDS |
| 22 | user rights | https://blog.petpooja.com/industry-business-guides/restaurant-pos-user-rights-who-should-access/ | per-login rights, e.g. "After Settlement Modification". Leakage panel |
| 23 | key user access | https://blog.petpooja.com/glossary/key-user-access/ | roles scoped to outlets |
| 24 | CRM reports | https://blog.petpooja.com/operations-workflows/how-to-use-petpooja-crm-reports-to-increase-your-outlet-sales/ | customer segments, SMS campaigns |
| 25 | loyalty / wallet | https://www.petpooja.com/restaurant-loyalty-program | points, cashback, expiry, OTP redemption, wallet top-up |
| 26 | CRM | https://www.petpooja.com/crm | birthday and anniversary SMS, feedback |
| 27 | POS build types | https://blog.petpooja.com/industry-business-guides/petpooja-pos-types-lite-android-local-electron-comparison/ | Lite / Android / Local / Electron, and what each one supports |
| 28 | integrations | https://www.petpooja.com/poss/restaurant-integrations | 200+ partners (Zomato, Swiggy, UPI, Tally, delivery fleets) |
| 29 | marketplace | https://www.petpooja.com/poss/restaurant-app-marketplace | add-on apps: captain, KDS, scan & order, and more |
| 30 | dashboard login | https://dineomai.com/blog/petpooja-login-dashboard | owner dashboard on billing.petpooja.com. Restricted users see fewer sections |
| 31 | reviews | https://www.g2.com/products/petpooja/reviews | tax, menu and printer setup is hard for new users |
| 32 | merchant app | https://apps.apple.com/app/id1362012013 | owner mobile dashboard: sales and notifications |

Still to gather (blocked here, worth doing by hand): the Play Store listing
screenshots for "Petpooja POS" and the "Captain App", YouTube setup and billing
walkthroughs, and Petpooja's support knowledge base, if one is public.

## Core loop

A cashier or captain takes an order on a table, takeaway or delivery. Station-wise
KOTs go to the kitchen. The bill is printed with GST, settled by cash, card or UPI
(split if needed), and every sale rolls up into the day-end report, the stock count
and the customer record.

## Screens

Routes are proposals for the clone. `bo` is the back office, `pos` the billing
terminal, `cap` the captain view, `kds` the kitchen display, `qr` the public guest menu.

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Sign up / log in | /login, /signup | owner account, then staff log in | form, OTP input | empty, error, OTP sent |
| S02 | Onboarding wizard | after first signup | restaurant name, outlet, address, GSTIN, tax setup, order types, first menu | stepper, form | each step, skipped steps |
| S03 | Owner dashboard | bo /dashboard | today's sales, orders, top items, payment split, outlet comparison | stat tiles, charts, outlet filter, date range | empty (new outlet), filled, loading |
| S04 | Outlets | bo /outlets | list, add and configure outlets. Outlet switcher in the header | table, switcher | 1 outlet, many |
| S05 | Menu: categories & items | bo /menu | category tree (parent > category), item list, on/off toggle, bulk edit, import | tree, data table, toggle, search | empty, filled, item off |
| S06 | Item editor | bo /menu/items/:id | name, shortcode, price per order type, online price, variations, add-ons, tax, station, veg flag, availability time, combo | form, chips, repeaters | new, edit, validation error |
| S07 | Variations & add-on groups | bo /menu/addons | add-on groups with min/max, variation templates | list, modal | empty, filled |
| S08 | Taxes & charges | bo /settings/taxes | GST slabs (CGST+SGST / IGST), service charge, packaging and delivery charges, tax inclusive/exclusive | table, form | default GST, custom |
| S09 | Discounts & coupons | bo /discounts | % or flat, item, category or bill level, order-type rules, validity, max cap | table, form | none, active, expired |
| S10 | Areas, tables & QR | bo /tables | areas (AC, Garden...), tables with seats, QR code per table for scan & order | grid, QR download | empty, filled |
| S11 | Kitchen stations & printers | bo /settings/stations | stations (Kitchen, Bar, Bakery), which categories or items go where, printer per station, bill printer | list, mapping table | none, mapped, printer offline |
| S12 | Staff & user rights | bo /staff | users, PIN, role, per-right toggles (cancel KOT, modify after settlement, discount, reprint, reports), outlet scope | table, permission matrix | owner, manager, biller, captain |
| S13 | Reports catalogue | bo /reports | grouped list of ~80-90 reports: sales, item-wise, category, tax, payment, discount, cancelled, staff, captain performance, inventory, CRM | searchable list | n/a |
| S14 | Report viewer | bo /reports/:key | filters (date, outlet, order type), table, totals, CSV/Excel/PDF export, email schedule | filters, data table, export | empty, filled, loading |
| S15 | Day end / shift close | pos /day-end | biller-wise sales and cash summary, expected vs counted cash, open orders check, close the day | summary card, cash count form | open orders block, closed |
| S16 | Leakage / audit panel | bo /audit | KOTs cancelled after sending, bills modified or reprinted, table shifts, discounts, all with who and when | timeline, filters | none, flagged |
| S17 | POS staff login | pos /login | PIN or user switch on a shared terminal | PIN pad | wrong PIN, locked |
| S18 | Table view | pos /tables | floor by area. Table states: blank, running, KOT printed, bill printed, paid. Timer per table. Actions: merge, shift, transfer | table tiles, area tabs, legend | all free, busy, reserved |
| S19 | Billing screen | pos /order/:id | order type (dine-in / takeaway / delivery), category rail, item grid and search by name or shortcode, cart with qty, notes, variations and add-ons, customer, discount, KOT / KOT & Print / Bill / Save & Settle | item grid, cart, numpad, modals | empty cart, items, KOT sent, billed, offline |
| S20 | Customer modal | from S19 | find by phone, add name, address, GST number. Shows wallet and points | search, form | new, returning |
| S21 | Settlement / payment | from S19 | cash, card, UPI, wallet, other. Multi-mode, part payment, due (credit), tip, round-off, NC/complimentary (guess) | payment tiles, numpad | full, part, due, failed |
| S22 | Split bill | from S19 | equal, item-wise or custom amount. GST per share | split editor | 2..n splits |
| S23 | Running orders | pos /orders | all open orders by type and status, hold orders, search, reprint, cancel with reason | list, filters | none, many |
| S24 | Online order inbox | pos /online | incoming orders from website, QR and aggregators. Accept or reject (auto-accept option), mark food ready, prep time, store on/off, item stock toggles | order cards, sound alert, toggle | new (ringing), accepted, ready, rejected, store off |
| S25 | Print preview (bill / KOT) | from S19 | printable bill (GSTIN, HSN/SAC, tax breakdown, FSSAI no.) and KOT (table, captain, items, notes, serial no., VOID KOT) | print templates | bill, KOT, cancel KOT, reprint (marked) |
| S26 | Kitchen display | kds /:stationId | order cards by station, items, notes, age timer, tap to mark item or order ready, recall | card grid, timer | empty, busy, late, ready |
| S27 | Captain view | cap / | mobile: pick table, take order with notes, send KOT, see running table, request bill | table grid, menu list, cart | offline queue, sent |
| S28 | Guest QR menu | qr /:outletSlug/t/:tableCode | menu by category, veg filter, item details, add to cart, sold-out hidden | menu list, item sheet | closed, sold out |
| S29 | Guest cart & submit | qr cart | review, notes, submit. Validation code shown to the guest. Later rounds go onto the same table bill | cart, code display | submitted, pending validation, added round |
| S30 | Raw materials | bo /inventory/items | raw items, unit, conversion, category, min level, current stock, expiry | data table | empty, low, expired |
| S31 | Recipe editor | bo /inventory/recipes/:itemId | ingredients per menu item or variation, semi-finished (multi-stage) recipes, yield | repeater, unit picker | none, set |
| S32 | Purchase entry (GRN) | bo /inventory/purchases | supplier invoice: items, qty, rate, tax. Increases stock | line-item form | draft, posted |
| S33 | Suppliers & purchase orders | bo /inventory/po | suppliers, raise PO, receive against PO, returns | table, form | draft, sent, partial, received |
| S34 | Indents & transfers | bo /inventory/transfers | outlet asks the central kitchen or another outlet for stock, sender dispatches, receiver accepts. Returns | request list, form | requested, dispatched, received, rejected |
| S35 | Stock count & wastage | bo /inventory/count | physical count vs system, variance, wastage entry with reason | sheet, form | draft, posted |
| S36 | Stock reports & alerts | bo /inventory/reports | consumption, closing stock, variance, low stock, expiry, food cost % | reports, alert list | none, alerts |
| S37 | Customers | bo /crm | customer list, segments (new, regular, lapsed), profile with order history, spend, wallet | table, profile | empty, filled |
| S38 | Loyalty & wallet setup | bo /crm/loyalty | points per amount, cashback, expiry, redemption rules, OTP redemption, wallet recharge offers | form | off, on |
| S39 | Campaigns | bo /crm/campaigns | SMS or WhatsApp to a segment, birthday and anniversary automations, schedule | composer, segment picker | draft, scheduled, sent |
| S40 | Feedback | bo /crm/feedback | feedback link or QR after the bill, ratings and comments | list, chart | none, filled |
| S41 | Integrations | bo /integrations | connect online channels (own website / QR, aggregators via partner API), payment gateway, accounting export, SMS provider | cards, connect forms | not connected, connected, error |
| S42 | Subscription & billing (SaaS) | bo /billing | plan, outlets, add-ons, invoices, renew | plan cards, invoice table | trial, active, overdue |
| S43 | Outlet settings & bill format | bo /settings | outlet profile, GSTIN, FSSAI, bill header/footer, numbering series, round-off, order types on/off | form, live preview | default, custom |
| S44 | Reservations & waitlist | pos /reservations | book a table for a time, waitlist, seat (medium confidence) | list, form | none, upcoming |
| S45 | Self-order kiosk | kiosk / | large-touch menu, cart, pay, token number | menu grid, cart | idle, ordering, paid |
| S46 | Owner mobile dashboard | bo /m | sales at a glance on a phone (Merchant app equivalent) | stat tiles | n/a |

46 screens.

## Flows

```
F01 New restaurant signs up and is ready to bill
    S01 -> S02 (outlet, GST, taxes) -> S05/S06 (add items) -> S10 (tables) -> S11 (stations, printers) -> S12 (staff) -> S19
    happy path clicks: ~25 + per-item entry (number to beat: under 10 minutes to the first bill with a sample menu)
    edge: no GSTIN (composition / unregistered), IGST vs CGST+SGST, menu import from Excel fails, printer not found

F02 Dine-in order, fired to the kitchen, billed and settled (the core loop)
    S18 pick table -> S19 add items (shortcode/search), notes -> KOT (station-wise KOTs print, S25) -> [add more, KOT again]
        -> Bill (S25 bill print) -> S21 settle (cash/card/UPI) -> table back to blank on S18
    happy path clicks: 1 table + N items + 1 KOT + 1 bill + 2 settle = N+5
    edge: item with mandatory variation/add-on, item switched off mid-order, KOT printer offline,
          cancel an item after KOT (needs right + reason -> VOID KOT), discount needs permission,
          modify after bill print (logged), terminal offline

F03 Takeaway / counter quick bill
    S19 (order type takeaway) -> items -> "Save & Print" -> S21 -> token number
    happy path clicks: N+3
    edge: customer phone required for delivery, packaging charge per item

F04 Delivery order taken by phone
    S19 delivery -> S20 customer + address -> items -> KOT -> bill -> S21 mark due/paid on delivery
    edge: delivery charge rules, cash-on-delivery due

F05 Captain takes an order at the table
    S27 pick table -> add items, notes -> Send KOT -> KOT prints / shows on S26 -> table shows running on S18
    happy path clicks: N+2
    edge: network down (queue offline, sync later), two captains on the same table, captain has no cancel rights

F06 Kitchen works a ticket on the KDS
    S26 new card (sound) -> tap item(s) done -> tap order ready -> card clears, POS/captain sees "ready"
    edge: void KOT arrives for an in-progress card, recall a cleared card, order late (timer turns red)

F07 Split and settle a shared table
    S19 -> S22 (item-wise or equal) -> S21 per split (UPI + card + cash)
    edge: split after a discount, rounding across splits, one split left unpaid (due)

F08 Merge, shift or transfer tables / items
    S18 long-press table -> merge with / move to table -> S19 reflects the merged order
    edge: target table already running, transfer only some items, logged in the audit (S16)

F09 Guest orders by QR (scan & order)
    S28 scan table QR -> browse -> S29 submit -> code shown -> staff validate on S24/S19 -> KOT -> later rounds append -> bill at the table
    happy path clicks (guest): N+3
    edge: fake order (no validation), item sold out after cart, table already billed, outlet closed

F10 Online order arrives and is fulfilled
    S24 rings -> accept (or auto-accept) with prep time -> KOT -> mark food ready -> handed over -> auto bill
    edge: reject with reason, item out of stock -> toggle stock (pushed to channel), store switched off until a time,
          channel status callback fails (retry)

F11 Owner edits the menu once and it reaches every channel
    S05/S06 change price / switch item off -> POS, captain, QR, kiosk and connected channels update
    edge: different price per order type or channel, scheduled availability (breakfast only), multi-outlet push from a master menu

F12 Recipe-based stock deduction
    S31 set recipe -> sale on S19 -> stock reduced per recipe (incl. variations, add-ons) -> S36 low stock alert
    edge: unit conversion (kg vs g), semi-finished items, cancelled KOT (wasted or restored?), negative stock

F13 Purchase and receive stock
    S33 raise PO -> supplier delivers -> S32 GRN against the PO (partial) -> stock up -> supplier due
    edge: price differs from PO, damaged return, tax on purchase

F14 Outlet requests stock from the central kitchen
    S34 outlet raises an indent -> central kitchen dispatches (stock out there) -> outlet receives (stock in) -> variance logged
    edge: partial dispatch, rejected, in transit at day end

F15 Day end
    S15 check no open orders -> count cash -> close day -> summary SMS/email to the owner -> S03 updated
    edge: open orders block closing, cash short/over, a late bill after day close (goes to the next business date)

F16 Customer earns and redeems loyalty
    S20 phone -> bill -> points credited (SMS) -> next visit: redeem via OTP on S21 -> wallet recharge with bonus
    edge: OTP not received, points expired, redemption cap

F17 Owner checks reports and leakage
    S03 -> S13 -> S14 (filter, export) -> S16 cancelled KOTs / modified bills
    edge: multi-outlet consolidated vs per outlet, very large date range (export async)

F18 Owner sets staff rights
    S12 add user -> role -> toggle rights -> outlet scope -> staff logs in with PIN on S17 and sees only what is allowed
    edge: manager override PIN for one action, user removed while logged in

F19 Campaign to lapsed customers
    S37 segment "not visited in 30 days" -> S39 compose -> schedule -> sent -> report
    edge: DND/opt-out, SMS template approval (DLT in India)

F20 Subscribe and add an outlet (SaaS)
    S42 trial -> choose plan + add-ons -> pay -> add outlet on S04
    edge: payment fails, overdue -> read-only POS (grace period)
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, danger, large-touch (POS) | default, hover, pressed, focus, disabled, loading | all |
| Item tile (POS) | with/without image, veg/non-veg marker, price | default, in cart (qty badge), off/sold out | S19, S27, S28, S45 |
| Category rail | vertical (POS), horizontal chips (mobile) | selected, default | S19, S27, S28, S45 |
| Cart line | with variation/add-ons, note | normal, KOT sent (locked), voided, editing qty | S19, S27, S29 |
| Numpad / PIN pad | qty, amount, PIN | default, error | S17, S19, S21, S15 |
| Table tile | 2/4/6+ seats | blank, running, KOT printed, bill printed, paid, reserved, merged | S18, S27 |
| Order-type switch | dine-in, takeaway, delivery, online | selected | S19 |
| Payment method tile | cash, card, UPI, wallet, due, other | selected, amount filled | S21, S22 |
| Modal / sheet | dialog, bottom sheet (mobile), full-screen (POS) | open, closing | everywhere |
| Reason picker | cancel, void, discount, NC | required, chosen | S19, S23 |
| Order card | online, KDS | new (flash + sound), accepted, preparing, ready, late, rejected | S24, S26 |
| Timer badge | elapsed since KOT | normal, warning, late | S18, S26 |
| Toggle | item on/off, store on/off, permission | on, off, disabled | S05, S12, S24 |
| Data table | sortable, selectable, with totals row | empty, loading, filled, error | S05, S13-S14, S30-S37 |
| Filters bar | date range, outlet, order type, staff | default, applied | S03, S14, S16, S36 |
| Stat tile + chart | KPI, delta, sparkline | loading, filled | S03, S46 |
| Form fields | text, number, money, phone (+91), GSTIN, select, multi-select, date, time window | default, focus, error, disabled | all bo |
| Repeater row | variations, add-ons, recipe lines, PO lines | add, remove, error | S06, S31-S35 |
| Permission matrix | role x right | on/off, inherited | S12 |
| Stepper | onboarding | current, done, skipped | S02 |
| Toast / alert | success, error, offline, sync | shown, dismissed | all |
| Offline banner | — | offline, syncing, synced | pos, cap |
| Print template | bill, KOT, void KOT, day-end, token | normal, reprint marked | S25, S15 |
| QR code card | per table | download, print | S10 |
| Outlet switcher | — | single, multi | header (bo) |
| Empty state | per list | with CTA | all lists |

## Inferred data model

```
Organization  id, name, owner_user_id, plan, status (trial | active | overdue | cancelled), created_at
              evidence: per-outlet SaaS pricing (src 2-4), multi-outlet (src 9), S42
              confidence: high (that tenants exist), medium (fields)

Outlet        id, org_id, name, address, city, gstin, fssai_no, currency, timezone, is_central_kitchen,
              order_types_enabled[], bill_prefix, store_online_status, turn_on_time, min_order_amount,
              delivery_charge, packaging_charge
              evidence: API restaurant object (restaurantid, menusharingcode, currency, minimumorderamount,
                        minimumdeliverytime, deliverycharge, packaging_charge), update_store_status (store_status, turn_on_time, reason) (src 13)
              confidence: high

User          id, org_id, name, phone, email, pin_hash, role_id, outlet_ids[], active
Role          id, org_id, name, rights[] (e.g. cancel_kot, modify_after_settlement, give_discount, reprint, view_reports)
              evidence: user rights blog, "After Settlement Modification" right, key-user outlet scoping (src 22, 23)
              confidence: high (concept), medium (right names)

ParentCategory id, outlet_id, name, sort
Category      id, outlet_id, parent_id, name, sort, timing (available from/to), active
              evidence: API categories + parentcategories (src 13), availability time (src 7)
              confidence: high

Item          id, outlet_id, category_id, name, shortcode, description, price, is_veg (attribute),
              in_stock, auto_turn_on_time, allow_variation, tax_ids[], station_id, is_combo, combo_items[],
              order_type_prices (json), online_price, image_url, sort
              evidence: API item (itemid, itemname, itemcategoryid, price, in_stock, itemallowvariation,
                        item_tax, is_combo, combo_items), update_item_stock (inStock, autoTurnOnTime), shortcodes (src 7)
              confidence: high

Variation     id, item_id, name, price, sort          evidence: API variations (src 13), confidence: high
AddonGroup    id, outlet_id, name, min_select, max_select
Addon         id, group_id, name, price, is_veg      evidence: API addongroups (src 13), confidence: high (min/max: medium)
ItemAddonGroup item_id, addon_group_id
Attribute     id, name (veg, non-veg, egg)           evidence: API attributes (src 13), confidence: medium

Tax           id, outlet_id, name (CGST, SGST, IGST, VAT, service charge), rate, type (percent | fixed),
              applies_on (core | total), order_types[]
              evidence: API taxes, item_tax, gst_liability on order items (src 13); GST per split (src 14)
              confidence: high
Discount      id, outlet_id, name, type (percent | flat), value, level (item | category | bill), max_cap,
              min_bill, order_types[], valid_from/to, needs_right, coupon_code
              evidence: API discounts (src 13), discounts and coupons (src 1)
              confidence: medium

Area          id, outlet_id, name
Table         id, area_id, name, seats, qr_code, status (blank | running | kot | billed | paid | reserved)
              evidence: table view, merge/shift (src 1), QR per table (src 18)
              confidence: high (concept), medium (status names)

Station       id, outlet_id, name, printer_id, kds_enabled
Printer       id, outlet_id, name, type (bill | kot), connection (network | usb | bluetooth), address
              evidence: station-wise KOT and unique printer per station (src 1, 16)
              confidence: high

Order         id, outlet_id, business_date, order_no, type (dine_in | takeaway | delivery | online | qr | kiosk),
              source (pos | captain | qr | website | aggregator:<name> | kiosk), channel_order_id,
              table_id, customer_id, captain_user_id, biller_user_id, status (open | kot | billed | settled |
              cancelled | rejected), online_status (new | accepted | ready | dispatched | delivered | rejected),
              prep_time_min, pax, notes, created_at
              evidence: save_order (orderinfo, clientOrderID, orderID, callback_url Accept/Reject/Food Ready) (src 13),
                        order types (src 13 ordertypes), captain performance report (src 22)
              confidence: high
OrderItem     id, order_id, item_id, variation_id, name, qty, price, final_price, item_discount, item_tax (json),
              addons (json), note, kot_id, status (active | void), void_reason, void_by
              evidence: API OrderItem (id, name, price, final_price, quantity, variation_id, item_tax, item_discount, addons)
              confidence: high

KOT           id, order_id, station_id, kot_no (running serial per day), type (new | void), printed_at,
              kds_status (new | preparing | ready), created_by
              evidence: KOT serials and VOID KOT (KOT blog), station routing (src 16), KDS ready (src 20)
              confidence: high

Bill          id, order_id, bill_no (series per outlet + fiscal year), sub_total, discount_total, tax_breakup (json),
              charges (json), round_off, grand_total, printed_count, status (open | settled | cancelled), is_nc,
              split_parent_id
              evidence: bill print, split bills with GST per share (src 14), reprint audit (src 22)
              confidence: high (is_nc: guess)
Payment       id, bill_id, method (cash | card | upi | wallet | due | other), amount, reference, received_by, at
              evidence: split payments with mixed modes (src 14)
              confidence: high

Customer      id, org_id, phone, name, email, addresses (json), gstin, dob, anniversary, tags[], first_visit,
              last_visit, visits, total_spend
              evidence: API Customer (details), CRM segments and birthday SMS (src 24, 26)
              confidence: high
LoyaltyLedger id, customer_id, outlet_id, type (earn | redeem | expire | recharge | bonus), points, amount,
              bill_id, expires_at, otp_verified
              evidence: loyalty wallet with points, cashback, expiry, OTP redemption, recharge offers (src 25)
              confidence: medium

DayEnd        id, outlet_id, business_date, closed_by, expected_cash, counted_cash, variance, summary (json), closed_at
              evidence: day-end summary, biller-wise cash summary (src 6, 22)
              confidence: medium

RawMaterial   id, org_id, name, category, base_unit, purchase_unit, conversion, min_level, has_expiry
StockLedger   id, outlet_id, raw_material_id, qty (+/-), reason (sale | purchase | transfer_in | transfer_out |
              wastage | adjustment | production), ref_type, ref_id, at
              (current stock = sum of the ledger; snapshot table for speed)
Recipe        id, item_id, variation_id, yield_qty
RecipeLine    recipe_id, raw_material_id or semi_item_id, qty, unit
              evidence: recipe-based deduction, multi-stage recipes (src 9, 10)
              confidence: high (concept), guess (ledger design)
Supplier      id, org_id, name, phone, gstin, address
PurchaseOrder id, outlet_id, supplier_id, status (draft | sent | partial | received | cancelled), lines (json)
Purchase(GRN) id, outlet_id, supplier_id, po_id, invoice_no, date, lines, tax, total, paid, due
StockTransfer id, from_outlet_id, to_outlet_id, status (requested | dispatched | received | rejected), lines
Wastage       id, outlet_id, raw_material_id, qty, reason, by
              evidence: POs, suppliers, central kitchen request/supply, returns (src 9)
              confidence: medium

Channel       id, outlet_id, kind (website | qr | aggregator | kiosk), name, external_store_id, credentials (encrypted),
              auto_accept, status
              evidence: online order integration, auto-accept (src 11, 12), partner app-key/secret/token per integration (src 13)
              confidence: medium

Reservation   id, outlet_id, customer_id, party_size, at, table_id, status       confidence: guess
Campaign      id, org_id, channel (sms | whatsapp), segment (json), body, scheduled_at, status, stats
Feedback      id, outlet_id, bill_id, customer_id, rating, comment, at         confidence: medium
AuditLog      id, org_id, outlet_id, user_id, action (kot_cancel | bill_modify | reprint | table_shift | discount ...),
              entity, entity_id, before, after, reason, at
              evidence: leakage panel, KOT modification report with captain name and timestamp (src 16, 22)
              confidence: high
Subscription  id, org_id, plan (core | growth | scale), addons[], outlets, renews_at, status   confidence: medium
```

Relationships: Organization 1-n Outlet, 1-n User, 1-n Customer, 1-n RawMaterial, 1-n Supplier.
Outlet 1-n Category 1-n Item 1-n Variation. Item n-n AddonGroup 1-n Addon. Item n-n Tax.
Outlet 1-n Area 1-n Table. Outlet 1-n Station 1-1 Printer. Item n-1 Station (fallback: category station).
Order 1-n OrderItem, 1-n KOT, 1-n Bill (splits) 1-n Payment. Order n-1 Table, n-1 Customer, n-1 User (captain, biller).
Item 1-1 Recipe 1-n RecipeLine n-1 RawMaterial. Outlet 1-n StockLedger. Customer 1-n LoyaltyLedger.
Everything is scoped by org_id. Multi-outlet menus: a master menu at org level, copied or synced to outlets
(an assumption: check against the menu-sync sources).

## Feature matrix

See `features.csv`. Must: 44, should: 39, could: 21, skip: 10 (114 rows).

## Out of scope (cannot or should not be cloned)

- **Zomato / Swiggy direct integrations.** They need partner onboarding with each aggregator, which is a business deal and not a feature. Build the channel abstraction and the online order inbox. Connect the clone's own website and QR ordering first, then go through an integration aggregator (UrbanPiper-style middleware) or apply for partner access.
- **Petpooja's marketplace of 200+ partner apps** and its partner network.
- **Petpooja's customers, menus, data and brand**: logos, names ("Captain App" is generic, "Petpooja" is not), copy and imagery.
- **Native Android and Windows apps** with true offline-for-days operation. The web clone gets a PWA with an offline order queue instead (see Hard parts).
- **Hardware**: EDC card machines and integrated payment terminals, cash drawers and their drivers. Printing goes through the browser or a small local print agent.
- **Petpooja Invoice** (the retail billing product), payroll and task management add-ons, and Petpooja Pay. These are separate products.
- **GST e-invoicing (IRN)** needs a GSP/ASP provider contract. Plan it as an integration through a licensed GSP API, not built in house.
- **SMS in India** needs DLT registration and an SMS provider. That's an integration, not a feature you clone.
- **Its AI tools** (the "six AI tools") are unknown in detail. Revisit after `/replica-entrepreneur`.

## Size

Screens 46, flows 20, entities ~38.

Hard parts:
1. **Printing from a web app.** Silent, station-wise KOT and bill printing to thermal printers (ESC/POS over LAN/USB) needs a local print bridge (a tiny agent, or QZ Tray-style), because browsers can't do silent multi-printer printing.
2. **Offline billing and sync.** A restaurant can't stop billing when the internet drops. The POS, captain and KDS need a local-first store (IndexedDB) with an order queue, per-device number series and conflict rules.
3. **Realtime across devices.** POS, captain, KDS, QR and online inbox all edit the same order and table state, so you need websockets and ordering guarantees.
4. **GST-correct billing.** Inclusive/exclusive tax, CGST+SGST vs IGST, discounts before tax, per-split recalculation, round-off, fiscal-year bill series, NC bills and audit trails for every change.
5. **Inventory accuracy.** Recipe deduction with unit conversion, variations and add-ons, multi-stage semi-finished items, transfers in transit and central kitchen production.
6. **Aggregator integrations** are partner-gated (see Out of scope).

Size: **XL. Rescope it into phases.** Each phase below ships something sellable:

| phase | contents | screens | size |
| --- | --- | --- | --- |
| P1 Core POS | signup/onboarding, menu, taxes, discounts, tables, stations/printing, billing, KOT, split/settle, running orders, day end, staff rights, core reports, audit, subscription | S01-S25, S42-S43 | L |
| P2 Floor & kitchen | KDS, captain view, QR scan & order, reservations | S26-S29, S44 | M |
| P3 Inventory | raw materials, recipes, purchases/POs, suppliers, stock count, wastage, alerts | S30-S33, S35-S36 | M-L |
| P4 Growth | CRM, loyalty/wallet, campaigns, feedback, online order inbox + own website channel, integrations | S24 (full), S37-S41 | M-L |
| P5 Chains | multi-outlet master menu, central kitchen, indents/transfers, consolidated reports, kiosk, owner mobile view | S04, S34, S45-S46 | M |

P1 is the product: the billing → KOT → settle → day-end loop is what restaurants
pay for. Ship P1 to a few pilot outlets before starting P2.
