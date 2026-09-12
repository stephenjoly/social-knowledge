# Architecture

Social Knowledge is a single-process TypeScript application with a React browser client. The monolith is intentional: one deployable owns ingestion, processing, search, export, and the authenticated UI while keeping data local and operational complexity low.

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
| HTTP and sessions | `src/app.ts`, `src/auth.ts` | Input validation, authentication, ownership, response shaping |
| Capture queue | `src/worker.ts`, `src/failures.ts`, `src/events.ts` | Job lifecycle, retry, recovery, progress events |
| Acquisition | `src/url.ts`, `src/downloader.ts`, `src/media-processor.ts` | URL allowlisting, bounded download, metadata, audio and frames |
| AI processing | `src/transcriber.ts`, `src/translator.ts`, `src/title-generator.ts`, `src/analyzer.ts` | Typed model interactions and knowledge extraction |
| Persistence | `src/db.ts` | SQLite schema, migrations, account-scoped records and queries |
| Archive | `src/archive.ts`, `src/vault-writer.ts`, `src/library-publisher.ts` | Durable media, Markdown notes, library publication |
| Knowledge access | `src/knowledge.ts`, `src/ask.ts`, `src/mcp.ts`, `src/openapi.ts` | Search, role-preserving conversational retrieval, compaction checkpoints, read-only agent access and contracts |
| Connections | `src/oauth.ts`, `src/platform-connections.ts` | MCP authorization and encrypted platform credentials |
| Browser UI | `web/` | Authenticated dashboard; it consumes HTTP APIs rather than storage directly |
| Operations | `Dockerfile`, `compose*.yaml`, `deploy/`, `scripts/` | Reproducible build, deployment, smoke checks and rollback |

## Dependency direction

Keep dependencies flowing from composition and transport toward focused services and data types:

```text
index/app/worker -> domain services -> db/config/types
web UI          -> HTTP contracts
```

Domain services must not depend on initialized server instances or UI code. The UI must not rely on database layout or private archive paths. Cross-cutting services such as events and notifications are injected into the worker.

## Data and trust boundaries

- Every account-owned job, capture, connection, export, API key, and OAuth grant is scoped to a user.
- SQLite is the catalog and queue source of truth. Media and generated notes are referenced durable filesystem artifacts.
- Social content and model inputs are untrusted. Model outputs are accepted only through explicit structured schemas.
- Platform cookies are filtered by domain, encrypted at rest, materialized only in a mode-`0600` temporary file, and excluded from exports.
- External programs are invoked with bounded inputs and argument arrays; the application does not assemble shell commands.

## Change rules

- A new endpoint needs boundary validation, authentication/authorization coverage, and a stable response contract.
- A schema change needs an in-place migration, tests against existing-shaped data, and a rollback assessment.
- A new pipeline stage needs explicit job status/progress behavior, failure classification, and restart semantics.
- A new export or agent surface must default to the least data necessary and must not reveal internal paths or credentials.
- Update this document when a component, ownership boundary, persistence model, or dependency direction changes.
