export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-950 px-4 py-16 text-zinc-100">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-3xl font-bold tracking-tight text-red-500">
            Mafia
          </span>
          <p className="mt-1 text-sm text-zinc-400">
            Trust no one. Survive the night.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-xl">
          {children}
        </div>
      </div>
    </div>
  );
}
