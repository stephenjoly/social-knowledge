# Technical debt

Track only specific, evidenced deficiencies that are intentionally deferred. This is not a feature wishlist.

Each entry should name the affected area, evidence, impact, desired end state, and removal test. Delete entries when resolved; link to an active execution plan when work begins.

## Current items

### PR preview storage isolation

Runtime inspection on 2026-09-27 found PR #31's Dokploy preview and permanent staging mounting the same named data, vault, and media volumes. Account mutations and migrations in the preview can therefore affect staging. Dokploy v0.29.2 inherits parent Application mounts; preview environment variables do not override them.

Desired end state: automatic PR previews with synthetic credentials and storage isolated from permanent staging and production. A dedicated mount-free preview Application remains a possible remediation. On 2026-09-27 the owner accepted updating PR #31 against the existing shared staging storage because it contains only demo accounts. This task-specific exception permits its deployment and demo acceptance; it does not establish storage isolation. Removal test: inspect a freshly created and redeployed preview's actual container mounts, then verify preview writes cannot affect staging. See the [completed account-settings plan](exec-plans/completed/2026-09-27-account-settings.md).

On 2026-10-22, PR #64 reused and enriched shared synthetic staging storage at the owner’s explicit request. Live GPT-5 testing exposed a second requirement of this exception: runtimes sharing encrypted provider records must share a compatible encryption key ring. PR64’s per-preview encryption fallback could not read a credential written by permanent staging, despite persisted verified status. The owner approved an explicit preview `AI_CREDENTIALS_KEY` matching staging’s effective key, retaining the old PR64 key in `AI_CREDENTIALS_PREVIOUS_KEYS`. Keep provider encryption stable independently of per-preview API tokens; do not overwrite saved provider credentials to repair a runtime key mismatch. See the [provider recovery plan](exec-plans/active/ask-provider-recovery.md).
