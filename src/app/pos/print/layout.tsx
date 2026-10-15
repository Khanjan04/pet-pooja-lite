import { Suspense } from "react";

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div aria-busy className="flex-1" />}>{children}</Suspense>;
}
