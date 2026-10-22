# Chat-first Ask AI, model picker and Settings modal

Status: active; design approved, implementation in progress
Owner: Stephen Joly (product); Codex delivery lead
Started: 2026-10-22
Branch: `codex/ask-ai-ui-mockup` (base `origin/staging` 034ac71); feature PR targets `staging`

## Design contract

[`designs/app/ask-chat-first/index.html`](../../../designs/app/ask-chat-first/index.html)
is the binding definition of success. Stephen approved it without changes on
2026-10-22. Open it in a browser; the top bar steps through six states, and every
control shown is part of scope. PNG references are in
[`designs/app/ask-chat-first/previews/`](../../../designs/app/ask-chat-first/previews/)
(captured at a 1360×1000 viewport). The [design README](../../../designs/app/ask-chat-first/README.md)
lists the changes and a three-minute review script.

Priority when sources disagree: (1) the mockup HTML/CSS (exact sizes, spacing,
colours, copy); (2) this plan's decisions and API contract; (3)
[`docs/design/ui-v2-spec.md`](../../design/ui-v2-spec.md) for anything the mockup
does not show. The mockup supersedes UI v2 screens 08–09 (Ask) and the Settings-mode
sidebar of screens 10–15. The Settings section *contents* in screens 10–15 still apply
inside the modal unless the mockup shows otherwise.

Mockup data is synthetic. Ship real account data and never fabricate a control that
has no backing (UI v2 data rules).

## Context

Owner feedback on the live Ask page (22 Oct 2026):
- History is a popover in the Ask header; past chats are hard to scan and switch.
- The composer's "Whole archive" chip has no handler (`web/pages/ask.tsx`, `Composer`).
- The model used by Ask can only be changed in Settings, which is a full page that
  replaces the sidebar and loses your place.
- Visual issues: floating white header box; sources panel always open with a gap to
  the window edge; citation chip after every sentence; double focus ring on composer.

Facts established in code (verify before changing):
- Ask already routes generation through the owner's Analysis selection:
  `src/app.ts` calls `aiProviderService.runForUser(userId, …)`, and
  `runForUser(userId, action, provider?, model?, thinkingLevel?)` in
  `src/ai-providers.ts` accepts overrides. A per-chat model is an override, not a new
  routing path.
- Model options come from `GET /api/v1/ai-providers` (`providers[].taskOptions.analysis`,
  with `thinkingLevels`); `web/shared/format.ts#analysisOptions` already reads them.
- Conversations: `conversations` and `conversation_messages` tables in `src/db.ts`;
  routes `GET/POST /api/v1/conversations`, `GET/DELETE /api/v1/conversations/:id`,
  `POST …/:id/messages`, `POST …/:id/messages/:messageId/retry` in `src/app.ts`.
  There is no rename or pin endpoint today.
- Settings routing: `?tab=settings&topic=<topic>` with history state in `web/main.tsx`;
  sidebar Settings mode in `web/pages/app-shell.tsx`; page in `web/pages/settings.tsx`;
  leave-with-unsaved-changes guard in `web/unsaved-changes.ts`.

## Scope

In scope (everything visible in the mockup):
1. **Sidebar chat history** on every app page: `New chat` row (`G Q`), `Search chats`
   (`/` focuses), groups Pinned / Today / Yesterday / Previous 7 days / month name,
   current-chat highlight, spinner for a pending answer, amber dot for a failed last
   answer, `⋯` row menu (Rename, Pin to top/Unpin, Export as Markdown, Delete… with
   confirm), `Show all N chats` after a cap. Removes the Ask History popover, header
   New chat button and the Ask-home "Recent conversations" list.
2. **Composer model picker** replacing "Whole archive": connected providers' analysis
   models grouped by provider, `Default` badge, check on current, Thinking segmented
   control only for models with thinking levels, `Set as default`, `Manage models`
   (opens the Settings modal on AI & models). Empty state: chip reads
   `Connect a model` and opens AI & models.
3. **Answer metadata and retry**: meta line `<model> · <thinking> · N saved posts · time`;
   `Retry with… ▾` re-runs that answer on a chosen model.
4. **Ask layout polish**: full-width 52px header bar with title menu, Share/export
   button, `Sources N` toggle; toggleable 316px sources panel flush to the window
   edge (`S`, button, citation click re-opens and highlights the card; hover
   cross-highlights); synopsis on source cards; one citation chip per point; single
   composer focus ring; new-chat hero, subtitle and suggestion chips.
5. **Settings as a modal** (900×660, radius 14) over the current page: opens from the
   profile gear and `⌘,`; closes on ×, Esc, scrim click; left nav with Account /
   Workspace / Administration groups; existing section contents; amber unsaved-changes
   bar with Discard / Save changes; new **Ask AI default** row in AI & models.
6. **Preferences** shown in My account: "Show sources panel by default" and
   "Send messages with Enter / ⌘ Enter".

Out of scope: new providers (no Anthropic); capture pipeline or analysis behaviour
changes; mobile visual design (must remain usable; see Decisions); chat sharing links;
full-text search of message bodies (title search only); production deployment.

