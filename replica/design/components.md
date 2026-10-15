# Component specs

Source: the component list in `recon.md`, specced for our tokens. **Designed, not
measured**: no reference screenshots existed (see `tokens.json` `_about`).
Layout patterns follow common restaurant-POS conventions (category rail, item
grid, cart on the right, colour-coded table floor). Every label, icon and empty
state here is written fresh. Icons are from **Lucide** (ISC licence). Fonts:
**Inter** + **Noto Sans Devanagari** (both OFL).

Global rules
- Colours only via roles (`bg-surface`, `text-text-muted`, `border-border-input`), never raw hex.
- **Density:** back office = `data-density="compact"` (controls 32/40/48 px). POS, captain, KDS and kiosk = `data-density="touch"` (44/56/72 px). Touch targets are ≥ 44 px everywhere on touch surfaces, with ≥ 8 px between targets.
- **Theme:** light by default. KDS defaults to dark (`data-theme="dark"`). Everything works in both.
- **Numbers:** all money, quantities, timers and bill/KOT numbers use `font-variant-numeric: tabular-nums`. Money is formatted with `Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'})` (₹1,23,456.00).
- **Focus:** `:focus-visible` = 2 px `focus` ring + 2 px offset, on every interactive element. Never `outline: none` without a replacement.
- **Status is never colour alone:** table states, food type, order status and timers always pair colour with a label, icon or shape.
- **Motion:** `fast` for press/hover, `base` for sheets/modals. All motion off under `prefers-reduced-motion`.
- **Language:** labels are short and plain. Indian English spellings, and menu item names may be in any script (Devanagari fallback font).

---

## Button
```
variants  primary (accent), secondary (surface + border), ghost, danger, success (for "Settle")
sizes     sm / md / lg = control-sm/md/lg (compact 32/40/48, touch 44/56/72)
states    default, hover (accent-hover), active (scale .98), focus-visible (2px ring focus),
          disabled (opacity .5, no pointer), loading (spinner replaces icon, label kept)
tokens    bg accent, text on-accent, radius md, text sm/600 (compact) | base/600 (touch)
a11y      real <button type="button">; loading sets aria-busy and stays focusable;
          icon-only buttons need aria-label; danger actions confirm in a Dialog
used on   all
```

## IconButton
```
variants  ghost, secondary
sizes     square control-sm/md
states    as Button
a11y      aria-label required; tooltip on hover/focus in back office
used on   S05, S18, S19, S23, S26
```

## Item tile (POS)
```
anatomy   [food-type mark] name (2 lines max, ellipsis) · price (tabular) · optional image (back office toggle)
          qty badge top-right when in cart
variants  text-only (default, fastest), with image
states    default, pressed, in-cart (accent-soft bg + qty badge), has-options (small "+ options" hint),
          sold out (surface-sunken, struck price, "Sold out" label, not pressable),
          focus-visible
tokens    bg bg, border border, radius md, min width item-tile-min (132), min height control-lg (touch 72)
a11y      <button>; accessible name "Paneer Tikka, ₹240, veg, 2 in cart"; sold out = aria-disabled
keyboard  grid arrow-key navigation (roving tabindex); Enter adds 1; shortcode search field focus = "/"
used on   S19, S27, S28, S45
```

## Category rail
```
variants  vertical rail (POS, width pos-category-rail 168), horizontal chips (captain, QR, kiosk)
states    default, selected (accent-soft bg, on-accent-soft text, 3px accent bar), focus-visible
a11y      role=tablist (rail) controlling the item grid (tabpanel); arrow keys move; count in name
used on   S19, S27, S28, S45
```

## Cart line
```
anatomy   qty stepper · name + variation + add-ons (muted, small) + note (italic) · line total
states    editing (unsent, stepper live), sent-to-kitchen (lock icon, stepper hidden, "Sent" label),
          void (line-through, danger "Void" chip, reason in muted text), complimentary ("NC" chip)
actions   tap → line sheet (qty, note, variation, add-ons, void with reason when sent)
a11y      list item; stepper buttons labelled "Decrease/Increase quantity of Paneer Tikka"
used on   S19, S27, S29
```

