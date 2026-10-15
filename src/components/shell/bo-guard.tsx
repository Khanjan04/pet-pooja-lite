"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/feedback";

export interface Me {
  name: string;
  email: string;
  role: "owner" | "admin" | "manager" | "accountant";
  org: { id: string; name: string; status: string };
  outletIds: string[];
}

const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext);

/** Back office needs a signed-in member of a restaurant. */
export function BoGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/v1/me", { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!live) return;
        if (r.ok) setMe(data);
        else if (data.code === "signin_required") router.replace("/login");
        else if (data.code === "org_required") router.replace("/onboarding");
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [router]);

  if (failed)
    return (
      <div className="p-6">
        <Alert kind="danger" title="Can’t reach the server">Check the connection and reload the page.</Alert>
      </div>
    );
  if (!me) return <div aria-busy className="flex-1" />;
  return (
    <MeContext.Provider value={me}>
      {me.org.status === "read_only" && (
        <div role="status" className="bg-warning-soft px-4 py-2 text-sm font-semibold text-on-warning-soft">
          The back office is read-only until a plan is active. Tills keep working. <Link className="underline" href="/billing">Choose a plan</Link>
        </div>
      )}
      {me.org.status === "past_due" && (
        <div role="status" className="bg-warning-soft px-4 py-2 text-sm font-semibold text-on-warning-soft">
          Your last payment didn’t go through. <Link className="underline" href="/billing">Check billing</Link>
        </div>
      )}
      {children}
    </MeContext.Provider>
  );
}
