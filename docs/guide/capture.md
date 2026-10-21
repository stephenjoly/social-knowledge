# Capture and Shortcuts

## Pipeline

1. Accept an authenticated link from an Apple Shortcut or another client.
2. Normalize, allowlist, and persist the job in SQLite; after extraction, deduplicate alternate share URLs by the platform media ID.
3. Download bounded media and best-effort metadata with `yt-dlp`.
4. Extract mono audio and representative frames with FFmpeg.
5. Transcribe audio with OpenAI.
6. Detect the transcript language and, when enabled in the user's Settings, translate foreign-language clips into the user's default language while preserving the original transcript.
7. Analyze the translated transcript when available, plus the caption, selected comments, and frames using strict structured output.
8. Archive video/audio and atomically write a Markdown source note into the Obsidian vault.

The worker retries transient failures and recovers interrupted jobs after a restart. Metadata and comments are nullable because social extractors cannot guarantee them.

Comment extraction is best-effort. When `FETCH_COMMENTS=true`, the archive keeps up to ten available comments, prioritizing pinned and highly liked responses; a platform returning no comments does not prevent the capture from completing.

## Guided Shortcut setup

In Settings → API keys, choose **Create Shortcut key**, copy the key, and paste it when importing the signed download. These keys only submit links, check account-owned receipts, and call `GET /api/v1/shortcut/connection`; they cannot search or export knowledge. **Test connection** validates the bearer key from this browser and reports whether AI task configuration is saved. It creates no job and does not verify iPhone installation or live AI access. Existing general API keys keep their permissions.

The key-creation API accepts optional `scope: "capture" | "full"` (default `full` for existing clients). The connection endpoint requires an active account bearer key, ignores browser cookies, returns `{ ok: true, scope, captureReady }`, and disables caching. Missing/revoked/suspended credentials receive 401.

Before rolling back to code predating key scopes, revoke capture-only keys: old code would otherwise treat them as general keys.

## Apple Shortcut contract

Download the token-free v6 shortcuts from [the repository’s shortcuts directory](https://github.com/stephenjoly/social-knowledge/blob/staging/shortcuts/README.md). Both variants passed native macOS tests against a local test server; actual iPhone/live-account acceptance remains separate. Sources, Apple-signed downloads, and validation evidence are versioned in the repository. v5 remains known broken.

Generate an importable Share Sheet Shortcut without embedding a secret:

```bash
python3 scripts/build-shortcut.py --endpoint https://<service-name>/api/v1/jobs --output /tmp/save.shortcut
shortcuts sign --mode anyone --input /tmp/save.shortcut --output /tmp/save-signed.shortcut
```

Import the signed file on your Apple device and enter an account API key from Settings. The Shortcut extracts the first URL from shared text. When run without a shared link (including the editor Run button), it asks you to paste a URL. It extracts a URL from that answer, converts it to text, and stops locally without a request if no URL is found. It submits JSON `{"url": "…"}` to `POST /api/v1/jobs` with `Authorization: Bearer <account-key>`, checks the server receipt, then polls `GET /api/v1/shortcut/jobs/:id` every five seconds for up to twelve checks. Completed jobs show archive success; failed jobs show the safe server response. If processing takes longer, the receipt points you to Activity; it does not claim completion. iOS can interrupt a running Share Sheet Shortcut, so polling is bounded feedback, not a guaranteed background callback. Server-side [ntfy completion/failure notifications](./self-hosting.md#notifications) are also available.

For a server predating the polling route, add `--receipt-only`. This version checks the submission response and directs you to Activity without polling. Keep the original Shortcut until the replacement is verified on-device. Test by sharing an Instagram/Facebook URL, an unsupported TikTok URL, and a copy with an invalid API key. Never publicly share a personalized Shortcut containing a token. `--personal-source` is only for private local repair of an existing Shortcut.

Receipt contract:

- Authenticated, valid HTTPS submissions persist the original URL as an account-owned job before AI configuration is required. `received: true` plus `job.id` confirms URL retention, not media capture.
- Supported Facebook/Instagram links queue media capture. Unsupported HTTPS links (including TikTok) are retained in Activity with `unsupported_platform`; they never enter the downloader and cannot be retried. They are URL bookmarks, not completed captures in Inbox/Library.
- Missing transcription/analysis configuration retains a failed job with `ai_setup_required`. The response remains HTTP 428 for compatibility, now including the persisted receipt. Configure AI in Settings, then retry or resubmit.
- `invalid_request` means the JSON body is missing a nonempty string `url` (or otherwise fails the request schema); it does not mean the API key expired. The generated Shortcut checks empty input before POST.
- Invalid/unsafe input and rejected authentication do not create jobs. HTTP 401 means the credential is invalid, revoked, or belongs to a suspended account; account API keys have no automatic expiry.
- The status route accepts account API keys and the legacy `API_TOKEN`, enforces ownership, disables caching, and returns controlled failure copy without internal diagnostics. Browser job routes continue to require browser sessions.

Prefer an internal route reachable over WireGuard. Do not expose this endpoint publicly without scoped authentication, request limits, and reverse-proxy hardening.
