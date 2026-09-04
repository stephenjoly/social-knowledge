const repository = document.documentElement.dataset.repository;
const inferredRepository = location.hostname.endsWith("github.io")
  ? `https://github.com/${location.hostname.split(".")[0]}/${location.pathname.split("/").filter(Boolean)[0] || "social-knowledge"}`
  : "https://github.com/stephenjoly/social-knowledge";

for (const link of document.querySelectorAll("[data-repo-link]")) {
  link.href = repository || inferredRepository;
}
