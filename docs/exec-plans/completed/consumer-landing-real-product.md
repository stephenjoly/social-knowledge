# Ground the consumer landing page in the real product

Status: completed — ready for design review
Owner: Codex foreman, Opus UI worker, Codex app-evidence worker
Started: 2026-10-18

## Context

Stephen approves Unfold's visual character and motion, but identifies that invented recipe/workout/travel output layouts may not match the application. The primary conversion should be Get started, with server installation and Apple Shortcut setup visible.

## Scope

Refine existing standalone prototype; introduce real running React app screenshots with synthetic fixture content, Get started setup, and signed v6 Shortcut download with endpoint constraints. Preserve accepted motion/aesthetic. No production app changes, installer implementation, hosted signup, public deployment or private archive access.

## Acceptance criteria

- Real app Inbox and capture-detail screenshots prominently show actual UI, labeled sample data.
- No implication of dedicated Recipe/Workout/Travel output modes.
- Main CTA is Get started and lands on actionable self-host setup; sample search is secondary.
- Docker instructions follow actual repository setup; copy action gives feedback and links complete docs.
- Apple Shortcut section explains download, capture-only key, import, sharing, receipts, and custom-server endpoint limitation.
- Desktop/mobile, keyboard, reduced motion, overflow, local demo and outgoing link checks pass.
- Screenshot provenance documented; disposable QA data/server retired.

## Approach

Shared brief `landing-refinement-brief.md` defines strict file ownership. Opus owns page code; Codex evidence worker owns three app screenshot files and provenance report. Foreman verifies integration, existing preview, checks and PR49 update.

## Progress

- [x] Existing product/setup and Shortcut implementation inspected.
- [x] Bounded worker assignments launched in existing workspace.
- [x] Real app evidence captured and verified: unchanged React UI, real temporary Fastify/SQLite, six synthetic captures. Screenshots inspected; zero keys, external requests or page errors. Disposable QA resources removed.
- [x] Focused page refinement complete: shared-field hero illustration, actual app section, Get started setup, visible signed Shortcut download and custom-server instructions.
- [x] Browser acceptance and repository checks passed; checkpoint and existing draft PR update prepared.

## Decisions

- 2026-10-18: Existing user authorization to use judgment applies; no additional speculative design gate. Keep current concept, ground outputs and primary CTA in actual product.
- 2026-10-18: No invented one-line installer. The supported Docker Compose command is presented with configuration prerequisites and canonical docs.
- 2026-10-18: Existing signed Shortcut points to Stephen's server. Advertise that honestly and link custom-host generation instructions instead of pretending it works with arbitrary servers.

## Verification

Focused browser review plus `npm run check`, asset provenance and link checks. Recheck only touched behavior after fixes.

Results: `npm run check` passed docs, strict TypeScript, build and all 31 test files / 166 tests. Command snippets passed shell syntax validation without executing installation. Public repository/setup links and signed Shortcut downloads returned HTTP 200 (workers verified both download variants).

Chromium acceptance at 1440px desktop and 375/390px phone widths: Get started arrives below the sticky nav and focuses setup; command copy feedback and denied-clipboard selection fallback pass with a stubbed clipboard; sample-search focus, matching and empty state pass; hero arrow-key tabs pass; all three real app assets load; no page overflow, page errors, failed requests or external runtime requests. Reduced motion shows completed scenes and working setup focus. Actual app previews remain visible after fast and reverse scrolling. Final desktop/mobile visual comparison covered hero, real app/capture, Get started and Shortcut sections; accepted visual character and motion preserved. Evidence wording and saved-state copy were qualified to avoid unsupported guarantees. Screenshot evidence: ignored `output/playwright/refinement-*.png`.

One review-script selector typo in the parent harness (`.product__detail` instead of `.detail-row`) was caught and did not affect product behavior. Corrected capture-section screenshots completed the visual review.

Limits: Safari/Firefox, live Docker installation, real Shortcut import/iPhone capture and AI-provider execution were not exercised. Screenshots prove actual UI rendering against synthetic database records; no real archive content or credentials were used. Published v6 Shortcut still targets Stephen's instance; the page explains that adjacent to download and supplies custom-host generator instructions. No public deployment or app change was made.

Review: local preview `http://127.0.0.1:41006/`; inspect The app, press Get started, then inspect iPhone Shortcut and expand Make one for your server. Full review script: `designs/landing/README.md`. Screenshot provenance: `designs/landing/app-evidence.md`.

## Risks and recovery

No live account data/providers or production deployment. Existing static preview serves only design directory; revert prototype commit to restore previous review. Stop and clean up worker-owned temporary QA service/database after screenshots.
