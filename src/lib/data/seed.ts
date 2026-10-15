// The sample menu, floor and roles a new restaurant can start with (server/orgs.ts).
// Names and dishes are generic.

import type { AddonGroup, Area, Category, Item, Outlet, Role, Staff, Station, Table, Tax } from "@/lib/domain/types";

export const SEED_VERSION = 1;

export const outlet: Outlet = {
  id: "outlet-1",
  name: "Demo Kitchen, Ahmedabad",
  address: "12 Example Road, Navrangpura, Ahmedabad 380009",
  gstin: "24ABCDE1234F1Z5",
  fssaiNo: "10019999000000",
  stateCode: "24",
  timezone: "Asia/Kolkata",
  dayStartsAt: "05:00",
  priceIncludesTax: false,
  roundOff: true,
  billHeader: "Demo Kitchen",
  billFooter: "Thank you. Visit again!",
};

export const taxes: Tax[] = [
  { id: "tax-cgst", name: "CGST 2.5%", kind: "cgst", rateBp: 250 },
  { id: "tax-sgst", name: "SGST 2.5%", kind: "sgst", rateBp: 250 },
];
const GST = taxes.map((t) => t.id);

export const stations: Station[] = [
  { id: "st-kitchen", name: "Kitchen" },
  { id: "st-tandoor", name: "Tandoor" },
  { id: "st-bar", name: "Beverages" },
];

export const categories: Category[] = [
  { id: "cat-starters", name: "Starters", stationId: "st-kitchen", sort: 1 },
  { id: "cat-tandoor", name: "Tandoor", stationId: "st-tandoor", sort: 2 },
  { id: "cat-mains", name: "Main course", stationId: "st-kitchen", sort: 3 },
  { id: "cat-breads", name: "Breads", stationId: "st-tandoor", sort: 4 },
  { id: "cat-rice", name: "Rice & biryani", stationId: "st-kitchen", sort: 5 },
  { id: "cat-desserts", name: "Desserts", stationId: "st-kitchen", sort: 6 },
  { id: "cat-drinks", name: "Drinks", stationId: "st-bar", sort: 7 },
];

export const addonGroups: AddonGroup[] = [
  {
    id: "ag-extras",
    name: "Extras",
    minSelect: 0,
    maxSelect: 3,
    addons: [
      { id: "ad-cheese", name: "Extra cheese", pricePaise: 3000 },
      { id: "ad-butter", name: "Extra butter", pricePaise: 2000 },
      { id: "ad-dip", name: "Mint dip", pricePaise: 1500 },
    ],
  },
  {
    id: "ag-spice",
    name: "Spice level",
    minSelect: 1,
    maxSelect: 1,
    addons: [
      { id: "ad-mild", name: "Mild", pricePaise: 0 },
      { id: "ad-medium", name: "Medium", pricePaise: 0 },
      { id: "ad-hot", name: "Hot", pricePaise: 0 },
    ],
  },
];

