"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form";
import { Segmented } from "@/components/ui/pos";
import { authClient } from "@/lib/auth-client";

const STATES: [string, string][] = [
  ["35", "Andaman & Nicobar"], ["37", "Andhra Pradesh"], ["12", "Arunachal Pradesh"], ["18", "Assam"], ["10", "Bihar"], ["04", "Chandigarh"],
  ["22", "Chhattisgarh"], ["26", "Dadra & Nagar Haveli and Daman & Diu"], ["07", "Delhi"], ["30", "Goa"], ["24", "Gujarat"], ["06", "Haryana"],
  ["02", "Himachal Pradesh"], ["01", "Jammu & Kashmir"], ["20", "Jharkhand"], ["29", "Karnataka"], ["32", "Kerala"], ["38", "Ladakh"],
  ["31", "Lakshadweep"], ["23", "Madhya Pradesh"], ["27", "Maharashtra"], ["14", "Manipur"], ["17", "Meghalaya"], ["15", "Mizoram"],
  ["13", "Nagaland"], ["21", "Odisha"], ["34", "Puducherry"], ["03", "Punjab"], ["08", "Rajasthan"], ["11", "Sikkim"], ["33", "Tamil Nadu"],
  ["36", "Telangana"], ["16", "Tripura"], ["09", "Uttar Pradesh"], ["05", "Uttarakhand"], ["19", "West Bengal"],
];

// S02: one form, then straight to a working till.
export default function OnboardingPage() {
  const router = useRouter();
  const session = authClient.useSession();
  const [f, setF] = useState({ restaurantName: "", outletName: "Main", address: "", city: "", stateCode: "", gstScheme: "regular", gstin: "", ownerName: "", ownerPin: "", sampleMenu: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    if (!session.isPending && !session.data) router.replace("/login");
  }, [session.isPending, session.data, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/orgs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, ownerName: f.ownerName || session.data?.user.name }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      // Make this browser a till straight away so the owner can ring up a first order.
      await fetch("/api/v1/devices/pair-this", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ outletId: data.outletId }) });
      router.replace("/dashboard?welcome=1");
      return;
    }
    setBusy(false);
    if (data.code === "conflict" && /already/.test(data.error)) return router.replace("/dashboard");
    setError(data.error ?? "Couldn’t set up the restaurant.");
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-xl flex-col gap-5 rounded-lg bg-bg p-6 shadow-card sm:p-8">
      <div>
        <h1 className="text-xl">Set up your restaurant</h1>
        <p className="text-sm text-text-muted">Two minutes. You can change all of this later.</p>
      </div>
      <Field label="Restaurant name" required maxLength={80} value={f.restaurantName} onChange={set("restaurantName")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Outlet name" required maxLength={80} hint="e.g. the area it’s in" value={f.outletName} onChange={set("outletName")} />
        <Field label="City" maxLength={60} value={f.city} onChange={set("city")} />
      </div>
      <Field label="Address" maxLength={200} value={f.address} onChange={set("address")} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        State <span className="sr-only">(required)</span>
        <select required value={f.stateCode} onChange={set("stateCode")} className="h-control-md rounded-md border border-border-input bg-bg px-3 text-base font-normal">
          <option value="">Choose a state</option>
          {STATES.map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">GST registration</legend>
        <Segmented
          label="GST registration"
          value={f.gstScheme}
          onChange={(v) => setF({ ...f, gstScheme: v })}
          options={[
            { value: "regular", label: "Registered" },
            { value: "composition", label: "Composition" },
            { value: "unregistered", label: "Not registered" },
          ]}
        />
        <p className="text-sm text-text-muted">
          {f.gstScheme === "regular" ? "Bills are tax invoices with 5% GST (CGST 2.5% + SGST 2.5%)." : "Bills are issued without GST. You can add taxes later."}
        </p>
      </fieldset>
      {f.gstScheme === "regular" && <Field label="GSTIN" required maxLength={15} autoCapitalize="characters" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} hint="15 characters, starts with your state code." />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name on the till" maxLength={60} placeholder={session.data?.user.name} value={f.ownerName} onChange={set("ownerName")} />
        <Field label="Your till PIN" required inputMode="numeric" pattern="\d{4}" maxLength={4} hint="4 digits. Staff get their own." type="password" value={f.ownerPin} onChange={set("ownerPin")} />
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 size-4" checked={f.sampleMenu} onChange={(e) => setF({ ...f, sampleMenu: e.target.checked })} />
        <span>
          <span className="font-semibold">Start with a sample menu and floor</span>
          <br />
          <span className="text-text-muted">About 30 dishes, 3 areas and 18 tables to try the till with. Edit or delete them any time.</span>
        </span>
      </label>
      {error && <Alert kind="danger" title={error} />}
      <Button type="submit" size="lg" loading={busy}>Create restaurant</Button>
    </form>
  );
}
