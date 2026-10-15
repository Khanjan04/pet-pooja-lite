import Link from "next/link";
import { MonitorSmartphone, LayoutDashboard, Palette } from "lucide-react";

export default function Home() {
  const card = "flex items-center gap-3 rounded-lg border border-border bg-bg p-4 font-semibold text-text shadow-card hover:bg-surface";
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-xl">Restaurant POS</h1>
      <p className="text-text-muted">Demo build. Data lives in this browser only; nothing is sent anywhere.</p>
      <Link href="/pos" className={card}>
        <MonitorSmartphone aria-hidden className="size-6 text-accent" /> Open the POS
      </Link>
      <Link href="/dashboard" className={card}>
        <LayoutDashboard aria-hidden className="size-6 text-accent" /> Back office
      </Link>
      <Link href="/design" className={card}>
        <Palette aria-hidden className="size-6 text-accent" /> Design system
      </Link>
    </main>
  );
}
