"use client";

import { useState, useTransition } from "react";
import { runSocialProviderTest } from "@/app/(dashboard)/dashboard/admin/social-provider/actions";
import { platformLabels, socialPlatforms, type SocialPlatform, type SocialTestResult } from "@/lib/social/types";

export function SocialProviderTest({ sites }: { sites: { id: string; name: string | null; subdomain: string }[] }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(["facebook"]);
  const [text, setText] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [facebookPageId, setFacebookPageId] = useState("");
  const [googleLocationId, setGoogleLocationId] = useState("");
  const [linkedinPageId, setLinkedinPageId] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [referenceKind, setReferenceKind] = useState<"request" | "job">("request");
  const [requestId, setRequestId] = useState("");
  const [googlePostId, setGooglePostId] = useState("");
  const [pageToken, setPageToken] = useState("");
  const [reviewId, setReviewId] = useState("");
  const [comment, setComment] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<SocialTestResult | null>(null);
  const [pending, startTransition] = useTransition();
  function run(input: unknown) {
    startTransition(async () => {
      setResult(null);
      const next = await runSocialProviderTest(siteId, input);
      setResult(next);
      if (next.reference) { setReferenceId(next.reference.id); setReferenceKind(next.reference.kind); }
    });
  }
  const field = "mt-1 min-h-11 w-full rounded-lg border border-[var(--platform-line)] bg-[var(--platform-panel)] p-3 text-sm";
  if (!sites.length) return <p>Create a site before testing social connections.</p>;
  return <div className="space-y-6">
    <label className="block text-sm font-medium">Test site
      <select className={field} disabled={pending} value={siteId} onChange={(event) => {
        setSiteId(event.target.value); setResult(null); setReferenceId(""); setRequestId("");
        setGoogleLocationId(""); setFacebookPageId(""); setLinkedinPageId(""); setReviewId(""); setGooglePostId(""); setPageToken(""); setConfirm(false);
      }}>{sites.map((site) => <option key={site.id} value={site.id}>{site.name || site.subdomain}</option>)}</select>
    </label>
    <fieldset disabled={pending} className="space-y-6">
      <legend className="sr-only">Live provider operations</legend>
      <div className="flex flex-wrap gap-3">
        <button className="platform-button" type="button" onClick={() => run({ action: "connect" })}>Generate connect link</button>
        <button className="platform-button" type="button" onClick={() => run({ action: "accounts" })}>List and sync accounts</button>
        <button className="platform-button" type="button" onClick={() => run({ action: "destinations" })}>List Facebook Pages / Google locations</button>
      </div>
      <section className="space-y-4 rounded-2xl border border-[var(--platform-line)] p-5">
        <h2 className="font-semibold">Publish test</h2>
        <div className="flex flex-wrap gap-4">{socialPlatforms.map((platform) => <label key={platform} className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={platforms.includes(platform)} onChange={(event) => setPlatforms((current) => event.target.checked
            ? [...current, platform] : current.filter((value) => value !== platform))} />{platformLabels[platform]}
        </label>)}</div>
        <label className="block text-sm">Post text<textarea className={field} value={text} onChange={(event) => setText(event.target.value)} /></label>
        <label className="block text-sm">Public HTTPS photo URL (blank for text)<input className={field} type="url" value={photoUrl} onChange={(event) => setPhotoUrl(event.target.value)} /></label>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">Facebook Page ID<input className={field} value={facebookPageId} onChange={(event) => setFacebookPageId(event.target.value)} /></label>
          <label className="text-sm">Google location ID<input className={field} value={googleLocationId} onChange={(event) => setGoogleLocationId(event.target.value)} /></label>
          <label className="text-sm">LinkedIn company Page ID<input className={field} value={linkedinPageId} onChange={(event) => setLinkedinPageId(event.target.value)} /></label>
        </div>
        <p className="text-xs text-[var(--platform-secondary)]">Select the intended destination explicitly. A Page or location pinned in the provider can override these IDs. Use one JPEG image for the first photo test.</p>
        <label className="block text-sm">Request ID (retained for safe retry)<input className={field} value={requestId} onChange={(event) => setRequestId(event.target.value)} placeholder="Generated when publishing" /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} />I authorize publishing this post or review reply publicly.</label>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="platform-button-primary" disabled={!confirm || !platforms.length} onClick={() => {
            const id = requestId || crypto.randomUUID();
            setRequestId(id); setReferenceId(id); setReferenceKind("request");
            run({ action: "publish", confirm, input: {
              platforms, text, photoUrl: photoUrl || undefined, requestId: id,
              facebookPageId: facebookPageId || undefined, googleLocationId: googleLocationId || undefined,
              linkedinPageId: linkedinPageId || undefined,
            } });
          }}>Publish test now</button>
          <button type="button" className="platform-button" onClick={() => { setRequestId(crypto.randomUUID()); setConfirm(false); }}>Prepare a new post ID</button>
        </div>
        <p className="text-xs text-[var(--platform-secondary)]">After a timeout, check the retained request ID before retrying. Reuse it for retries; use a new ID only for a genuinely new post. Do not retry an uncertain review reply blindly.</p>
      </section>
      <section className="space-y-4 rounded-2xl border border-[var(--platform-line)] p-5">
        <h2 className="font-semibold">Status and live URLs</h2>
        <label className="block text-sm">Reference type<select className={field} value={referenceKind} onChange={(event) => setReferenceKind(event.target.value === "job" ? "job" : "request")}><option value="request">Async request</option><option value="job">Scheduled job</option></select></label>
        <label className="block text-sm">Reference ID<input className={field} value={referenceId} onChange={(event) => setReferenceId(event.target.value)} /></label>
        <button type="button" className="platform-button" disabled={!referenceId} onClick={() => run({ action: "status", reference: { kind: referenceKind, id: referenceId }, platforms })}>Check status and history</button>
        <label className="block text-sm">Google post resource name (from history)<input className={field} placeholder="accounts/123/locations/456/localPosts/789" value={googlePostId} onChange={(event) => setGooglePostId(event.target.value)} /></label>
        <button type="button" className="platform-button" disabled={!googlePostId} onClick={() => run({ action: "google_post", postId: googlePostId })}>Check Google visibility</button>
      </section>
      <section className="space-y-4 rounded-2xl border border-[var(--platform-line)] p-5">
        <h2 className="font-semibold">Google reviews</h2>
        <label className="block text-sm">Next page token (optional)<input className={field} value={pageToken} onChange={(event) => setPageToken(event.target.value)} /></label>
        <button type="button" className="platform-button" onClick={() => run({ action: "reviews", pageToken: pageToken || undefined, locationId: googleLocationId || undefined })}>List reviews</button>
        <label className="block text-sm">Review resource name<input className={field} placeholder="accounts/123/locations/456/reviews/abc" value={reviewId} onChange={(event) => setReviewId(event.target.value)} /></label>
        <label className="block text-sm">Public reply (replaces any existing owner reply)<textarea className={field} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
        <button type="button" className="platform-button" disabled={!confirm || !reviewId || !comment.trim()} onClick={() => run({ action: "reply", confirm, reviewId, comment })}>Send public reply</button>
      </section>
    </fieldset>
    <p role="status" className="text-sm">{pending ? "Contacting the social service..." : result && !result.error ? "Response received. Inspect the result below; acceptance does not guarantee publication." : ""}</p>
    {result?.error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{result.error}</p> : null}
    {result?.connectUrl ? <a href={result.connectUrl} target="_blank" rel="noopener noreferrer" className="platform-button-primary">Open private connect link</a> : null}
    {result ? <section className="space-y-3">
      <h2 className="font-semibold">Response (credentials redacted)</h2>
      <p className="text-xs text-[var(--platform-secondary)]">May contain account information or review text. Remove personal data before sharing. Connect links contain tokens; do not share them.</p>
      <pre className="max-h-[36rem] overflow-auto rounded-xl border border-[var(--platform-line)] p-4 text-xs">{JSON.stringify({ data: result.data, raw: result.raw }, null, 2)}</pre>
    </section> : null}
  </div>;
}
