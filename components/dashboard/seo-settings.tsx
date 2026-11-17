"use client";

import { useActionState } from "react";
import type { SiteSeo } from "@/lib/seo";
import { addRedirect, deleteRedirect, saveSeo } from "@/app/(dashboard)/dashboard/sites/[siteId]/seo/actions";

const initial = { error: "", success: "" };
const control = "mt-1 w-full rounded-lg border border-[#E8E7E3] bg-white px-3 py-2 text-sm";

function Feedback({ state }: { state: typeof initial }) {
  return state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> :
    state.success ? <p role="status" className="text-sm text-zinc-600">{state.success}</p> : null;
}

export function SeoSettings({ siteId, seo }: { siteId: string; seo: SiteSeo }) {
  const [state, action, pending] = useActionState(saveSeo.bind(null, siteId), initial);
  return <form action={action} className="space-y-4 rounded-xl border border-[#E8E7E3] bg-white p-5">
    <h2 className="font-semibold">Site SEO settings</h2>
    <label className="block text-sm">Default social share image URL<input className={control} name="socialImage" defaultValue={seo.socialImage} /></label>
    <label className="block text-sm">Google Search Console verification code<input className={control} name="googleVerification" defaultValue={seo.googleVerification} />
      <span className="mt-1 block text-xs text-zinc-500">Paste the verification content value, not the full meta tag.</span></label>
    <label className="block text-sm">Google Analytics measurement ID<input className={control} name="googleAnalyticsId" defaultValue={seo.googleAnalyticsId} placeholder="G-XXXXXXXXXX" />
      <span className="mt-1 block text-xs text-zinc-500">Optional. Loads Google Analytics on published pages.</span></label>
    <label className="block text-sm">Meta Pixel ID<input className={control} name="metaPixelId" defaultValue={seo.metaPixelId} inputMode="numeric" />
      <span className="mt-1 block text-xs text-zinc-500">Optional. Loads Meta Pixel on published pages.</span></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="noindex" defaultChecked={seo.noindex} />Hide pages from search engines by default</label>
    <button disabled={pending} className="rounded-lg bg-[#121212] px-4 py-2 text-sm text-white disabled:opacity-50">{pending ? "Saving..." : "Save SEO settings"}</button>
    <Feedback state={state} />
  </form>;
}

export function RedirectManager({ siteId, redirects }: { siteId: string; redirects: { id: string; from_path: string; to_path: string }[] }) {
  const [state, action, pending] = useActionState(addRedirect.bind(null, siteId), initial);
  return <section className="space-y-4 rounded-xl border border-[#E8E7E3] bg-white p-5"><h2 className="font-semibold">Redirects</h2>
    <p className="text-xs text-zinc-500">Use paths on this site. Changes may take 30 seconds to appear; browsers may cache permanent redirects.</p>
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">From<input name="fromPath" required placeholder="/old-page" className={control} /></label>
      <label className="text-sm">To<input name="toPath" required placeholder="/new-page" className={control} /></label>
      <button disabled={pending} className="rounded-lg bg-[#121212] px-4 py-2 text-sm text-white disabled:opacity-50">Add redirect</button>
    </form><Feedback state={state} />
    {redirects.length ? <ul className="divide-y divide-[#E8E7E3]">{redirects.map((redirect) =>
      <li key={redirect.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span className="break-all">{redirect.from_path} → {redirect.to_path}</span><DeleteRedirect siteId={siteId} id={redirect.id} /></li>)}</ul>
      : <p className="text-sm text-zinc-500">No redirects yet.</p>}
  </section>;
}

function DeleteRedirect({ siteId, id }: { siteId: string; id: string }) {
  const [state, action, pending] = useActionState(deleteRedirect.bind(null, siteId), initial);
  return <form action={action}><input type="hidden" name="id" value={id} /><button disabled={pending} className="text-sm text-red-700 underline">Delete</button><Feedback state={state} /></form>;
}
