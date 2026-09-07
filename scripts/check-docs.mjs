import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "AGENTS.md",
  "context.md",
  "ARCHITECTURE.md",
  "README.md",
  "SECURITY.md",
  "docs/product.md",
  "docs/engineering.md",
  "docs/development-workflow.md",
  "docs/deployment-model.md",
  "docs/exec-plans/README.md",
  "docs/tech-debt.md",
];

await Promise.all(requiredFiles.map((file) => access(file)));

const agents = await readFile("AGENTS.md", "utf8");
const missingLinks = requiredFiles
  .filter((file) => file !== "AGENTS.md" && !agents.includes(file));

if (missingLinks.length) {
  throw new Error(`AGENTS.md does not link to: ${missingLinks.join(", ")}`);
}

console.log(`Documentation harness OK (${requiredFiles.length} required files).`);
