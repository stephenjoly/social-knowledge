# Technical debt

Track only specific, evidenced deficiencies that are intentionally deferred. This is not a feature wishlist.

Each entry should name the affected area, evidence, impact, desired end state, and removal test. Delete entries when resolved; link to an active execution plan when work begins.

## Current items

### PR preview storage isolation

Runtime inspection on 2026-09-27 found PR #31's Dokploy preview and permanent staging mounting the same named data, vault, and media volumes. Account mutations and migrations in the preview can therefore affect staging. Dokploy v0.29.2 inherits parent Application mounts; preview environment variables do not override them.

Desired end state: automatic PR previews with synthetic credentials and storage isolated from permanent staging and production. A dedicated mount-free preview Application is proposed, pending owner approval because it changes the deployment model. Until resolved, hold feature redeployment and remote mutation tests. Removal test: inspect a freshly created and redeployed preview's actual container mounts, then verify preview writes cannot affect staging. See the [active account-settings plan](exec-plans/active/2026-09-27-account-settings.md).
