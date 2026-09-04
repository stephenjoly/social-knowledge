import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parse, stringify } from "yaml";
import type { JobStore } from "./db.js";

export class LibraryPublisher {
  constructor(private readonly store: JobStore, private readonly vaultDir: string) {}

  async readCapture(captureId: string) {
    const capture = this.store.getCapture(captureId);
    if (!capture) return null;
    return readFile(this.safePath(capture.notePath), "utf8");
  }

  async refreshCapture(captureId: string) {
    const capture = this.store.getCapture(captureId);
    if (!capture) throw new Error("Capture not found");
    const destination = this.safePath(capture.notePath);
    const body = await readFile(destination, "utf8");
    const match = /^---\n([\s\S]*?)\n---\n/.exec(body);
    const properties = match ? (parse(match[1]!) as Record<string, unknown>) : {};
    const assignment = this.store.libraryAssignment(captureId);
    const breadcrumb = assignment ? this.store.libraryBreadcrumb(assignment.nodeId) : [];
    properties.library_node_id = assignment?.nodeId ?? null;
    properties.primary_breadcrumb = breadcrumb.map((node) => node.label);
    properties.library_node_ids = breadcrumb.map((node) => node.id);
    properties.classification_source = assignment?.assignedBy ?? "unclassified";
    properties.places = [capture.analysis.classification.country, capture.analysis.classification.city].filter(Boolean);
    const content = match ? body.slice(match[0].length) : body;
    await this.atomicWrite(destination, `---\n${stringify(properties, { lineWidth: 0 }).trimEnd()}\n---\n${content}`);
  }

  async readNode(nodeId: string) {
    const node = this.store.libraryNode(nodeId);
    if (!node) return null;
    return this.nodeMarkdown(node);
  }

  async regenerateAll() {
    const nodes = this.store.libraryTree();
    const root = path.join(this.vaultDir, "Social Knowledge");
    const maps = path.join(root, "Maps");
    const nextMaps = path.join(root, `.Maps-${randomUUID()}`);
    const previousMaps = path.join(root, `.Maps-previous-${randomUUID()}`);
    await mkdir(nextMaps, { recursive: true });
    const domains = nodes.filter((node) => node.parentId === null);
    const recent = this.store.listAllCaptures().slice(-10).reverse();
    const home = ["---", "type: social-knowledge-home", "generated: true", "---", "", "# Social Knowledge", "", "## Domains", "", ...domains.map((node) => `- [${node.label}](library:${node.id}) — ${node.captureCount} captures`), "", "## Recent captures", "", ...recent.map((capture) => `- [${capture.title}](capture:${capture.id})`), ""].join("\n");
    await this.atomicWrite(path.join(root, "Home.md"), home);
    for (const node of nodes) {
      const breadcrumb = this.store.libraryBreadcrumb(node.id);
      const relative = path.join(...breadcrumb.map((part) => part.label)) + ".md";
      await this.atomicWrite(path.join(nextMaps, relative), this.nodeMarkdown(this.store.libraryNode(node.id)!));
    }
    await rename(maps, previousMaps).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    await rename(nextMaps, maps);
    await rm(previousMaps, { recursive: true, force: true });
  }

  private nodeMarkdown(node: NonNullable<ReturnType<JobStore["libraryNode"]>>) {
    return [
      "---", `node_id: ${node.id}`, `node_type: ${node.kind}`, "generated: true", "---", "",
      `# ${node.label}`, "", node.breadcrumb.map((item) => item.label).join(" → "), "",
      "## Browse", "", ...(node.children.length ? node.children.map((child) => `- [${child.label}](library:${child.id}) — ${child.captureCount} captures`) : ["_No child categories._"]), "",
      "## Captures", "", ...(node.captures.length ? node.captures.map((capture) => `- [${capture.title}](capture:${capture.id}) — ${capture.platform}`) : ["_No captures assigned directly to this category._"]), "",
    ].join("\n");
  }

  private safePath(relative: string) {
    const root = path.resolve(this.vaultDir);
    const resolved = path.resolve(root, relative);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error("Unsafe note path");
    return resolved;
  }

  private async atomicWrite(destination: string, body: string) {
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.tmp`;
    await writeFile(temporary, body, "utf8");
    await rename(temporary, destination);
  }
}
