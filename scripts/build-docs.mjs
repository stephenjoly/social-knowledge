import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  copyFile,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pageHref = (slug) => `/docs/${slug ? `${slug}/` : ""}`;
const plainText = (node) =>
  node.type === "html"
    ? ""
    : typeof node.value === "string"
      ? node.value
      : (node.alt ?? (node.children ?? []).map(plainText).join(""));
function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}
function relativePath(value, label) {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\\") ||
    value.split("/").some((part) => !part || part === "." || part === "..") ||
    /[?#\x00-\x1f]/.test(value) ||
    path.isAbsolute(value)
  ) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}
async function inputFile(root, source) {
  relativePath(source, "source path");
  const resolved = await realpath(path.join(root, source));
  if (
    !resolved.startsWith(`${root}${path.sep}`) ||
    !(await stat(resolved)).isFile()
  ) {
    throw new Error(`Source must be a file within the repository: ${source}`);
  }
  return resolved;
}
function headingPlugin(page) {
  return () => (tree) => {
    const used = new Set();
    page.headings = [];
    page.ids = new Set();
    page.h1 = [];
    walk(tree, (node) => {
      if (node.type !== "heading") return;
      const text = plainText(node);
      const base =
        text
          .normalize("NFKD")
          .replace(/\p{M}/gu, "")
          .toLowerCase()
          .replace(/[^\p{L}\p{N}_\s-]/gu, "")
          .trim()
          .replace(/\s+/g, "-") || "section";
      let id = base;
      for (let suffix = 1; used.has(id); suffix++) id = `${base}-${suffix}`;
      used.add(id);
      page.ids.add(id);
      node.data = {
        ...node.data,
        hProperties: { ...node.data?.hProperties, id },
      };
      if (node.depth === 1) page.h1.push(text);
      if (node.depth === 2 || node.depth === 3)
        page.headings.push({ id, text, level: node.depth });
    });
    page.text = (tree.children ?? []).map(plainText).join("\n");
  };
}
function renderMarkdown(page, extraPlugins = []) {
  return renderToStaticMarkup(
    createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm, headingPlugin(page), ...extraPlugins],
      skipHtml: true,
      children: page.markdown,
    }),
  );
}

