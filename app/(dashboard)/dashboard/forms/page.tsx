import { Suspense } from "react";
import { requireUser } from "@/lib/auth";

export default function FormsPage() {
  return (
    <section className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Forms</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Submissions from your website forms.
        </p>
      </header>
      <Suspense
        fallback={<div className="h-32 animate-pulse rounded-2xl bg-zinc-200" />}
      >
        <FormsContent />
      </Suspense>
    </section>
  );
}

async function FormsContent() {
  await requireUser();

  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
      <p className="font-medium text-zinc-900">No submissions yet</p>
      <p className="mt-1 text-sm text-zinc-600">
        Form submissions from your sites will appear here.
      </p>
    </div>
  );
}
