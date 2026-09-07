import "./globals.css";

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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
