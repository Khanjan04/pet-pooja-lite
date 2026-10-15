import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import type { Member } from "./actors";
import { many, one, pool, tx, type Db } from "./db";
import { paymentFailedMessage, sendEmail } from "./email";
import { env } from "./env";
import { conflict, HttpError } from "./errors";
import { registerJob } from "./jobs";

// Subscriptions through Razorpay (India: INR, UPI Autopay, cards). Razorpay hosts the payment
// page, so we never touch card details. Our database is the source of truth for status,
// updated only by verified webhooks.

export type Plan = "core" | "growth" | "scale";

function planId(plan: Plan) {
  const e = env();
  return { core: e.RAZORPAY_PLAN_CORE, growth: e.RAZORPAY_PLAN_GROWTH, scale: e.RAZORPAY_PLAN_SCALE }[plan];
}

function client() {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = env();
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) throw new HttpError(503, "Payments aren’t set up yet. Add the RAZORPAY_* keys (test mode) to the server environment.", "payments_off");
  return new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
}

export async function billingStatus(m: Member) {
  const org = await one<{ status: string; trial_ends_at: Date }>(pool(), "select status, trial_ends_at from organizations where id = $1", [m.orgId]);
  const sub = await one<Record<string, unknown>>(
    pool(),
    `select plan, status, provider_status, outlet_quantity, current_period_end, cancel_at_period_end, checkout_url
     from subscriptions where org_id = $1 order by created_at desc limit 1`,
    [m.orgId],
  );
  return { orgStatus: org!.status, trialEndsAt: org!.trial_ends_at, subscription: sub, paymentsConfigured: !!(env().RAZORPAY_KEY_ID && env().RAZORPAY_KEY_SECRET) };
}

/** Start a subscription: returns Razorpay's hosted page to authorise the mandate. */
export async function startCheckout(m: Member, plan: Plan): Promise<string> {
  const pid = planId(plan);
  const rzp = client();
  if (!pid) throw new HttpError(503, `No Razorpay plan id set for “${plan}”. Create the plan in Razorpay and set RAZORPAY_PLAN_${plan.toUpperCase()}.`, "plan_missing");
  const live = await one<{ checkout_url: string | null; status: string }>(pool(), "select checkout_url, status from subscriptions where org_id = $1 and status in ('incomplete','active','past_due','paused')", [m.orgId]);
  if (live?.status === "incomplete" && live.checkout_url) return live.checkout_url;
  if (live) throw conflict("You already have a subscription. Cancel it first to change plans.");
  const outlets = Math.max(1, m.outletIds.length);
  const sub = await rzp.subscriptions.create({
    plan_id: pid,
    total_count: 120, // monthly for up to 10 years; cancel any time
    quantity: outlets,
    customer_notify: 1,
    notes: { org_id: m.orgId },
  });
  await pool().query(
    `insert into subscriptions (org_id, provider, provider_subscription_id, plan, outlet_quantity, status, provider_status, checkout_url)
     values ($1, 'razorpay', $2, $3, $4, 'incomplete', $5, $6)`,
    [m.orgId, sub.id, plan, outlets, sub.status, sub.short_url],
  );
  return sub.short_url;
}

/** One click: stops renewal at the end of the paid period. No retention maze. */
export async function cancelSubscription(m: Member) {
  const sub = await one<{ provider_subscription_id: string; status: string }>(pool(), "select provider_subscription_id, status from subscriptions where org_id = $1 and status in ('incomplete','active','past_due','paused')", [m.orgId]);
  if (!sub) throw conflict("There’s no active subscription to cancel.");
  const immediately = sub.status === "incomplete";
  await client().subscriptions.cancel(sub.provider_subscription_id, !immediately);
  await pool().query(
    `update subscriptions set cancel_at_period_end = $2, status = case when $2 then status else 'cancelled' end where provider_subscription_id = $1`,
    [sub.provider_subscription_id, !immediately],
  );
}

/* ---------------- webhooks ---------------- */

export function verifyWebhookSignature(raw: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got);
}

