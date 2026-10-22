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

Rows are the default. The Rows/Tiles choice keeps the current search, filters,
sort, loaded results, and browsing anchor. The preference is stored per signed-in
account in that browser, not synchronized across devices. Tiles use stored
thumbnails with a stable fallback and retain titles, creators, and source platform;
phone layouts keep each tile readable in a single column. Empty archives offer a
first capture and a way to resume incomplete AI setup.

The sidebar groups Inbox, Activity, and Knowledge base under Library. Assistant
contains New chat and searchable conversation history on every app page. Chats
are grouped by pin and date, with pending and failed answer indicators. Row menus
rename, pin or unpin, export Markdown with source URLs, and confirm deletion.
Renaming and pinning preserve the chat’s date group.
The capture button opens a dialog over the current page. Command/Ctrl+K opens the
destination palette. G then I/A/K/Q opens Inbox, Activity, Knowledge base, or a
new chat; / focuses chat search. The processing card links to Activity and remains
available in the mobile menu.

The account-row gear and Command/Ctrl+, open Settings over the current page.
Its sections are My account, AI & models, Connections, API keys, Data & export,
and People & access for administrators. Closing restores the underlying page and
focus; browser Back closes the modal. Links use `?settings=<topic>` and legacy
Settings links remain supported. Unsaved drafts show Save changes and Discard
controls and require confirmation before closing. Phones use a full-screen modal.

## Activity behavior

Activity follows screen 04 with the approved UX addendum. Four stat cards show
processing, queued, needing attention, and saved in the viewer's local day. Rows
emphasize the post, current status, and next action. Needs attention gives failure
guidance without duplicating the full explanation in the capture list. Selecting
an item opens its inspector; timing, stage history, attempts, and logs are revealed
through Show timing and logs. Copy safe logs exposes only controlled event copy
and timestamps, never raw diagnostics or internal paths.

Fix connection opens Settings › Connections and retains the affected capture as
return context. It explains reconnecting first, then retrying. Missing AI setup
similarly retains the submitted link, opens AI & models, and offers retry after
saved setup. A queued receipt describes queued work; duplicate receipts distinguish
queued, processing, completed, unsupported, and archived outcomes. Only new or
requeued work displays the processing steps. Capture's iPhone tip opens guided
Shortcut setup in API keys.

Terminal unsupported bookmarks can be archived with an undo action and restored
from Activity's Archived filter. Archiving removes them from normal lists and
attention counts while preserving their URL and complete event history. Restoring
does not queue a download. Other failures remain visible and actionable. Retry all
failed covers eligible account-owned failures beyond the loaded page, excluding
archived and unsupported bookmarks. The newest active capture is selected when it
starts; a `?job=` link or a recovery return selects its specific capture instead.

Logs retain previous attempts when a capture was retried. When persisted history supports it, each event includes an attempt number and each failure explains its controlled failure category and recovery guidance. Automatic retry scheduling and manual retry requests are labeled separately; the attention count explicitly counts manual retries. Known AI credential, quota, rate-limit, and model-availability failures have specific recovery guidance. Unknown legacy causes are identified as unavailable. Their action labels are derived from known pipeline statuses, so changes in display wording cannot hide valid success events. Historical failures remain visible as failures alongside a later saved outcome.

On wide screens Activity fills the viewport: the work column scrolls on its own
and the inspector runs to the bottom edge. Expanded logs scroll with keyboard
access. Below 1100px the inspector stacks under the lists; selecting an item scrolls
it into view, and its return action goes back to that item.

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

AI settings separates credentials from task configuration. Compact provider rows connect or manage OpenAI and Cerebras keys. The task table chooses a connected provider, a compatible model, and a thinking level where supported. Changes remain drafts until Save changes succeeds. Transcription, Analysis, and Ask AI default have separate settings. An unset Ask default follows Analysis, preserving existing choices. New connections do not assign tasks automatically. Queued captures retain their saved models and thinking level, and disconnecting clears affected assignments.

The bottom Test connection section’s Run test action opens explicit transcription, structured-analysis, and streaming-Ask checks using saved task settings. Save draft changes before testing. Transcription uses a short audio file selected by the user; analysis and Ask use small synthetic text samples. Tests can incur provider usage and do not create captures or conversations. Results distinguish configuration from successful provider calls and become stale when relevant settings change. These checks do not certify social downloads, archive retrieval, or the full capture pipeline.

Settings topics share their layout and reserve scrollbar space to avoid horizontal shifts when switching between short and long pages. Provider verification confirms credentials; it does not replace live model and capture acceptance before production.

Setup guidance distinguishes connecting credentials, assigning tasks, saving draft
changes, and explicitly testing saved settings. Task assignments and Save remain
discoverable on phones. Connection help describes the manual cookie-file workflow
and transferring a file to a phone; it does not imply one-click social sign-in.

## Ask behavior

Ask has one composer, a full-width conversation header, and a toggleable sources
panel. New chats offer grounded starter questions when saved posts exist. The
composer picker lists connected providers’ analysis models and supported thinking
levels. A chat remembers its model; Set as default changes the model for new chats.
Manage models opens Settings on AI & models. With no connected model, Connect a
model opens that setup.

Each answer records the provider, model, and thinking level actually used. Its
metadata names the model, source count, and time; historical answers without model
metadata remain unlabeled. Retry with… runs another attempt with a selected model
without changing the chat selection. Completed answers can be retried only while
they are the latest answer. Earlier attempts remain in history; subsequent model
context uses the latest completed retry instead of duplicating replaced answers.
Interrupted pending answers recover automatically to a retryable failure.
A disconnected chat selection falls back to
the Ask default, then Analysis, and records the actual fallback model.

Source cards identify the answer they support; a follow-up without citations does
not inherit older cards. Earlier evidence remains available through its answer.
The Sources button and S toggle the panel. Citation clicks reopen it and highlight
the matching source; source cards open saved notes. Repeated citations within one
point are consolidated. Streaming follows new text while the reader is at the
bottom and stops following when the reader scrolls up.

Reopened failures use controlled recovery copy. Missing AI setup links to AI &
models. Empty archives offer capture and explain that answers need saved posts.
My account preferences control default source visibility and whether Enter or
Command/Ctrl+Enter sends messages; Shift+Enter inserts a new line.

## Account settings and access administration

My account manages the signed-in person's display name, username, initials-avatar color, password, and session. Password changes require the current password and sign out existing browser sessions. The archive shortcut opens Data & export; account-owned captures, credentials, and API keys remain private.

Avatar colour saves immediately; profile fields require Save changes. Navigation
warns before discarding unsaved edits. Language preferences are discoverable from
My account and remain in Data & export, where changes explicitly apply to new
captures only and retain save/error feedback.

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
