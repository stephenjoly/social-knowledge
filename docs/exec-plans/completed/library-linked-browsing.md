# Linked Knowledge base browsing

Status: complete
Owner: Codex
Started: 2026-09-26

## Context and scope

Owner wants a growing Obsidian-like map: Home lists populated category branches; each category/subcategory describes existing content, links to children and extracted insights, and lists captures across its subtree. Add local Back/Forward history and Expand all; remove Move capture; keep Open capture at the right of the reading toolbar. Capture link belongs only on Inbox. Empty taxonomy placeholders must not appear in browsing.

## Acceptance

- Home and branch maps expose existing owner-scoped content, not empty placeholders or invented summaries.
- Category capture lists include descendant captures and insights link back to their sources.
- Back/Forward restore home, node and note views; navigation after Back discards forward history; failed/stale requests do not corrupt selection.
- Expand all/Collapse all work on visible populated branches.
- Open capture remains available; Move capture is absent. Global capture action appears only on Inbox.
- Desktop/mobile journeys pass; existing data and classification behavior remain compatible.

## Approach

Root: frontend navigation, controls, Home map, browser verification and delivery. Isolated Worker: library read models, scoped map Markdown and API tests. Keep existing stored taxonomy for classification compatibility; filter browsing to populated branches rather than deleting data.

## Progress

- [x] Preflight and bounded assignment.
- [x] UI navigation and content maps integrated.
- [x] Full checks and browser acceptance.
- [x] Ready for delivery through existing PR #28 preview; deployed asset verification accompanies delivery.

## Verification and recovery

Run `npm run check` and focused real-backend Knowledge base browser test; retain ownership/security regressions. Publish to existing PR #28 preview only. Revert scoped commits if necessary; no destructive migration, production change or credential work.

## Result and evidence

`npm run check` passed (119 tests). Four affected browser journeys passed: linked library Home/category/insight/note navigation, app history, Activity, and capture submission. Verified Expand/Collapse, hidden empty categories, disabled history boundaries, forward-history truncation, failed-load recovery, Inbox-only capture action, and mobile overflow. Desktop and mobile screenshots inspected.

The browser API uses an owner-scoped recursive content projection with escaped Markdown and no archive paths, transcripts, credentials or account IDs. The existing archive publisher retains its existing export-map behavior; this refinement applies to the in-app content maps. Stored taxonomy is preserved.
