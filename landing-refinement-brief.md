# Unfold refinement — real product and getting started

Status: approved under Stephen's continuing authorization to use judgment and build. User likes current visual direction and motion; requests grounding in real app, Get started CTA, server setup instructions, and visible Apple Shortcut download/setup.

## One-page scope

Retain accepted Unfold aesthetic and useful motion. Replace invented Recipe/Workout/Travel output templates with the actual application's Inbox and capture-detail UI, using screenshots of the running React app populated only with synthetic fixtures. Everyday input scenarios may remain illustrations, but must not imply dedicated recipe/workout/travel modes, fields, or templates exist. Explain real outcomes: synopsis, original transcript, topics, recommendations/evidence, preserved source, private library and Ask. Simplify/remodel existing example and search sections rather than appending a second website.

Primary CTA becomes **Get started**, taking visitors to a concrete setup section. Local sample search is secondary ('Explore a sample library'), never the acquisition goal. Self-hosting is current launch path; do not invent hosted registration. Explain Docker + checkout/configuration + start, first administrator, account AI setup, then Apple Shortcut. Use the actual README command `docker compose up --build -d`, with visible prerequisites and link to complete setup docs; do not invent curl installer or execute server installation. Clearly state self-hosted and bring-your-own provider key. No pricing promises.

Give Apple Shortcut its own clear section: download token-free signed v6 completion template, create capture-only key in app Settings → API keys, copy/paste during import, share a Reel from iPhone, receipt vs completion. Crucial current limitation: bundled signed file points at `social-knowledge.stephenjoly.net`. Do not imply universal server support. Link to custom-server generator instructions in README/shortcuts docs. No key creation or real capture from landing page.

## Ownership and contracts

- Opus 5.5 High UI worker owns `designs/landing/index.html`, `landing.css`, `landing.js`, `data.js`, `README.md` and optional local illustration assets excluding reserved `assets/app-*.png`. Read other files; no app/source, manifests, scripts, git operations or delegation.
- Codex 6.1 Sol Medium evidence worker owns only `designs/landing/assets/app-inbox.png`, `app-capture.png`, `app-shortcut.png`, and `app-evidence.md`. Capture actual running app UI with synthetic data only. Never open production account/library, keys, cookies, or real storage. Temporary harness belongs in ignored output or /tmp, not app code. Include reproducible provenance/limits. Use own isolated browser and local QA service, not parent or Opus browser. Do not edit UI files or delegate.
- Image URLs are `assets/app-inbox.png`, `assets/app-capture.png`, `assets/app-shortcut.png`; label 'Actual app · sample data'. At least Inbox + capture detail should be prominent and legible on desktop, with accessible mobile presentation.
- Foreman owns this brief, execution plan, hosting, checks, git checkpoint and PR #49 update. Workspace `wks_4d5154f1b923fb81`, existing branch `codex/consumer-landing-unfold`. Existing static preview port41006, root `designs/landing/`; do not stop it.

## Acceptance

Get started buttons arrive at usable setup; commands copy with feedback/fallback; repo/README/Shortcut download links real; no invented installer; custom endpoint caveat adjacent to download. No fake structured modes. Real app screens accurately labeled and readable; existing accepted visual character/motion preserved. Desktop/mobile overflow, keyboard, reduced motion, search secondary behavior, and console verified. No production deployment/data, signup backend, analytics, installer implementation or app changes.

## Sources

`README.md` Safe first test, Apple Shortcut contract, Guided Shortcut setup; `shortcuts/README.md`; `web/shortcut-setup.tsx` pinned v6 download; `web/main.tsx`, `web/knowledge-ask.css`, `e2e/archive.spec.ts`, `e2e/inbox-view.spec.ts`, `test/helpers.ts` for real UI and synthetic fixtures. Keep scope tight; reuse accepted page rather than generate another concept.
