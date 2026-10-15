export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-density="touch" className="flex min-h-screen flex-col bg-surface text-text">
      {children}
    </div>
  );
}
