# Getting started

## Requirements

- Node.js 22+
- FFmpeg
- `yt-dlp`
- An account-scoped OpenAI connection for audio transcription; users may independently choose OpenAI or Cerebras for analysis

Docker includes all runtime dependencies.

For the Docker path, install Docker Engine with the Compose plugin (or Docker Desktop) and clone this repository. Run the following from its root. The checked-in Compose file uses raw environment-file format, requiring a Compose version that supports `env_file.format: raw`.

## Safe first test

The safest first run uses disposable project-local storage rather than your real Obsidian vault:

1. Copy `.env.example` to `.env`.
2. Replace the placeholder in `API_TOKEN` with a long random value of at least 32 characters. Add `AI_CREDENTIALS_KEY` with a separate stable random value of at least 32 characters; `.env.example` does not currently include it. Never commit `.env`. `API_TOKEN` is for legacy Shortcut capture and an encryption-compatibility fallback; it is not a browser sign-up credential.
3. Keep `DATA_DIR=/data`, `VAULT_DIR=/vault`, and `MEDIA_DIR=/media` for Docker. Set `APP_URL=http://localhost:8787` for this local test, with no `/app` suffix. Leave `BIND_ADDRESS` unset to use Compose’s loopback-only default.
4. Create the local `data`, `vault`, and `media` directories.
5. Run `docker compose up --build -d`.
6. Keep the fresh application private until this step: open `http://localhost:8787/login` and create the first administrator with a strong password, confirmation, and acknowledgement of administrator authority. The first successful registration is signed in immediately; an unclaimed, publicly reachable deployment can be claimed by its first visitor.
7. In onboarding or Settings → AI & models, connect provider keys, assign the Transcription and Analysis tasks, and save the selections. Capture requires an OpenAI connection for transcription and either OpenAI or Cerebras for analysis; Ask requires only an analysis selection. The app tests each key before encrypting and storing it.
8. Submit one public Reel, watch Activity, then open the completed card in Inbox.

The shell steps are:

```bash
cp .env.example .env
# Edit .env as described above before starting.
mkdir -p data vault media
docker compose up --build -d
```

Keep all three directories disposable until capture and export are verified; do not point this first run at your real Obsidian vault. The container runs as an unprivileged user, so bind-mounted directories must be writable by that user.

`GET /health` checks service availability. After signing in, `/app` opens your private library; `/` is the public landing page. A signed-out app visit returns to its requested location after login.

For [Share Sheet setup](./capture.md#guided-shortcut-setup), [AI and language choices](./settings.md), and [remote hosting or backups](./self-hosting.md), continue with the dedicated guides. Read the [first-administrator and invitation boundaries](./security.md) before widening network access.