/** Build only explicit public inputs. renderPage injection keeps fixtures independent of the visual shell. */
export async function buildDocs({
  rootDir = process.cwd(),
  outputDir = path.join(rootDir, "dist-ui/docs"),
  manifest: suppliedManifest,
  renderPage,
} = {}) {
  const root = await realpath(rootDir);
  const output = path.resolve(outputDir);
  if (output === root || root.startsWith(`${output}${path.sep}`))
    throw new Error("Unsafe docs output directory");
  const manifest =
    suppliedManifest ??
    JSON.parse(
      await readFile(path.join(root, "docs-site/manifest.json"), "utf8"),
    );
  if (
    !Array.isArray(manifest.pages) ||
    !manifest.pages.length ||
    !Array.isArray(manifest.assets)
  ) {
    throw new Error("Docs manifest requires pages and assets arrays");
  }
  const sources = new Map();
  const urls = new Map();
  const outputs = new Set(["search-index.json"]);
  const reserve = (target) => {
    relativePath(target, "output path");
    if (
      outputs.has(target) ||
      [...outputs].some(
        (other) =>
          target.startsWith(`${other}/`) || other.startsWith(`${target}/`),
      )
    ) {
      throw new Error(`Duplicate or overlapping docs output: ${target}`);
    }
    outputs.add(target);
  };
  const pages = [];
  for (const entry of manifest.pages) {
    if (
      typeof entry.slug !== "string" ||
      (entry.slug !== "" &&
        !/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(
          entry.slug,
        ))
    ) {
      throw new Error(`Invalid docs slug: ${entry.slug}`);
    }
    for (const key of ["title", "description", "group"]) {
      if (typeof entry[key] !== "string" || !entry[key].trim())
        throw new Error(`Missing page ${key}`);
    }
    const target = entry.slug ? `${entry.slug}/index.html` : "index.html";
    reserve(target);
    const sourceFile = await inputFile(root, entry.source);
    if (sources.has(entry.source))
      throw new Error(`Duplicate docs source: ${entry.source}`);
    const page = {
      ...entry,
      target,
      href: pageHref(entry.slug),
      markdown: await readFile(sourceFile, "utf8"),
    };
    renderMarkdown(page);
    if (page.h1.length !== 1 || page.h1[0] !== page.title)
      throw new Error(
        `Page title must equal its single Markdown H1: ${entry.source}`,
      );
    sources.set(entry.source, page);
    urls.set(page.href, page);
    pages.push(page);
  }
  if (!urls.has("/docs/"))
    throw new Error("Docs manifest requires an overview with empty slug");
  const assets = [];
  for (const asset of manifest.assets) {
    reserve(asset.target);
    const sourceFile = await inputFile(root, asset.source);
    if (sources.has(asset.source))
      throw new Error(`Duplicate docs source: ${asset.source}`);
    const item = { ...asset, sourceFile, href: `/docs/${asset.target}` };
    sources.set(asset.source, item);
    urls.set(item.href, item);
    assets.push(item);
  }
  function resolveLink(page, value, image) {
    if (typeof value !== "string" || /[\x00-\x20\\]/.test(value))
      throw new Error(`Invalid URL in ${page.source}: ${value}`);
    if (/^(?:https?:\/\/|mailto:|tel:)/i.test(value)) {
      if (image && !/^https?:\/\//i.test(value))
        throw new Error(`Invalid image URL: ${value}`);
      return value;
    }
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value))
      throw new Error(`Unsafe URL in ${page.source}: ${value}`);
    let parsed;
    try {
      parsed = new URL(value, "https://docs.invalid/");
    } catch {
      throw new Error(`Invalid URL: ${value}`);
    }
    let pathname;
    let anchor;
    try {
      pathname = decodeURIComponent(parsed.pathname);
      anchor = decodeURIComponent(parsed.hash.slice(1));
    } catch {
      throw new Error(`Invalid URL encoding: ${value}`);
    }
    if (/[\\\x00-\x1f]/.test(pathname))
      throw new Error(`Invalid local URL: ${value}`);
    const rawPath = value.split(/[?#]/)[0];
    let item;
    if (!rawPath) item = page;
    else if (rawPath.startsWith("/")) {
      if (!image && ["/app", "/login"].includes(pathname)) return value;
      item = urls.get(pathname) ?? urls.get(`${pathname}/`);
    } else {
      let decoded;
      try {
        decoded = decodeURIComponent(rawPath);
      } catch {
        throw new Error(`Invalid URL encoding: ${value}`);
      }
      const source = path.posix.normalize(
        path.posix.join(path.posix.dirname(page.source), decoded),
      );
      item = sources.get(source);
    }
    if (!item || (image && !item.sourceFile))
      throw new Error(
        `Unpublished local ${image ? "image" : "link"} in ${page.source}: ${value}`,
      );
    if (anchor && item.ids && !item.ids.has(anchor))
      throw new Error(`Unknown anchor in ${page.source}: ${value}`);
    return `${item.href}${parsed.search}${parsed.hash}`;
  }
  const nav = pages.map(({ title, href, group }) => ({ title, href, group }));
  const rendered = [];
  // Validate all publication links before replacing a previously successful bundle.
  for (const [index, page] of pages.entries()) {
    const contentHtml = renderMarkdown(page, [
      () => (tree) => {
        const imageReferences = new Set();
        walk(tree, (node) => {
          if (node.type === "imageReference")
            imageReferences.add(node.identifier);
        });
        walk(tree, (node) => {
          if (["link", "image", "definition"].includes(node.type))
            node.url = resolveLink(
              page,
              node.url,
              node.type === "image" ||
                (node.type === "definition" &&
                  imageReferences.has(node.identifier)),
            );
        });
      },
    ]);
    rendered.push({
      page,
      props: {
        title: page.title,
        description: page.description,
        contentHtml,
        headings: page.headings,
        nav,
        currentPath: page.href,
        previous: index
          ? { title: pages[index - 1].title, href: pages[index - 1].href }
          : null,
        next:
          index + 1 < pages.length
            ? { title: pages[index + 1].title, href: pages[index + 1].href }
            : null,
      },
    });
  }
  const renderer =
    renderPage ??
    (
      await import(
        pathToFileURL(path.join(root, "docs-site/template.mjs")).href
      )
    ).renderDocsPage;
  if (typeof renderer !== "function")
    throw new Error("Docs template must export renderDocsPage");
  const documents = rendered.map(({ page, props }) => ({
    target: page.target,
    html: renderer(props),
  }));
  if (documents.some(({ html }) => typeof html !== "string"))
    throw new Error("Docs renderer must return HTML strings");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const { target, html } of documents) {
    const destination = path.join(output, target);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, html);
  }
  for (const asset of assets) {
    const destination = path.join(output, asset.target);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(asset.sourceFile, destination);
  }
  const searchIndex = pages.map(({ title, href, description, text }) => ({
    title,
    href,
    description,
    text,
  }));
  await writeFile(
    path.join(output, "search-index.json"),
    `${JSON.stringify(searchIndex)}\n`,
  );
  return { pages: pages.length, assets: assets.length, outputDir: output };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const result = await buildDocs();
  console.log(
    `Built ${result.pages} public documentation pages and ${result.assets} assets.`,
  );
}
