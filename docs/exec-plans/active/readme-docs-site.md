# Short README and public documentation site
Status: active; approved by Stephen on 2026-10-21.
Owner: Codex foreman
Date: 2026-10-21
Workspace: wks_9f559aba7544e83d
Current branch: codex/docs-reader, created from origin/staging on 2026-10-21.
Prior README/guide checkpoint shipped through #61 and release #62.

## Outcome
Stephen explicitly requested continuing the unfinished website on a separate
branch on 2026-10-21. The previously approved reader scope and frozen interface
below still apply; the proposed stock-theme alternative was never selected.

README becomes a one-minute introduction: what Social Knowledge does, who it is for, a short feature list, clear setup path, and links to fuller guides. Full documentation becomes a browsable static website at /docs/ on the existing application origin, intended production URL https://social-knowledge.stephenjoly.net/docs/ after accepted deployment.

## README and docs screens
README: existing product logo, concise explanation, one framed hero screenshot, short feature list, prerequisites and honest minimal Docker getting-started steps, documentation links. Keep other framed screenshots available in a compact optional gallery or product guide. Aim roughly 300–450 words, excluding commands. Preserve essential first-admin/privacy cautions near setup.
Docs: documentation overview; Getting started; Capture and Apple Shortcuts; Library and Ask; Settings/AI/languages; Agent API and MCP; Self-hosting/storage/backups; Security; Development. Migrate detailed README content into topic Markdown pages. Preserve all substantive technical guidance, repair links and old README section destinations where practical. Avoid duplicate maintained copies.
Docs UI: product logo, sidebar, current-page heading outline, code blocks, local search, mobile navigation, readable light/dark themes, links back to app/project. Consistent existing brand; no dashboard redesign.

## Build and hosting
Generate static HTML and a local search index from an explicit public-document manifest during npm run build. Reuse the existing Markdown/React toolchain where practical; no separate server or runtime database. Package output in dist-ui/docs and include source/build inputs in Docker. /docs and nested routes work anonymously, without affecting /login, /app, APIs, OAuth or MCP. Publish only explicitly listed content/assets, never the entire repository docs tree or execution plans.
Use the existing Dokploy release path. No DNS changes, separate docs subdomain, production deployment or merge in this implementation. Existing GitHub Pages landing remains as-is. Production URL becomes live only after authorized staging/release promotion.

## Worker ownership
Three bounded workers in this same workspace: GPT-6.1 medium for README/content migration; GPT-6.1 medium for build/routing/tests; Opus 5.5 high for documentation UI assets/templates. Disjoint file ownership and template/build contracts established before edits. Parent handles integration, checks, commit/push and PR updates.

## Acceptance
README is concise and gives a working start path. Every former technical section has a mapped docs destination. Docs build automatically from Markdown, search finds relevant guides, all local links/assets/anchors work, code blocks remain readable, desktop/mobile navigation works. Anonymous docs access succeeds; authenticated/private routes retain behavior. Only allowlisted public content is packaged. Focused routing/build tests plus npm run check and synthetic browser smoke pass. Review one preview URL with walkthrough: README -> Getting started -> search MCP -> hosting/security. Update execution plan/context/architecture/deployment docs to reflect final implementation.

## Scope boundaries
No data/schema changes, external search service, analytics, new domain, app UI redesign, live provider calls, credential access, or production release. Continue existing draft PR unless its state changes; do not merge it automatically.

## Progress
- [x] Scope approved and repository boundaries inspected.
- [x] README and content migration (376 words; 9 guides; source-verified corrections).
- [x] Static build, public route, and focused tests (25 pass with fixture renderer; production template/CSS pending).
- [ ] Documentation visual shell and mobile navigation.
- [ ] Integrated build, browser acceptance, and final review.
- [ ] Commit, push, update draft PR and verify CI.