const STATUS: Record<string, { sub: string; org: string | null }> = {
  created: { sub: "incomplete", org: null },
  authenticated: { sub: "incomplete", org: null },
  active: { sub: "active", org: "active" },
  resumed: { sub: "active", org: "active" },
  pending: { sub: "past_due", org: "past_due" },
  halted: { sub: "past_due", org: "past_due" },
  paused: { sub: "paused", org: "past_due" },
  cancelled: { sub: "cancelled", org: "read_only" },
  completed: { sub: "cancelled", org: "read_only" },
  expired: { sub: "cancelled", org: "read_only" },
};

interface RzpEvent {
  event: string;
  created_at: number;
  payload: { subscription?: { entity: { id: string; status: string; current_end?: number | null; quantity?: number; notes?: { org_id?: string } } } };
}

/**
 * Store the event once (Razorpay retries), then apply it if it's newer than what we have.
 * Returns what happened, for logs and tests.
 */
export async function handleRazorpayEvent(eventId: string, raw: string): Promise<"duplicate" | "ignored" | "stale" | "applied"> {
  const evt = JSON.parse(raw) as RzpEvent;
  return tx(async (c) => {
    const fresh = await one(c, "insert into inbound_events (source, external_id, payload) values ('razorpay', $1, $2) on conflict (source, external_id) do nothing returning id", [eventId, raw]);
    if (!fresh) return "duplicate";
    const s = evt.payload.subscription?.entity;
    if (!evt.event.startsWith("subscription.") || !s) {
      await c.query("update inbound_events set processed_at = now() where source = 'razorpay' and external_id = $1", [eventId]);
      return "ignored";
    }
    const map = STATUS[s.status] ?? null;
    const at = new Date(evt.created_at * 1000);
    const sub = await one<{ id: string; org_id: string; provider_event_at: Date | null }>(c, "select id, org_id, provider_event_at from subscriptions where provider_subscription_id = $1 for update", [s.id]);
    let result: "stale" | "applied" | "ignored" = "ignored";
    if (sub && map) {
      if (sub.provider_event_at && sub.provider_event_at >= at) result = "stale";
      else {
        await c.query(
          `update subscriptions set status = $2, provider_status = $3, provider_event_at = $4,
             current_period_end = coalesce(to_timestamp($5), current_period_end), outlet_quantity = coalesce($6, outlet_quantity)
           where id = $1`,
          [sub.id, map.sub, s.status, at, s.current_end ?? null, s.quantity ?? null],
        );
        if (map.org) await c.query("update organizations set status = $2 where id = $1 and status <> 'cancelled'", [sub.org_id, map.org]);
        if (s.status === "pending" || s.status === "halted") await queueFailedPaymentEmail(c, sub.org_id);
        result = "applied";
      }
    }
    await c.query("update inbound_events set processed_at = now(), org_id = $2 where source = 'razorpay' and external_id = $1", [eventId, sub?.org_id ?? null]);
    return result;
  });
}

async function queueFailedPaymentEmail(c: Db, orgId: string) {
  await c.query("insert into jobs (kind, payload) values ('billing.payment_failed', $1)", [JSON.stringify({ orgId })]);
}

registerJob<{ orgId: string }>("billing.payment_failed", async ({ orgId }) => {
  const owners = await many<{ email: string; name: string }>(
    pool(),
    `select u.email, o.name from org_members m join "user" u on u.id = m.user_id join organizations o on o.id = m.org_id where m.org_id = $1 and m.role in ('owner','admin')`,
    [orgId],
  );
  for (const o of owners) await sendEmail(paymentFailedMessage(o.email, o.name, `${env().APP_URL}/billing`));
});

/** From account deletion: stop charging right away. */
registerJob<{ orgId: string }>("subscription.cancel", async ({ orgId }) => {
  const sub = await one<{ provider_subscription_id: string }>(pool(), "select provider_subscription_id from subscriptions where org_id = $1 and status in ('incomplete','active','past_due','paused')", [orgId]);
  if (!sub) return;
  await client().subscriptions.cancel(sub.provider_subscription_id, false);
  await pool().query("update subscriptions set status = 'cancelled' where provider_subscription_id = $1", [sub.provider_subscription_id]);
});