## API contract (backend and frontend build against this in parallel)

`AskSelection = { provider: "openai" | "cerebras"; model: string; thinkingLevel: "minimal" | "low" | "medium" | "high" | null }`
— same shape as `AiAnalysisSelection`; validate with the same rules (connected
provider, model in `taskOptions.analysis`, thinking level allowed for that model).

| Endpoint | Change |
|---|---|
| `GET /api/v1/conversations` | Each item adds `pinnedAt: string \| null`, `lastStatus: "pending" \| "complete" \| "failed" \| "cancelled" \| null` (latest assistant message), `selection: AskSelection \| null`. Order: pinned first by `pinnedAt` desc, then `updatedAt` desc. |
| `POST /api/v1/conversations` | Accepts optional `selection`. |
| `PATCH /api/v1/conversations/:id` (new) | Body any of `{ title?: string (trim, 1–100), pinned?: boolean, selection?: AskSelection \| null }`. Returns `{ conversation }`. `404 not_found` for another owner's id; `400 invalid_request` / `invalid_selection`. Pinning does not change `updatedAt`. |
| `GET /api/v1/conversations/:id` | Adds `pinnedAt`, `selection`. Assistant messages add `provider`, `model`, `thinkingLevel` (null for historical rows). |
| `POST …/:id/messages` | Model = conversation `selection` ?? owner Ask default ?? owner Analysis selection. Persist the resolved provider/model/thinking on the assistant message. |
| `POST …/:id/messages/:messageId/retry` | Optional body `{ selection?: AskSelection }` for that retry only; does not change the conversation's selection. |
| `GET /api/v1/ai-providers` | `selections.ask: AskSelection \| null` (null = follows Analysis). Readiness `ask` true when ask ?? analysis resolves to a connected provider. |
| Existing task-selections save endpoint | Accepts `ask` alongside `transcription` and `analysis`; disconnecting a provider clears an affected `ask` selection and affected conversation selections fall back at send time. |
| `GET/PATCH /api/v1/preferences` | Adds `askSourcesPanel: boolean` (default `true`) and `sendWith: "enter" \| "mod-enter"` (default `"enter"`). |

Export as Markdown is client-side from `GET /api/v1/conversations/:id` (title, each
turn, model line, sources with original URLs). No new endpoint.

Persistence (additive, nullable, migration-safe on existing SQLite data):
`conversations.pinned_at`, `conversations.ask_provider`, `ask_model`,
`ask_thinking_level`; `conversation_messages.provider`, `model`, `thinking_level`;
`ai_task_selections.ask_provider`, `ask_model`, `ask_thinking_level`; preference
columns in the existing preferences storage. All reads and writes stay scoped by
owner; follow the `PRAGMA table_info` + `ALTER TABLE … ADD COLUMN` pattern used for
`analysis_thinking_level`.

## Frontend structure and file ownership

Conversation list state moves up from `ask.tsx` to the app level so the sidebar and
Ask page share it. Proposed contract (adjust names, keep the split):
`useConversations()` in a new `web/shared/conversations.ts` returns
`{ conversations, loaded, error, currentId, open(id), startNew(), rename(id,title), setPinned(id,pinned), remove(id), refresh() }`.
Settings becomes `SettingsModal` rendered by `web/main.tsx` over any tab; deep link
`?settings=<topic>` on any tab; legacy `?tab=settings&topic=<topic>` opens the modal
over the last archive tab (default Inbox). Topics `overview` and `all` map to `account`.

Suggested ownership so parallel workers never share a file:
- **Backend** (logic/tests): `src/db.ts`, `src/app.ts`, `src/ai-providers.ts`,
  `src/ask.ts`, `src/openapi.ts`, `web/shared/types.ts`, `test/**`.
- **Shell and Settings UI** (design): `web/main.tsx`, `web/pages/app-shell.tsx`,
  `web/shell.css`, `web/pages/settings.tsx`, `web/settings-ui.tsx`, `web/settings.css`,
  `web/account-settings.tsx`, `web/unsaved-changes.ts`, `web/shared/conversations.ts`.
- **Ask UI** (design): `web/pages/ask.tsx`, `web/ask.css`, `web/knowledge-ask.css`,
  `web/pages/ask-format.ts`, `web/chat-stream.ts`.
- **e2e** (`e2e/**`): owned by whoever lands the last milestone; update
  `account-management`, `activity-view`, `navigation-history`, `provider-settings`,
  `settings-alignment`, `ui-ux-*` for the modal and sidebar.
`web/shared/types.ts` changes land first (backend) so UI workers code against them.

## Acceptance criteria

- Each of the six mockup states is reproducible in the app with synthetic data and
  matches the matching PNG at 1360×1000: layout, sizes, spacing, colours, copy and
  states. Differences are listed in text and either fixed or approved by Stephen.
- Sidebar history works on every app page; search filters by title; rename, pin,
  export and delete work and persist; spinner and amber dot reflect real status.
