export const metadata = {
  title: "Microstock Metadata Generator",
  description: "Generate SEO-optimized titles and keywords for microstock platforms",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0b0e14", color: "#e6e6e6" }}>
        {children}
      </body>
    </html>
  );
}
