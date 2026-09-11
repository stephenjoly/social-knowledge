# Product roadmap

This roadmap records product priorities, not delivery commitments. Active implementation details belong in `docs/exec-plans/active/`.

## Now: Inbox analytics

Give each user an immediate, trustworthy summary of their archive and import health:

- total captures saved;
- captures saved during the rolling previous 24 hours; and
- imports currently in the terminal failed state.

Counts must be exact, owner-scoped, inexpensive, independent of Inbox pagination and filters, and refreshed after relevant live job events. See [Inbox analytics](exec-plans/active/inbox-analytics.md).

## Next: Low-friction accounts and administration

Replace token-dependent browser sign-in and sign-up with a conventional account experience. Add an administrator role and protected user management so administrators can create and delete users, initiate secure password resets, and manage account access. The existing account for `stephenjoly99@gmail.com` must receive the administrator role through a compatible, idempotent migration or bootstrap policy.

This area requires a separate plan before implementation because it changes authentication, authorization, persisted identity data, password recovery, and destructive account operations. API keys remain appropriate for agents and programmatic clients; they should not be required for ordinary browser authentication.

## Later: Large-library navigation

Extend cursor pagination to Library category and Unclassified result lists when collection size or observed query cost warrants it. Their exact counts are already computed independently of the Inbox page size, so this is not required for Inbox analytics.

