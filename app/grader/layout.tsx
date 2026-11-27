import "./grader.css";
import { graderContactUrl } from "@/lib/grader/presentation";

export default function GraderLayout({ children }: { children: React.ReactNode }) {
  const contact = graderContactUrl();
  return <div className="grader"><header className="grader-nav">
    <a href="/" className="grader-logo">SitoMax<span>.</span></a>
    {contact ? <a href={contact}>Talk to us <span aria-hidden="true">↗</span></a> : <span>Contact link unavailable</span>}
  </header>{children}<footer className="grader-footer"><a href="/">SitoMax</a><span>Better websites for hardworking businesses.</span></footer></div>;
}
