// Web app manifest — Next.js serves this at /manifest.webmanifest and links
// it automatically. Gives the app its own identity (name + icon) when
// installed to a home screen or desktop.
export default function manifest() {
  return {
    name: "Lightbox — Microstock Metadata",
    short_name: "Lightbox",
    description: "Generate SEO-optimized titles and keywords for microstock platforms",
    start_url: "/",
    display: "standalone",
    background_color: "#0e0f13",
    theme_color: "#0e0f13",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
