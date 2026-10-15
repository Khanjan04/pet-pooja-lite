import { beforeEach, describe, expect, it } from "vitest";
import * as api from "./api";
import { __setDb, getDb, seedDb } from "./store";

beforeEach(() => __setDb(seedDb()));

async function loggedIn(staffId = "staff-1", pin = "1111") {
  await api.loginWithPin(staffId, pin);
}

describe("core loop: table -> order -> KOT -> bill -> settle", () => {
  it("runs end to end with exact GST maths and frees the table", async () => {
    await loggedIn("staff-2", "2222");
    const id = await api.openOrder({ type: "dine_in", tableId: "tbl-m1", pax: 2 });
    // reopening the same table returns the same order
    expect(await api.openOrder({ type: "dine_in", tableId: "tbl-m1" })).toBe(id);

    await api.addItem(id, { itemId: "item-pt", addonIds: ["ad-hot"], qty: 2 }); // 2 x 240
    await api.addItem(id, { itemId: "item-bn", qty: 3 }); // 3 x 60
    await api.addItem(id, { itemId: "item-bn" }); // merges -> 4 x 60
    await api.addItem(id, { itemId: "item-fls", variationId: "v-fls-n" }); // drink -> bar station
    expect(getDb().orderItems.find((l) => l.itemId === "item-bn")?.qty).toBe(4);

    const kots = await api.sendKot(id);
    expect(kots.map((k) => k.stationId).sort()).toEqual(["st-bar", "st-kitchen", "st-tandoor"]);
    await expect(api.sendKot(id)).rejects.toThrow(/Nothing new/);

    const billId = await api.printBill(id);
    const bill = getDb().bills.find((b) => b.id === billId)!;
    // 480 + 240 + 90 = 810.00; 5% = 40.50; 850.50 -> 851.00
    expect(bill.subtotalPaise).toBe(81000);
    expect(bill.taxPaise).toBe(4050);
    expect(bill.roundOffPaise).toBe(50);
    expect(bill.totalPaise).toBe(85100);
    expect(bill.billNo).toBe(1);
    expect(bill.seriesCode).toBe("T1");

    await expect(api.addItem(id, { itemId: "item-ch" })).rejects.toThrow(/already billed/);

    // split tender: UPI then cash
    expect(await api.addPayment(billId, { method: "upi", amountPaise: 50000 })).toBe("open");
    await expect(api.addPayment(billId, { method: "cash", amountPaise: 99999 })).rejects.toThrow(/more than/);
    expect(await api.addPayment(billId, { method: "cash", amountPaise: 35100, tenderedPaise: 40000 })).toBe("settled");

    const d = getDb();
    expect(d.orders.find((o) => o.id === id)?.status).toBe("settled");
    // table is free again: a new order on it is a different order
    expect(await api.openOrder({ type: "dine_in", tableId: "tbl-m1" })).not.toBe(id);
  });

  it("numbers bills per series without gaps", async () => {
    await loggedIn();
    const nums: number[] = [];
    for (const t of ["tbl-m2", "tbl-m3", "tbl-m4"]) {
      const id = await api.openOrder({ type: "dine_in", tableId: t });
      await api.addItem(id, { itemId: "item-ch" });
      await api.sendKot(id);
      const b = await api.printBill(id);
      nums.push(getDb().bills.find((x) => x.id === b)!.billNo);
    }
    expect(nums).toEqual([1, 2, 3]);
  });
});

describe("rules", () => {
  it("needs a PIN session", async () => {
    await expect(api.openOrder({ type: "takeaway" })).rejects.toThrow(/session/);
    await expect(api.loginWithPin("staff-1", "0000")).rejects.toThrow(/Wrong PIN/);
  });

  it("validates options: size required, spice level required, sold out blocked", async () => {
    await loggedIn();
    const id = await api.openOrder({ type: "takeaway" });
    await expect(api.addItem(id, { itemId: "item-tc" })).rejects.toThrow(/size/);
    await expect(api.addItem(id, { itemId: "item-pt" })).rejects.toThrow(/spice level/);
    await expect(api.addItem(id, { itemId: "item-ft" })).rejects.toThrow(/sold out/);
    await expect(api.addItem(id, { itemId: "item-pt", addonIds: ["ad-hot", "ad-mild"] })).rejects.toThrow(/at most 1/);
  });

  it("blocks billing until everything is in the kitchen", async () => {
    await loggedIn();
    const id = await api.openOrder({ type: "takeaway" });
    await api.addItem(id, { itemId: "item-ch" });
    await expect(api.printBill(id)).rejects.toThrow(/Send everything/);
  });

  it("voids after KOT with a reason, prints a void ticket and drops it from the bill", async () => {
    await loggedIn();
    const id = await api.openOrder({ type: "dine_in", tableId: "tbl-a1" });
    const line = await api.addItem(id, { itemId: "item-dm", qty: 2 });
    await api.sendKot(id);
    await expect(api.setQty(line, 1)).rejects.toThrow(/Void it instead/);
    await expect(api.voidItem(line, 1, " ")).rejects.toThrow(/reason/);
    await api.voidItem(line, 1, "Guest changed mind");
    const d = getDb();
    const voidKot = d.kots.find((k) => k.kind === "void")!;
    expect(voidKot.lines[0].qty).toBe(-1);
    expect(d.audit.some((a) => a.action === "kot.void" && a.flagged)).toBe(true);
    const billId = await api.printBill(id);
    expect(getDb().bills.find((b) => b.id === billId)!.subtotalPaise).toBe(25000);
  });

  it("captains can’t void or reprint; reprints are audited", async () => {
    await loggedIn("staff-3", "3333");
    const id = await api.openOrder({ type: "dine_in", tableId: "tbl-a2" });
    const line = await api.addItem(id, { itemId: "item-ch" });
    await api.sendKot(id);
    await expect(api.voidItem(line, 1, "x")).rejects.toThrow(/permission/);
    await api.printBill(id);
    await expect(api.printBill(id)).rejects.toThrow(/permission/);
    await loggedIn("staff-1", "1111");
    await api.printBill(id);
    expect(getDb().audit.filter((a) => a.action === "bill.reprint")).toHaveLength(1);
  });

  it("cancels only unsent orders, with a reason", async () => {
    await loggedIn();
    const a = await api.openOrder({ type: "takeaway" });
    await api.addItem(a, { itemId: "item-ch" });
    await expect(api.cancelOrder(a, "")).rejects.toThrow(/reason/);
    await api.cancelOrder(a, "Customer left");
    const b = await api.openOrder({ type: "takeaway" });
    await api.addItem(b, { itemId: "item-ch" });
    await api.sendKot(b);
    await expect(api.cancelOrder(b, "x")).rejects.toThrow(/Void the items/);
  });

  it("reopens an unpaid bill and takes the next number on reprint", async () => {
    await loggedIn();
    const id = await api.openOrder({ type: "takeaway" });
    await api.addItem(id, { itemId: "item-ch" });
    await api.sendKot(id);
    const b1 = await api.printBill(id);
    await api.reopenOrder(id, "Guest added dessert");
    await api.addItem(id, { itemId: "item-gj" });
    await api.sendKot(id);
    const b2 = await api.printBill(id);
    const d = getDb();
    expect(d.bills.find((b) => b.id === b1)!.status).toBe("cancelled");
    expect(d.bills.find((b) => b.id === b2)!.billNo).toBe(2);
    expect(d.bills.find((b) => b.id === b2)!.subtotalPaise).toBe(14000);
  });
});
