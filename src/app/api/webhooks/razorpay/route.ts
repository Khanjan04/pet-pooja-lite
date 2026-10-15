import { handleRazorpayEvent, verifyWebhookSignature } from "@/server/billing";
import { env } from "@/server/env";
import { HttpError, json, route } from "@/server/http";

// Razorpay → us. Signature checked on the raw body; each event id is processed once.
export const POST = route(async (req: Request) => {
  const secret = env().RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, "Webhooks not configured.");
  const raw = await req.text();
  if (raw.length > 256_000) throw new HttpError(413, "Too large.");
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"), secret)) throw new HttpError(401, "Bad signature.");
  const eventId = req.headers.get("x-razorpay-event-id");
  if (!eventId) throw new HttpError(400, "Missing event id.");
  return json({ result: await handleRazorpayEvent(eventId, raw) });
});