type Row = [string, string, number, Item["foodType"], string | null, Partial<Item>?];
const rows: Record<string, Row[]> = {
  "cat-starters": [
    ["Paneer tikka", "PT", 24000, "veg", null, { addonGroupIds: ["ag-spice", "ag-extras"] }],
    ["Hara bhara kebab", "HBK", 22000, "veg", null],
    ["Veg spring roll", "VSR", 19000, "veg", null],
    ["Chilli paneer", "CP", 23000, "veg", null, { addonGroupIds: ["ag-spice"] }],
    ["Chicken 65", "C65", 28000, "non_veg", null, { addonGroupIds: ["ag-spice"] }],
    ["Egg bhurji", "EB", 16000, "egg", null],
    ["Masala papad", "MP", 6000, "veg", null],
  ],
  "cat-tandoor": [
    ["Tandoori chicken", "TC", 34000, "non_veg", null, { variations: [{ id: "v-tc-h", name: "Half", pricePaise: 34000 }, { id: "v-tc-f", name: "Full", pricePaise: 56000 }] }],
    ["Malai soya chaap", "MSC", 26000, "veg", null],
    ["Fish tikka", "FT", 38000, "non_veg", null, { inStock: false }],
  ],
  "cat-mains": [
    ["Paneer butter masala", "PBM", 29000, "veg", null, { variations: [{ id: "v-pbm-h", name: "Half", pricePaise: 18000 }, { id: "v-pbm-f", name: "Full", pricePaise: 29000 }] }],
    ["Dal makhani", "DM", 25000, "veg", null],
    ["Kadai vegetable", "KV", 24000, "veg", null],
    ["Butter chicken", "BC", 36000, "non_veg", null],
    ["Mutton rogan josh", "MRJ", 42000, "non_veg", null],
    ["Egg curry", "EC", 21000, "egg", null],
  ],
  "cat-breads": [
    ["Tandoori roti", "TR", 3000, "veg", null],
    ["Butter naan", "BN", 6000, "veg", null],
    ["Garlic naan", "GN", 7000, "veg", null],
    ["Laccha paratha", "LP", 6500, "veg", null],
  ],
  "cat-rice": [
    ["Jeera rice", "JR", 16000, "veg", null],
    ["Veg biryani", "VB", 26000, "veg", null],
    ["Chicken dum biryani", "CDB", 32000, "non_veg", null],
  ],
  "cat-desserts": [
    ["Gulab jamun (2 pcs)", "GJ", 9000, "veg", null],
    ["Rasmalai", "RM", 11000, "veg", null],
  ],
  "cat-drinks": [
    ["Masala chai", "CH", 5000, "veg", null],
    ["Fresh lime soda", "FLS", 9000, "veg", null, { variations: [{ id: "v-fls-s", name: "Sweet", pricePaise: 9000 }, { id: "v-fls-n", name: "Salted", pricePaise: 9000 }] }],
    ["Sweet lassi", "SL", 11000, "veg", null],
    ["Mineral water", "MW", 2000, "veg", null, { taxIds: [] }],
  ],
};

export const items: Item[] = Object.entries(rows).flatMap(([categoryId, list]) =>
  list.map(([name, shortcode, pricePaise, foodType, stationId, extra], i) => ({
    id: `item-${shortcode.toLowerCase()}`,
    categoryId,
    stationId,
    name,
    shortcode,
    foodType,
    pricePaise,
    inStock: true,
    taxIds: GST,
    variations: [],
    addonGroupIds: [],
    sort: i,
    ...extra,
  })),
);

export const areas: Area[] = [
  { id: "area-main", name: "Main hall", sort: 1 },
  { id: "area-ac", name: "AC section", sort: 2 },
  { id: "area-terrace", name: "Terrace", sort: 3 },
];

export const tables: Table[] = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `tbl-m${i + 1}`, areaId: "area-main", name: `M${i + 1}`, seats: i % 3 === 0 ? 2 : 4 })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: `tbl-a${i + 1}`, areaId: "area-ac", name: `A${i + 1}`, seats: i < 2 ? 6 : 4 })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `tbl-t${i + 1}`, areaId: "area-terrace", name: `T${i + 1}`, seats: 4 })),
];

const ALL_RIGHTS: Role["rights"] = [
  "order.create", "kot.cancel", "bill.print", "bill.reprint", "bill.settle", "bill.cancel",
  "discount.give", "order.cancel", "table.shift", "day_end", "reports.view",
];

export const roles: Role[] = [
  { id: "role-manager", name: "Manager", rights: ALL_RIGHTS },
  { id: "role-cashier", name: "Cashier", rights: ["order.create", "bill.print", "bill.settle", "table.shift", "day_end"] },
  { id: "role-captain", name: "Captain", rights: ["order.create", "bill.print"] },
];

export const staff: Staff[] = [
  { id: "staff-1", name: "Asha (Manager)", roleId: "role-manager" },
  { id: "staff-2", name: "Ravi (Cashier)", roleId: "role-cashier" },
  { id: "staff-3", name: "Imran (Captain)", roleId: "role-captain" },
];

