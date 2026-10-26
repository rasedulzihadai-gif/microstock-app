// Copies the pdf.js worker, standard fonts and CMaps into /public so the
// browser renders .ai / .pdf previews without bundler gymnastics. Runs after
// install and before dev/build; failures are non-fatal because the preview code
// can fall back to an in-bundle main-thread worker.
import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "node_modules", "pdfjs-dist");
const target = path.join(root, "public", "pdfjs");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(source))) {
    console.warn("[pdfjs] pdfjs-dist is not installed — skipping preview asset copy.");
    return;
  }

  await mkdir(target, { recursive: true });

  const worker = path.join(source, "legacy", "build", "pdf.worker.min.mjs");
  if (await exists(worker)) {
    await cp(worker, path.join(target, "pdf.worker.min.mjs"));
  }

  for (const dir of ["standard_fonts", "cmaps"]) {
    const from = path.join(source, dir);
    if (await exists(from)) {
      await cp(from, path.join(target, dir), { recursive: true });
    }
  }

  console.log("[pdfjs] preview assets ready in public/pdfjs");
}

main().catch((error) => {
  console.warn(`[pdfjs] preview asset copy skipped: ${error?.message || error}`);
});
