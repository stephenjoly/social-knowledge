#!/usr/bin/env node
// Publish only the approved runtime assets, never design notes or private files.
import { readFile, writeFile, mkdir, unlink, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const check = process.argv.slice(2).includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check")) {
  throw new Error("Usage: node scripts/sync-landing-site.mjs [--check]");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const files = [
  "brand/LUCIDE-LICENSE.txt", "brand/favicon.svg", "brand/favicon.ico", "brand/apple-touch-icon.png", "brand/social-preview.png",
  "index.html", "landing.css", "landing.js", "data.js",
  "assets/inter-latin-wght-normal.woff2", "assets/Inter-LICENSE.txt",
];
const source = await Promise.all(files.map(async (file) => ({
  file, content: file === "index.html"
      ? Buffer.from((await readFile(path.join(root, "designs/landing", file), "utf8")).replaceAll("__PUBLIC_ORIGIN__", "https://stephenjoly.github.io/social-knowledge"))
      : await readFile(path.join(root, "designs/landing", file)),
})));
let stale = false;
for (const { file, content } of source) {
  const targets = [path.join(root, "site", file), ...(file.startsWith("brand/") ? [path.join(root, "web/public", file)] : [])];
  for (const target of targets) {
    if (check) {
      const current = await readFile(target).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (!current?.equals(content)) {
        console.error(`Out of date: ${path.relative(root, target)}`);
        stale = true;
      }
    } else {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
  }
}
for (const file of ["styles.css", "site.js"]) {
  const target = path.join(root, "site", file);
  if (check) {
    if (await access(target).then(() => true, (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    })) {
      console.error(`Obsolete landing asset: site/${file}`);
      stale = true;
    }
  } else {
    await unlink(target).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
}
if (stale) process.exitCode = 1;
else console.log(check ? "Public landing assets match the approved source." : "Public landing assets synchronized.");
