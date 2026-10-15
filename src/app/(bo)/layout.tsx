import { Suspense } from "react";
import { BoGuard } from "@/components/shell/bo-guard";
import { BoNav } from "@/components/shell/bo-nav";

export default function BackOfficeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-density="compact" className="flex min-h-screen flex-col bg-bg lg:flex-row">
      <Suspense fallback={<div className="shrink-0 border-r border-border bg-surface lg:w-[var(--t-layout-bo-sidebar)]" />}>
        <BoNav />
      </Suspense>
      <main id="main" className="min-w-0 flex-1">
        <BoGuard>{children}</BoGuard>
      </main>
    </div>
  );
}
