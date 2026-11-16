import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const { renderDocsPage } = await import(
  pathToFileURL(path.resolve("docs-site/template.mjs")).href
);

describe("documentation template publication", () => {
  it("escapes metadata, navigation and outline text while preserving the rendered article's single H1", () => {
    const unsafe = '\"><script>alert("metadata")</script>&';
    const html: string = renderDocsPage({
      title: unsafe,
      description: unsafe,
      contentHtml:
        '<h1 id="guide">Guide</h1><h2 id="install">Install</h2><p>Safe rendered article.</p>',
      headings: [{ id: unsafe, text: unsafe, level: 2 }],
      nav: [{ title: unsafe, href: `/docs/start/?q=${unsafe}`, group: unsafe }],
      currentPath: "/docs/",
      previous: { title: unsafe, href: `/docs/previous/?q=${unsafe}` },
      next: { title: unsafe, href: `/docs/next/?q=${unsafe}` },
    });
    expect(html).toContain(
      "&lt;script&gt;alert(&quot;metadata&quot;)&lt;/script&gt;&amp;",
    );
    expect(html).not.toContain('<script>alert("metadata")</script>');
    expect(html).not.toContain(unsafe);
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain('<h1 id="guide">Guide</h1>');
    expect(html).toContain('<h2 id="install">Install</h2>');
    expect(html).toContain('href="/docs/start/?q=&quot;&gt;&lt;script&gt;');
    expect(html).toContain('href="#&quot;&gt;&lt;script&gt;');
  });
});
