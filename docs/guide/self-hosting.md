# Self-hosting and backups

## Dokploy

Dokploy builds the root `Dockerfile` directly from the GitHub repository. GitHub Actions validates the source but does not publish deployment images. Production and staging are separate Dokploy Applications; pull-request previews are created only for collaborator-authorized PRs and use disposable container-local data plus preview-only credentials.

Follow the maintained [deployment and rollback model](https://github.com/stephenjoly/social-knowledge/blob/staging/docs/deployment-model.md): validate a disposable preview and isolated staging, promote accepted `staging` to `main`, verify an online SQLite backup, retain the prior deployment, and verify live release identity and user journeys. Passing CI or publishing a release is not evidence of deployment health. No production deployment is performed by these setup instructions.

`compose.dokploy-managed.yaml` is the dashboard-managed deployment definition. It uses the already-built local image and declares the original sandbox volumes as external, allowing Dokploy to control service lifecycle without replacing or deleting existing data. Optional runtime variables such as `NTFY_*` are editable in the Dokploy service UI; AI credentials belong to users and are managed in the application.

## Remote access

For a remote deployment, set `BIND_ADDRESS`, `APP_URL`, and `TRUSTED_PROXIES` explicitly. Keep the application bound to loopback or a private interface, terminate TLS at a trusted reverse proxy, and list only that proxy's address or CIDR in `TRUSTED_PROXIES`. The anonymous `/docs/` route shares this instance’s network reachability; publishing it does not change dashboard or API authentication. The GitHub Pages project homepage remains a separate public site.

Keep `APP_URL` at the origin, without an `/app` suffix. `BIND_ADDRESS` is the Compose host binding; `HOST` is the server listen address inside the container. The checked-in Compose binds `127.0.0.1` by default. `/health` is anonymous; `/login` handles sign-in and `/app` is private.

## Credential encryption

Provider credentials use versioned AES-256-GCM encryption. Set `AI_CREDENTIALS_KEY` to a stable random value of at least 32 characters. To rotate it, set the new value and temporarily list old values, comma-separated, in `AI_CREDENTIALS_PREVIOUS_KEYS` until users replace their stored credentials. Existing deployments fall back to `PLATFORM_CREDENTIALS_KEY`, then `API_TOKEN`.

Set a stable, randomly generated `PLATFORM_CREDENTIALS_KEY` of at least 32 characters in production.

The platform-cookie encryption fallback is `API_TOKEN`; AI encryption falls back through `PLATFORM_CREDENTIALS_KEY` and then `API_TOKEN`. Changing a fallback key can make saved credentials unreadable. Preserve these keys separately from portable exports. The checked-in dashboard-managed Compose explicitly forwards AI encryption variables but does not forward `PLATFORM_CREDENTIALS_KEY`; configure that variable in the actual application environment or adapt the deployment definition before relying on it.

## Social connections

Signed-in users can upload platform-specific Netscape `cookies.txt` exports under **Settings → Connections → Social sessions**. Social Knowledge removes unrelated domains, encrypts the remaining cookies at rest, and never returns them through the API or includes them in backups. Set the dedicated key described under [credential encryption](#credential-encryption) before storing UI-managed connections. It does not protect first-run browser registration.

Facebook increasingly requires requests that look like a real browser session. The production image includes yt-dlp's `curl-cffi` support and applies `FACEBOOK_IMPERSONATE` only to Facebook URLs. Facebook and Instagram use independent optional cookie-file settings, and cookies are never passed across platforms. Treat cookie files as account credentials: never paste them into chat or commit them.

`FACEBOOK_COOKIES_FILE` and `INSTAGRAM_COOKIES_FILE` are independent optional runtime settings. Legacy `COOKIES_FILE` falls back for Facebook only. Deployment cookie files must be mounted read-only. The checked-in dashboard-managed Compose requires its Facebook host cookie path and external volumes; it is not the minimal first-run Compose file.

## Notifications

Set `NTFY_URL`, `NTFY_TOPIC`, and, when required by the ntfy server, `NTFY_TOKEN` to receive completion and final-failure pushes. Notifications contain only the platform, a bounded safe title, and a link to the authenticated Activity page.

## Runtime limits and diagnostics

`FETCH_COMMENTS` enables best-effort comment extraction. `MAX_DURATION_SECONDS` defaults to `1800`, `MAX_DOWNLOAD_BYTES` to `524288000`, `WORKER_POLL_MS` to `2000`, and `MAX_ATTEMPTS` to `3`. Model catalog variables are described in [Settings and AI](./settings.md); Ask context controls are in [Library and Ask](./library-and-ask.md#follow-up-questions-and-context). `LOG_LEVEL`, `HOST`, and `PORT` configure the server; `APP_URL` and `TRUSTED_PROXIES` configure external URLs and proxy trust. Keep `DEMO_ACCOUNTS_ENABLED=false` outside isolated preview/staging environments.

## Storage

- SQLite and transient work files: `DATA_DIR`
- Obsidian Markdown notes: `VAULT_DIR/Social Knowledge/Users/<owner-user-id>/Captures`
- Original video, audio, and thumbnail: `MEDIA_DIR/YYYY/MM/<job-id>`
- Temporary knowledge and full-library exports: `DATA_DIR/exports/<user-id>`; snapshots expire after 24 hours.

The original media is deliberately kept outside the vault so Obsidian synchronization does not ingest large files. Each note retains the archive paths and original source URL.

When a platform does not provide a downloadable thumbnail, ingestion archives the first JPEG frame
already extracted for visual analysis. Existing captures with a video but no thumbnail can be
audited and repaired without re-downloading or rerunning AI processing. Build the CLI with `npm run build` first and run with the deployment’s environment variables exported. For a host checkout using `.env`, invoke `node --env-file=.env dist/thumbnail-backfill-cli.js` with the same flags instead of `npm run thumbnails:backfill --`:

```bash
npm run thumbnails:backfill -- --dry-run
npm run thumbnails:backfill -- --apply
npm run thumbnails:backfill -- --rollback /data/backups/thumbnail-backfill-<timestamp>.jsonl
```

Apply mode validates each source video and generated JPEG, never overwrites an existing thumbnail,
and writes an append-only recovery manifest under `DATA_DIR/backups`. Run it as the same unprivileged
user that owns the archive. Rollback removes only exact manifest-owned asset records and generated
files whose checksums still match.

Do not replace the sandbox vault volume with a host/NAS bind mount until its path, ownership, synchronization behavior, and backup coverage have been verified on the Dokploy host.

## Portable library backups

Signed-in users can also create a complete portable backup under **Settings → Data & export → Export archive**. The resulting 24-hour `.tar.gz` contains account-owned structured metadata, transcripts, selected comments, generated Markdown notes, and every archived media asset. It excludes passwords, sessions, API keys, OAuth credentials, social-platform cookies, and server configuration. Full-library backups use session-authenticated `/api/v1/library-exports` routes and are intentionally unavailable to bearer-key clients.

These account exports do not replace an operator’s online SQLite backup, media/vault backups, and separately protected server configuration and encryption keys. Verify backup integrity and recovery before changing storage or production releases.

## Legacy manual deployment helper

The repository retains `scripts/deploy-dokploy.sh` for the older direct SSH/Compose workflow. It is not the current staged Dokploy release path. For an explicitly authorized legacy environment, its required inputs and command remain:

```bash
export DEPLOY_TARGET=deploy@example-host
export DEPLOY_COMPOSE_DIR=/path/to/compose
export DEPLOY_CONTAINER=social-knowledge
export DEPLOY_BASE_URL=https://social-knowledge.example
scripts/deploy-dokploy.sh
```

The helper runs typechecking, tests, and a production build; takes a timestamped online SQLite backup; tags the current local image as `social-knowledge:rollback-last`; builds and recreates the service; waits for health; and runs public, authenticated browser, OAuth, Agent API, and MCP acceptance. A shell trap attempts to remove temporary users and keys. It assumes an existing `demo` account for the Agent API key and uses a mutable local image tag. Do not substitute it for the current production promotion procedure. `SMOKE_BASE_URL=https://social-knowledge.example npm run smoke:live` can run the public smoke checks independently.
