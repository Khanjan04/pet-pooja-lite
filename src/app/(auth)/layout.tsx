export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main data-density="compact" className="flex min-h-screen items-center justify-center bg-surface p-4">
      {children}
    </main>
  );
}
