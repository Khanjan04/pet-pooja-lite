import { Suspense } from "react";
import { PosShell } from "@/components/shell/pos-shell";

// The shell reads the URL and the device session, so it renders on the client.
export default function PosAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div aria-busy className="flex-1" />}>
      <PosShell>{children}</PosShell>
    </Suspense>
  );
}
