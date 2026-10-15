import { describe, expect, it } from "vitest";
import { allocate, changeDue, computeBill, roundHalfUp } from "./billing";
import { businessDate, fiscalYear } from "./dates";
import { pendingKotLines } from "./kot";
import type { OrderItem, Tax } from "./types";

const GST5: Tax[] = [
  { id: "cgst", name: "CGST 2.5%", kind: "cgst", rateBp: 250 },
  { id: "sgst", name: "SGST 2.5%", kind: "sgst", rateBp: 250 },
];
const both = ["cgst", "sgst"];
const exclusive = { taxes: GST5, priceIncludesTax: false, roundOff: true };

function checkInvariant(b: ReturnType<typeof computeBill>) {
  expect(b.totalPaise).toBe(b.subtotalPaise - b.discountPaise + b.chargesPaise + b.taxPaise + b.roundOffPaise);
  expect(Math.abs(b.roundOffPaise)).toBeLessThanOrEqual(50);
}

describe("roundHalfUp / allocate", () => {
  it("rounds half up", () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(2.49)).toBe(2);
    expect(roundHalfUp(-2.5)).toBe(-3);
  });
  it("allocates exactly", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(7, [0, 0])).toEqual([0, 0]);
    const parts = allocate(1001, [333, 333, 334]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1001);
  });
});

describe("computeBill, tax-exclusive", () => {
  it("adds CGST + SGST and rounds off to the rupee", () => {
    // 2 x 240 + 4 x 60 = 720.00; 5% GST = 36.00; total 756.00
    const b = computeBill(
      [
        { grossPaise: 48000, taxIds: both },
        { grossPaise: 24000, taxIds: both },
      ],
      exclusive,
    );
    expect(b.subtotalPaise).toBe(72000);
    expect(b.taxLines.map((t) => t.amountPaise)).toEqual([1800, 1800]);
    expect(b.totalPaise).toBe(75600);
    expect(b.roundOffPaise).toBe(0);
    checkInvariant(b);
  });

  it("rounds off fractions of a rupee", () => {
    // 199.00 + 5% = 208.95 -> 209.00 (+0.05)
    const b = computeBill([{ grossPaise: 19900, taxIds: both }], exclusive);
    expect(b.taxPaise).toBe(996); // per tax: 19900 x 2.5% = 497.5 -> 498
    expect(b.totalPaise).toBe(20900);
    expect(b.roundOffPaise).toBe(4);
    checkInvariant(b);
  });

  it("applies discounts before tax", () => {
    const b = computeBill([{ grossPaise: 100000, taxIds: both }], { ...exclusive, billDiscountPaise: 10000 });
    expect(b.discountPaise).toBe(10000);
    expect(b.taxLines[0].taxablePaise).toBe(90000);
    expect(b.taxPaise).toBe(4500);
    expect(b.totalPaise).toBe(94500);
    checkInvariant(b);
  });

  it("spreads a bill discount over lines and only taxes taxed lines", () => {
    const b = computeBill(
      [
        { grossPaise: 30000, taxIds: both },
        { grossPaise: 10000, taxIds: [] }, // e.g. packaged water, no GST
      ],
      { ...exclusive, billDiscountPaise: 4000 },
    );
    expect(b.taxLines[0].taxablePaise).toBe(27000);
    checkInvariant(b);
  });

  it("never discounts below zero", () => {
    const b = computeBill([{ grossPaise: 5000, discountPaise: 9000, taxIds: both }], exclusive);
    expect(b.discountPaise).toBe(5000);
    expect(b.totalPaise).toBe(0);
    checkInvariant(b);
  });

  it("handles an empty bill", () => {
    const b = computeBill([], exclusive);
    expect(b.totalPaise).toBe(0);
    expect(b.taxLines).toEqual([]);
  });

  it("can skip round-off", () => {
    const b = computeBill([{ grossPaise: 19900, taxIds: both }], { ...exclusive, roundOff: false });
    expect(b.roundOffPaise).toBe(0);
    expect(b.totalPaise).toBe(20896);
  });
});

describe("computeBill, tax-inclusive", () => {
  it("backs tax out so the guest pays the menu price", () => {
    const b = computeBill([{ grossPaise: 21000, taxIds: both }], { ...exclusive, priceIncludesTax: true, roundOff: false });
    expect(b.totalPaise).toBe(21000);
    expect(b.taxLines[0].taxablePaise).toBe(20000);
    expect(b.taxPaise).toBe(1000);
    checkInvariant(b);
  });

  it("keeps taxable + tax equal to price on awkward amounts", () => {
    for (const p of [9900, 12345, 99999, 1, 333]) {
      const b = computeBill([{ grossPaise: p, taxIds: both }], { ...exclusive, priceIncludesTax: true, roundOff: false });
      expect(b.totalPaise).toBe(p);
      checkInvariant(b);
    }
  });
});

describe("changeDue", () => {
  it("never goes negative", () => {
    expect(changeDue(50000, 41900)).toBe(8100);
    expect(changeDue(100, 500)).toBe(0);
  });
});

describe("dates", () => {
  it("puts after-midnight sales on the previous business date", () => {
    // 2026-10-14 22:00 UTC = 03:30 IST on the 15th -> business date 14th
    expect(businessDate(new Date("2026-10-14T22:00:00Z"), "Asia/Kolkata")).toBe("2026-10-14");
    // 05:30 IST on the 15th -> 15th
    expect(businessDate(new Date("2026-10-15T00:00:00Z"), "Asia/Kolkata")).toBe("2026-10-15");
    // crossing a month boundary: 01:30 IST on 1 Nov still belongs to 31 Oct
    expect(businessDate(new Date("2026-10-31T20:00:00Z"), "Asia/Kolkata")).toBe("2026-10-31");
    // 07:00 IST on 2 Nov is past the 05:00 cut-off
    expect(businessDate(new Date("2026-11-02T01:30:00Z"), "Asia/Kolkata", "05:00")).toBe("2026-11-02");
  });
  it("labels Indian fiscal years", () => {
    expect(fiscalYear("2026-04-01")).toBe("2026-27");
    expect(fiscalYear("2026-03-31")).toBe("2025-26");
    expect(fiscalYear("2099-12-31")).toBe("2099-00");
  });
});

describe("pendingKotLines", () => {
  const base: OrderItem = {
    id: "a", orderId: "o", itemId: "i", variationId: null, stationId: "kitchen", name: "Paneer tikka",
    variationName: "Full", addons: [{ addonId: "x", name: "Extra cheese", pricePaise: 3000 }], qty: 3,
    unitPricePaise: 27000, taxIds: both, note: "spicy", sentQty: 1, status: "active", voidReason: null, createdAt: "",
  };
  it("sends only unsent quantity, grouped by station", () => {
    const m = pendingKotLines([
      base,
      { ...base, id: "b", stationId: "bar", name: "Lime soda", variationName: null, addons: [], sentQty: 0, qty: 2 },
      { ...base, id: "c", sentQty: 3 },
      { ...base, id: "d", status: "void", sentQty: 0 },
    ]);
    expect(m.get("kitchen")).toEqual([{ orderItemId: "a", name: "Paneer tikka", detail: "Full, Extra cheese", note: "spicy", qty: 2 }]);
    expect(m.get("bar")?.[0].qty).toBe(2);
    expect(m.size).toBe(2);
  });
});
