import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

interface PageProps {
  title: string;
  description: string;
  contentHtml: string;
  headings: Array<{ id: string; text: string; level: number }>;
  nav: Array<{ title: string; href: string; group: string }>;
  currentPath: string;
  previous: { title: string; href: string } | null;
  next: { title: string; href: string } | null;
}
interface Manifest {
  pages: Array<{
    slug: string;
    source: string;
    title: string;
    group: string;
    description: string;
  }>;
  assets: Array<{ source: string; target: string }>;
}
const moduleUrl = pathToFileURL(path.resolve("scripts/build-docs.mjs")).href;
const { buildDocs } = (await import(moduleUrl)) as {
  buildDocs: (options: {
    rootDir: string;
    outputDir: string;
    manifest: Manifest;
    renderPage: (props: PageProps) => string;
  }) => Promise<{ pages: number; assets: number }>;
};

describe("public documentation publication boundary", () => {
  let root: string;
  let output: string;
  let manifest: Manifest;
  let calls: PageProps[];
  const page = (slug: string, title: string) => ({
    slug,
    title,
    source: `guide/${slug || "index"}.md`,
    group: "Start",
    description: `${title} guide`,
  });
  const write = async (source: string, content: string) => {
    await mkdir(path.dirname(path.join(root, source)), { recursive: true });
    await writeFile(path.join(root, source), content);
  };
  const build = () =>
    buildDocs({
      rootDir: root,
      outputDir: output,
      manifest,
      renderPage: (props) => {
        calls.push(props);
        return `<!doctype html><title>${props.title}</title><main>${props.contentHtml}</main>`;
      },
    });
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "docs-build-"));
    output = path.join(root, "built");
    calls = [];
    manifest = {
      pages: [page("", "Overview"), page("start", "Start")],
      assets: [{ source: "images/demo.svg", target: "assets/demo.svg" }],
    };
    await write(
      "guide/index.md",
      "# Overview\n\n[Start](./start.md#install)\n\n![Demo](../images/demo.svg)\n",
    );
    await write("guide/start.md", "# Start\n\n## Install\n\nUse MCP.\n");
    await write("images/demo.svg", '<svg xmlns="http://www.w3.org/2000/svg"/>');
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("publishes only explicit pages/assets and generates navigation and searchable plain text", async () => {
    await write("docs/exec-plans/private.md", "PRIVATE EXECUTION PLAN");
    await write("guide/unlisted.md", "PRIVATE MANUAL");
    await write(".env", "PRIVATE CONFIGURATION");
    await mkdir(output);
    await writeFile(path.join(output, "stale-secret.txt"), "OLD BUNDLE");
    expect(await build()).toMatchObject({ pages: 2, assets: 1 });
    expect((await readdir(output, { recursive: true })).sort()).toEqual([
      "assets",
      "assets/demo.svg",
      "index.html",
      "search-index.json",
      "start",
      "start/index.html",
    ]);
    const html = await readFile(path.join(output, "index.html"), "utf8");
    expect(html).toContain('href="/docs/start/#install"');
    expect(html).toContain('src="/docs/assets/demo.svg"');
    expect(calls[0]).toMatchObject({
      currentPath: "/docs/",
      previous: null,
      next: { title: "Start", href: "/docs/start/" },
    });
    expect(calls[1]).toMatchObject({
      previous: { title: "Overview", href: "/docs/" },
      next: null,
      headings: [{ id: "install", text: "Install", level: 2 }],
    });
    expect(calls[0]?.nav).toHaveLength(2);
    const index = JSON.parse(
      await readFile(path.join(output, "search-index.json"), "utf8"),
    );
    expect(index[1]).toEqual({
      title: "Start",
      href: "/docs/start/",
      description: "Start guide",
      text: "Start\nInstall\nUse MCP.",
    });
    expect(JSON.stringify(index)).not.toMatch(/PRIVATE|OLD BUNDLE/);
  });

  it("renders safe Markdown/GFM with deterministic unique heading anchors", async () => {
    await write(
      "guide/start.md",
      '# Start\n\n## Café & **API**\n\n## Café API\n\n## Café API-1\n\n### !!!\n\n<script>alert("bad")</script>\n\n| Name | Value |\n| --- | --- |\n| MCP | yes |\n\n```html\n<img onerror="bad">\n```\n',
    );
    await write(
      "guide/index.md",
      "# Overview\n\n[Anchor](start.md#cafe-api-1-1)\n",
    );
    await build();
    expect(calls[1]?.headings.map((heading) => heading.id)).toEqual([
      "cafe-api",
      "cafe-api-1",
      "cafe-api-1-1",
      "section",
    ]);
    expect(calls[1]?.contentHtml).toContain("<table>");
    expect(calls[1]?.contentHtml).toContain("&lt;img onerror=");
    expect(calls[1]?.contentHtml).not.toContain("<script>");
    const headings = calls[1]?.headings;
    await build();
    expect(calls[3]?.headings).toEqual(headings);
  });

  it.each([
    ["[Hidden](./unlisted.md)", "Unpublished local link"],
    ["[Missing](start.md#missing)", "Unknown anchor"],
    ["[Missing](#missing)", "Unknown anchor"],
    ["[Source](/src/app.ts)", "Unpublished local link"],
    ["![Hidden](../images/private.png)", "Unpublished local image"],
    ["![Page][image]\n\n[image]: ./start.md", "Unpublished local image"],
    ["[Unsafe](javascript:alert%281%29)", "Unsafe URL"],
    ["[Unsafe](//evil.example/path)", "Unsafe URL"],
    ["[Malformed](start.md#%zz)", "Invalid URL encoding"],
    [
      "[Reference][hidden]\n\n[hidden]: ./unlisted.md",
      "Unpublished local link",
    ],
  ])(
    "rejects broken or unsafe publication URL: %s",
    async (markdown, message) => {
      await write("guide/index.md", `# Overview\n\n${markdown}\n`);
      await mkdir(output);
      await writeFile(
        path.join(output, "previous.txt"),
        "previous successful publication",
      );
      await expect(build()).rejects.toThrow(message);
      expect(await readFile(path.join(output, "previous.txt"), "utf8")).toBe(
        "previous successful publication",
      );
    },
  );

  it("resolves absolute docs links, relative sources, encoded anchors and query strings", async () => {
    await write(
      "guide/index.md",
      "# Overview\n\n[A](/docs/start#install) [B](./start.md?view=one#%69nstall) [App](/app) [Login](/login) [External](https://example.com/manual#install)\n",
    );
    await build();
    expect(calls[0]?.contentHtml).toContain('href="/docs/start/#install"');
    expect(calls[0]?.contentHtml).toContain(
      'href="/docs/start/?view=one#%69nstall"',
    );
    expect(calls[0]?.contentHtml).toContain('href="/app"');
    expect(calls[0]?.contentHtml).toContain('href="/login"');
    expect(calls[0]?.contentHtml).toContain(
      'href="https://example.com/manual#install"',
    );
  });

  it.each([
    "../escape",
    "/escape",
    "assets/../escape",
    "assets\\escape",
    "search-index.json",
    "start/index.html",
  ])("rejects unsafe/colliding asset target %s", async (target) => {
    manifest.assets[0]!.target = target;
    await expect(build()).rejects.toThrow(
      /Invalid output path|Duplicate or overlapping/,
    );
  });

  it("rejects source symlinks outside the repository", async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), "docs-outside-"));
    try {
      await writeFile(path.join(outside, "private.md"), "# Overview");
      await rm(path.join(root, "guide/index.md"));
      await symlink(
        path.join(outside, "private.md"),
        path.join(root, "guide/index.md"),
      );
      await expect(build()).rejects.toThrow("within the repository");
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("requires a single H1 matching manifest metadata", async () => {
    await write("guide/index.md", "# Wrong title\n");
    await expect(build()).rejects.toThrow("single Markdown H1");
    await write("guide/index.md", "# Overview\n\n# Overview\n");
    await expect(build()).rejects.toThrow("single Markdown H1");
  });
});