## Integration checkpoint — 2026-10-21
Content migration is independently ready for the existing draft PR. Only README.md
and the nine docs/guide Markdown files are included in that checkpoint; the
unfinished website integration remains local. Parent review passed TypeScript,
the documentation harness, and whitespace checks. Build worker validated all
nine real guides and eight available assets using a fixture renderer and an
in-memory omission of the absent CSS; this is not a production site build.
Content checkpoint 9e033b5d9e5c93e0e2628cce9dbfd1c5c93b0694 was pushed to
codex/readme-showcase and draft PR #61 was updated with the current scope and
remaining blocker. The unfinished integration paths are intentionally uncommitted.
GitHub CI passed for 9e033b5 (run 39625649287); no merge or deployment performed.

### Subsequent authorized promotion
Stephen then requested promotion to main and a check for other staging work.
Before #61, staging and main had identical file contents. #61 merged to staging
as 034ac716a46eb5f0bbf064a6b6426cdf9c2f9494; combined staging CI, exact Dokploy
deployment, public smoke, and synthetic browser login/Inbox passed. Fresh online
production SQLite backup passed integrity/foreign-key checks and the current
production image was retained for rollback. Release #62 passed CI and source
policy and merged to main as c793d3405461b9a46bd26c3a6a6d82c0456288da. Only the
completed README/guide/screenshot checkpoint was promoted; all website integration
paths remain local. Production verification is recorded on release PR #62.
No unrelated open PR was merged. Continue website work on a fresh task branch
from staging while preserving these local changes; do not reuse the closed PR.

The assigned Opus designer hit its session limit, reported to reset at 13:50
America/Toronto. docs-site/template.mjs and docs-site/assets/docs.css are missing.
Stephen has been asked whether to use a standard documentation theme (potential
build dependency) now or retain custom Opus styling after reset; no choice has
been received. Do not substitute a custom design from another model, push the
incomplete build wiring, or claim full check/browser acceptance has passed.

