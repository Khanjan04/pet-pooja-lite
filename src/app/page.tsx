import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col justify-center gap-4 p-8">
      <h1 className="text-xl">Restaurant POS</h1>
      <p className="text-text-muted">The app is being built. The design system comes first.</p>
      <Link href="/design" className="font-semibold text-accent underline underline-offset-4">
        Open the design system
      </Link>
    </main>
  );
}
