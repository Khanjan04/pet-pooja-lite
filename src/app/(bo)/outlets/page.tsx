"use client";

import { useCallback, useEffect, useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form";
import { useMe } from "@/components/shell/bo-guard";

interface Device { id: string; kind: string; name: string; seriesCode: string; lastSeenAt: string | null; revokedAt: string | null }

// S04 (tills part). Multi-outlet management comes in P5.
export default function OutletsPage() {
  const me = useMe();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [name, setName] = useState("Counter 2");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => fetch("/api/v1/devices", { cache: "no-store" }).then(async (r) => setDevices((await r.json()).devices ?? [])), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(path: string, body: unknown) {
    setError(null);
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error ?? "Something went wrong.");
    return data;
  }

  const canManage = me && ["owner", "admin", "manager"].includes(me.role);
  const active = devices?.filter((d) => !d.revokedAt) ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 lg:p-8">
      <div>
        <h1 className="text-xl">Outlets & tills</h1>
        <p className="text-sm text-text-muted">Each till gets its own bill series (T1, T2…), so two tills never share a bill number.</p>
      </div>
      {canManage && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              setCode((await post("/api/v1/devices/pairing-code", { outletId: me!.outletIds[0], kind: "pos", name })).code);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <Field label="Name for the new till" className="min-w-48 flex-1" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit">Get a pairing code</Button>
          {code && (
            <div role="status" className="w-full rounded-md bg-accent-soft p-3 text-on-accent-soft">
              On the new device, open <b>/pos/pair</b> and enter <span className="num text-xl font-bold tracking-widest">{code}</span>. It works once, for 10 minutes.
            </div>
          )}
        </form>
      )}
      {error && <Alert kind="danger" title={error} />}
      {!devices ? (
        <Skeleton className="h-24" />
      ) : active.length === 0 ? (
        <EmptyState icon={<MonitorSmartphone />} title="No tills yet" help="Pair a device with a code, or open the POS on this computer." />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted">
              <th className="py-2 font-normal">Till</th>
              <th className="py-2 font-normal">Series</th>
              <th className="py-2 font-normal">Last seen</th>
              <th className="py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {active.map((d) => (
              <tr key={d.id} className="border-t border-border">
                <td className="py-2">{d.name}</td>
                <td className="num py-2">{d.seriesCode}</td>
                <td className="py-2 text-text-muted">{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString("en-IN") : "never"}</td>
                <td className="py-2 text-right">
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={async () => { try { await post(`/api/v1/devices/${d.id}/revoke`, {}); await load(); } catch (err) { setError((err as Error).message); } }}>
                      Remove {d.name}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
