# Social Knowledge

Social Knowledge turns supported Facebook and Instagram video links into a private, searchable media and knowledge archive. It is a single TypeScript service: the React dashboard, HTTP API, SQLite catalog, job queue, media pipeline, AI extraction, archive, and Obsidian exporter all run in one process and one container.

## Pipeline

1. Accept an authenticated link from an Apple Shortcut or another client.
2. Normalize, allowlist, and persist the job in SQLite; after extraction, deduplicate alternate share URLs by the platform media ID.
3. Download bounded media and best-effort metadata with `yt-dlp`.
4. Extract mono audio and representative frames with FFmpeg.
5. Transcribe audio with OpenAI.
6. Detect the transcript language and, when enabled in the user's Settings, translate foreign-language clips into the user's default language while preserving the original transcript.
7. Analyze the translated transcript when available, plus the caption, selected comments, and frames using strict structured output.
8. Archive video/audio and atomically write a Markdown source note into the Obsidian vault.

The worker retries transient failures and recovers interrupted jobs after a restart. Metadata and comments are nullable because social extractors cannot guarantee them.

## Requirements

- Node.js 22+
- FFmpeg
- `yt-dlp`
- An OpenAI API key for audio transcription; each user connects OpenAI or Cerebras for generation in Settings

Docker includes all runtime dependencies.

## Safe first test

The safest first run uses disposable project-local storage rather than your real Obsidian vault:

1. Copy `.env.example` to `.env`.
2. Put a long random value in `API_TOKEN` and add `OPENAI_API_KEY` locally for audio transcription. Never commit `.env`.
3. Set `DATA_DIR=/data`, `VAULT_DIR=/vault`, and `MEDIA_DIR=/media` for Docker.
4. Create the local `data`, `vault`, and `media` directories.
5. Run `docker compose up --build -d`.
6. Open the application and create the first administrator with a strong password. The setup form also requires the `API_TOKEN`; this prevents another network client from claiming a fresh instance.
7. In **Settings → AI provider**, connect an OpenAI or Cerebras API key. The app tests the key before encrypting and storing it.
8. Submit one public Reel, watch Activity, then open the completed card in Inbox.

Capture and Ask requests are blocked until the signed-in account has a verified AI provider. Provider definitions and routing live in `src/ai-providers.ts`, so another OpenAI-compatible generation provider can be added without changing the capture pipeline. Cerebras generation uses `CEREBRAS_ANALYSIS_MODEL` (default `qwen-3.8-27b`). Audio transcription remains on the server-side OpenAI transcription configuration because Cerebras Inference does not expose the audio transcription endpoint used by this application.

Provider credentials use versioned AES-256-GCM encryption. Set `AI_CREDENTIALS_KEY` to a stable random value of at least 32 characters. To rotate it, set the new value and temporarily list old values, comma-separated, in `AI_CREDENTIALS_PREVIOUS_KEYS` until users replace their stored credentials. Existing deployments fall back to `PLATFORM_CREDENTIALS_KEY`, then `API_TOKEN`.

Comment extraction is best-effort. When `FETCH_COMMENTS=true`, the archive keeps up to ten available comments, prioritizing pinned and highly liked responses; a platform returning no comments does not prevent the capture from completing.

## Local development

```bash
cp .env.example .env
npm install
npm test
npm run dev
```

The checked-in Playwright flow covers login, Inbox/detail playback, and the responsive dashboard against a running deployment:

```bash
E2E_BASE_URL=https://social-knowledge.example \
E2E_USERNAME=your-test-user \
E2E_PASSWORD=your-test-password \
npm run test:e2e
```

Set a long random `API_TOKEN`, provide `OPENAI_API_KEY`, and use disposable local directories for `VAULT_DIR` and `MEDIA_DIR` until the configuration has been validated.

Capture failures are stored as a stable category, friendly recovery guidance, and a separate bounded technical diagnostic. Activity keeps the diagnostic collapsed by default so normal users see what happened and what to do rather than raw downloader output.

Language preferences live under Settings. Each user can select a default language and independently enable or disable translation of foreign-language captures. Both the original and translated transcript remain visible and searchable.

## API

Health does not require authentication:

```http
GET /health
```

