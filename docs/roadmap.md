# Product roadmap

This roadmap records product priorities, not delivery commitments. Active implementation details belong in `docs/exec-plans/active/`.

## Next: Low-friction accounts and administration

Replace token-dependent browser sign-in and sign-up with a conventional account experience. Add an administrator role and protected user management so administrators can create and delete users, initiate secure password resets, and manage account access.

This area requires a separate plan before implementation because it changes authentication, authorization, persisted identity data, password recovery, and destructive account operations. API keys remain appropriate for agents and programmatic clients; they should not be required for ordinary browser authentication.

## Later: Large-library navigation

Extend cursor pagination to Library category and Unclassified result lists when collection size or observed query cost warrants it. Their exact counts are already computed independently of the Inbox page size.
