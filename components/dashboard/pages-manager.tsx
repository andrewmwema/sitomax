"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  createPage,
  deletePage,
  movePage,
  renamePage,
  setHomePage,
} from "@/app/(dashboard)/dashboard/sites/[siteId]/actions";
import type { ActionState } from "@/lib/form-state";

export type ManagedPage = {
  id: string;
  slug: string;
  title: string | null;
  sort_order: number | null;
  published_at: string | null;
};

/** Add, rename, reorder and delete pages, and set the home page. */
export function PagesManager({
  siteId,
  pages,
}: {
  siteId: string;
  pages: ManagedPage[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionState>({ status: "idle" });
  const [newTitle, setNewTitle] = useState("");
  const [editing, setEditing] = useState<{ id: string; title: string; slug: string } | null>(
    null,
  );

  function run(action: () => Promise<ActionState>) {
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      if (result.status === "success") {
        setEditing(null);
      }
    });
  }

  const smallButton =
    "rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40";

  return (
    <div className="flex flex-col gap-4">
      {message.status !== "idle" ? (
        <p
          className={`rounded-lg px-3.5 py-2.5 text-sm ${
            message.status === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.message}
        </p>
      ) : null}

      <ul className="platform-panel divide-y divide-[#F0EFEA] overflow-hidden">
        {pages.map((page, index) => {
          const isHome = page.slug === "";
          const isEditing = editing?.id === page.id;

          return (
            <li key={page.id} className="flex flex-wrap items-center gap-3 px-5 py-5">
              {isEditing ? (
                <form
                  className="flex flex-1 flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => renamePage(page.id, editing.title, editing.slug));
                  }}
                >
                  <input
                    value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    placeholder="Title"
                    className="w-40 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm"
                    autoFocus
                  />
                  {!isHome ? (
                    <span className="flex items-center gap-1 text-sm text-zinc-500">
                      /
                      <input
                        value={editing.slug}
                        onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                        placeholder="slug"
                        className="w-32 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm"
                      />
                    </span>
                  ) : null}
                  <button type="submit" disabled={pending} className={smallButton}>
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className={smallButton}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex flex-1 flex-wrap items-center gap-2.5">
                  <span className="font-medium text-zinc-900">
                    {page.title || (isHome ? "Home" : page.slug)}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {isHome ? "/" : `/${page.slug}`}
                  </span>
                  {isHome ? (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      Home
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      page.published_at
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {page.published_at ? "Published" : "Draft"}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  title="Move up"
                  disabled={pending || index === 0}
                  onClick={() => run(() => movePage(page.id, "up"))}
                  className={smallButton}
                >
                  ↑
                </button>
                <button
                  type="button"
                  title="Move down"
                  disabled={pending || index === pages.length - 1}
                  onClick={() => run(() => movePage(page.id, "down"))}
                  className={smallButton}
                >
                  ↓
                </button>
                <Link
                  href={`/editor/${page.id}`}
                  className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    setEditing({
                      id: page.id,
                      title: page.title ?? "",
                      slug: page.slug,
                    })
                  }
                  className={smallButton}
                >
                  Rename
                </button>
                {!isHome ? (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setHomePage(page.id))}
                      className={smallButton}
                    >
                      Set as home
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`Delete “${page.title || page.slug}”?`)) {
                          run(() => deletePage(page.id));
                        }
                      }}
                      className={`${smallButton} text-red-600 hover:bg-red-50`}
                    >
                      Delete
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
        {pages.length === 0 ? (
          <li className="px-4 py-6 text-sm text-zinc-500">No pages yet.</li>
        ) : null}
      </ul>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newTitle.trim()) return;
          run(() => createPage(siteId, newTitle));
          setNewTitle("");
        }}
      >
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New page title"
          className="w-56 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending || !newTitle.trim()}
          className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
        >
          Add page
        </button>
      </form>
    </div>
  );
}