`POST /api/v1/jobs` accepts a user-created bearer key for Apple Shortcuts. The same account-owned keys provide read-only agent access to search, traverse, inspect, and export that user's knowledge. Create and revoke named keys after signing in under Settings. Browser catalog, activity, retry, streaming, and event routes require an authenticated server-side session.

```http
POST /api/v1/jobs
Content-Type: application/json

{
  "url": "https://www.instagram.com/reel/example/",
  "note": "Potential Lisbon restaurants"
}
```

The API returns `202` for a new job and `200` for an already-captured URL. The dashboard uses session-authenticated catalog, Activity, and account-wide Inbox analytics APIs; `GET /api/v1/inbox-analytics` returns total captures, captures created in the previous 24 hours, and currently failed imports without exposing job details.

Agent endpoints are documented by the OpenAPI 3.1 contract at `/openapi.json`:

- `GET /api/v1/knowledge/search?q=...` for weighted FTS5 and taxonomy search.
- `GET /api/v1/knowledge/captures` for stable `(created_at, id)` cursor pagination, up to 100 records per page.
- `GET /api/v1/knowledge/captures/:id?include=transcript,comments` for structured detail; source text is opt-in.
- `GET /api/v1/knowledge/topics` for taxonomy and facet discovery.
- `POST /api/v1/knowledge/exports` plus the status and download routes for 24-hour gzip JSONL snapshots.

Signed-in users can also create a complete portable backup under **Settings → Export library**. The resulting 24-hour `.tar.gz` contains account-owned structured metadata, transcripts, selected comments, generated Markdown notes, and every archived media asset. It excludes passwords, sessions, API keys, OAuth credentials, social-platform cookies, and server configuration. Full-library backups use session-authenticated `/api/v1/library-exports` routes and are intentionally unavailable to bearer-key clients.

Search ranks the complete matching account archive before applying its stable result cursor. Agent responses contain source links and asset metadata but never archive filesystem paths or media-download URLs. The legacy deployment `API_TOKEN` remains capture-only. Interrupted exports are marked `export_interrupted` during startup so clients can retry instead of polling forever; export records are streamed into gzip rather than assembled in memory.

### ChatGPT and Codex via MCP

The application exposes a private, read-only Streamable HTTP MCP server at `/mcp`. It provides `search_knowledge`, `get_capture`, `list_topics`, and `browse_category`; all results are scoped to the connected Social Knowledge account. Captions, comments, and transcripts are treated as untrusted source material and are never instructions.

ChatGPT and other interactive clients can use OAuth 2.1 discovery, Dynamic Client Registration, Authorization Code with PKCE S256, refresh-token rotation, and the `knowledge:read` scope. Sign into Social Knowledge when redirected and approve the read-only consent screen. Connected clients can be reviewed and revoked under **Settings → AI Connections**.

Codex can also use a named account API key. Store it outside the configuration file and add:

```toml
[mcp_servers.social_knowledge]
url = "https://social-knowledge.example/mcp"
bearer_token_env_var = "SOCIAL_KNOWLEDGE_API_KEY"
```

Then export `SOCIAL_KNOWLEDGE_API_KEY` in the environment that starts Codex. Example questions include “What Portugal recommendations have I saved?” and “Compare the Lisbon restaurants in my archive.”

Troubleshooting: a `401` response means the OAuth connection or API key is missing/revoked; reconnect in the MCP client or create a replacement named key. A successful connection advertises exactly four read-only tools. The deployment workflow runs an authenticated MCP initialization and search smoke test after every release.

## Apple Shortcut contract

Create a Share Sheet Shortcut that accepts URLs and performs **Get Contents of URL**:

- URL: `https://<internal-service-name>/api/v1/jobs`
- Method: `POST`
- Headers:
  - `Authorization`: `Bearer <API_TOKEN>`
  - `Content-Type`: `application/json`
- JSON body:
  - `url`: the Shortcut input URL
  - `note`: optional prompted text

Prefer an internal route reachable over WireGuard. Do not expose this endpoint publicly without scoped authentication, request limits, and reverse-proxy hardening.

## Dokploy

Dokploy builds the root `Dockerfile` directly from the GitHub repository. GitHub Actions validates the source but does not publish deployment images. Production and staging are separate Dokploy Applications; pull-request previews are created only for collaborator-authorized PRs and use disposable container-local data plus preview-only credentials.

