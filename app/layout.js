import "./globals.css";
// Self-hosted fonts (served from /_next/static) — no external requests at
// page load, so the app opens instantly even when Google Fonts is blocked.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

export const metadata = {
  title: "Lightbox — Microstock Metadata",
  description: "Generate SEO-optimized titles and keywords for microstock platforms",
};

export const viewport = {
  themeColor: "#0e0f13",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ background: "#0e0f13" }}>
      <head>{/* Fonts are self-hosted via @fontsource imports in this file — no render-blocking external stylesheets. */}</head>
      <body>{children}</body>
    </html>
  );
}
