# UI v2 approved UX improvements

Stephen approved implementing all 28 recommendations in PR #50 on 2026-10-19.
This addendum records that approval and the acceptance checks. It supersedes the
original contract only for the changes below. Preserve the simple Ask chat, quick
Capture dialog, six Settings topics, tokens, and unaffected reference geometry.

## Screens and behavior

| ID | Screen | Acceptance |
|---|---|---|
| 01 | Activity → Connections | Fix connection opens Connections, with a clear route back to the affected item. |
| 02 | Capture | Receipts distinguish queued, already saved, already processing, and retained unsupported bookmarks. Processing steps appear only when processing will occur. |
| 03 | Capture → AI setup | Missing AI explains that the URL is retained, opens relevant setup, and provides an easy retry. |
| 04 | Activity | Routine rows emphasize identity, current status, and next action. |
| 05 | Activity inspector | Durations, attempts, and logs are available on demand, not competing with the routine view. |
| 06 | Activity | Attention and capture views avoid duplicate failure explanations and identify the same item consistently. |
| 07 | Activity → Connections | Expired sessions explain reconnect, then retry; retry does not masquerade as a connection fix. |
| 08 | Activity | Terminal unsupported bookmarks can be archived and restored; URL/history survive, archived items leave attention counts, ownership is enforced. |
| 09 | Inbox | Accessible Rows/Tiles choice, rows default, clear selected state. |
| 10 | Inbox | Switching preserves search, filters, sort, loaded results, and browsing anchor; preference is scoped per account/browser. |
| 11 | Inbox | Tiles use stored thumbnails with stable fallback, titles and provenance; mobile does not force two columns. |
| 12 | Ask | Source cards identify the answer they support. |
| 13 | Ask | An uncited follow-up cannot appear supported by older source cards. |
| 14 | Ask | Streaming follows the bottom until the reader scrolls up; reading position is respected. |
| 15 | Ask history | Known failure reasons survive reopening and have relevant recovery actions. |
| 16 | Ask → note | Mobile citations are easy to tap/discover; opening and returning preserves the answer position. |
| 17 | Palette | Wording describes navigation, not archive search or asking questions. |
| 18 | Empty Inbox | First capture and incomplete-setup recovery have clear relevant entry points. |
| 19 | Empty/blocked Ask | AI setup is directly reachable; suggestions match an empty archive. |
| 20 | Capture → API keys | iPhone tip links to guided Shortcut setup. |
| 21 | My account | Immediate avatar save and explicit field save are clear; navigation protects unsaved edits. |
| 22 | AI & models | Next missing setup step distinguishes credentials, task assignment, saved changes, and testing. |
| 23 | AI & models mobile | Task assignments and Save are discoverable and reachable. |
| 24 | Connections | Cookie-file help is usable on a phone and truthful about manual setup. |
| 25 | Data & export | Language settings are discoverable, state new-captures-only behavior, and retain save/error feedback. |
| 26 | People & access | New invitation link explicitly explains invalidation of the previous link. |
| 27 | People & access | Invitation/admin controls explain private archive boundaries and enforce role isolation. |
| 28 | Mobile journeys | Verify keyboard/viewport behavior, Activity inspection/return, citation taps, and Settings completion. Distinguish browser emulation from physical-device evidence. |

## Verification and exclusions

Each implementation stream has an independent QA partner. Record item-level
evidence, focused tests, and unresolved findings in the shared implementation
brief. A fresh final CX review checks all 28 items. Run `npm run check`, browser
acceptance, responsive comparisons, then verify the served build and journeys on
the existing PR preview. Never claim physical-phone testing from emulation.

Out of scope: universal search, account deletion, changing provider behavior,
production data/deployment, cross-device display-preference sync, and additional
PRs. Archive is reversible visibility state, not deletion or a queue status.
