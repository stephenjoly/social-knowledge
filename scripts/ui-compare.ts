import { readdir, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Builds one side-by-side image per screen: the approved design on the left, the
 * current implementation on the right, with a difference overlay beneath.
 *
 *   npx tsx scripts/ui-compare.ts [--captures artifacts/ui-screens] [--out artifacts/ui-compare]
 *
 * Run scripts/ui-screens.ts first. Chromium needs its system libraries on PATH;
 * see docs/design/ui-v2-spec.md.
 */

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const referenceDir = path.resolve(
  flag("reference", "docs/design/ui-v2/screens"),
);
const captureDir = path.resolve(flag("captures", "artifacts/ui-screens"));
const outDir = path.resolve(flag("out", "artifacts/ui-compare"));

const toUrl = (file: string) => `file://${file}`;

const page_html = (name: string, reference: string, capture: string) => `
<!doctype html>
<html><head><meta charset="utf-8"><style>
  :root { color-scheme: light; }
  body { margin:0; background:#f1f1ef; font-family: Inter, system-ui, sans-serif; color:#18181b; }
  h1 { font-size:22px; margin:0 0 4px; letter-spacing:-0.4px; }
  p { font-size:13px; color:#71717a; margin:0 0 18px; }
  .wrap { padding:28px; }
  .cols { display:flex; gap:18px; align-items:flex-start; }
  .col { flex:1; min-width:0; }
  .label { font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#a1a1aa; margin-bottom:8px; }
  .shot { width:100%; display:block; border:1px solid #e4e4e7; border-radius:8px; background:#fff; }
  .diff { position:relative; margin-top:22px; }
  .diff img { width:100%; display:block; border:1px solid #e4e4e7; border-radius:8px; }
  .diff .over { position:absolute; inset:0; mix-blend-mode:difference; border-radius:8px; }
  .missing { padding:40px; text-align:center; border:1px dashed #e4e4e7; border-radius:8px; color:#9f3f34; font-size:14px; background:#fff; }
</style></head><body><div class="wrap">
  <h1>${name}</h1>
  <p>Left is the approved design. Right is the current implementation. The bottom strip is a difference blend: anything that is not black has drifted.</p>
  <div class="cols">
    <div class="col"><div class="label">Approved design</div><img class="shot" src="${reference}"></div>
    <div class="col"><div class="label">Implementation</div>${
      capture
        ? `<img class="shot" src="${capture}">`
        : `<div class="missing">no capture for this screen</div>`
    }</div>
  </div>
  ${
    capture
      ? `<div class="col" style="margin-top:22px"><div class="label">Difference</div><div class="diff"><img src="${reference}"><img class="over" src="${capture}"></div></div>`
      : ""
  }
</div></body></html>`;

const references = (await readdir(referenceDir))
  .filter((file) => file.endsWith(".png"))
  .sort();
if (!references.length) throw new Error(`no references in ${referenceDir}`);

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
// Wide enough that each column lands near the 1280px design width.
const page = await browser.newPage({ viewport: { width: 2800, height: 1200 } });
const scratch = path.join(outDir, ".compare.html");

const missing: string[] = [];
for (const file of references) {
  const name = path.basename(file, ".png");
  const capture = path.join(captureDir, file);
  const hasCapture = existsSync(capture);
  if (!hasCapture) missing.push(name);
  // Written to disk because a file:// image will not load into about:blank.
  await writeFile(
    scratch,
    page_html(
      name,
      toUrl(path.join(referenceDir, file)),
      hasCapture ? toUrl(capture) : "",
    ),
  );
  await page.goto(toUrl(scratch));
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: path.join(outDir, `${name}.png`),
    fullPage: true,
  });
  console.log(`compared ${name}${hasCapture ? "" : " (capture missing)"}`);
}

await browser.close();
await rm(scratch, { force: true });
console.log(`\nComparisons written to ${outDir}`);
if (missing.length) {
  console.error(`\nNo capture found for: ${missing.join(", ")}`);
  process.exitCode = 1;
}
