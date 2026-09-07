# Product

## Purpose

Social Knowledge turns Facebook and Instagram media a person deliberately submits into a private, searchable knowledge archive they control. It should make a saved item useful later without requiring the user to replay or manually summarize it.

## Core user journeys

1. Submit a supported link from the Apple Share Sheet or authenticated browser.
2. See trustworthy progress and actionable failure guidance.
3. Review the captured media, source attribution, transcript, summary, topics, entities, and evidence.
4. Search and browse the archive from the dashboard or a read-only AI connection.
5. Export a complete portable copy of account-owned knowledge and media.
6. Configure language behavior and account-specific Facebook or Instagram access without exposing credentials.

## Product principles

- **Private by default.** Account isolation and secret handling outrank convenience.
- **Source-grounded.** Preserve the original URL, creator attribution, source text, and evidence so generated knowledge can be checked.
- **Useful after capture.** Search, classification, recommendations, and summaries should help retrieval and action, not merely store files.
- **Honest about uncertainty.** Missing metadata and comments are normal; unsupported claims and failures should be visible rather than invented or hidden.
- **Recoverable.** Interrupted jobs and exports should have clear retry behavior, and the complete library should be portable.
- **Low-friction ingestion.** The common capture path should remain quick enough to use habitually from a phone.

## Current scope

The supported source platforms are Facebook and Instagram. The application provides a private dashboard, Apple Shortcut ingestion, account API keys, OAuth-backed read-only MCP access, Obsidian Markdown output, and complete library exports.

The service does not bypass DRM, paywalls, access controls, or platform permissions. It is not a general-purpose social crawler, shared multi-tenant social network, or public media proxy.

## Definition of a good change

A product change should identify the affected journey, state observable acceptance criteria, preserve privacy and provenance, cover failure behavior, and include a way to verify the result without production data. Material scope changes belong in an execution plan and should update this document.
