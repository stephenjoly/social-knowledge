# Development

```bash
cp .env.example .env
# Set secrets and local paths as described below.
npm ci
npm test
node --env-file=.env --import tsx --watch src/index.ts
```

The checked-in Playwright flow covers login, Inbox/detail playback, and the responsive dashboard against a running deployment:

```bash
E2E_BASE_URL=https://social-knowledge.example \
E2E_USERNAME=your-test-user \
E2E_PASSWORD=your-test-password \
npm run test:e2e
```

`npm run dev` runs the same watched TypeScript entry point when variables are already exported. It does not load `.env` automatically; the explicit Node command above does. Before starting, replace `API_TOKEN`, add `AI_CREDENTIALS_KEY`, and set `DATA_DIR=./data`, `VAULT_DIR=./vault`, `MEDIA_DIR=./media`, and `APP_URL=http://localhost:8787`. For local-only access set `HOST=127.0.0.1`; `BIND_ADDRESS` controls Docker’s host port binding, not the bare Node server. Use disposable directories and keep a fresh instance private until its first administrator has registered. Install Node.js 22+, FFmpeg, and yt-dlp for the host runtime. AI configuration is described in [Getting started](./getting-started.md).

Run the complete repository checks before declaring a code change complete:

```bash
npm run check
```

This validates documentation, landing assets, TypeScript, the production build, and tests. Use focused deterministic tests during iteration. Runtime code lives in `src/`, React UI in `web/`, unit/integration tests in `test/`, and browser acceptance in `e2e/`.

## Non-production demo accounts

Staging and pull-request previews can show one-click synthetic member and administrator accounts on the login page. Set `DEMO_ACCOUNTS_ENABLED=true` only on the non-production Dokploy Application. The default public credentials are `demo-member` / `DemoMember123!` and `demo-admin` / `DemoAdmin123!`; they can be changed with the corresponding `DEMO_MEMBER_*` and `DEMO_ADMIN_*` variables.

The application creates missing demo users and reconciles their passwords and roles at every startup. Staging keeps these users in its dedicated volume. Each preview has a separate disposable database, so previews do not share users or data; they merely recreate the same credentials from inherited environment settings. Never enable demo accounts or store real information in them in production.

## Agent browser QA

Paseo’s `paseo.json` worktree setup installs dependencies and matching browser binaries automatically. For existing checkouts, use Node.js 22+ and run:

```bash
npm ci
npx playwright install
npm run test:e2e
```

When `E2E_BASE_URL` is unset, Playwright builds the UI and starts a disposable loopback-only Fastify server on port 4185 automatically. Self-contained tests also start their own synthetic SQLite fixture servers. The archive test requires a separately running synthetic deployment and `E2E_USERNAME`/`E2E_PASSWORD`; absent credentials intentionally skip it. Never use production data.

For a full local UI run, including authenticated and fixture-only journeys otherwise
skipped, run `npx tsx scripts/ui-e2e.ts`. This seeds the disposable QA server from
`scripts/ui-fixture.ts` and uses deterministic Ask responses. It requires no real
provider credentials and refuses an external `E2E_BASE_URL`. Chromium must be
installed; on the development VM, source `~/.cache/sk-browser/env.sh` first.

Agents may run these commands autonomously for authorized local QA. Keep test data synthetic and do not submit real messages, calls, or production writes. Retain failure traces/screenshots outside Git; report failed and skipped tests explicitly. Browser caches are shared per host, while dependencies are installed per worktree.

## Contribution workflow

Run `bash scripts/agent-preflight.sh`, inspect branch/worktree state, and fetch before choosing a base. Start feature work from current `origin/staging` on a dedicated `codex/` branch; isolate concurrent edits in a worktree. Preserve unrelated changes and use task-scoped checkpoints and a draft PR targeting `staging`.

Read the repository’s [engineering standards](https://github.com/stephenjoly/social-knowledge/blob/staging/docs/engineering.md), [development workflow](https://github.com/stephenjoly/social-knowledge/blob/staging/docs/development-workflow.md), and [architecture](https://github.com/stephenjoly/social-knowledge/blob/staging/ARCHITECTURE.md) for the maintained contribution rules. Release PRs promote accepted `staging` to `main`; Dokploy owns deployments. [Deployment and rollback](https://github.com/stephenjoly/social-knowledge/blob/staging/docs/deployment-model.md) defines the release gates.
