# Product roadmap

Updated 2026-09-24 from the product owner's walkthrough and the prior roadmap. Horizons show planning intent, not delivery commitments. This is the single product priority list; implementation plans belong in `docs/exec-plans/active/`. Current shipped behavior is described in `docs/product.md` and `README.md`.

## What the feedback says

| Area | Keep | Improve or add |
| --- | --- | --- |
| Inbox / captures | Grid, playable source video, titles, summaries, bottom line, evidence | Consider **Library** as the name for the main capture collection; improve search and filters; offer a sortable table; make category and tags clear; add a capture button and modal; allow personal notes in the detail drawer. |
| Generated knowledge | The overall summary structure and source grounding | Surface fewer, stronger takeaways and actions. Lead with the actual insight rather than boilerplate about the creator. Let users choose a summary style or template later. |
| Library / knowledge base | Obsidian-like browsing and Markdown export | Make notes editable or annotatable; make the complete download easy to find; investigate safe, ongoing sync into a user-controlled Obsidian vault. The current separate Library view sees little use. |
| Ask AI | Relevant, quick answers with linked playable sources | Improve the visual design without changing the core answer flow. |
| Activity | Useful processing history | Put failed jobs first and make recovery clearer; refine the UI. |
| Capture | Current capture flow works | Put a `+` action in the collection header that opens capture in a modal. |
| Settings and onboarding | API keys and connections are valuable | Replace the long settings page with a left navigation by topic; split AI setup into transcription model and analysis model choices; consider an in-app, downloadable Apple Shortcut setup flow. |

The owner compared the desired filter interaction with Linear: a filter menu exposes available fields, selected fields become visible controls, and each control supports operators such as “is any of” and “is not any of” with multiple checked values. This is an interaction reference, not a request to copy Linear's visual design.

## First 1–2 months — make the daily workflow sharper

1. **Make AI setup a two-step choice.** Step 1: configure a transcription provider/model. Step 2: configure an analysis provider/model. Show which models support each job, verify credentials and model access, and make the selected choices visible and editable in Settings. The same model, provider, or credential may serve both jobs when capable; the choices remain separate. Today transcription is a server-side OpenAI model selected by environment variable, while each account selects an OpenAI or Cerebras generation provider with a server-configured analysis model. Plan the account-scoped settings and migration before implementation, and decide explicitly whether Ask uses the analysis choice. *(Owner follow-up feedback; current setup hides the transcription dependency and offers no model selection in the UI.)*
2. **Improve insight quality.** Tune extraction and presentation so a simple clip does not produce eight marginal takeaways or unnecessary actions. Prefer concise, specific claims; show an action only when the source warrants one. Keep evidence and source attribution. Evaluate with a small set of varied captures before rollout. *(Owner feedback; highest content-quality pain.)*
3. **Refresh the core interface as one coordinated UI program.** Start with the Inbox search and filter experience, then the capture detail, Ask, Activity, and shared visual patterns. Preserve the useful grid and playback. Prototype the field picker, visible filter controls, multi-select values, and inclusion/exclusion operators; make active filters easy to read and clear. *(Owner feedback.)*
4. **Make recovery and capture more direct.** Show failed Activity jobs first with retry guidance; add a `+` action in the Inbox header that opens the existing capture form in a modal. *(Owner feedback; uses existing actions.)*
5. **Make the complete archive export obvious.** Surface the existing account-owned full-library `.tar.gz` download from the Library and/or collection area, with clear contents and expiry. The backend export already exists under Settings; this is a discovery and usability task, not a new export engine. *(Owner feedback; verified in README and UI.)*

## Months 3–6 — organize and personalize the archive