## Cart summary & action bar (POS)
```
anatomy   subtotal · discount · charges · taxes (expandable per rate) · round-off · TOTAL (xl, tabular)
          actions: [Send to kitchen] [Print bill] [Settle] — primary action changes with order state:
          unsent lines → "Send to kitchen"; all sent → "Print bill"; billed → "Settle"
states    empty cart (empty state copy + disabled actions), offline (banner above, actions still live)
used on   S19
```

## Numpad / PIN pad
```
variants  qty, amount (with ₹ quick-amount chips: exact, 100, 200, 500, 2000), PIN (masked dots)
states    default, error (shake under reduced-motion = none; danger text below), locked (countdown)
tokens    keys control-lg touch (72), radius md, text xl tabular
a11y      keys are buttons; physical keyboard digits work; PIN dots have aria-live count, never the digits
used on   S15, S17, S19, S21
```

## Table tile
```
anatomy   table name (lg) · state label + icon · seats · elapsed timer (tabular) · amount when billed
states    blank       table-blank / on-table-blank, dashed border, label "Free"
          running     table-running, icon utensils, label "Seated"
          kot         table-kot, icon chef-hat, label "In kitchen"
          billed      table-billed, icon receipt, label "Bill printed"
          paid        table-paid, icon check, label "Paid" (auto-clears to blank)
          reserved    table-reserved, icon clock, label "Reserved 8:30"
          merged      chain-link icon + "with T4"
          selected    2px focus ring
tokens    min width table-tile-min (104), radius lg, shadow card
a11y      <button> named "Table 5, in kitchen, 4 seats, 23 minutes"; long-press menu also on context-menu key
used on   S18, S27
```

## Order-type switch
```
variants  segmented control: Dine-in · Takeaway · Delivery (+ Online read-only on online orders)
states    selected, disabled (after KOT for dine-in), focus-visible
a11y      role=radiogroup
used on   S19
```

## Payment method tile
```
variants  Cash, Card, UPI, Wallet, Due (credit), Other — Lucide icons, no bank/network logos
states    default, selected (accent ring), amount-filled (shows amount), disabled (wallet with 0 balance)
a11y      role=radio within radiogroup for single mode; checkbox semantics for multi-mode
used on   S21, S22
```

## Dialog / Sheet
```
variants  dialog (centred, max 560), sheet (bottom on mobile, right on desktop), full-screen (POS settle)
states    opening/closing (base motion), busy (submit loading)
a11y      Radix Dialog: focus trap, Esc closes (except unsaved settle), returns focus, aria-labelledby title
used on   everywhere
```

## Reason picker
```
anatomy   preset reasons as chips + "Other" text field; optional manager PIN step
states    required (submit disabled until chosen), chosen, needs-approval (PIN pad shown)
a11y      radiogroup; error text tied by aria-describedby
used on   S19 (void, discount, NC), S23 (cancel)
```

## Order card (online inbox / KDS)
```
anatomy   source chip · order no. · type · age timer · items (qty × name, add-ons, notes) · actions
states    new         accent border, pulsing dot (static under reduced-motion), sound on arrival
          accepted / preparing   default
          ready       success-soft bg, check icon
          late        danger border + "Late" label when age > prep time
          void line   line-through + "Cancelled" chip (danger-soft)
          rejected    muted, collapsed
tokens    min width kds-card-min (300), radius lg, text base (KDS: lg for item names)
a11y      article with heading; new orders announced via aria-live=polite region (and audible chime)
used on   S24, S26
```

## Timer badge
```
states    normal (text-muted), warning ≥ 75% of target (warning), late ≥ target (danger + "Late")
a11y      updates visually each second; announced only on state change, not each tick
used on   S18, S24, S26
```

## Toggle (switch)
```
states    on (accent), off (border-input track), disabled, busy
a11y      role=switch, aria-checked, label always visible ("In stock")
used on   S05, S12, S24, S38
```

