# Overview

## How it works

Social Knowledge turns supported Facebook and Instagram video links into a private, searchable media and knowledge archive. It is a single TypeScript service: the React dashboard, HTTP API, SQLite catalog, job queue, media pipeline, AI extraction, archive, and Obsidian exporter all run in one process and one container.

## Choose a guide

- [Getting started](./getting-started.md): private Docker setup and a first capture.
- [Capture and Shortcuts](./capture.md): capture processing, receipts, and Apple Share Sheet setup.
- [Library and Ask](./library-and-ask.md): search, browse, transcripts, and cited conversations.
- [Settings and AI](./settings.md): provider tasks, language, and account invitations.
- [API and MCP](./api-and-mcp.md): account keys, knowledge exports, ChatGPT, and Codex.
- [Self-hosting and backups](./self-hosting.md): deployment, configuration, storage, and recovery.
- [Security](./security.md): private access, account isolation, and source boundaries.
- [Development](./development.md): local commands and synthetic browser QA.

Full media capture supports Facebook and Instagram. Other valid HTTPS submissions are retained as unsupported bookmarks in Activity; they do not become completed captures. Metadata and comments depend on what the source makes available. The service does not bypass platform access controls.

The documentation site is intended for `/docs/` on the application origin after deployment. These Markdown guides are also readable in the repository. No one-line installer is currently provided.
