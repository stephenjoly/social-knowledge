# Deployment model

Social Knowledge uses one public source repository and isolated runtime environments. Publishing the source does not publish an archive or require the private application to be internet-accessible.

## Environments

| Environment | Source | Data | Purpose |
|---|---|---|---|
| Pull request | A `codex/*` branch targeting `staging` | Container-local disposable data and preview-only credentials | CI, review, and isolated Dokploy preview acceptance |
| Staging | The `staging` branch built by Dokploy | Dedicated disposable volumes and staging-only credentials | Combined browser, API, OAuth, MCP, migration, and ingestion acceptance |
| Production | The `main` state promoted by an approved `staging` to `main` PR | Existing persistent production volumes | Personal archive and Apple Shortcut endpoint |
| GitHub Pages | Static files under `site/` | No application data or credentials | Public project homepage |

## Promotion

1. Create a `codex/*` branch from freshly fetched `origin/staging` and open a feature PR targeting `staging`.
2. CI must pass type checking, unit/integration tests, documentation checks, and the production build. Dokploy creates a collaborator-authorized disposable preview from the staging Application.
3. Validate affected flows in the preview using synthetic data, then merge approved work into `staging`.
4. Dokploy automatically builds and deploys permanent staging from `staging` into isolated volumes and credentials.
5. Test the combined staging release and record its full SHA. Include a production-shaped migration test when the schema changes. Retest if staging advances.
6. When the owner authorizes production, run **Prepare Production Release** or open a `staging` to `main` PR using the release template. Pull requests into `main` from any other branch fail policy validation.
7. Before merging, verify an online SQLite backup and retain the current production deployment as the rollback target. Merging the release PR authorizes Dokploy to build and deploy `main`.
8. Verify the actual resulting `main` commit in production: health, browser login, capture submission, search/export, Agent API, OAuth, and MCP. CI or PR merge status alone is not deployment evidence.

## Why production does not move

The production hostname, API keys, sessions, Apple Shortcut endpoint, Docker volume names, and stored archive remain unchanged. The initial cutover changes only the image source—from a locally built tag to a GHCR digest—while mounting the same existing volumes. SQLite migrations continue to execute in place at application startup.

Staging never mounts production volumes or production social-cookie files. It uses its own API token, OpenAI credential or constrained test credential, users, OAuth clients, and content. Its volumes can be reset without affecting production.

## Preview links

GitHub Actions validates every pull request and pushes to `staging` and `main`. Dokploy clones the repository and builds the root Dockerfile locally; GitHub does not publish runtime container images. Permanent staging follows `staging`. Only feature PRs targeting `staging` receive collaborator-authorized disposable previews with preview-only credentials and container-local data. Release PRs reuse permanent staging and must not create another preview. Preview deployments never mount production or staging volumes.

Dokploy must keep **Require collaborator permissions** enabled, use a small preview limit, and remove preview Applications when PRs close. A preview URL proves only that an environment was created; it is not a health or acceptance attestation.

## First production cutover checklist

- Record the running production image ID and external volume names.
- Verify an online SQLite backup and its integrity.
- Confirm the candidate digest passed staging acceptance.
- Keep the production hostname, bound port, environment, cookie mount, and volume declarations unchanged.
- Change only `image:` to the accepted immutable digest and recreate the service.
- Run the complete production acceptance suite.
- Preserve the prior image and database backup until the release has remained healthy.