## Data table
```
features  sticky header, sortable columns (aria-sort), row selection, totals row (tabular), pagination
          or virtual scroll > 200 rows, column for actions (IconButton)
states    loading (skeleton rows), empty (EmptyState), error (inline alert + retry), filled
a11y      real <table>; sortable headers are buttons; selection checkboxes labelled by row name
used on   S05, S13, S14, S16, S30–S37
```

## Filters bar
```
anatomy   date range (presets: today, yesterday, this week, this month, custom; business-date aware),
          outlet multi-select, order type, staff; "Clear" ghost button; applied filters as chips
a11y      each control labelled; chips removable via button "Remove filter: Outlet A"
used on   S03, S14, S16, S36
```

## Stat tile
```
anatomy   label (sm muted) · value (xl tabular) · delta vs comparison (success/danger + arrow + text)
states    loading (skeleton), filled, no-data ("—" with explanation)
a11y      delta conveyed in text ("up 12% vs last Thursday"), not only colour/arrow
used on   S03, S46
```

## Form field
```
types     text, number, money (₹ prefix, paise stored), phone (+91 prefix, 10 digits), GSTIN (15 chars,
          uppercase, checksum validated), select, multi-select, date, time window (from–to)
states    default, focus (focus ring), error (danger border + message), disabled, read-only
tokens    border border-input, radius md, height control-md
a11y      <label for>, error via aria-describedby + aria-invalid; required marked in text, not only "*"
used on   all back office
```

## Repeater row
```
anatomy   row of fields + remove IconButton; "Add row" ghost button below
used on   S06 (variations), S07 (add-ons), S31 (recipe lines), S32–S35 (stock lines)
a11y      remove buttons labelled with row content; focus moves to new row on add
```

## Permission matrix
```
anatomy   rows = rights grouped (Orders, Bills, Discounts, Reports, Menu, Stock); columns = roles; checkboxes
a11y      table with row/column headers; group rows are headers; "select all in group" checkbox
used on   S12
```

## Stepper (onboarding)
```
states    current, done (check), upcoming, skipped
a11y      ordered list; current has aria-current="step"
used on   S02
```

## Toast & inline alert
```
variants  info, success, warning, danger
behaviour toasts auto-dismiss after 5 s (not errors); max 3 stacked; never the only place an error appears
a11y      role=status (polite) for success/info, role=alert for errors
used on   all
```

## Offline banner
```
states    offline ("Offline — orders are saved on this device and will sync"), syncing (n pending),
          synced (brief success), sync error (danger + "Retry")
tokens    warning-soft / on-warning-soft; success-soft when synced
a11y      role=status; persistent while offline
used on   POS, captain, KDS
```

## Food-type mark
```
variants  veg (square outline + filled circle, veg), non-veg (square outline + filled triangle, non-veg),
          egg (square outline + filled circle, egg)
          (shape differs, not only colour — matches the familiar Indian food-label convention)
size      12 px (lists), 16 px (tiles)
a11y      aria-label "Veg" / "Non-veg" / "Contains egg", or hidden when the text says it
used on   S05, S06, S19, S27, S28, S45
```

## Print templates
```
variants  bill (80/58 mm), KOT, void KOT ("CANCELLED" banner), reprint ("DUPLICATE"), day-end, token
rules     monospace layout in the agent; browser fallback uses @media print with width 80mm/58mm, no colour
used on   S25, S15
```

## QR code card
```
anatomy   outlet name, table name, QR, short instruction ("Scan to see the menu and order") — our copy
used on   S10 (printable PDF)
```

## Outlet switcher
```
states    single outlet (plain text), multi (combobox with search), "All outlets" for owners
a11y      combobox pattern (Radix Popover + listbox)
used on   back office header
```

## Empty state
```
anatomy   Lucide icon (48, text-muted) · one-line title · one-line help · primary action
copy      written per list, e.g. Menu: "No items yet" / "Add your first dish or import a spreadsheet."
used on   every list
```

## Skeleton
```
anatomy   surface-sunken blocks with a shimmer (static under reduced-motion)
a11y      container aria-busy=true; skeletons aria-hidden
used on   S03, S14, all tables
```
