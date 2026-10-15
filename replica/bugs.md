# Bugs

App: `/home/user/app`. Found by `/replica-test` on 2026-10-15 against a local production build with Postgres 16.
Every bug below was reproduced by a test that failed before the fix and passes after it. The tests are kept.

| | open | fixed |
| --- | --- | --- |
| S1 | 0 | 0 |
| S2 | 0 | 1 |
| S3 | 0 | 2 |
| S4 | 0 | 0 |

### BUG-001: Double-clicking “Create restaurant” creates two restaurants

- Severity: S2 (data wrong: the owner ends up with two restaurants and the back office silently uses the older one; no way to fix it from the app)
- Flow / case: F01 / F01-E2
- Screen: S02
- Build: 0b340b5  Browser / device: Chromium 141 (Playwright 1.56.1), 1440px

Steps
1. Sign up, open the verification link.
2. Fill the onboarding form.
3. Double-click “Create restaurant”.

Expected: one restaurant; the second request is refused (“You already have a restaurant set up”).
Actual: two organisations, both with the user as owner (`org_members` had 2 rows for one user).
Evidence: e2e `F01-E2` (expected 1, received 2); integration test “BUG-001: two simultaneous 'create restaurant' requests make one restaurant” failed with two 201s.
Suspected cause: check-then-insert race in `createOrg`: both transactions saw no membership before either committed. The button also accepted a second click while busy.
Status: fixed in c497e86: per-user advisory transaction lock in `createOrg`; buttons in a loading state ignore clicks.

### BUG-002: Double-tapping “Send to kitchen” shows “Nothing new to send to the kitchen”

- Severity: S3 (the tickets go out once, correctly, but the till shows a red error after a successful send, so staff think it failed and may re-send or call the kitchen)
- Flow / case: F02 / F02-E1
- Screen: S19
- Build: 0b340b5  Browser / device: Chromium 141, 1440px

Steps
1. Log in with a PIN, open a table, add Masala chai.
2. Double-click “Send to kitchen”.

Expected: one set of kitchen tickets and the “Sent to …” confirmation, no error.
Actual: one set of tickets (the server handled it), plus the error alert from the second request.
Evidence: e2e `F02-E1`: alert count expected 0, received 1.
Suspected cause: the order screen had no in-flight guard, so the second click sent a second command.
Status: fixed in a57a080: order-level actions (send, bill, reprint, void, settle confirmations) run one at a time with a busy state; adding dishes stays instant so quick taps aren’t dropped. Also: if the PIN session has ended, the screen now returns to the PIN screen instead of showing an error.

### BUG-003: An abandoned empty takeaway order stays on the tables screen forever

- Severity: S3 (visibly wrong; clutters “Takeaway & delivery” with ₹0 ghost orders; workaround: open it and cancel)
- Flow / case: F03 / F03-E2
- Screen: S18
- Build: 0b340b5  Browser / device: Chromium 141, 1440px

Steps
1. Tap “New takeaway”.
2. Without adding anything, tap “Back to tables”.

Expected: no running takeaway order is shown.
Actual: “Takeaway #T1-1 ₹0.00” stays listed under Takeaway & delivery.
Evidence: e2e `F03-E2`: link count expected 0, received 1.
Suspected cause: the order is created as soon as the button is pressed, and nothing cleans up empty ones.
Status: fixed in f512f36: counter orders with no items aren’t listed; the cron closes orders left empty for 2 hours and frees their tables (integration test “BUG-003”).

## To check (seen or suspected, not reproduced as a bug)

- **Arrow keys in the Sign in / New account switch** move focus without selecting inside the Playwright device profile, though they select in a plain Chromium page. Space selects in both, so keyboard users aren’t blocked. Check with a real screen reader (NVDA/VoiceOver) before launch.
- **One-off console error** in `F02-N2` (captain test) during an early run; not reproduced in 5 repeats or 3 full suite runs. Watch for it in CI.
- **Phone-width order screen:** the order and its buttons sit below the whole menu, so a long category means scrolling to “Send to kitchen”. Phones are the captain’s screen (S27, not built); decide the till layout below 768px then.
- **Order numbers** show as `#T1-1` (series-prefixed). Correct and unique, but different from the plain numbers staff are used to.

## Not testable here (manual, needs real providers)

- Real email delivery from your domain (Resend): F01-M1
- Google sign-in with your OAuth client: F01-M2
- Razorpay test-mode checkout, cancel, and a failed payment: F20-M1, F20-M2
- Thermal printing: needs the print agent (not built)