## Shared worker brief and file ownership
Content worker: README.md and docs/guide/*.md ONLY.
Build worker: scripts/build-docs.mjs, docs-site/assets/docs.js, src/app.ts, package.json, Dockerfile, test/docs-site.test.ts, test/docs-build.test.ts ONLY. No new packages/lock changes.
Design worker: docs-site/template.mjs and docs-site/assets/docs.css ONLY.
Parent: docs-site/manifest.json, context.md, ARCHITECTURE.md, docs/deployment-model.md, this plan and integration/browser verification scripts.
No worker switches branches, commits, pushes, deploys, installs dependencies or delegates. Use current workspace wks_9f559aba7544e83d. Parent runs full checks and builds after integration; workers run focused checks without competing full builds.

## Build/template contract (frozen for parallel work)
Manifest docs-site/manifest.json contains pages [{slug,source,title,group,description}] and assets [{source,target}]. slug empty means /docs/; other pages /docs/{slug}/. Outputs under dist-ui/docs, index.html per page; assets target relative to docs root. Only listed pages/assets plus generated search-index.json are published. No recursive docs directory copying.
Design template exports renderDocsPage({title,description,contentHtml,headings,nav,currentPath,previous,next}) returning complete HTML. contentHtml already sanitized/rendered by ReactMarkdown; contains the page H1. Template escapes all other strings. headings=[{id,text,level}] (h2/h3); nav=[{title,href,group}]; currentPath canonical /docs/.../; previous/next null or {title,href}. Template should not add duplicate H1. Assets /docs/assets/docs.css, /docs/assets/docs.js, /docs/assets/social-knowledge-mark.svg, /docs/assets/inter-latin-wght-normal.woff2. App link /app; repository https://github.com/stephenjoly/social-knowledge.
Backend-owned browser behavior uses these design selectors: data-docs-menu toggle button (aria-controls=docs-sidebar, aria-expanded); data-docs-sidebar sidebar id=docs-sidebar; data-docs-search search input; data-docs-results results container hidden by default; data-docs-search-status aria-live status; optional data-docs-theme button. JS toggles sidebar data-open and aria-expanded, sets root data-theme=light|dark, honors system default. Search index is [{title,href,description,text}] loaded from /docs/search-index.json. Search renders .docs-search-result links with .docs-search-title and .docs-search-description spans via textContent; status via textContent; no innerHTML of user input. CSS must respect [hidden]. Keyboard escape closes menu/search.
Content files use ordinary Markdown headings and relative .md links, e.g. ./getting-started.md, and ../screenshots/inbox-framed.png. Builder resolves public page/asset links against manifest, preserving anchors, and fails broken local publication links. Links to deliberately external repo manuals/code can use explicit https GitHub links. No arbitrary raw HTML rendering. Generate stable duplicate-safe heading anchors. Page title in metadata equals Markdown H1.
Node22 environment: rtk proxy env PATH=/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin ... . Dependencies and Chromium already installed. Default Node26 cannot run Node22-built native sqlite.
Existing logo and framed screenshots are final; no modifications. No design frame IDs: this is a new docs surface matching current app brand.

## Content preservation map
Content worker reports every former README heading and its destination in final response; parent records mapping here for review. Canonical source before migration is git show 8bfc96d:README.md. README brief should link public docs plus repository guide sources as fallback until release; do not imply /docs is already deployed.

## Risks and recovery
Publishing unintended files is prevented by explicit manifest and packaging tests. Public docs must not weaken /app authentication; add route regression tests. Build failure prevents shipping an incomplete docs bundle. Revert task commits to restore prior README and build if necessary; no persistent-data migration is involved.

## Content migration evidence

All 19 former README sections have mapped guide destinations; all 30 original configuration identifiers and 11 explicit route examples remain present. The content worker verified 32 local links/assets/anchors.

```json
{
  "Turn saved reels into knowledge you can actually use.": "README.md introduction; docs/guide/library-and-ask.md introduction",
  "Find the clip you meant to come back to": "docs/guide/library-and-ask.md#find-the-clip-you-meant-to-come-back-to",
  "Keep the useful parts and the original source": "docs/guide/library-and-ask.md#keep-the-useful-parts-and-the-original-source",
  "Ask your archive, then follow the sources": "docs/guide/library-and-ask.md#ask-your-archive-then-follow-the-sources",
  "How it works": "docs/guide/index.md#how-it-works",
  "Pipeline": "docs/guide/capture.md#pipeline",
  "Requirements": "docs/guide/getting-started.md#requirements",
  "Safe first test": "docs/guide/getting-started.md#safe-first-test; provider details \u2192 settings.md; encryption \u2192 self-hosting.md; Ask context \u2192 library-and-ask.md; comments \u2192 capture.md",
  "Local development": "docs/guide/development.md; navigation \u2192 library-and-ask.md; language \u2192 settings.md",
  "Non-production demo accounts": "docs/guide/development.md#non-production-demo-accounts; following failure/language paragraphs \u2192 library-and-ask.md/settings.md",
  "API": "docs/guide/api-and-mcp.md#api; complete library backup \u2192 self-hosting.md#portable-library-backups",
  "Accounts and invitations": "docs/guide/settings.md#accounts-and-invitations",
  "ChatGPT and Codex via MCP": "docs/guide/api-and-mcp.md#chatgpt-and-codex-via-mcp",
  "Apple Shortcut contract": "docs/guide/capture.md#apple-shortcut-contract",
  "Dokploy": "docs/guide/self-hosting.md#dokploy (remote access, encryption, social connections, notifications, legacy helper subsections)",
  "Storage": "docs/guide/self-hosting.md#storage",
  "Security boundaries": "docs/guide/security.md#security-boundaries",
  "Agent browser QA": "docs/guide/development.md#agent-browser-qa",
  "Guided Shortcut setup": "docs/guide/capture.md#guided-shortcut-setup"
}
```

## Current blocker

The Opus design worker hit its session usage limit, resetting at 1:50 p.m. Toronto time. No production docs template/CSS was created. User choice is pending between a standard prebuilt docs theme now (potential build dependency) and custom styling after reset. Build/routing and content work continue independently; no alternative is implemented without the choice.
