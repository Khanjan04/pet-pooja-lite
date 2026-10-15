# Test plan: restaurant POS clone

Build: f512f36 (all fixes in)  Date: 2026-10-15  Env: local production build (`scripts/serve.sh`), Postgres 16, data created per test through the real sign-up/onboarding code (sample menu).

Automation:
- `e2e/*.spec.ts`: Playwright, role/label selectors only. Every test fails on console errors or any 5xx, and screens get an axe WCAG 2.1 AA scan. `@mobile` cases also run at 390 px.
- `src/server/server.itest.ts`: route handlers against a real database (permissions, isolation, races, webhooks).
- `src/lib/domain/domain.test.ts`: bill maths, dates, KOT routing.

Result column: **pass**, **fail → BUG-nnn**, **not built** (the flow’s screens don’t exist yet; counted, not run), **manual** (needs a real provider).

| case | flow | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- | --- |
| F01-H1 | F01 sign up → ready to bill | happy | /dashboard → login → new account → email link → onboarding → create | dashboard “No sales yet”, till paired, PIN screen lists owner | e2e (1440 + 390) | pass (1440 + 390) |
| F01-H2 | F01 | happy: forgot password | request reset → email link → new password → sign in | signed in with new password, old sessions ended | e2e | pass |
| F01-E1 | F01 | edge: long, accented, emoji names | 60+ char name with emoji; Devanagari + emoji restaurant name | stored exactly, no layout overflow | e2e | pass |
| F01-E2 | F01 | edge: double-click submit | double-click Create restaurant | one restaurant, one till | e2e | fail → BUG-001 → fixed, pass |
| F01-E3 | F01 | edge: refresh mid-flow | reload onboarding | still signed in, form shown | e2e | pass |
| F01-E4 | F01 | edge: keyboard only | arrow keys + Tab + Enter through sign-up | “Check your email” | e2e | pass (see bugs.md “to check”) |
| F01-N1 | F01 | negative: registered without GSTIN | submit with empty GSTIN | 409, message names GSTIN | e2e | pass |
| F01-N2 | F01 | negative: wrong password / unverified | sign in wrong, then unverified | clear message; verification resent | e2e | pass |
| F01-N3 | F01 | negative: same email twice | sign up with an existing email | message or neutral screen; still one user | e2e | pass |
| F01-N4 | F01 | negative: used/fake reset link | open reset page with error | “This link has expired” | e2e | pass |
| F01-N5 | F01 | negative: rate limits | 4 sign-ups / 11 code guesses from one address | 429 | itest | pass |
| F01-M1 | F01 | manual: real email | sign up with Resend configured | email arrives, from own domain, link works | manual | manual |
| F01-M2 | F01 | manual: Google sign-in | with own OAuth client | account created, onboarding | manual | manual |
| F02-H1 | F02 dine-in loop | happy | table → items → KOT → bill → card + cash | KOTs per station, GST right, table frees | e2e (1440 + 390) | pass (1440 + 390) |
| F02-E1 | F02 | edge: double-click Send to kitchen | | one KOT set, no error shown | e2e | fail → BUG-002 → fixed, pass |
| F02-E2 | F02 | edge: double-click Take payment | | one payment | e2e | pass |
| F02-E3 | F02 | edge: two tabs | tab 2 open on tables; tab 1 seats A1 | tab 2 updates live, shares the order | e2e | pass |
| F02-E4 | F02 | edge: refresh + back mid-order | | order intact | e2e | pass |
| F02-E5 | F02 | edge: emoji + very long note | | kept (120 max), no overflow | e2e | pass |
| F02-E6 | F02 | edge: two tills seat one table at once | parallel openOrder | same order | itest | pass |
| F02-E7 | F02 | edge: retry after dropped connection | same idempotency key twice | one payment | itest | pass |
| F02-E8 | F02 | edge: offline | network off mid-order | clear offline banner; nothing silently lost | e2e | pass (automated: setOffline) |
| F02-E9 | F02 | edge: business date | sale at 01:30 IST | belongs to previous day | unit | pass |
| F02-N1 | F02 | negative: sold out | tap sold-out dish | nothing added | e2e | pass |
| F02-N2 | F02 | negative: void rules | void needs reason; captain has no void | as described | e2e + itest | pass |
| F02-N3 | F02 | negative: PIN session ended | end session in db, then act | back to PIN screen | e2e | pass |
| F02-N4 | F02 | negative: second restaurant’s data | open A’s order/bill URL as B | not found / nothing to print | e2e + itest | pass |
| F02-N5 | F02 | negative: printer | thermal printing | n/a until print agent | not built | not built |
| F03-H1 | F03 takeaway | happy, keyboard | “/” ch Enter, bill, cash | ₹50 without GST (unregistered) | e2e | pass |
| F03-E1 | F03 | edge: double-click New takeaway | | one order | e2e | pass |
| F03-E2 | F03 | edge: abandoned empty order | open takeaway, go back | no ghost order on tables | e2e | fail → BUG-003 → fixed, pass |
| F04-H1 | F04 delivery | happy (basic) | new delivery, item, KOT, bill | billable | e2e | pass |
| F04-E1 | F04 | customer + address | | needs S20 | not built | not built |
| F05 | captain | all | | screen not built | not built | not built |
| F06 | KDS | all | | screen not built | not built | not built |
| F07 | split bill | all | | S22 not built (split tender works: F02-H1) | not built | not built |
| F08 | merge/shift tables | all | | not built | not built | not built |
| F09 | QR ordering | all | | not built | not built | not built |
| F10 | online orders | all | | not built | not built | not built |
| F11 | menu edits reach channels | all | | S05/S06 not built | not built | not built |
| F12–F14 | inventory | all | | P3 | not built | not built |
| F15 | day end | all | | S15 not built | not built | not built |
| F16 | loyalty | all | | P4 | not built | not built |
| F17-H1 | F17 reports | happy + isolation | sale shows on dashboard; B sees nothing | e2e | pass |
| F18-H1 | F18 staff/tills | happy | pair till by code; remove it | removed till goes back to pairing | e2e (1440 + 390) | pass (1440 + 390) |
| F18-N1 | F18 | negative: PIN lockout | 5 wrong PINs | locked message, right PIN refused for 5 min | e2e + itest | pass |
| F18-N2 | F18 | negative: bad code | wrong pairing code | clear message | e2e | pass |
| F19 | campaigns | all | | P4 | not built | not built |
| F20-H1 | F20 subscribe | happy (partial) | open billing | trial shown, plans disabled without keys | e2e | pass |
| F20-E1 | F20 | edge: read-only org | | banner; tills still bill | e2e | pass |
| F20-N1 | F20 | negative: cancelled org | | till stops (pairing screen) | e2e | pass |
| F20-N2 | F20 | webhooks | bad signature, duplicate, out of order | 401 / once / stale ignored | itest | pass |
| F20-M1 | F20 | manual: Razorpay test checkout | subscribe with test UPI/card, then cancel | status active → cancelled at period end | manual | manual |
| F20-M2 | F20 | manual: payment failure | Razorpay test failure | past due banner + email | manual | manual |
| ACC-H1 | account | delete account | password confirm | user gone, org closed, bills kept | e2e + itest | pass |
| ACC-E1 | account | sign out everywhere | second browser signed in | second browser signed out | e2e | pass |

## Results

- **56 cases.** Run: **39**. All 39 pass now; 3 failed first and were fixed (BUG-001, BUG-002, BUG-003). Not built yet: 13. Manual, needing real providers: 4 (email, Google, Razorpay ×2).
- Tests behind them: 37 Playwright runs (34 tests, 3 of them also at 390 px), 17 server integration tests, 15 unit tests. The full Playwright suite passed 3 times in a row before the offline test was added, and once more with it (37/37, ~52 s).
- Every screen the e2e visits passes axe (WCAG 2.1 AA) and has no horizontal scroll at 390 px where checked.
