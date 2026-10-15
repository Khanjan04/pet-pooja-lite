// Domain types. They mirror replica/schema.sql (camelCase). Money is integer paise,
// rates are basis points (250 = 2.5%), times are ISO strings in UTC.

export type Id = string;
export type FoodType = "veg" | "non_veg" | "egg";
export type OrderType = "dine_in" | "takeaway" | "delivery";
export type PayMethod = "cash" | "card" | "upi" | "wallet" | "due";

export type Right =
  | "order.create"
  | "kot.cancel"
  | "bill.print"
  | "bill.reprint"
  | "bill.settle"
  | "bill.cancel"
  | "discount.give"
  | "order.cancel"
  | "table.shift"
  | "day_end"
  | "reports.view";

export interface Outlet {
  id: Id;
  name: string;
  address: string;
  gstin: string | null;
  fssaiNo: string | null;
  stateCode: string;
  timezone: string;
  dayStartsAt: string; // "05:00"
  priceIncludesTax: boolean;
  roundOff: boolean;
  billHeader: string;
  billFooter: string;
}

export interface Tax {
  id: Id;
  name: string;
  kind: "cgst" | "sgst" | "igst" | "vat" | "cess" | "other";
  rateBp: number;
}

export interface Station {
  id: Id;
  name: string;
}

export interface Category {
  id: Id;
  name: string;
  stationId: Id | null;
  sort: number;
}

export interface Variation {
  id: Id;
  name: string;
  pricePaise: number;
}

export interface Addon {
  id: Id;
  name: string;
  pricePaise: number;
}

export interface AddonGroup {
  id: Id;
  name: string;
  minSelect: number;
  maxSelect: number | null;
  addons: Addon[];
}

export interface Item {
  id: Id;
  categoryId: Id;
  stationId: Id | null;
  name: string;
  shortcode: string | null;
  foodType: FoodType;
  pricePaise: number;
  inStock: boolean;
  taxIds: Id[];
  variations: Variation[];
  addonGroupIds: Id[];
  sort: number;
}

export interface Area {
  id: Id;
  name: string;
  sort: number;
}

export interface Table {
  id: Id;
  areaId: Id;
  name: string;
  seats: number;
}

export interface Role {
  id: Id;
  name: string;
  rights: Right[];
}

export interface Staff {
  id: Id;
  name: string;
  roleId: Id;
}

export interface OrderAddon {
  addonId: Id;
  name: string;
  pricePaise: number;
}

export interface Order {
  id: Id;
  orderNo: string;
  businessDate: string;
  type: OrderType;
  tableIds: Id[];
  pax: number | null;
  status: "open" | "billed" | "settled" | "cancelled";
  createdByStaffId: Id;
  createdAt: string;
  cancelReason: string | null;
}

export interface OrderItem {
  id: Id;
  orderId: Id;
  itemId: Id;
  variationId: Id | null;
  stationId: Id | null;
  name: string;
  variationName: string | null;
  addons: OrderAddon[];
  qty: number;
  unitPricePaise: number; // includes variation + add-ons
  taxIds: Id[];
  note: string | null;
  sentQty: number; // quantity already on a KOT
  status: "active" | "void";
  voidReason: string | null;
  createdAt: string;
}

export interface KotLine {
  orderItemId: Id;
  name: string;
  detail: string | null;
  note: string | null;
  qty: number; // negative on a void KOT
}

export interface Kot {
  id: Id;
  orderId: Id;
  stationId: Id | null;
  kotNo: string;
  businessDate: string;
  kind: "new" | "void";
  lines: KotLine[];
  status: "new" | "preparing" | "ready";
  createdByStaffId: Id;
  createdAt: string;
}

export interface BillTaxLine {
  taxId: Id;
  name: string;
  rateBp: number;
  taxablePaise: number;
  amountPaise: number;
}

export interface BillTotals {
  subtotalPaise: number;
  discountPaise: number;
  chargesPaise: number;
  taxLines: BillTaxLine[];
  taxPaise: number;
  roundOffPaise: number;
  totalPaise: number;
}

export interface Bill extends BillTotals {
  id: Id;
  orderId: Id;
  seriesCode: string;
  fiscalYear: string;
  billNo: number;
  businessDate: string;
  status: "open" | "settled" | "cancelled";
  printCount: number;
  createdByStaffId: Id;
  createdAt: string;
  settledAt: string | null;
}

export interface Payment {
  id: Id;
  billId: Id;
  businessDate: string;
  method: PayMethod;
  amountPaise: number;
  tenderedPaise: number | null;
  reference: string | null;
  receivedByStaffId: Id;
  createdAt: string;
}

export interface AuditEntry {
  id: Id;
  at: string;
  staffId: Id | null;
  action: string;
  entity: string;
  entityId: Id;
  reason: string | null;
  flagged: boolean;
  detail: string | null;
}
