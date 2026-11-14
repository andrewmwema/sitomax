import { Suspense } from "react";

/**
 * PUBLIC tenant site renderer. Reached only via the proxy rewrite:
 *   {subdomain}.ROOT_DOMAIN/{path}  ->  /s/{subdomain}/{path}
 *   {custom-domain}/{path}          ->  /s/{custom-domain}/{path}
 *
 * Placeholder until site resolution and Puck rendering are wired up.
 */
export default function TenantSitePage({
  params,
}: PageProps<"/s/[site]/[[...slug]]">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24">
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Loading…</p>}>
        <TenantPlaceholder params={params} />
      </Suspense>
    </main>
  );
}

async function TenantPlaceholder({
  params,
}: {
  params: PageProps<"/s/[site]/[[...slug]]">["params"];
}) {
  const { site, slug } = await params;
  const path = "/" + (slug?.join("/") ?? "");

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{site}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Tenant page <code className="font-mono">{path}</code> — renderer coming
        soon.
      </p>
    </>
  );
}
