import { Construction } from "lucide-react";
import { screen } from "@/lib/screens";

/** Placeholder for a screen that isn't built yet. Says what it will do and which phase builds it. */
export function StubScreen({ id }: { id: string }) {
  const s = screen(id);
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 p-8 text-center">
      <Construction aria-hidden className="size-12 text-text-muted" />
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {s.id} · coming in {s.phase}
      </p>
      <h1 className="text-xl">{s.name}</h1>
      <p className="text-text-muted">{s.purpose}</p>
    </div>
  );
}
