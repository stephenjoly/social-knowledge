// Re-render public brand assets from the existing mark and self-hosted typeface.
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const brand = new URL("designs/landing/brand/", root);
const svg = await readFile(new URL("favicon.svg", brand), "utf8");
const font = (await readFile(new URL("designs/landing/assets/inter-latin-wght-normal.woff2", root))).toString("base64");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const icon = async (size) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
    return page.screenshot({ omitBackground: true });
  };
  await writeFile(new URL("apple-touch-icon.png", brand), await icon(180));
  const png = await icon(32);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header[6] = 32; header[7] = 32;
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  await writeFile(new URL("favicon.ico", brand), Buffer.concat([header, png]));
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<!doctype html><style>
    @font-face{font-family:Inter;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:100 900}
    *{box-sizing:border-box}body{margin:0;background:#F7F4EE;color:#26322B;font-family:Inter;padding:64px 80px}
    .brand{display:flex;align-items:center;gap:20px;font-size:32px;font-weight:600;letter-spacing:-.64px}
    .brand svg{width:64px;height:64px;flex:none}
    h1{font-size:100px;font-weight:700;line-height:1.02;letter-spacing:-3px;margin:54px 0 30px}
    p{font-size:26px;line-height:1.45;color:#3F3F46;margin:0;max-width:860px}
    </style><div class="brand">${svg}<span>Social Knowledge</span></div>
    <h1>Keep what<br>you save.</h1>
    <p>A private library for the videos you save.<br>Searchable, readable and linked to the original.</p>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: new URL("social-preview.png", brand).pathname });
} finally { await browser.close(); }
console.log("Brand icons and 1200×630 link preview rendered.");
