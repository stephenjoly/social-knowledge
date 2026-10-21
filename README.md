<img src="docs/readme/social-knowledge-mark.svg" width="56" height="56" alt="Social Knowledge logo">

# Social Knowledge

Turn saved reels into knowledge you can actually use.

Social Knowledge is a private, self-hosted archive for people who save useful Facebook and Instagram videos and want to find the ideas again. Submit a link from your browser or Apple Share Sheet. Keep the original media and source alongside transcripts, takeaways, and recommendations, then search your collection or ask a follow-up question.

![Social Knowledge Inbox with searchable saved clips and category filters, using synthetic demo content.](docs/screenshots/inbox-framed.png)

## What you can do

- Find saved clips with search, categories, topics, and platform filters.
- Read transcripts and extracted insights beside the original media and creator attribution.
- Ask questions across your archive and follow citations back to saved notes.
- Capture from Apple Shortcuts, export Markdown for Obsidian, or download a portable library backup.
- Connect ChatGPT, Codex, and other agents through account-scoped, read-only MCP and Agent API access.

Full media capture supports Facebook and Instagram. Other valid HTTPS links remain unsupported bookmarks in Activity. Downloads and metadata depend on platform availability; the service does not bypass access controls. Screenshots use synthetic content; the guide’s Ask screenshot contains a seeded sample answer.

## Try it privately with Docker

Install Docker with a Compose version supporting raw environment files, clone this repository, and run these commands from its root. Docker supplies Node.js, FFmpeg, and yt-dlp.

```bash
cp .env.example .env
```

Edit `.env`: replace `API_TOKEN` with a random value of at least 32 characters; add a separate stable `AI_CREDENTIALS_KEY` of at least 32 characters. Set `APP_URL=http://localhost:8787`; keep the Docker storage paths `/data`, `/vault`, and `/media`.

```bash
mkdir -p data vault media
docker compose up --build -d
```

**Keep the fresh instance private until you create its first administrator at http://localhost:8787/login. The first successful registration claims administrator authority; an unclaimed public instance can be claimed by its first visitor.** Compose binds loopback by default. Use disposable storage first and never commit `.env`.

Connect provider keys in Settings → AI & models, assign and save Transcription and Analysis, then submit one public Reel. Capture requires OpenAI transcription and OpenAI or Cerebras analysis; provider usage may incur charges.

## Documentation

Start with [Getting started](docs/guide/getting-started.md), [Shortcuts](docs/guide/capture.md), or the [guide overview](docs/guide/index.md). The intended public [documentation site](https://social-knowledge.stephenjoly.net/docs/) will serve `/docs/` after accepted deployment; use these repository guides until then. Detailed configuration, API, security, backups, and development instructions live there.
