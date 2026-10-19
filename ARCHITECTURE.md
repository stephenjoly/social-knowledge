# Architecture

Social Knowledge is a single-process TypeScript application with a React browser client. The monolith is intentional: one deployable owns ingestion, processing, search, export, and the authenticated UI while keeping data local and operational complexity low.

The same runtime serves the public Unfold landing at `/`, existing sign-in/first-account/invitation screens at `/login`, and the session-protected dashboard at `/app`. Signed-out app visits preserve their destination through login; signed-in login visits continue to the app or an allowlisted OAuth authorization URL. APIs, OAuth and MCP retain their origin-root paths. Old root tab/job/capture bookmarks redirect to `/app`, and a small public browser script forwards old fragment invitations to `/login` without putting tokens in HTTP requests. Unknown browser paths return 404 rather than the dashboard shell.

The build packages `site/` into `dist-ui/landing/`, separately from Vite assets, and adds instance sign-in/open-app links plus legacy-invitation handling. The links use `GET /api/auth/session`, an anonymous, non-cacheable endpoint that returns only an `authenticated` boolean. The standalone Pages bundle stays host-independent. Landing artwork and styling remain authored under `designs/landing/`.

## System map

```text
Apple Shortcut / browser / MCP client
                 |
            Fastify app
          (`src/app.ts`)
          /      |       \
   auth/API   knowledge   OAuth/MCP
       |          |          |
              JobStore (SQLite)
                    |
               JobWorker
                    |
 URL -> yt-dlp -> FFmpeg -> transcription -> translation -> analysis
                    |
          media archive + SQLite capture + Obsidian note
```

`src/index.ts` is the composition root. It loads validated configuration, creates storage, initializes services, starts Fastify, and controls worker shutdown. Runtime services receive dependencies through constructors or explicit parameters.

## Major boundaries

| Area | Primary files | Responsibility |
|---|---|---|
| HTTP and sessions | `src/app.ts`, `src/auth.ts`, `src/browser-routes.ts` | Input validation, authentication, ownership, response shaping and allowlisted browser return paths; `/`, `/login` and `/roadmap` serve public pages |
| Capture queue | `src/worker.ts`, `src/failures.ts`, `src/events.ts` | Job lifecycle, retry, recovery, progress events |
| Activity read model | `src/activity.ts`, `src/app.ts`, `src/db.ts` | Owner-scoped counts and pages, safe job and event projections, five-stage timing, bulk retry |
| Acquisition | `src/url.ts`, `src/downloader.ts`, `src/media-processor.ts` | URL allowlisting, bounded download, metadata, audio and frames |
| AI processing | `src/transcriber.ts`, `src/translator.ts`, `src/title-generator.ts`, `src/analyzer.ts` | Typed model interactions and knowledge extraction |
| Persistence | `src/db.ts` | SQLite schema, migrations, account-scoped records and queries |
| Archive | `src/archive.ts`, `src/vault-writer.ts`, `src/library-publisher.ts` | Durable media, Markdown notes, library publication |
| Knowledge access | `src/knowledge.ts`, `src/ask.ts`, `src/mcp.ts`, `src/openapi.ts` | Search, role-preserving conversational retrieval, compaction checkpoints, read-only agent access and contracts |
| Connections | `src/oauth.ts`, `src/platform-connections.ts` | MCP authorization and encrypted platform credentials |
| Browser UI | `web/`, `docs/roadmap/2026-09-24/` | Authenticated dashboard consumes HTTP APIs rather than storage directly; the canonical roadmap dashboard and its Markdown source are copied into the UI build for the public `/roadmap` route |
| Operations | `Dockerfile`, `compose*.yaml`, `deploy/`, `scripts/` | Reproducible build, deployment, smoke checks and rollback |

## Dependency direction

Keep dependencies flowing from composition and transport toward focused services and data types:

```text
index/app/worker -> domain services -> db/config/types
web UI          -> HTTP contracts
```

Library browsing uses owner-scoped populated trees and a compact recursive content projection for node maps. Captures in descendant categories are included, with stored summaries and takeaways linked to their source notes. Markdown text is escaped; the browser projection omits archive paths and raw capture records.

Domain services must not depend on initialized server instances or UI code. The UI must not rely on database layout or private archive paths. Cross-cutting services such as events and notifications are injected into the worker.

## Browser modules

`web/main.tsx` composes authentication, navigation, shared Activity state, and the
capture and command dialogs. `web/pages/` contains the sidebar shell, Inbox,
Activity, Knowledge base, capture notes, Ask, authentication, and Settings.
`web/shared/` owns browser HTTP helpers, response types, and formatting; these
modules consume HTTP contracts and never import initialized server services.

