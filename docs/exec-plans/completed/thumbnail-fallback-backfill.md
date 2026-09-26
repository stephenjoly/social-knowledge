# Durable thumbnail fallback and archive backfill

Status: completed
Owner: Codex
Started: 2026-09-11

## Context

Production has archived videos for every capture, but 82 captures observed on 2026-09-10 have no
thumbnail asset because Facebook did not consistently provide a downloadable thumbnail. The Inbox
therefore renders a platform-letter placeholder even though the source video is healthy.

## Scope

Use an already-extracted analysis frame when a new download has no upstream thumbnail. Add an
idempotent, journaled maintenance command to generate and register JPEG thumbnails from existing
archived videos. Do not re-download sources or rerun transcription, analysis, or classification.

## Acceptance criteria

- New captures retain upstream thumbnails and otherwise archive the first extracted JPEG frame.
- Dry-run reports every capture with exactly one video and no thumbnail without writing data.
- Apply validates generated JPEGs, never overwrites a file or asset, and is resumable.
- Rollback removes only manifest-owned asset rows and checksum-matching generated files.
- Production backfill leaves no readable video capture without a thumbnail asset.

## Approach

Add persistence methods for thumbnail-backfill discovery and exact conditional insert/removal. Add a
compiled maintenance service and CLI with dry-run, apply, and rollback modes. Journal prepared and
committed mutations in append-only JSONL. Validate and release through preview/staging/production,
then back up SQLite and apply the production repair as the container runtime user.

## Progress

- [x] Implement runtime fallback and persistence boundary.
- [x] Implement maintenance CLI and rollback journal.
- [x] Add focused regression and recovery tests.
- [x] Pass repository checks and container build.
- [x] Validate staging, deploy production, and apply the backfill.
- [x] Reconcile homelab documentation and archive this plan.

## Decisions

- 2026-09-11: Preserve every upstream thumbnail; use the first existing analysis frame only as the
  fallback so normal ingestion adds no extra media pass.
- 2026-09-11: Backfill from archived videos rather than re-importing social sources.
- 2026-09-11: Use no-clobber file publication and a prepared-before-commit journal so interrupted
  work is recoverable without restoring the full database.
- 2026-09-11: Review found sparse `fps=1/15` extraction can emit no frame for short videos. Replace
  it with a shared frame-zero-plus-15-second selection filter and verify it with real FFmpeg.
- 2026-09-11: Discovery accounts for missing/duplicate video topology, and rollback deletes a
  generated orphan only when no live asset references its checksum-matching path.
- 2026-09-11: Prepared records also identify temporary JPEGs. Rollback validates the allocated
  filename, checksum, size, containment, and asset reference count before removing either file.
  Older manifests use the deterministic `.thumbnail-<assetId>.tmp.jpg` filename for recovery.
- 2026-09-11: Both generated and adopted thumbnails must have a nonzero size and FFprobe codec
  `mjpeg`; source videos retain codec-agnostic validation. CI installs the exact Ubuntu package
  `7:6.1.1-3ubuntu5` and verifies the installed version (see
  [Ubuntu package metadata](https://packages.ubuntu.com/noble/ffmpeg)).

## Verification

On 2026-09-11, after merging current staging (`63cd883`) in `0b4c95e`, `npm run check` passed with
74 tests; three real-FFmpeg tests were skipped on the development host because it has no FFmpeg
binary. All 77 tests passed in a disposable test image
using the production FFmpeg runtime, including the actual short-video backfill. The production image
`social-knowledge:thumbnail-backfill-hardened` built successfully, and the compiled shared frame
arguments produced exactly one JPEG for a synthetic two-second video and three JPEGs for a
31-second video inside that image. CI pins FFmpeg on Ubuntu 24.04 so those integration tests
run there. In staging, verify a fallback capture through the card, detail poster, asset route, and
archive. In production, run the dry-run, apply, SQLite integrity/foreign-key/duplicate checks, and
UI spot checks.

The final local production image ID is
`sha256:0c40a2752befb6b52b2d5bb06c6c4a78c68c2f5841426758b7dab7e401f28d4f`.
Fixes are recorded in `48a3459`, preserving the earlier reviewed commits.

## Production result — 2026-09-11

- Feature PR #9 and release PR #10 passed GitHub CI and merged through staging to main.
- Accepted staging: `ff51e4cb2eac5c809749e63f394ee4ab0638e884`.
- Production source: `d41d5c11b696bd7577ea51c67dae7e87151987dc`.
- Production image: `sha256:3a86ca9e58c7a8e736a8258181dc044950e915b16050d72f0eac669af609d4cb`.
- Online backup: `/data/backups/social-knowledge-pre-thumbnails-20260911T020349055Z.sqlite3`,
  independently verified with integrity `ok` and zero foreign-key violations.
- Rollback image: `social-knowledge:rollback-before-thumbnails-20260911`
  (`sha256:97da76a34fecbdcf67b0a665dc059f09572a6f87c51603d1d285d6d4c267f24e`).
- Manifest: `/data/backups/thumbnail-backfill-2026-09-11T021027607Z.jsonl`.
- Pre-deploy baseline: 350 captures, 82 missing thumbnails. New imports continued during rollout;
  dry-run found 83 valid candidates, zero topology/target conflicts, and 21 GB available space.
- Apply as `node`: 83 committed, zero failed/adopted/skipped, 7,482,835 bytes generated.
- Post-apply: 357 captures, zero missing thumbnails, zero duplicate thumbnails, integrity `ok`,
  zero foreign-key violations, and no residual synthetic test accounts. Imports remained active.
- Synthetic two-second fallback processing, archive publication, Inbox image decoding, JPEG asset
  endpoint, detail poster, login, and reload acceptance passed in preview, staging, and production.
  Staging/production health, search/export, Agent API, and OAuth/MCP acceptance also passed.
- Backfilled short (5.248 s), long (179.769 s), and vertical (88.422 s) captures passed real
  Inbox image decoding and detail-poster checks. The two-second synthetic fixture covered landscape
  orientation. No horizontal video was found among the 83 backfilled captures.
- Canonical homelab host and release runbook documentation updated with these artifacts and recovery
  instructions; staging follows `staging`, and approved release merges deploy `main` automatically.

## Risks and recovery

Malformed or missing videos are recorded and skipped without changing source data. Unsafe existing
thumbnail paths abort rather than overwrite. Application regressions use the retained Dokploy
release; backfill rollback uses exact asset IDs and file checksums from the manifest.
