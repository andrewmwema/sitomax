import type { Metadata } from "next";
import { GraderScanForm } from "@/components/grader/scan-form";
import { Activity, Globe, Handshake, MapPin, MousePointerClick, Search, Smartphone } from "lucide-react";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Free Website Grader | SitoMax",
  description: "Get a free website grade and discover practical ways to improve your site.",
  alternates: { canonical: `${brand.rootDomain.includes("localhost") ? "http" : "https"}://${brand.rootDomain}/grader` },
};

const checks = [
  [Activity, "Speed", "See how quickly your site loads."],
  [Smartphone, "Mobile", "Check the experience on a phone."],
  [Search, "Search visibility", "Review the basics that help search engines understand your site."],
  [Globe, "Security & trust", "Check for HTTPS and trust signals."],
  [MousePointerClick, "Lead capture", "Find opportunities to make contacting you easier."],
  [MapPin, "Local presence", "Review the local details customers look for."],
  [Handshake, "Social & content", "See how visitors can connect with your business."],
] as const;

export default function GraderLanding() {
  return <main>
    <section className="grader-hero"><div className="grader-wrap grader-hero-grid">
      <div>
        <p className="grader-kicker">A smarter website starts here</p>
        <h1>How good is <em>your website?</em></h1>
        <p className="grader-lede">Get a free grade in about 60 seconds. Find out what&apos;s working and what could be holding your business back.</p>
        <GraderScanForm />
        <p className="grader-trust">Free <span>·</span> No signup to see your score <span>·</span> Takes about a minute</p>
      </div>
      <div className="grader-example" aria-label="Illustrative example report">
        <div className="grader-example-top"><span>WEBSITE REPORT</span><span>EXAMPLE</span></div>
        <p>Your website, at a glance.</p>
        <div className="grader-example-score"><strong>82</strong><span>/100<br /><b>Grade B</b></span></div>
        {["Speed", "Mobile", "Search visibility"].map((item, index) => <div key={item} className="grader-example-row">
          <span>{item}</span><div><i style={{ width: `${[72, 89, 80][index]}%` }} /></div>
        </div>)}
        <p className="grader-example-note">Illustrative example, not a real scan.</p>
      </div>
    </div></section>
    <section className="grader-wrap grader-section"><p className="grader-kicker">The bigger picture</p>
      <h2>Seven ways to see your site clearly.</h2><p className="grader-section-intro">We check the essentials, from first impressions to the ways customers find and contact you.</p>
      <div className="grader-check-grid">{checks.map(([Icon, title, description]) => <article key={title}>
        <Icon size={22} aria-hidden="true" /><h3>{title}</h3><p>{description}</p>
      </article>)}</div>
    </section>
    <section className="grader-wrap grader-section grader-faq"><p className="grader-kicker">Good to know</p><h2>Questions? Answered.</h2>
      <details><summary>What does the grader check?</summary><p>We inspect your homepage and use Google PageSpeed Insights to assess speed, mobile experience, search visibility and more. Checks we can&apos;t complete are marked accordingly.</p></details>
      <details><summary>Is it really free?</summary><p>Yes. You can see your score and a preview without signing up.</p></details>
      <details><summary>How long does it take?</summary><p>Most scans take about a minute, though some websites or external checks may take longer.</p></details>
    </section>
  </main>;
}
