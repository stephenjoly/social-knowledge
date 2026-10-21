# API and MCP

## API

Health does not require authentication:

```http
GET /health
```

`POST /api/v1/jobs` accepts a user-created bearer key for Apple Shortcuts. General (`full` scope) account-owned keys also provide read-only agent access to search, traverse, inspect, and export that user's knowledge. Create and revoke named keys after signing in under Settings. Browser catalog, activity, retry, streaming, and event routes require an authenticated server-side session.

```http
POST /api/v1/jobs
Authorization: Bearer <account-key>
Content-Type: application/json

{
  "url": "https://www.instagram.com/reel/example/",
  "note": "Potential Lisbon restaurants"
}
```

The API returns `202` for a new job and `200` for an already-captured URL. The dashboard uses session-authenticated catalog, Activity, and account-wide Inbox analytics APIs; `GET /api/v1/inbox-analytics` returns total captures, captures created in the previous 24 hours and seven days, and currently failed imports without exposing job details. `GET /api/v1/captures` remains newest-first by default and additionally accepts `sort=title|savedAt|source|category|topic` plus `direction=asc|desc`; each listed capture includes `categoryLabel`, the top-level domain of its current library assignment or `null`. Sorted cursors are opaque and must be reused with the same sort; Source uses the normalized platform-and-creator pair, Category uses the top-level domain of the current library assignment, empty category/topic values sort last, and a multi-topic capture sorts by its lexicographically first normalized topic.

Agent endpoints are documented by the OpenAPI 3.1 contract at `/openapi.json`:

- `GET /api/v1/knowledge/search?q=...` for weighted FTS5 and taxonomy search.
- `GET /api/v1/knowledge/captures` for stable `(created_at, id)` cursor pagination, up to 100 records per page.
- `GET /api/v1/knowledge/captures/:id?include=transcript,comments` for structured detail; source text is opt-in.
- `GET /api/v1/knowledge/topics` for taxonomy and facet discovery.
- `POST /api/v1/knowledge/exports` plus the status and download routes for 24-hour gzip JSONL snapshots.

Search ranks the complete matching account archive before applying its stable result cursor. Agent responses contain source links and asset metadata but never archive filesystem paths or media-download URLs. The legacy deployment `API_TOKEN` remains capture-only and is never required for browser registration or login. Interrupted exports are marked `export_interrupted` during startup so clients can retry instead of polling forever; export records are streamed into gzip rather than assembled in memory.

The `202`/`200` success statuses above describe configured capture submission; missing AI setup returns `428` with a persisted receipt. See the [full Shortcut receipt contract](./capture.md#apple-shortcut-contract) for unsupported links, authentication failures, and retry behavior. Capture-only keys receive `403 insufficient_scope` from knowledge endpoints.

## ChatGPT and Codex via MCP

The application exposes a private, read-only Streamable HTTP MCP server at `/mcp`. It provides `search_knowledge`, `get_capture`, `list_topics`, and `browse_category`; all results are scoped to the connected Social Knowledge account. Captions, comments, and transcripts are treated as untrusted source material and are never instructions.

ChatGPT and other interactive clients can use OAuth 2.1 discovery, Dynamic Client Registration, Authorization Code with PKCE S256, refresh-token rotation, and the `knowledge:read` scope. Sign into Social Knowledge when redirected and approve the read-only consent screen. Connected clients can be reviewed and revoked under **Settings → Connections → Connected assistants**.

Codex can also use a named general (`full` scope) account API key; capture-only keys cannot use MCP. Store it outside the configuration file and add:

```toml
[mcp_servers.social_knowledge]
url = "https://social-knowledge.example/mcp"
bearer_token_env_var = "SOCIAL_KNOWLEDGE_API_KEY"
```

Then export `SOCIAL_KNOWLEDGE_API_KEY` in the environment that starts Codex. Example questions include “What Portugal recommendations have I saved?” and “Compare the Lisbon restaurants in my archive.”

Troubleshooting: a `401` response means the OAuth connection or API key is missing/revoked; reconnect in the MCP client or create a replacement named key. A successful connection advertises exactly four read-only tools. The repository provides `scripts/smoke-mcp.mjs` for authenticated initialization and search acceptance. The legacy direct-deploy helper invokes it; GitHub workflows do not run it automatically after every release. A release or passing CI alone does not prove that a deployment passed this smoke test.

Full-media [portable library backups](./self-hosting.md#portable-library-backups) require a browser session and are unavailable to bearer-key clients.
