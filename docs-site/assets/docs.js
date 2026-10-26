(() => {
  "use strict";
  const menu = document.querySelector("[data-docs-menu]");
  const sidebar = document.querySelector("[data-docs-sidebar]");
  const input = document.querySelector("[data-docs-search]");
  const results = document.querySelector("[data-docs-results]");
  const status = document.querySelector("[data-docs-search-status]");
  const theme = document.querySelector("[data-docs-theme]");
  let generation = 0;
  let timer;
  const setMenu = (open) => {
    menu?.setAttribute("aria-expanded", String(open));
    sidebar?.toggleAttribute("data-open", open);
  };
  menu?.addEventListener("click", () =>
    setMenu(menu.getAttribute("aria-expanded") !== "true"),
  );
  sidebar?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a"))
      setMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    ++generation;
    clearTimeout(timer);
    if (menu?.getAttribute("aria-expanded") === "true") {
      setMenu(false);
      menu.focus();
    }
    if (results) results.hidden = true;
    if (status) status.textContent = "";
  });

  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let preference;
  try {
    preference = localStorage.getItem("docs-theme");
  } catch {
    /* Storage may be disabled. */
  }
  if (!["light", "dark"].includes(preference)) preference = null;
  const applyTheme = () => {
    const value = preference ?? (system.matches ? "dark" : "light");
    document.documentElement.dataset.theme = value;
    theme?.setAttribute(
      "aria-label",
      `Switch to ${value === "dark" ? "light" : "dark"} theme`,
    );
    theme?.setAttribute("aria-pressed", String(value === "dark"));
  };
  applyTheme();
  system.addEventListener("change", applyTheme);
  theme?.addEventListener("click", () => {
    preference =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("docs-theme", preference);
    } catch {
      /* Theme still works without persistence. */
    }
    applyTheme();
  });

  if (!input || !results || !status) return;
  let indexPromise;
  const loadIndex = () =>
    (indexPromise ??= fetch("/docs/search-index.json", { credentials: "omit" })
      .then(async (response) => {
        if (!response.ok) throw new Error("search_unavailable");
        // Bound work even if a server sends an unexpected search index.
        const body = await response.text();
        if (body.length > 2_000_000) throw new Error("search_index_too_large");
        const data = JSON.parse(body);
        if (!Array.isArray(data) || data.length > 200)
          throw new Error("invalid_search_index");
        return data
          .filter(
            (item) =>
              item &&
              ["title", "href", "description", "text"].every(
                (key) => typeof item[key] === "string",
              ) &&
              /^\/docs\/(?:[a-z0-9-]+\/)*(?:#[\w-]+)?$/.test(item.href),
          )
          .map((item) => ({
            title: item.title.slice(0, 200),
            href: item.href,
            description: item.description.slice(0, 500),
            searchable:
              `${item.title} ${item.description} ${item.text.slice(0, 100_000)}`.toLocaleLowerCase(),
          }));
      })
      .catch((error) => {
        indexPromise = undefined;
        throw error;
      }));
  const search = async () => {
    const current = ++generation;
    const query = input.value.trim().slice(0, 120).toLocaleLowerCase();
    results.replaceChildren();
    results.hidden = true;
    status.textContent = "";
    if (query.length < 2) return;
    status.textContent = "Searching documentation…";
    try {
      const index = await loadIndex();
      if (current !== generation) return;
      const terms = query.split(/\s+/).slice(0, 8);
      const matches = index
        .filter((item) => terms.every((term) => item.searchable.includes(term)))
        .slice(0, 8);
      for (const item of matches) {
        const link = document.createElement("a");
        link.className = "docs-search-result";
        link.href = item.href;
        const title = document.createElement("span");
        title.className = "docs-search-title";
        title.textContent = item.title;
        const description = document.createElement("span");
        description.className = "docs-search-description";
        description.textContent = item.description;
        link.append(title, description);
        results.append(link);
      }
      results.hidden = matches.length === 0;
      status.textContent = matches.length
        ? `${matches.length} documentation result${matches.length === 1 ? "" : "s"}.`
        : "No matching documentation.";
    } catch {
      if (current === generation)
        status.textContent = "Search unavailable. Browse the navigation links.";
    }
  };
  input.addEventListener("input", () => {
    ++generation;
    clearTimeout(timer);
    timer = setTimeout(search, 120);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && !results.hidden) {
      const first = results.querySelector("a");
      if (first) {
        event.preventDefault();
        first.focus();
      }
    }
    if (event.key === "Escape") {
      ++generation;
      clearTimeout(timer);
    }
  });
})();
