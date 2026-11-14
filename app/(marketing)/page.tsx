import Link from "next/link";

/**
 * Agency marketing site, served on the root domain.
 */
export default function MarketingHomePage() {
  const agencyName = process.env.NEXT_PUBLIC_AGENCY_NAME ?? "My Agency";

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">{agencyName}</h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        Beautiful websites for your business, built and managed for you.
      </p>
      <Link
        href="/login"
        className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Client login
      </Link>
    </main>
  );
}
