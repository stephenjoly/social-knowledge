import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

// Presentation-only framing for README screenshots. Raw captures from
// scripts/readme-screens.ts are inputs and are never rewritten; each framed
// sibling places the raw pixels at natural size (device scale 1, integer
// offsets) inside a rounded light frame on a soft gradient backdrop.
// Usage: node scripts/frame-readme-screens.mjs [--only inbox]
const screens = ["inbox", "capture-detail", "ask"];
const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : undefined;
if (only && !screens.includes(only)) throw new Error("Unknown screenshot selection");
const dir = path.resolve("docs/screenshots");

const MARGIN_X = 72;
const MARGIN_Y = 64;
const FRAME = 10;
const OUTER_RADIUS = 16;
const INNER_RADIUS = OUTER_RADIUS - FRAME;

function pngSize(buffer) {
  if (buffer.toString("ascii", 1, 4) !== "PNG") throw new Error("Input is not a PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function html(dataUrl, { width, height }) {
  return `<!doctype html><html><head><style>
  * { margin: 0; box-sizing: border-box; }
  html, body { background: transparent; }
  .stage {
    width: ${width + 2 * (FRAME + MARGIN_X)}px;
    height: ${height + 2 * (FRAME + MARGIN_Y)}px;
    padding: ${MARGIN_Y}px ${MARGIN_X}px;
    background:
      radial-gradient(58% 62% at 6% 96%, rgba(118, 152, 232, 0.78), transparent 72%),
      radial-gradient(46% 70% at 100% 72%, rgba(170, 162, 234, 0.72), transparent 72%),
      radial-gradient(52% 48% at 90% 2%, rgba(212, 204, 242, 0.9), transparent 72%),
      radial-gradient(64% 54% at 22% 0%, rgba(247, 236, 216, 1), transparent 76%),
      linear-gradient(158deg, #f1e8dc 0%, #e2dcec 44%, #c3cdef 100%);
  }
  .frame {
    padding: ${FRAME}px;
    border-radius: ${OUTER_RADIUS}px;
    background: linear-gradient(180deg, #f3f2f6, #ebeaf0);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.65),
      0 0 0 1px rgba(46, 44, 84, 0.10),
      0 2px 6px rgba(46, 44, 84, 0.08),
      0 24px 60px -6px rgba(46, 44, 84, 0.30);
  }
  img {
    display: block;
    width: ${width}px;
    height: ${height}px;
    border-radius: ${INNER_RADIUS}px;
    box-shadow: 0 0 0 1px rgba(40, 40, 60, 0.09);
  }
</style></head><body><div class="stage"><div class="frame"><img src="${dataUrl}" alt=""></div></div></body></html>`;
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1500 }, deviceScaleFactor: 1 });
  for (const screen of only ? [only] : screens) {
    const raw = await readFile(path.join(dir, `${screen}.png`));
    const size = pngSize(raw);
    const rawUrl = `data:image/png;base64,${raw.toString("base64")}`;
    await page.setContent(html(rawUrl, size));
    await page.evaluate(async () => {
      await document.fonts.ready;
      await document.querySelector("img").decode();
    });
    const box = await page.locator("img").boundingBox();
    if (!box || box.width !== size.width || box.height !== size.height || box.x % 1 || box.y % 1)
      throw new Error(`${screen}: screenshot not placed at natural integer pixels`);
    const framed = await page.locator(".stage").screenshot({ animations: "disabled" });
    const file = path.join(dir, `${screen}-framed.png`);
    await writeFile(file, framed);

    // Compare framed interior with the raw capture, skipping only the
    // rounded-corner squares where the frame clip intentionally applies.
    const framedUrl = `data:image/png;base64,${framed.toString("base64")}`;
    const diff = await page.evaluate(async ({ rawUrl, framedUrl, x, y, r }) => {
      const load = async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
        const context = canvas.getContext("2d", { colorSpace: "srgb" });
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.naturalWidth, image.naturalHeight);
      };
      const [a, b] = await Promise.all([load(rawUrl), load(framedUrl)]);
      let compared = 0;
      let mismatched = 0;
      for (let row = 0; row < a.height; row++) {
        for (let col = 0; col < a.width; col++) {
          const nearX = col < r || col >= a.width - r;
          const nearY = row < r || row >= a.height - r;
          if (nearX && nearY) continue;
          const i = (row * a.width + col) * 4;
          const j = ((row + y) * b.width + col + x) * 4;
          compared++;
          if (a.data[i] !== b.data[j] || a.data[i + 1] !== b.data[j + 1] || a.data[i + 2] !== b.data[j + 2])
            mismatched++;
        }
      }
      return { compared, mismatched };
    }, { rawUrl, framedUrl, x: box.x, y: box.y, r: INNER_RADIUS });
    const output = pngSize(framed);
    console.log(JSON.stringify({
      screen,
      file: path.relative(process.cwd(), file),
      bytes: framed.length,
      output,
      imageBox: { x: box.x, y: box.y, width: box.width, height: box.height },
      interior: diff,
    }));
    if (diff.mismatched) throw new Error(`${screen}: framed interior differs from raw capture`);
  }
} finally {
  await browser.close();
}