- Picker lists only connected providers' analysis models; changing it persists on the
  chat and the next answer uses it; new chats start on Ask default ?? Analysis;
  `Set as default` updates Ask default; meta line shows the model that actually
  answered, including for retries; `Retry with…` uses the chosen model once.
- Sources panel toggles via button, `S` and citation click; preference persists;
  hover cross-highlights; one citation per point.
- Settings modal opens from the gear and `⌘,`, deep links work, browser back closes
  it, focus is trapped and returned, Esc/× close, unsaved changes show the bar and
  confirm before close; all existing Settings journeys keep working.
- Keyboard: `G Q`, `/`, `S`, `⌘,`, Esc. Accessible names, visible focus, reduced motion.
- At 390px wide everything remains usable (sidebar is the existing drawer; modal is
  full-screen); no horizontal overflow.
- Cross-owner tests for every new or changed endpoint; migration test on a database
  created by the current schema; `npm run check` and affected Playwright journeys pass.
- `docs/product.md` (navigation, AI setup, Ask behaviour) updated to the shipped
  behaviour; this plan moved to `completed/`.

## Progress

- 2026-10-22: M1–M3 committed; full check passed 302 tests. Early visual states 2/6 checked; modal 900×660. Existing browser journeys: 26/27 clean batch, corrected stale setup-banner expectation then focused provider journey passed; no skips. New Ask acceptance 2/2 covers six states, default/send/retry, persisted panel and sidebar CRUD/export. Citation component-remount click loss and nested People-menu Escape fixed; preference PATCHes serialized.

- 2026-10-22: Preflight clean; all six HTML states clicked in browser. Branch pushed; draft PR #64 targets staging.
- Delivery ownership: A backend/types/tests; B shell/Settings; C Ask. Lead owns plan/docs, integration, preview and e2e after slices land. Workers commit only their owned paths; no pushes or base merges.

- [x] Mockup approved and committed as the design contract (2026-10-22).
- [x] M1 Backend contract: migrations, endpoints, types, tests.
- [x] M2 Shell: sidebar history + Settings modal + routing (early key-screen check of state 2 and 6).
- [x] M3 Ask page: header, picker, meta/retry, sources panel, citations, hero.
- [ ] M4 Integration, e2e updates, full visual comparison, docs, PR preview with seeded synthetic data.

## Decisions

- 2026-10-22: Shared review data lives under dedicated synthetic member `ask-review`, leaving existing users, passwords, and provider keys unchanged. A strict HTTPS PR-preview hostname plus enabled demo accounts permits automatic fixture bootstrap and simulated Ask for that account only. Production and permanent staging never activate simulation.

- 2026-10-22: Stephen requested reuse/enrichment of the shared synthetic staging dataset for all previews. PR64 inherits staging data/vault/media mounts. This explicitly overrides preview persistence isolation for this review; no production mounts or data. Add labeled synthetic review records without replacing existing data; destructive tests stay in local disposable stores.

- 2026-10-22: Original design author `25214aae-9f86-4336-94c1-8103217aac98` reviews after lead validation. Approved brief satisfies pre-build scope approval.
- 2026-10-22: Runtime delegation policy requires Codex 6.1 medium for logic and Opus 5.5 high for UI; those settings override requested low-thinking implementation. Three workers share this workspace and disjoint file ownership.

- 2026-10-22: Mockup approved as-is; it is the binding contract.
- 2026-10-22: Chat history is visible on every app page, not only on Ask (as in the mockup).
- 2026-10-22: The per-chat model persists on the conversation; each assistant
  message records the model that produced it, so the meta line is truthful.
- 2026-10-22: Ask default is a new nullable selection; null follows Analysis, so
  existing accounts see no change until they choose.
- 2026-10-22: Settings becomes a modal with deep links; the full-page Settings mode
  and its sidebar are removed.
- 2026-10-22: Mobile is not separately designed; reuse the existing drawer and make
  the modal full-screen below 720px. Confirm with Stephen at the preview.

## Verification

- Focused `vitest` while iterating; `npm run check` before each PR push (batch pushes).
- Playwright: updated settings/navigation journeys plus new journeys for sidebar
  history, picker, retry-with and the Settings modal.
- Visual: one early comparison of states 2 and 6, then all six at the end against
  `designs/app/ask-chat-first/previews/`; report differences as text with a screenshot
  folder link.
- PR preview with seeded synthetic chats (≥ 12 across date groups, one pending, one
  failed, one pinned) and both providers configured with staging-only credentials or
  simulated responses; a step-by-step test script naming mockup states 1–6.

## Risks and recovery

- Settings routing regressions (deep links, unsaved guard): covered by existing e2e
  specs that must be updated, not deleted.
- Migration on persistent SQLite: additive nullable columns only; rollback leaves
  unused columns harmlessly.
- Concurrent branches: on 2026-10-22 open PR #63 (docs reader) touches `src/app.ts`;
  stale draft #3 (editorial theme) touches the web UI and must not be merged blindly.
  Re-check open PRs before each milestone and merge current `origin/staging` rather
  than overwrite.
- Provider disconnect while a chat has a selection: fall back at send time and show
  the fallback model in the meta line.
