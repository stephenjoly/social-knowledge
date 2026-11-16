---
version: 1
slug: "docs-site-template-mjs"
primary_target: "docs-site/template.mjs"
related_targets: ["docs-site/assets/docs.css","docs-site/assets/docs.js"]
---

# Documentation reader

Mode: Read. Target: /docs/, nine user/operator guides. Audience: people setting
up or using their private archive. Success: arrive from homepage Docs, find a
guide, read it comfortably, and return to the application.

Approved 2026-11-15: Vowen-inspired reading structure, homepage navbar Docs entry
only, same origin, local search, mobile navigation, light/dark. No new service,
dependency, dashboard redesign, or deployment. Existing guide text and synthetic
October screenshot assets supply the content; update verified stale guidance.

## Direction contract

THESIS: Calm, navigable project documentation. Search and route labels provide
orientation while the article carries the page; no marketing hero or dashboard
decoration inside the reading surface.

OWN-WORLD: Preserve Social Knowledge's book mark, Inter, warm #f7f4ee paper,
#26322b forest actions, #2f5d40 links and quiet hairlines. The docs-only dark theme
uses forest-tinted surfaces and warm text. Use the requested reference's reading
structure without its branding or content.

STORY: The visitor sees Overview and a Getting started action, chooses one of
nine guides, follows its outline or searches, then opens the application.

FIRST VIEWPORT: Sticky 76px header with brand left, search centred, Website,
theme toggle and Open app right. Three columns: grouped 216px sidebar, up to
740px article, 180px outline. H1 at 32–40px; lede 18px; body 15px. On phones,
search uses a second header row and an accessible inline menu expands above the
article. No horizontal document overflow at 320px.

FORM: Precise user-pinned Vowen-like reader inside an established brand;
code-led implementation, no concept round. Seed: none (narrow reference request).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verification

One early Overview render; final desktop/mobile/light/dark comparison. Full
npm run check, five Playwright docs journeys, publication/auth boundaries, local
search success/empty/error and keyboard use. Existing rasters unchanged with
provenance in docs/screenshots/README.md. No new shipping raster is generated.
