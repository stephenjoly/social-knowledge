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
  "index.html", "landing.css", "landing.js", "data.js",
  "assets/inter-latin-wght-normal.woff2", "assets/Inter-LICENSE.txt",
];
const source = await Promise.all(files.map(async (file) => ({
  file, content: await readFile(path.join(root, "designs/landing", file)),
})));
let stale = false;
for (const { file, content } of source) {
  const target = path.join(root, "site", file);
  if (check) {
    const current = await readFile(target).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!current?.equals(content)) {
      console.error(`Out of date: site/${file}`);
      stale = true;
    }
  } else {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
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
