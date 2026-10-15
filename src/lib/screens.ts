// Every screen from replica/recon.md, with its route. Stub pages and the nav read this.

export type Surface = "auth" | "bo" | "pos" | "kds" | "captain" | "guest" | "kiosk";
export type Phase = "P1" | "P2" | "P3" | "P4" | "P5";

export interface Screen {
  id: string;
  name: string;
  route: string;
  surface: Surface;
  phase: Phase;
  purpose: string;
}

export const SCREENS: Screen[] = [
  { id: "S01", name: "Sign in", route: "/login", surface: "auth", phase: "P1", purpose: "Owner and manager sign-in; new restaurants sign up." },
  { id: "S02", name: "Set up your restaurant", route: "/onboarding", surface: "auth", phase: "P1", purpose: "Outlet details, GST, order types and a first menu." },
  { id: "S03", name: "Dashboard", route: "/dashboard", surface: "bo", phase: "P1", purpose: "Today’s sales, orders, payment split and best sellers." },
  { id: "S04", name: "Outlets", route: "/outlets", surface: "bo", phase: "P5", purpose: "Add and configure outlets; pair terminals." },
  { id: "S05", name: "Menu", route: "/menu", surface: "bo", phase: "P1", purpose: "Categories and items, stock switches, bulk edit and import." },
  { id: "S06", name: "Item editor", route: "/menu/items/new", surface: "bo", phase: "P1", purpose: "Price, shortcode, food type, tax, station, variations and add-ons." },
  { id: "S07", name: "Variations & add-ons", route: "/menu/addons", surface: "bo", phase: "P1", purpose: "Add-on groups with minimum and maximum picks." },
  { id: "S08", name: "Taxes & charges", route: "/settings/taxes", surface: "bo", phase: "P1", purpose: "GST rates, packaging and delivery charges, inclusive pricing." },
  { id: "S09", name: "Discounts", route: "/discounts", surface: "bo", phase: "P1", purpose: "Percent and flat discounts, coupons and their rules." },
  { id: "S10", name: "Floor & QR codes", route: "/floor", surface: "bo", phase: "P1", purpose: "Areas, tables, seats and a QR code per table." },
  { id: "S11", name: "Stations & printers", route: "/settings/stations", surface: "bo", phase: "P1", purpose: "Kitchen stations, which items go where, and printers." },
  { id: "S12", name: "Staff & permissions", route: "/staff", surface: "bo", phase: "P1", purpose: "Staff, PINs, roles and what each role may do." },
  { id: "S13", name: "Reports", route: "/reports", surface: "bo", phase: "P1", purpose: "Every report, grouped and searchable." },
  { id: "S14", name: "Report", route: "/reports/sales", surface: "bo", phase: "P1", purpose: "Filters, table, totals and export." },
  { id: "S15", name: "Close the day", route: "/pos/day-end", surface: "pos", phase: "P1", purpose: "Cash count, biller-wise summary and day close." },
  { id: "S16", name: "Audit trail", route: "/audit", surface: "bo", phase: "P1", purpose: "Voids, reprints, bill changes and table moves, with who and when." },
  { id: "S17", name: "Staff PIN login", route: "/pos/login", surface: "pos", phase: "P1", purpose: "Pick your name, enter your PIN." },
  { id: "S18", name: "Tables", route: "/pos", surface: "pos", phase: "P1", purpose: "Floor view with live table states and timers." },
  { id: "S19", name: "Order & billing", route: "/pos/order/[id]", surface: "pos", phase: "P1", purpose: "Take the order, send to kitchen, print the bill." },
  { id: "S20", name: "Customer", route: "/pos/order/[id] (dialog)", surface: "pos", phase: "P1", purpose: "Find or add a customer by phone." },
  { id: "S21", name: "Settle", route: "/pos/order/[id] (dialog)", surface: "pos", phase: "P1", purpose: "Take payment by cash, card, UPI or more." },
  { id: "S22", name: "Split bill", route: "/pos/order/[id] (dialog)", surface: "pos", phase: "P1", purpose: "Split equally, by item or by amount." },
  { id: "S23", name: "Running orders", route: "/pos/orders", surface: "pos", phase: "P1", purpose: "All open orders; reprint or cancel." },
  { id: "S24", name: "Online orders", route: "/pos/online", surface: "pos", phase: "P4", purpose: "Website and QR orders: accept, reject, mark ready." },
  { id: "S25", name: "Print preview", route: "/pos/print/bill/[id]", surface: "pos", phase: "P1", purpose: "Bill and kitchen ticket layouts for thermal printers." },
  { id: "S26", name: "Kitchen display", route: "/kds", surface: "kds", phase: "P2", purpose: "Tickets by station; tap when ready." },
  { id: "S27", name: "Captain", route: "/captain", surface: "captain", phase: "P2", purpose: "Take orders at the table on a phone." },
  { id: "S28", name: "Guest menu", route: "/q/demo-t1", surface: "guest", phase: "P2", purpose: "Scan a table QR to browse and order." },
  { id: "S29", name: "Guest cart", route: "/q/demo-t1/cart", surface: "guest", phase: "P2", purpose: "Review and send the order; show the check code." },
  { id: "S30", name: "Raw materials", route: "/inventory", surface: "bo", phase: "P3", purpose: "Ingredients, units and minimum levels." },
  { id: "S31", name: "Recipes", route: "/inventory/recipes", surface: "bo", phase: "P3", purpose: "What each dish uses, so stock moves with sales." },
  { id: "S32", name: "Purchases", route: "/inventory/purchases", surface: "bo", phase: "P3", purpose: "Record supplier invoices into stock." },
  { id: "S33", name: "Suppliers & purchase orders", route: "/inventory/po", surface: "bo", phase: "P3", purpose: "Suppliers, raise and receive purchase orders." },
  { id: "S34", name: "Stock transfers", route: "/inventory/transfers", surface: "bo", phase: "P5", purpose: "Request and send stock between outlets." },
  { id: "S35", name: "Stock count & wastage", route: "/inventory/count", surface: "bo", phase: "P3", purpose: "Physical counts, variance and wastage." },
  { id: "S36", name: "Stock reports", route: "/inventory/reports", surface: "bo", phase: "P3", purpose: "Consumption, closing stock, low stock and food cost." },
  { id: "S37", name: "Customers", route: "/crm", surface: "bo", phase: "P4", purpose: "Customer list, segments and visit history." },
  { id: "S38", name: "Loyalty & wallet", route: "/crm/loyalty", surface: "bo", phase: "P4", purpose: "Points, cashback, expiry and wallet top-ups." },
  { id: "S39", name: "Campaigns", route: "/crm/campaigns", surface: "bo", phase: "P4", purpose: "SMS and WhatsApp messages to a segment." },
  { id: "S40", name: "Feedback", route: "/crm/feedback", surface: "bo", phase: "P4", purpose: "Ratings and comments after the bill." },
  { id: "S41", name: "Integrations", route: "/integrations", surface: "bo", phase: "P4", purpose: "Online channels, payments, accounting export, SMS." },
  { id: "S42", name: "Plan & billing", route: "/billing", surface: "bo", phase: "P1", purpose: "Your plan, outlets, add-ons and invoices." },
  { id: "S43", name: "Outlet settings", route: "/settings", surface: "bo", phase: "P1", purpose: "Profile, GSTIN, FSSAI, bill format and numbering." },
  { id: "S44", name: "Reservations", route: "/pos/reservations", surface: "pos", phase: "P2", purpose: "Bookings and the waitlist." },
  { id: "S45", name: "Self-order kiosk", route: "/kiosk", surface: "kiosk", phase: "P5", purpose: "Guests order and pay at a screen." },
  { id: "S46", name: "Owner on the go", route: "/m", surface: "bo", phase: "P5", purpose: "Sales at a glance on a phone." },
];

export function screen(id: string): Screen {
  const s = SCREENS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown screen ${id}`);
  return s;
}
