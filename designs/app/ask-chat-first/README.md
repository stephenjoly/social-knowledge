# Ask AI — chat-first design contract

**Status: approved by Stephen on 22 October 2026 with no changes. This is the
binding UI target for the Ask, sidebar and Settings work.** [`index.html`](index.html)
is the definition of success: implementation must match it. Scope, decisions, API
contract and acceptance criteria are in the execution plan
[`docs/exec-plans/active/ask-chat-first.md`](../../../docs/exec-plans/active/ask-chat-first.md).

Open [`index.html`](index.html) in a browser (no build, no network). The top bar
steps through six states. PNG copies, captured at a 1360×1000 viewport, are in
[`previews/`](previews/): `home`, `convo`, `picker`, `history`, `focus`, `settings`
match states 1–6.
Inspired by the approved Delegate chat-first target in the phone-concierge repo.
Tokens are copied from `web/design-tokens.css`. All chats, creators and posts are
synthetic.

## Proposed changes

1. **Chat history in the sidebar.** Under Assistant, "Ask" becomes **New chat**
   (`G Q`), followed by **Search chats** (`/`) and every conversation grouped
   Pinned / Today / Yesterday / Previous 7 days / month. Spinner = still
   answering, amber dot = last answer failed. Row `⋯` menu: Rename, Pin to top,
   Export as Markdown, Delete. This replaces the History popover, the header
   New chat button and the "Recent conversations" list on the Ask home.
2. **Model picker replaces "Whole archive".** The chip had no handler. The picker
   lists analysis models from every provider connected in Settings › AI & models,
   grouped by provider, with thinking level only where the model supports it.
   The choice is per chat; new chats start on the default. "Manage models" opens
   Settings on AI & models. The answer meta line names the model that answered,
   and "Retry with…" re-runs an answer on another model.
3. **Settings as a modal** over the current screen (gear or `⌘,`; `×`/`Esc`
   closes). Same sections and grouping as today. AI & models gains one row,
   **Ask AI default**. An unsaved-changes bar replaces the leave-page prompt.
4. **Polish of the current Ask screen:** full-width header bar (no floating white
   box); sources panel toggleable (`S`, button, or clicking a citation) and flush
   to the window edge, with a short synopsis per card; one citation per point
   instead of after every sentence; one focus ring on the composer (today the
   textarea and the composer both draw one).

## Review script (about 3 minutes)

1. **1 · New chat** — sidebar shows the history list; composer shows the model chip.
2. **2 · Conversation** — hover a citation number: its source card lights up.
3. **3 · Model picker** — click GPT-5, then Qwen: the thinking control appears
   only for models that support it, and the chip and answer meta update.
4. **4 · Search & manage chats** — type in Search chats; the `⋯` menu is open.
5. **5 · Sources hidden** — press `S` or click a citation to bring the panel back.
6. **6 · Settings modal** — switch sections; change a model select to see the
   unsaved bar; press `Esc` to return to the chat.

## Resolved questions

Recorded as decisions in the execution plan: chat history shows on every app page;
the per-chat model persists on the conversation and each answer records its model;
Ask AI default is a new nullable owner setting that falls back to Analysis (Ask
already routes through the Analysis selection via `runForUser`); mobile reuses the
existing drawer with a full-screen Settings modal and is confirmed at preview.
