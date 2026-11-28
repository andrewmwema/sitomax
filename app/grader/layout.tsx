import "./grader.css";
import Image from "next/image";
import { brandLogo } from "@/lib/brand";
import { graderContactUrl } from "@/lib/grader/presentation";

export default function GraderLayout({ children }: { children: React.ReactNode }) {
  const contact = graderContactUrl();
  return <div className="grader"><header className="grader-nav">
    <a href="/" className="grader-logo"><Image src={brandLogo.full.path} alt={brandLogo.alt} priority
      width={brandLogo.full.width} height={brandLogo.full.height} sizes="136px" /></a>
    {contact ? <a href={contact}>Talk to us <span aria-hidden="true">↗</span></a> : <span>Contact link unavailable</span>}
  </header>{children}<footer className="grader-footer"><a href="/">SitoMax</a><span>Better websites for hardworking businesses.</span></footer></div>;
}
