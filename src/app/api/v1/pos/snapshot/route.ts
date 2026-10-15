import { device, deviceClaims, member, memberClaims, staffOn } from "@/server/actors";
import { forbidden, json, route } from "@/server/http";
import { outletSnapshot } from "@/server/snapshot";

// The client store's data. Till view (default): needs a paired device; without a PIN session it
// only gets the outlet and staff roster. Back-office view (?as-member=1): the signed-in member's
// first outlet, or ?outlet=. The two never fall back to each other.
export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  if (!url.searchParams.has("as-member")) {
    const d = await device(req);
    const s = await staffOn(req, d, true);
    const snap = await outletSnapshot(deviceClaims(d), d.outletId, {
      device: { id: d.deviceId, seriesCode: d.seriesCode },
      session: s ? { staffId: s.staffId, expiresAt: s.expiresAt } : null,
      rosterOnly: !s,
    });
    return json(snap);
  }
  const m = await member(req);
  const outletId = url.searchParams.get("outlet") ?? m.outletIds[0];
  if (!outletId || !m.outletIds.includes(outletId)) throw forbidden();
  return json(await outletSnapshot(memberClaims(m), outletId, {}));
});