1. **Add a sortable table beside the grid.** Allow sorting by title, capture date, source, category, and topic/tag where those fields are reliable. Keep selection, playback, and detail access consistent across views; verify sorting works across all pages of results. *(Owner feedback.)*
2. **Clarify one primary category and multiple tags/topics per capture.** Reconcile the existing Library classification tree and generated topics with the requested category/tag model. Let users correct classification and tags, and make both usable in filters and sorting. Preserve existing data and owner isolation. *(Owner feedback; current classification and topics already exist, but their meaning is not obvious.)*
3. **Add account-owned notes to captures.** Let users write and edit notes from the detail drawer and Library, keep generated text distinct from user text, and include notes in search and portable exports. Decide how edits interact with generated Markdown before implementation. *(Owner feedback.)*
4. **Rebuild Settings navigation.** Use a left sidebar with sections such as Profile, Security, AI, Connections, API keys, and Exports. Keep current settings discoverable on smaller screens. Explore a summary-style configuration here, initially with a few understandable choices; assess a free-form system prompt only after defining validation and source-grounding rules. *(Owner feedback.)*
5. **Finish account administration from the prior roadmap.** First-account setup, roles, invitations, and user listing are already on staging. Remaining scope: protected account removal, role changes, and secure password reset/recovery. Write a separate execution plan because identity deletion and recovery are sensitive. *(Prior roadmap, narrowed against completed onboarding plan.)*

## Months 6–12 — deepen portability and integrations

1. **Provide a guided Apple Shortcut download.** Build on the existing Shortcut and account API keys so a signed-in user can install a working personal Shortcut with minimal manual setup. Design key creation, handoff, revocation, and error recovery without embedding a reusable secret in a public artifact. Confirm Apple's signing/import constraints before choosing the exact flow. *(Owner feedback; a Shortcut exists today but requires manual configuration/signing.)*
2. **Investigate ongoing Obsidian vault sync.** Support an explicitly connected, user-controlled vault or folder, create/update one note per capture, and define edit ownership, conflict handling, deletion, offline recovery, and credential boundaries. Start with a technical/product design and a narrow pilot; current server-side Markdown publication and one-shot export are separate capabilities. *(Owner feedback.)*
3. **Scale Library navigation if evidence warrants it.** Extend cursor pagination to category and Unclassified lists when collection size or measured query cost justifies it. *(Carried from prior roadmap; conditional, not an immediate user pain.)*

## 12+ months — evaluate broader product shape

1. **Reconsider Inbox and Library information architecture.** Test whether the capture collection should be called Library and whether the separate knowledge-base view should become an advanced view, since the owner rarely opens it. Do this after the collection, notes, and table changes provide a real basis for evaluation. *(Owner feedback; naming and navigation are open decisions.)*
2. **Consider advanced summary templates and prompt controls.** If simpler style choices do not meet user needs, design per-user templates with safe defaults, preview, versioning, and a way to reprocess existing captures. Never let user templates erase original evidence or attribution. *(Owner feedback; later extension of summary personalization.)*
3. **Assess additional source platforms, including TikTok.** The walkthrough referred to TikToks, while the product and URL validator currently support Facebook and Instagram. Confirm whether TikTok is a requested integration or shorthand for short videos, then validate demand, ingestion reliability, and rights before committing it to a build horizon. *(Scope decision pending.)*

## Decisions and sequencing

- **Preserve what works:** grid browsing, in-place playback, Ask source links, the existing summary sections where useful, evidence, source URL, creator attribution in metadata, Obsidian output, and full-library export.
- **One UI roadmap item, several releases:** the visual refresh is one program with independently reviewable filter/search, detail, Ask, Activity, Settings, and responsive milestones. AI setup, content quality, and failure handling are early because they affect successful capture and daily trust.
- **Avoid duplicate work:** the existing full export and Shortcut are starting points; tokenless registration and invitations are delivered on staging. A new export engine and repeated onboarding work are excluded.
- **Open product choices:** confirm TikTok scope; choose the final Inbox/Library names; define category versus tag ownership and edit behavior; choose whether user notes change exported Markdown; decide the supported Obsidian sync model; decide whether Ask shares the analysis model. These choices do not block the first UI and insight-quality work.
- **Evidence and sizing:** these priorities come from the product owner's 2026-09-24 walkthrough plus the prior roadmap. No customer demand, engineering effort, or delivery date has been inferred. Re-rank after user research and technical sizing.
