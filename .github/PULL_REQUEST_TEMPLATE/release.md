## Production release

Promote the complete approved staging state to production.

Tested environment: [Open permanent staging](https://social-knowledge.staging.stephenjoly.net). Release PRs reuse permanent staging and do not create disposable previews.

## Staging evidence

Tested full staging SHA:

Acceptance results (health, login, capture, search, export, Agent API, OAuth/MCP, and affected flows):

Known gaps or blockers:

- [ ] Permanent staging serves the recorded `staging` commit.
- [ ] Staging uses isolated disposable data and staging-only credentials.
- [ ] Required automated and product acceptance checks passed.
- [ ] Current staging head still matches the tested SHA; later changes were retested.
- [ ] No staging experiment, personal archive content, or staging-only configuration is being promoted.

## Release behavior

Merging this PR authorizes production. Dokploy deploys `main`; GitHub checks promotion provenance. After rollout, verify the resulting production commit, health, and core journeys. CI alone is not deployment evidence.

## Rollback readiness

- [ ] Schema changes are backward-compatible or the rollback constraint is documented.
- [ ] A current online SQLite backup has been verified.
- [ ] The previous known-good Dokploy deployment remains available.
