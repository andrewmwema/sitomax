import { Suspense } from "react";

/**
 * Full-screen visual editor for a page. Placeholder until the editor is
 * wired up to load draft_data and save through a Server Action.
 */
export default function EditorPage({
  params,
}: PageProps<"/editor/[pageId]">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Editor</h1>
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Loading…</p>}>
        <EditorPlaceholder params={params} />
      </Suspense>
    </main>
  );
}

async function EditorPlaceholder({
  params,
}: {
  params: PageProps<"/editor/[pageId]">["params"];
}) {
  const { pageId } = await params;

  return (
    <p className="text-zinc-600 dark:text-zinc-400">
      Editing page <code className="font-mono">{pageId}</code> — editor coming
      soon.
    </p>
  );
}