The shell owns the selected settings topic and renders the account or workspace
navigation in its single sidebar. Capture notes replace the visible page inside
the shell while preserving that page's browsing state. The capture dialog opens
over the current destination. Shared controls live in `web/components/ui/`, with
colours and geometry defined in `web/design-tokens.css`; page styles remain next
to the corresponding modules in `web/`. Account administration and Shortcut setup
retain their focused modules, using the shared settings controls.

App navigation keeps settings topics in browser history and runs the shared
`web/unsaved-changes.ts` guard before leaving editable settings. Account changes
clear transient private state and advance a session generation so delayed reads,
mutations, and event callbacks cannot populate the next account's workspace.
Inbox layout preference is scoped to the account in browser storage; switching
Rows/Tiles preserves the loaded query results and browsing position.

Ask binds its source panel to an individual answer through `ask-format.ts`, which
also maps persisted failure codes to controlled recovery messages. The thread
tracks whether the reader is following incoming text and preserves citation focus
and reading position across capture-note navigation. Settings setup progression
lives in `web/ai-setup-progress.tsx`; saved configuration remains authoritative.

## Data and trust boundaries

- Every account-owned job, capture, connection, export, API key, and OAuth grant is scoped to a user.
- API keys carry a persisted full or capture scope. The additive migration preserves full access for existing keys. Capture keys can submit links, inspect owner-scoped Shortcut receipts, and call the bearer-only connection diagnostic; Agent API and MCP knowledge access require full keys (or existing read-only OAuth grants for MCP). The diagnostic returns only credential validity/scope and saved AI configuration readiness, with no job creation.
- Account profile fields and suspension state live on the existing users table through additive migrations. Session, API-key, and OAuth lookups enforce suspension at authentication boundaries while preserving account-owned records. Profile and password mutations act only on the session owner; administrator mutations affect access metadata, never private archive content.
- AI provider credentials and task assignments are separate records. Task assignments own the validated provider, model, and thinking level. Legacy per-provider preferences remain compatible but do not change saved task assignments. Capture jobs snapshot selected models and thinking level at submission or manual retry; Ask uses the current shared analysis assignment. Updating settings does not mutate already queued jobs.
- Explicit AI connection diagnostics use the account's saved task selection with bounded sample requests. They do not create archive or conversation records. Uploaded test audio stays in memory, and responses contain controlled result codes and selection metadata rather than provider output or raw diagnostics.
- Authenticated ingestion retains valid HTTPS submissions as owned jobs. Unsupported-platform bookmarks start in a terminal failure state and cannot enter the capture queue; the downloader keeps its Facebook/Instagram allowlist. Shortcut status reads use capture credentials with the same ownership boundary.
- Unsupported terminal bookmarks have a nullable `jobs.archived_at` visibility field,
  added after the legacy ownership migration. Owner-scoped archive/restore endpoints
  change only that field and return the safe Activity projection. Normal Activity,
  attention, and retry selections exclude archived jobs; the archived filter and
  direct owner detail preserve access to their URLs and event history. Restoring
  never queues work. Older binaries ignore the additive column and can show these
  bookmarks again, while retaining their existing unsupported-platform retry block.
- SQLite is the catalog and queue source of truth. Media and generated notes are referenced durable filesystem artifacts.
- Activity responses use an explicit public projection. Raw job records, diagnostic errors, cookie data, credentials, and internal note paths stay behind the persistence boundary. Failed events persist an optional, allowlisted failure code per attempt; legacy causes are inferred only from known historical message prefixes, otherwise remain unavailable. Raw diagnostic text never supplies UI copy. The failure list pages independently of the capture table; bulk retry selects all eligible account-owned failures in one transaction.
- Social content and model inputs are untrusted. Model outputs are accepted only through explicit structured schemas.
- Platform cookies are filtered by domain, encrypted at rest, materialized only in a mode-`0600` temporary file, and excluded from exports.
- External programs are invoked with bounded inputs and argument arrays; the application does not assemble shell commands.

## Change rules

- A new endpoint needs boundary validation, authentication/authorization coverage, and a stable response contract.
- A schema change needs an in-place migration, tests against existing-shaped data, and a rollback assessment.
- A new pipeline stage needs explicit job status/progress behavior, failure classification, and restart semantics.
- A new export or agent surface must default to the least data necessary and must not reveal internal paths or credentials.
- Update this document when a component, ownership boundary, persistence model, or dependency direction changes.
