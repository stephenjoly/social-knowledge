# Personalized shortcut downloads — shared research brief

Status: native feasibility milestone active; install-and-connect accepted 2026-10-19.
Owner: foreman. Started: 2026-10-19.

## Objective
Plan two downloads in the authenticated UI: keep the existing no-note shortcut and add a distinct With note shortcut. New shortcut offers Add note / Skip before capture, configurable receipt sound, and no manual API-key entry. Explain whether automatic provisioning can also cover the existing variant without replacing installed copies. Preserve account isolation and durable user notes.

## Research baseline and boundaries
The current checkout is old. Read current source using `git show origin/staging:<path>` / `git grep ... origin/staging`; freshly fetched staging is d3e1a2a1544c258a38d017672a40fab6f70a17d1. Do not change branches or runtime code. Research workers share this workspace. Do not delegate. No production access, real credentials, signing/uploading personalized files, or infrastructure changes. Reports go to the parent; only foreman edits this brief/spec.

## Key files
Read project preflight/instructions, context, docs/product.md, docs/engineering.md, SECURITY.md, docs/deployment-model.md. Inspect scripts/build-shortcut.py, shortcuts/README.md and manifest/templates, web/shortcut-setup.tsx, web/shortcut-downloads.ts, src/auth.ts, src/app.ts, src/db.ts, src/worker.ts, src/analyzer.ts, src/vault-writer.ts, test/shortcut*.test.ts and test/fixtures/shortcuts/. UI surface is Settings → API keys; no visual design changes in this milestone. Design frame IDs: none assigned.

## Assignments
1. Credential/delivery researcher: trace current hashed-key issuance, scopes and auth; propose safe automatic provisioning, lifecycle and import/signing mechanism. Check Apple primary documentation for platform constraints. Distinguish verified facts from required native experiments. Return concrete boundaries, dependencies, alternatives only where a product decision is required.
2. QA researcher: independently trace note persistence/retrieval and current native shortcut tests. Propose acceptance matrix for new note/sound/install behavior, cancellation, duplicates, credentials/owner isolation and legacy regression. Inspect Apple sources as needed. No claims of executed tests unless actually run.

## Acceptance for this planning milestone
One-page user-facing spec, actionable implementation sequence, verification/rollback plan, explicit unknowns; explain that login identifies account but does not imply recoverable existing API keys. Prefer scoped newly provisioned credential. Zero manual key entry must be demonstrated on native iPhone before release. Existing shortcut remains usable. No implementation or deployment in this milestone.

## Native feasibility milestone handoff

Planning research finished. User accepted install then Connect once, and requested concise emoji notifications (see spec). Current branch is now `codex/shortcut-note-pairing`, based on fetched staging; read working files normally. A fresh worker owns ONLY new files under `test/fixtures/shortcuts/pairing-spike/`: build a synthetic token-free native pairing/storage probe, loopback mock and reproducible checks. No runtime/UI changes, production credentials, git actions, or native GUI automation; foreman owns native UI and docs. Reuse existing shortcut serialization patterns. No delegation. Long-lived synthetic token must be acquired at runtime, never embedded in signed template. Local storage mechanism and action serialization are experimental, not validated until native runs. Do not assume file storage is Keychain or silently choose iCloud. Report blockers promptly. Full iPhone acceptance may require a connected device.
