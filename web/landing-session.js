// Old invitation URLs keep credentials in the fragment, never an HTTP query.
if (new URLSearchParams(window.location.hash.slice(1)).has("invite")) {
  window.location.replace(`/login${window.location.hash}`);
} else {
  fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((session) => {
      if (!session?.authenticated) return;
      for (const link of document.querySelectorAll("[data-session-link]")) {
        link.textContent = "Open app";
        link.setAttribute("href", "/app");
      }
    })
    .catch(() => {}); // Sign-in links remain usable while offline.
}
