# Trustworthy archive guide

Status: completed
Owner: delivery lead
Started: 2026-10-23

## Context
Stephen approved a small refinement after a Portugal archive query returned a fixed miss message followed by keyword troubleshooting. Ask should guide the user's saved library, not act as a general research agent.

## Scope
Shorten the deterministic empty-retrieval reply; align contextual planner and answer policy around archive navigation, discussion of saved ideas and app help. Keep natural greetings, contextual clarification and grounded explanations. No web research, new tools, harness, providers, schema or layout changes.

## Acceptance criteria
- A clear archive miss reports no matching saves concisely, without claiming exhaustive absence or requiring the user to troubleshoot keywords.
- Positive response principles govern tone; no phrase blacklist or query keyword classifier.
- General reasoning serves saved material and archive/app tasks, rather than unrelated standalone requests.
- Explicit external research requests get a brief truthful handoff, with no browsing or offer to perform research.
- Citation validation, ownership and nullable sufficiency semantics stay intact.

## Approach
One backend worker owns src/ask.ts and test/ask.test.ts. Lead owns documentation, integration and verification. Preserve existing PR targeting staging.

## Progress
- [x] Inspect exact screenshot reply: deterministic empty-retrieval fallback.
- [x] Update policy/fallback and focused regression coverage (9736ba8).
- [x] Full check and relevant preview verification.

## Decisions
- 2026-10-23: User authorized this refinement directly. This narrows the earlier app-scoped general drafting policy to an archive-centered mandate.
- 2026-10-23: Report retrieval results honestly; a search miss is not proof the complete library contains no related item. No extra generation call to rewrite a known empty result.

## Verification
- Focused Ask tests: 42 passed; server typecheck and diff check passed.
- npm run check: 396 tests across 41 files passed, documentation/site checks, strict server/web types and production build passed. UI assets unchanged.
- Dokploy preview deployed source/docs revision 79f117d4afe9b870af33c3076836b90d3a11271e.
- Live synthetic demo-member, GPT-6 Luna Medium: Portugal question returned exactly “I didn’t find matching saves for that question.”, sufficient=false, zero sources. Explicit online restaurant research request returned a truthful external-search handoff, sufficient=null, zero sources, with no offer to perform research. Two bounded real-provider turns; no credential/default changes.
- Retained synthetic acceptance chat c87da8d6-5fa0-4fb9-9dc7-5f00b2a4537b, “Archive guide policy verification”, for review.
- No production promotion in this task. Existing UI assets and browser journeys are unchanged; no visual comparison required for the backend policy/fallback refinement.

## Risks and recovery
Prompt behavior is probabilistic; deterministic misses remain short by construction. Preserve strict source validation and existing contextual source reuse. Revert scoped policy/fallback checkpoint if needed; no data migration.
