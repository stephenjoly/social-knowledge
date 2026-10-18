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

Inbox opens directly into capture search, filters, sorting, and a compact list. It has no top summary cards. The loaded capture count remains beside the collection controls; account-wide summary APIs remain available to existing clients.

The sidebar groups Inbox, Activity, and Knowledge base under Library, with Ask in
a separate Assistant group. Its capture button opens a dialog over the current
page. The search control and Command/Ctrl+K open a destination palette; this is
navigation, not archive search. The G then I/A/K/Q shortcuts open Inbox, Activity,
Knowledge base, and Ask. The processing card shows live account-owned work and
links to Activity; on mobile it remains available inside the menu.

The account-row gear opens Settings on My account. Settings replaces the sidebar
navigation with My account, AI & models, Connections, API keys, Data & export,
and People & access for administrators. Back to archive returns to the previous
archive destination. There is no Overview page or second settings sidebar.

## Activity behavior

Activity follows screen 04 of the UI v2 contract. Four stat cards show captures processing, queued, needing attention, and saved in the viewer's local day. Needs attention lists failed captures in failure-priority order with their failure, the stage it failed at, and the attempt; each offers Retry (except unsupported-platform bookmarks), and expired platform sessions also offer Fix connection, which opens Settings › Connections. Retry all failed re-queues every account-owned failed capture, including failures outside the loaded page, and shows pending feedback. The Captures list shows all statuses by default, or only in-progress work, with a five-step tracker (Added, Found, Media, Text, Saved) and the current status on every row, and more history through pagination. Selecting a row or failure opens it in the inspector on the right: a stage checklist with durations (running stages show a clock), the processing log, failure guidance for failed captures, and Copy safe logs. The newest active capture is selected automatically when it starts; a `?job=` link selects and highlights that capture instead. Processing logs expose only known-safe event copy and timestamps, never raw diagnostics or internal paths. The account trigger opens a compact menu; its adjacent gear opens Settings directly on desktop.

Logs retain previous attempts when a capture was retried. When persisted history supports it, each event includes an attempt number and each failure explains its controlled failure category and recovery guidance. Automatic retry scheduling and manual retry requests are labeled separately; the attention count explicitly counts manual retries. Known AI credential, quota, rate-limit, and model-availability failures have specific recovery guidance. Unknown legacy causes are identified as unavailable. Their action labels are derived from known pipeline statuses, so changes in display wording cannot hide valid success events. Historical failures remain visible as failures alongside a later saved outcome.

On wide screens Activity fills the viewport: the work column scrolls on its own and the inspector runs to the bottom edge, with its log scrolling inside it with keyboard access. Below 1100px the inspector stacks under the lists and selecting a row scrolls it into view.

Activity uses the shared application sidebar and the v2 app page gutters (40px by 56px).

For release verification boundaries, see [Preview acceptance](preview-acceptance.md).

## Knowledge base browsing

Knowledge base shows populated category cards, topic counts, and extracted
insights linked to their captures. Category and topic pages browse child topics,
takeaways, and captures across their subtree. Empty categories stay out of the
browsing UI without removing stored taxonomy. Local Back/Forward controls retain
reading history. Capture notes show the original source, takeaways,
recommendations, transcripts, and classification details; recommendation markers
are decorative. The note's Back action returns to the page and state it was opened
from. Capture remains available from the application shell.

## AI setup

AI settings separates credentials from task configuration. Compact provider rows connect or manage OpenAI and Cerebras keys. The task table chooses a connected provider, a compatible model, and a thinking level where supported. Changes remain drafts until Save changes succeeds. Transcription and Analysis have separate settings; Analysis also powers Ask. Existing choices carry forward. New connections do not assign tasks automatically. Queued captures retain their saved models and thinking level, and disconnecting clears affected assignments.

The footer's Test connection action opens explicit transcription, structured-analysis, and streaming-Ask checks using saved task settings. Save draft changes before testing. Transcription uses a short audio file selected by the user; analysis and Ask use small synthetic text samples. Tests can incur provider usage and do not create captures or conversations. Results distinguish configuration from successful provider calls and become stale when relevant settings change. These checks do not certify social downloads, archive retrieval, or the full capture pipeline.

Settings topics share their layout and reserve scrollbar space to avoid horizontal shifts when switching between short and long pages. Provider verification confirms credentials; it does not replace live model and capture acceptance before production.

## Account settings and access administration

My account manages the signed-in person's display name, username, initials-avatar color, password, and session. Password changes require the current password and sign out existing browser sessions. The archive shortcut opens Data & export; account-owned captures, credentials, and API keys remain private.

People & access is a separate administrator-only settings topic. Administrators can search accounts, change another person's role, and suspend or restore sign-in and credential access. Suspension preserves the person's archive and credentials. The server prevents self-demotion, self-suspension, and removing the last active administrator. Administration never grants access to another person's archive or credentials.

Invitation links remain single-use and expire after 24 hours. Raw links are available only when created or regenerated, because persisted invitations contain token hashes. The interface can copy links held in the current page session; regenerating a link invalidates its predecessor.

## Current scope

Full media capture supports Facebook and Instagram. Authenticated HTTPS submissions from other platforms, including TikTok, retain the original URL as an account-owned bookmark in Activity with an explicit unsupported-platform message. These bookmarks do not appear as completed captures in Inbox or Library and are never downloaded. Missing AI setup also retains the submitted URL for later retry. Apple Shortcut receipts distinguish URL acceptance from finished capture and provide bounded completion polling. The application provides a private dashboard, Apple Shortcut ingestion, account API keys, OAuth-backed read-only MCP access, Obsidian Markdown output, and complete library exports.

The service does not bypass DRM, paywalls, access controls, or platform permissions. It is not a general-purpose social crawler, shared multi-tenant social network, or public media proxy. Its anonymous `/roadmap` page publishes only the maintained product roadmap and its source document; it never exposes account or archive data.

## Definition of a good change

A product change should identify the affected journey, state observable acceptance criteria, preserve privacy and provenance, cover failure behavior, and include a way to verify the result without production data. Material scope changes belong in an execution plan and should update this document.

## Apple Shortcut setup

Settings → API keys provides a signed v6 completion Shortcut download and an optional receipt-only variant, alongside account-key creation and import/share instructions. Downloads are public and contain no credentials; users enter their own key in Shortcuts. The published templates connect to social-knowledge.stephenjoly.net, which is shown in the setup card. Files are pinned to the tested repository commit so later branch changes cannot replace the download silently.

Guided setup creates a named capture-only key, offers a copy action with manual-copy fallback, and tests the bearer credential without creating a capture. Users still paste the key once during import. The test checks browser connectivity and saved AI configuration, not iPhone installation or live provider availability. Capture-only keys cannot access Agent API or MCP knowledge; existing general keys retain their permissions. Revocation remains in the account key list.
