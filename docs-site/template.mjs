function requireString(value, name) {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
}

function requireItem(item, fields, name) {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`${name} must be an object`);
  }
  for (const field of fields) {
    requireString(item[field], `${name}.${field}`);
  }
}

function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

const icons = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
};
const icon = (name, className = "") =>
  `<svg class="docs-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

export function renderDocsPage({
  title,
  description,
  contentHtml,
  headings,
  nav,
  currentPath,
  previous,
  next,
}) {
  for (const [name, value] of Object.entries({
    title,
    description,
    contentHtml,
    currentPath,
  })) {
    requireString(value, name);
  }
  if (!Array.isArray(headings)) throw new Error("headings must be an array");
  if (!Array.isArray(nav)) throw new Error("nav must be an array");
  for (const [index, heading] of headings.entries()) {
    requireItem(heading, ["id", "text"], `headings[${index}]`);
    if (heading.level !== 2 && heading.level !== 3) {
      throw new Error(`headings[${index}].level must be 2 or 3`);
    }
  }
  for (const [index, item] of nav.entries()) {
    requireItem(item, ["title", "href", "group"], `nav[${index}]`);
  }
  for (const [name, item] of Object.entries({ previous, next })) {
    if (item !== null) requireItem(item, ["title", "href"], name);
  }

  let lastGroup;
  const navigation = nav
    .map((item) => {
      const group =
        item.group !== lastGroup
          ? `<p class="docs-nav-group">${escapeHtml(item.group)}</p>`
          : "";
      lastGroup = item.group;
      return `${group}<a class="docs-nav-link" href="${escapeHtml(item.href)}"${item.href === currentPath ? ' aria-current="page"' : ""}>${escapeHtml(item.title)}</a>`;
    })
    .join("\n");
  const pager = (item, direction, relation) =>
    item === null
      ? ""
      : `<a class="docs-pager-link" href="${escapeHtml(item.href)}" rel="${relation}"><span class="docs-pager-direction">${direction}</span><span>${escapeHtml(item.title)}</span>${icon("arrow")}</a>`;
  const outline =
    headings.length === 0
      ? ""
      : `<nav class="docs-outline" aria-label="On this page">
      <p class="docs-outline-label">On this page</p>
      ${headings.map((heading) => `<a class="docs-outline-link" href="#${escapeHtml(heading.id)}" data-level="${heading.level}">${escapeHtml(heading.text)}</a>`).join("\n")}
    </nav>`;
  const overview = currentPath === "/docs/";
  const introduction = contentHtml.replace(
    /(<h1\b[^>]*>.*?<\/h1>)/s,
    (_, heading) =>
      `<header class="docs-article-head">${heading}<p class="docs-lede">${escapeHtml(description)}</p></header>`,
  );
  const start =
    overview && next
      ? `<div class="docs-start"><a class="docs-primary" href="${escapeHtml(next.href)}">${escapeHtml(next.title)}${icon("arrow")}</a><a href="#choose-a-guide">Browse guides</a></div>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Social Knowledge docs</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="color-scheme" content="light dark">
  <link rel="icon" type="image/svg+xml" href="/docs/assets/social-knowledge-mark.svg">
  <link rel="preload" href="/docs/assets/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/docs/assets/docs.css">
  <script src="/docs/assets/docs.js" defer></script>
</head>
<body>
  <a class="docs-skip" href="#docs-content">Skip to content</a>
  <div class="docs-shell${overview ? " docs-overview" : ""}">
    <header class="docs-topbar">
      <div class="docs-brand-group">
        <button type="button" class="docs-menu docs-icon-button" data-docs-menu aria-label="Toggle documentation menu" aria-controls="docs-sidebar" aria-expanded="false">${icon("menu")}</button>
        <a class="docs-brand" href="/"><img class="docs-brand-mark" alt="" width="28" height="28" src="/docs/assets/social-knowledge-mark.svg"><span class="docs-brand-name">Social Knowledge</span></a>
      </div>
      <div class="docs-search" role="search">
        <label class="docs-visually-hidden" for="docs-search">Search documentation</label>
        ${icon("search")}
        <input id="docs-search" class="docs-search-input" type="search" data-docs-search aria-controls="docs-search-results" autocomplete="off" placeholder="Search documentation" maxlength="120">
        <kbd class="docs-search-key" aria-hidden="true">Ctrl K</kbd>
        <div class="docs-search-results" id="docs-search-results" data-docs-results hidden></div>
        <p class="docs-search-status" data-docs-search-status role="status" aria-live="polite"></p>
      </div>
      <div class="docs-header-actions">
        <a class="docs-home-link" href="/">Website</a>
        <button type="button" class="docs-theme docs-icon-button" data-docs-theme aria-label="Switch to dark theme" aria-pressed="false">${icon("sun", "docs-theme-sun")}${icon("moon", "docs-theme-moon")}</button>
        <a class="docs-app-link" href="/app">Open app${icon("arrow")}</a>
      </div>
    </header>
    <div class="docs-frame">
      <aside class="docs-sidebar" id="docs-sidebar" data-docs-sidebar><a class="docs-section-link" href="/docs/">Documentation</a><nav aria-label="Documentation">${navigation}</nav><a class="docs-sidebar-app" href="/app">Open app${icon("arrow")}</a></aside>
      <main class="docs-main" id="docs-content" tabindex="-1">
        <article class="docs-content">${overview ? introduction.replace("</header>", () => `</header>${start}`) : introduction}</article>
        <nav class="docs-pager" aria-label="Adjacent guides">${pager(previous, "Previous", "prev")}${pager(next, "Next", "next")}</nav>
        <footer class="docs-footer"><span>Social Knowledge documentation</span><a class="docs-repo-link" href="https://github.com/stephenjoly/social-knowledge">View on GitHub${icon("arrow")}</a></footer>
      </main>
      ${outline}
    </div>
  </div>
</body>
</html>`;
}
