# Ship approved Unfold landing

Status: completed
Owner: Codex
Started: 2026-10-18

## Context and scope

Stephen approved the complete landing/footer/routing and requested “ship it”. Follow existing PR49 → staging → release PR → main → Dokploy production. Installer and generic Shortcut implementation remain explicitly deferred. No production fixtures, credential changes, infrastructure changes, schema changes or redesign.

## Acceptance and progress

- [x] Merge current staging (`acde31e`) into the feature branch, retaining app-v2 extraction and owner/session guards.
- [x] Independent code/security/integration review; concrete findings fixed and reviewer closure confirms no blockers.
- [x] Full local check passes: 37 files / 288 tests. Five account/onboarding browser checks pass; nine routing regressions and provider Settings check pass on final code.
- [x] Latest CI and isolated PR49 preview accepted at feature head 7461ed35347b7e1bc6630c2b0a589e6ed9cb694e.
- [x] PR49 merged; staging 66df1a777a4205255970fd16e8f403239feb5119 verified with synthetic browser/API acceptance and matching packaged landing bytes.
- [x] Online production SQLite backup and integrity checked; current pre-release registry rollback v122 and immutable image retained; mounts preserved.
- [x] PR54 promoted tested staging; production c5e3e8a9d6aa66fd53e50aad9cc14e11cd8941ca verified healthy with matching landing bytes, browser routes and preserved archive.

## Decisions

- Preserve the repo's existing SHA-based staged promotion. There is no VERSION file on the branch or staging; the generic ship version helper misclassifies this pre-existing manifest-only setup as drift. Keep package version 0.1.0, do not introduce a versioning scheme or tag as part of this landing release.
- Coverage worker hit model capacity after leaving meaningful routing tests. Parent inspected and completed them: expired session, rejected-provider 401, redirect boundaries, offline session links, old bookmarks, invitation fragment secrecy, OAuth resume and logout/back behavior. No provider fallback or quota workaround.
- A parallel Playwright run collided in the shared trace output. Rerun in isolated output directories passed all five account/onboarding tests; final routing/provider run passed all ten. This was an artifact cleanup collision, not an app assertion failure.
- Review fixes: distinguish `unauthorized` from rejected provider keys; preserve HTML no-store headers; prevent initial session-check error redirect loops; fail packaging if a session-link insertion is missing; close the superseded restoration plan.

## Rollback and verification

Dokploy owns deployment. Initial production baseline was `8bf957d7bd4db63bbac70e444e85b98dbd2188d8`. During release preparation an accepted avatar-swatch fix landed via PR52/53; the final pre-promotion source became `0698b9682ad710398e61f6be9864dbd588394f3c`, with retained registry rollback v122. Its immutable image and unchanged external mounts were recorded privately. Verify a fresh online backup immediately before promotion. Never restore SQLite merely to roll back code.

GitHub CI and merge status are insufficient: verify Dokploy deployment description SHA, checkout SHA, healthy task and public smoke; compare packaged landing bytes to the accepted build. Verify anonymous login/app redirects and synthetic staging sign-in; do not create production users, keys or captures for acceptance.

## Final rollout evidence

- Feature PR49 and production release PR54 are merged. Dokploy deployment description and checkout identify production `c5e3e8a9d6aa66fd53e50aad9cc14e11cd8941ca`; the task is healthy. Post-merge CI and GitHub Pages succeeded.
- Online backup integrity was OK with zero foreign-key errors. Post-rollout catalog counts match the pre-release baseline, database quick-check is OK, and foreign-key errors remain zero. Existing data/vault/media/cookie mounts are unchanged; no production account, key or capture was created for testing.
- Accepted packaged landing SHA-256 is `54ca815d157a135609b4b7e0d0fc5cb837abe5371da0fe7168aa01997e57da88`, matching the production container and public HTTP response.
- Public `/` and `/login` return 200 with expected assets; `/app` redirects signed-out visitors to `/login`. Existing-account protection and private catalog/Agent API/export/MCP authorization boundaries pass; OAuth discovery points to the production MCP URL. The initial export collection GET probe returned the expected 404 because that collection is POST-only; the verified export-item GET route correctly returned 401. No product defect.
- Live Chromium at 390px: seven footer links, no overflow, Sign in opens `/login`, private-app gate reaches `/login`, and no page errors. Staging synthetic sign-in returned to the requested Settings page, authenticated catalog returned 200, Open app and logout worked. Actual production credentials/provider/ingestion journeys were not exercised; automated and synthetic staging coverage cover those changed authentication flows.
- The coverage worker hit provider capacity after writing tests; parent reviewed/completed them. Final check: 37 files / 288 tests; routing/provider acceptance 10/10; account/onboarding and concurrent swatch integration passed. Independent reviewer confirmed all findings closed.
- Installer/portable Shortcut work remains explicitly deferred. Safari, Firefox and physical iPhone remain untested.

Live URL: https://social-knowledge.stephenjoly.net/ . This post-release evidence update changes documentation only; it does not change or redeploy production.
