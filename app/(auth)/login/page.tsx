/**
 * Login with magic link. Placeholder until Supabase Auth is wired up.
 */
export default function LoginPage() {
  const agencyName = process.env.NEXT_PUBLIC_AGENCY_NAME ?? "My Agency";

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">
        Sign in to {agencyName}
      </h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Magic-link login coming soon.
      </p>
    </main>
  );
}
