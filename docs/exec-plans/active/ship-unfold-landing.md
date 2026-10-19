# Ship approved Unfold landing

Status: active
Owner: Codex
Started: 2026-10-18

## Context and scope

Stephen approved the complete landing/footer/routing and requested “ship it”. Follow existing PR49 → staging → release PR → main → Dokploy production. Installer and generic Shortcut implementation remain explicitly deferred. No production fixtures, credential changes, infrastructure changes, schema changes or redesign.

## Acceptance and progress

- [x] Merge current staging (`acde31e`) into the feature branch, retaining app-v2 extraction and owner/session guards.
- [x] Independent code/security/integration review; concrete findings fixed and reviewer closure confirms no blockers.
- [x] Full local check passes: 37 files / 288 tests. Five account/onboarding browser checks pass; nine routing regressions and provider Settings check pass on final code.
- [ ] Latest CI and isolated PR49 preview accepted.
- [ ] Feature merged to staging; exact staging SHA verified with synthetic browser/API acceptance.
- [ ] Online production SQLite backup and integrity checked; previous image/mounts retained.
- [ ] Authorized staging-to-main release merged; actual production SHA, packaged landing and affected flows verified.

## Decisions

- Preserve the repo's existing SHA-based staged promotion. There is no VERSION file on the branch or staging; the generic ship version helper misclassifies this pre-existing manifest-only setup as drift. Keep package version 0.1.0, do not introduce a versioning scheme or tag as part of this landing release.
- Coverage worker hit model capacity after leaving meaningful routing tests. Parent inspected and completed them: expired session, rejected-provider 401, redirect boundaries, offline session links, old bookmarks, invitation fragment secrecy, OAuth resume and logout/back behavior. No provider fallback or quota workaround.
- A parallel Playwright run collided in the shared trace output. Rerun in isolated output directories passed all five account/onboarding tests; final routing/provider run passed all ten. This was an artifact cleanup collision, not an app assertion failure.
- Review fixes: distinguish `unauthorized` from rejected provider keys; preserve HTML no-store headers; prevent initial session-check error redirect loops; fail packaging if a session-link insertion is missing; close the superseded restoration plan.

## Rollback and verification

Dokploy owns deployment. Current production source is `8bf957d7bd4db63bbac70e444e85b98dbd2188d8`; its running immutable image ID and existing external mounts were recorded privately, and Dokploy retains registry rollback v120. Verify a fresh online backup immediately before promotion. Never restore SQLite merely to roll back code.

GitHub CI and merge status are insufficient: verify Dokploy deployment description SHA, checkout SHA, healthy task and public smoke; compare packaged landing bytes to the accepted build. Verify anonymous login/app redirects and synthetic staging sign-in; do not create production users, keys or captures for acceptance.
