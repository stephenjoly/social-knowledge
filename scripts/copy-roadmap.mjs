import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const sourceDir = "docs/roadmap/2026-09-24";
const outputDir = "dist-ui";

await mkdir(outputDir, { recursive: true });
await Promise.all([
  copyFile(
    path.join(sourceDir, "roadmap-dashboard.html"),
    path.join(outputDir, "roadmap.html"),
  ),
  copyFile(path.join(sourceDir, "roadmap.md"), path.join(outputDir, "roadmap.md")),
]);
