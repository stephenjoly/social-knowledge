# Overview

Save a useful video, keep the original source, and find the idea again. Social Knowledge turns the Facebook and Instagram videos you deliberately share into a private library of media, transcripts, takeaways, and cited answers.

If you are setting up your own instance, start with [Getting started](./getting-started.md). Already have access? Learn how to [save a link](./capture.md) or [browse and ask your archive](./library-and-ask.md).

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

## How it works

A single service handles the dashboard, capture queue, media processing, AI extraction, and storage. Captures keep their source attribution alongside the saved media. Search and Ask use the archive you build; Markdown exports let you take your notes to Obsidian.

Social Knowledge runs on your server with your own AI provider keys. For installation, storage, and recovery details, see [Self-hosting and backups](./self-hosting.md). No one-line installer is currently provided.
