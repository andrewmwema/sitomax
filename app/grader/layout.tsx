import "./grader.css";

export default function GraderLayout({ children }: { children: React.ReactNode }) {
  return <div className="grader"><header className="grader-nav">
    <a href="/" className="grader-logo">SitoMax<span>.</span></a>
    <a href="https://sitomax.com/contact">Talk to us <span aria-hidden="true">↗</span></a>
  </header>{children}<footer className="grader-footer"><a href="/">SitoMax</a><span>Better websites for hardworking businesses.</span></footer></div>;
}
