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

## Inbox behavior

Inbox opens directly into capture search, filters, sorting, and tile/table views. It has no top summary cards. The loaded capture count remains beside the collection controls; account-wide summary APIs remain available to existing clients.

## Activity behavior

Activity opens on active captures and expands the newest one. A compact table shows each capture's source, status, updated time, and five stages: Added, Found, Media, Text, and Saved. Expanding another row closes the previous log. All includes active, failed, and completed captures, with more history available through pagination. Stage circles convey queued, active, completed, and failed states; durations appear on hover and inside expanded logs on touch devices. The summary counts active and queued jobs, failures, captures saved in the viewer's local day, and recent events. Needs attention keeps a fixed-height, scrollable list ordered by failure priority. Retry all re-queues every account-owned failed capture, including failures outside the currently loaded page, and shows pending feedback. Processing logs expose only known-safe event copy and timestamps, never raw diagnostics or internal paths. The account trigger opens a compact menu; its adjacent gear opens Settings directly on desktop.

Logs retain previous attempts when a capture was retried. When persisted history supports it, each event includes an attempt number and each failure explains its controlled failure category and recovery guidance. Automatic retry scheduling and manual retry requests are labeled separately; the attention count explicitly counts manual retries. Known AI credential, quota, rate-limit, and model-availability failures have specific recovery guidance. Unknown legacy causes are identified as unavailable. Their action labels are derived from known pipeline statuses, so changes in display wording cannot hide valid success events. Historical failures remain visible as failures alongside a later saved outcome.

Expanded Activity logs are capped at 320px. Entries scroll within the panel, with keyboard access; the heading, Copy logs action, and touch stage durations remain visible.

Activity uses the shared application sidebar, content width, and page gutters so navigation does not change the interface scale.

For release verification boundaries, see [Preview acceptance](preview-acceptance.md).

## Knowledge base browsing

Knowledge base browsing uses linked content maps: Home shows populated branches; category pages browse child categories, existing extracted insights, and captures across their subtree. Empty categories stay out of the browsing UI without removing stored taxonomy. Local Back/Forward controls navigate reading history, with Open capture on the right of capture notes. Expand all and Collapse all control the visible tree. Move capture is not exposed in this view. The global Capture link action is shown on Inbox only.

## AI setup

AI settings separates credentials from task configuration. Compact provider rows connect or manage OpenAI and Cerebras keys. The task table chooses a connected provider, a compatible model, and a thinking level where supported. Changes remain drafts until Save changes succeeds. Transcription and Analysis have separate settings; Analysis also powers Ask. Existing choices carry forward. New connections do not assign tasks automatically. Queued captures retain their saved models and thinking level, and disconnecting clears affected assignments.

The footer's Test connection action opens explicit transcription, structured-analysis, and streaming-Ask checks using saved task settings. Save draft changes before testing. Transcription uses a short audio file selected by the user; analysis and Ask use small synthetic text samples. Tests can incur provider usage and do not create captures or conversations. Results distinguish configuration from successful provider calls and become stale when relevant settings change. These checks do not certify social downloads, archive retrieval, or the full capture pipeline.

Settings topics share their layout and reserve scrollbar space to avoid horizontal shifts when switching between short and long pages. Provider verification confirms credentials; it does not replace live model and capture acceptance before production.

## Current scope

The supported source platforms are Facebook and Instagram. The application provides a private dashboard, Apple Shortcut ingestion, account API keys, OAuth-backed read-only MCP access, Obsidian Markdown output, and complete library exports.

The service does not bypass DRM, paywalls, access controls, or platform permissions. It is not a general-purpose social crawler, shared multi-tenant social network, or public media proxy. Its anonymous `/roadmap` page publishes only the maintained product roadmap and its source document; it never exposes account or archive data.

## Definition of a good change

A product change should identify the affected journey, state observable acceptance criteria, preserve privacy and provenance, cover failure behavior, and include a way to verify the result without production data. Material scope changes belong in an execution plan and should update this document.
