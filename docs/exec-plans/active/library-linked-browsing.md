# Linked Knowledge base browsing

Status: active
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
- [ ] UI navigation and content maps integrated.
- [ ] Full checks and browser acceptance.
- [ ] PR preview updated and verified.

## Verification and recovery

Run `npm run check` and focused real-backend Knowledge base browser test; retain ownership/security regressions. Publish to existing PR #28 preview only. Revert scoped commits if necessary; no destructive migration, production change or credential work.
