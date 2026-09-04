# Deployment model

Social Knowledge uses one public source repository and isolated runtime environments. Publishing the source does not publish an archive or require the private application to be internet-accessible.

## Environments

| Environment | Source | Data | Purpose |
|---|---|---|---|
| Pull request | The proposed commit | None or disposable fixtures | CI, build checks, and downloadable artifacts |
| Staging | The `main` commit's immutable `sha-*` container image | Dedicated disposable volumes and staging-only credentials | Browser, API, OAuth, MCP, migration, and ingestion acceptance |
| Production | The exact image digest accepted in staging and named by a version tag | Existing persistent production volumes | Personal archive and Apple Shortcut endpoint |
| GitHub Pages | Static files under `site/` | No application data or credentials | Public project homepage |

## Promotion

1. A pull request must pass type checking, unit/integration tests, and the production build.
2. Merging to `main` publishes `ghcr.io/<owner>/social-knowledge:sha-<commit>` and moves the convenience `staging` tag.
3. Dokploy staging deploys the immutable `sha-*` image into its own volumes and URL.
4. Run staging acceptance, including database migration from a production-shaped fixture when the schema changes.
5. Create a `v*` tag on the accepted commit. The container workflow adds that release tag to the same source revision.
6. Resolve the release tag to its digest and update Dokploy production to that digest. Never rebuild for production.
7. Before recreating production, take an online SQLite backup and retain the current image digest as the rollback target.
8. Verify health, browser login, capture submission, Agent API, OAuth, and MCP. Roll back the image if acceptance fails; restore the database backup only when a schema change prevents application rollback.

## Why production does not move

The production hostname, API keys, sessions, Apple Shortcut endpoint, Docker volume names, and stored archive remain unchanged. The initial cutover changes only the image source—from a locally built tag to a GHCR digest—while mounting the same existing volumes. SQLite migrations continue to execute in place at application startup.

Staging never mounts production volumes or production social-cookie files. It uses its own API token, OpenAI credential or constrained test credential, users, OAuth clients, and content. Its volumes can be reset without affecting production.

## Preview links

GitHub Actions supplies checks and build artifacts for every pull request. A stable Dokploy staging URL follows `main`. Per-pull-request application URLs can be added later through Dokploy preview deployments after their lifecycle, DNS, authentication, cleanup, and secret isolation have been verified; they are not required for the safe initial migration.

## First production cutover checklist

- Record the running production image ID and external volume names.
- Verify an online SQLite backup and its integrity.
- Confirm the candidate digest passed staging acceptance.
- Keep the production hostname, bound port, environment, cookie mount, and volume declarations unchanged.
- Change only `image:` to the accepted immutable digest and recreate the service.
- Run the complete production acceptance suite.
- Preserve the prior image and database backup until the release has remained healthy.
