# Execution plans

Use an execution plan for work that spans multiple subsystems or sessions, changes architecture or persisted data, has material rollout risk, or benefits from a durable decision trail. Small, self-contained changes can use an ephemeral task plan instead.

Store work in progress under `active/`. Move it to `completed/` when all acceptance criteria are met; completed plans are history and should not be rewritten to describe later behavior.

## Template

```markdown
# <Outcome>

Status: active
Owner: <human or agent>
Started: YYYY-MM-DD

## Context
What problem exists, for whom, and what evidence establishes it?

## Scope
What is included and explicitly excluded?

## Acceptance criteria
- Observable, testable outcome

## Approach
The intended sequence, affected boundaries, migration, and rollout strategy.

## Progress
- [ ] Concrete milestone

## Decisions
- YYYY-MM-DD: Decision and rationale.

## Verification
Commands and manual or staging checks required.

## Risks and recovery
Failure modes, monitoring, rollback, and data recovery.
```
