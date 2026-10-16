import { Suspense } from "react";
import { PosShell } from "@/components/shell/pos-shell";

// The shell reads the URL and the device session, so it renders on the client.
// These screens load their data in the browser after checking who you are, so Next can't
// prerender an "instant" shell for them. Opt out of the dev-time validation warnings.
export const instant = false;

export default function PosAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div aria-busy className="flex-1" />}>
      <PosShell>{children}</PosShell>
    </Suspense>
  );
}
