# Development workflow

The release path is:

```text
origin/staging -> codex feature branch -> PR preview/review -> staging
  -> combined staging QA -> approved staging-to-main PR -> production verification
```

## Start a task

1. Run `bash scripts/agent-preflight.sh`, then fetch `origin` before selecting a base.
2. Resume existing work on its existing branch. Otherwise create a descriptive `codex/` branch from current `origin/staging`.
3. Give simultaneous tasks separate branches and worktrees. Never switch branches underneath another active task.
4. Read `AGENTS.md`, `context.md`, and only the task-relevant sources they link.

## Commit and synchronize

- Make focused commits and stage only task-owned paths. Never commit secrets, cookies, databases, media, vault content, exports, or unrelated changes.
- Push meaningful checkpoints before pausing or handing off. State honestly when work remains local or a push fails.
- Open a draft PR targeting `staging` early so checks, discussion, and the Dokploy preview are visible.
- Before final review, fetch and compare against both the remote feature branch and `origin/staging`. Merge current staging into an already-published feature branch rather than rewriting shared history.
- Run focused checks while iterating and `npm run check` before merge. Browser-facing changes also require preview acceptance.

## Review and promotion

Feature PRs merge into `staging`, never directly into `main`. Staging contains accepted work intended for the next release; experiments stay on feature branches and previews.

After a feature merge, Dokploy automatically updates permanent staging. Test the combined staging state and record its full SHA. If staging changes afterward, retest the new state. Production requires the owner's authorization and a `staging` to `main` release PR following `docs/deployment-model.md`.

## Handoff and cleanup

A handoff records branch, worktree, latest pushed commit, PR and preview links, checks run, known failures, remaining work, and local-only changes.

After merge, confirm the PR and preview are closed, the worktree is clean, and no unique commits remain before removing a worktree or branch. Never force-remove active or dirty work, and never retire `staging` or `main`.
