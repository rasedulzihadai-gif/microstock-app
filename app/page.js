"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { IconSparkles, IconUpload } from "../components/icons";

const MicrostockApp = dynamic(() => import("../components/microstock-app"), {
  ssr: false,
  loading: () => (
    <main className="app-loading" aria-live="polite">
      <div className="app-loading__mark"><IconSparkles width={21} height={21} /></div>
      <p>Preparing your workspace…</p>
    </main>
  ),
});

export default function LandingPage() {
  const [isOpening, setIsOpening] = useState(false);
  const [isAppOpen, setIsAppOpen] = useState(false);
  const launchTimer = useRef(null);

  useEffect(() => () => window.clearTimeout(launchTimer.current), []);

  function openApp() {
    if (isOpening) return;
    setIsOpening(true);
    launchTimer.current = window.setTimeout(() => setIsAppOpen(true), 430);
  }

  if (isAppOpen) {
    return (
      <div className="workspace-enter">
        <MicrostockApp />
      </div>
    );
  }

  return (
    <main className={`landing${isOpening ? " landing--leaving" : ""}`}>
      <div className="landing__glow landing__glow--one" />
      <div className="landing__glow landing__glow--two" />

      <nav className="landing__nav" aria-label="Primary navigation">
        <a className="landing-brand" href="/" aria-label="Lightbox home">
          <span className="landing-brand__mark">
            <img src="/icon-192.png" alt="" />
          </span>
          <span>Lightbox</span>
        </a>
        <span className="landing__nav-note">Microstock metadata, refined.</span>
      </nav>

      <section className="landing__hero">
        <div className="landing__copy">
          <div className="landing__eyebrow"><span /> AI-powered metadata workspace</div>
          <h1>Make every image ready for the marketplace.</h1>
          <p>
            Turn your visual library into precise titles, relevant keywords, and export-ready metadata for the stock platforms that matter.
          </p>
          <div className="landing__actions">
            <button className="landing__cta" onClick={openApp} disabled={isOpening}>
              <IconSparkles width={17} height={17} />
              <span>{isOpening ? "Opening workspace…" : "Open app"}</span>
              <span className="landing__cta-arrow" aria-hidden="true">→</span>
            </button>
            <span className="landing__helper">Bring your own AI provider</span>
          </div>
          <div className="landing__signals" aria-label="Lightbox features">
            <span><i />Batch-ready queue</span>
            <span><i />Four platform formats</span>
            <span><i />CSV export included</span>
          </div>
        </div>

        <div className="landing-preview" aria-hidden="true">
          <div className="landing-preview__topbar">
            <div className="landing-preview__brand"><span className="landing-preview__logo">L</span><span>Lightbox</span></div>
            <span className="landing-preview__status"><i /> Ready</span>
          </div>
          <div className="landing-preview__body">
            <aside className="landing-preview__queue">
              <div className="landing-preview__queue-label">IMAGE QUEUE</div>
              <div className="landing-preview__file landing-preview__file--active">
                <span className="landing-preview__image landing-preview__image--one" />
                <span><b>coastal-sunrise.jpg</b><small>Ready to generate</small></span>
              </div>
              <div className="landing-preview__file">
                <span className="landing-preview__image landing-preview__image--two" />
                <span><b>studio-leaves.jpg</b><small>Queued</small></span>
              </div>
              <div className="landing-preview__file">
                <span className="landing-preview__image landing-preview__image--three" />
                <span><b>city-evening.jpg</b><small>Queued</small></span>
              </div>
            </aside>
            <div className="landing-preview__result">
              <div className="landing-preview__tabs"><span className="is-active">Adobe Stock</span><span>Shutterstock</span></div>
              <div className="landing-preview__visual" />
              <div className="landing-preview__label">TITLE</div>
              <div className="landing-preview__title">Golden sunrise over calm coastal water</div>
              <div className="landing-preview__label">KEYWORDS <span>18</span></div>
              <div className="landing-preview__chips"><em>sunrise</em><em>coast</em><em>ocean</em><em>golden hour</em><em>seascape</em></div>
            </div>
          </div>
          <div className="landing-preview__footer"><IconUpload width={13} height={13} /> Add images <span>Generate metadata</span></div>
        </div>
      </section>

      <footer className="landing__footer">
        <span>Built for thoughtful stock contributors.</span>
        <span className="landing__footer-rule" />
        <span>Your images stay in your queue until you choose to generate.</span>
      </footer>
    </main>
  );
}
