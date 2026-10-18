# Ground the consumer landing page in the real product

Status: active
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
- [ ] Focused page refinement complete.
- [ ] Browser acceptance, repository check, checkpoint and PR update.

## Decisions

- 2026-10-18: Existing user authorization to use judgment applies; no additional speculative design gate. Keep current concept, ground outputs and primary CTA in actual product.
- 2026-10-18: No invented one-line installer. The supported Docker Compose command is presented with configuration prerequisites and canonical docs.
- 2026-10-18: Existing signed Shortcut points to Stephen's server. Advertise that honestly and link custom-host generation instructions instead of pretending it works with arbitrary servers.

## Verification

Focused browser review plus `npm run check`, asset provenance and link checks. Recheck only touched behavior after fixes.

## Risks and recovery

No live account data/providers or production deployment. Existing static preview serves only design directory; revert prototype commit to restore previous review. Stop and clean up worker-owned temporary QA service/database after screenshots.