Set a stable, randomly generated `PLATFORM_CREDENTIALS_KEY` of at least 32 characters in production. Signed-in users can upload platform-specific Netscape `cookies.txt` exports under **Settings → Facebook and Instagram**. Social Knowledge removes unrelated domains, encrypts the remaining cookies at rest, and never returns them through the API or includes them in backups. `API_TOKEN` is used as a compatibility fallback encryption key only when `PLATFORM_CREDENTIALS_KEY` is absent; set the dedicated key before storing UI-managed connections.

For a remote deployment, set `BIND_ADDRESS`, `APP_URL`, and `TRUSTED_PROXIES` explicitly. Keep the application bound to loopback or a private interface, terminate TLS at a trusted reverse proxy, and list only that proxy's address or CIDR in `TRUSTED_PROXIES`. Public static documentation does not require exposing the application itself.

`compose.dokploy-managed.yaml` is the dashboard-managed deployment definition. It uses the already-built local image and declares the original sandbox volumes as external, allowing Dokploy to control service lifecycle without replacing or deleting existing data. Runtime variables, including `OPENAI_API_KEY` and optional `NTFY_*` values, are editable in the Dokploy service UI.

Set `NTFY_URL`, `NTFY_TOPIC`, and, when required by the ntfy server, `NTFY_TOKEN` to receive completion and final-failure pushes. Notifications contain only the platform, a bounded safe title, and a link to the authenticated Activity page.

Set `DEPLOY_TARGET`, `DEPLOY_COMPOSE_DIR`, `DEPLOY_CONTAINER`, and `DEPLOY_BASE_URL`, then run:

```bash
scripts/deploy-dokploy.sh
```

It runs typechecking, tests, and the production build; takes a timestamped online SQLite backup; tags the current image as `social-knowledge:rollback-last`; deploys the new image; waits for health; and runs public, authenticated browser, and account-owned Agent API acceptance tests. Temporary users and keys are removed by a shell trap. `npm run smoke:live` can also be run independently.

Facebook increasingly requires requests that look like a real browser session. The production image includes yt-dlp's `curl-cffi` support and applies `FACEBOOK_IMPERSONATE` only to Facebook URLs. Facebook and Instagram use independent optional cookie-file settings, and cookies are never passed across platforms. Treat cookie files as account credentials: never paste them into chat or commit them.

Do not replace the sandbox vault volume with a host/NAS bind mount until its path, ownership, synchronization behavior, and backup coverage have been verified on the Dokploy host.

## Storage

- SQLite and transient work files: `DATA_DIR`
- Obsidian Markdown notes: `VAULT_DIR/Inbox/Social/YYYY/MM`
- Original video, audio, and thumbnail: `MEDIA_DIR/YYYY/MM/<job-id>`
- Temporary knowledge and full-library exports: `DATA_DIR/exports/<user-id>`; snapshots expire after 24 hours.

The original media is deliberately kept outside the vault so Obsidian synchronization does not ingest large files. Each note retains the archive paths and original source URL.

When a platform does not provide a downloadable thumbnail, ingestion archives the first JPEG frame
already extracted for visual analysis. Existing captures with a video but no thumbnail can be
audited and repaired without re-downloading or rerunning AI processing:

```bash
npm run thumbnails:backfill -- --dry-run
npm run thumbnails:backfill -- --apply
npm run thumbnails:backfill -- --rollback /data/backups/thumbnail-backfill-<timestamp>.jsonl
```

Apply mode validates each source video and generated JPEG, never overwrites an existing thumbnail,
and writes an append-only recovery manifest under `DATA_DIR/backups`. Run it as the same unprivileged
user that owns the archive. Rollback removes only exact manifest-owned asset records and generated
files whose checksums still match.

## Security boundaries

- Only HTTPS Facebook and Instagram hostnames are accepted.
- Shell execution is never used; subprocess arguments are passed as arrays.
- Playlists, overlong videos, and oversized downloads are rejected.
- Cookie authentication is optional and must be mounted read-only.
- The container runs unprivileged, drops Linux capabilities, and has a read-only root filesystem.
- The source URL and creator attribution remain in every note.

Do not use the service to bypass DRM, paywalls, access controls, or platform permissions.
