# Preserve valid Facebook video with no extractable audio

Status: active
Owner: Codex Worker
Started: 2026-10-03

## Context

Four account-owned Facebook captures produced valid H.264 MP4 video, but failed because media processing unconditionally extracted an audio stream. The available yt-dlp metadata did not identify an audio-only stream. A valid downloaded video with no audio stream must remain archiveable; unreadable or streamless media must still fail.

## Scope

- Select separate upstream video and audio when yt-dlp exposes both.
- Probe the downloaded stream topology before audio extraction.
- Preserve valid video-only captures through frame analysis, archive, note, and asset persistence without a fabricated transcript or audio asset.
- Add deterministic downloader, processor, worker, and note regression coverage.

Excluded: production retries, platform credential changes, deployed diagnostics, and claims about the original post beyond the downloaded stream metadata.

## Acceptance criteria

- A valid video-only download skips transcription and translation, reaches analysis with frames and an empty transcript, and completes without an audio asset.
- A video with an audio stream still extracts audio and transcribes.
- ffprobe failures and media with no video stream remain processing failures, rather than being called silent.
- yt-dlp requests the best available video-plus-audio combination before falling back to a muxed format.

## Approach

1. Add an explicit yt-dlp format selector that retains separate audio when available.
2. Probe codec stream types in `MediaProcessor`; extract audio only after confirming an audio stream and reject missing video streams.
3. Carry nullable audio paths through archive, worker asset construction, and vault output.
4. Verify mocked command, worker orchestration, and writer behavior; then run the full repository check.

## Progress

- [x] Confirmed a clean feature branch at current `origin/staging`.
- [x] Reviewed downloader, processor, worker, archive, vault, and existing test contracts.
- [x] Implemented stream-aware behavior and deterministic regressions.
- [x] Passed focused Vitest coverage and TypeScript checks.
- [ ] Merge current `origin/staging` and run the complete repository check.

## Decisions

- 2026-10-03: Treat only a successful probe with at least one video stream and no audio stream as no-audio media. Probe errors and streamless output remain failures.
- 2026-10-03: Record no transcript as an empty persisted transcript with `transcript_available: false`; do not invent language or text.
- 2026-10-03: Use `bestvideo*+bestaudio/best/bestvideo`; a local synthetic yt-dlp 2026.08.19 check selected separate video plus audio when available and valid video-only media when every format declared `acodec=none`.

## Verification

- Focused Vitest coverage for downloader selection, processor stream topology, worker orchestration, archive/note behavior.
- `npm run check`.

## Risks and recovery

An incorrect probe classification could lose audio or accept corrupt media. The probe requires a video stream and errors propagate. The change is additive and reversible with a source revert; no migration or existing archive rewrite is required.
