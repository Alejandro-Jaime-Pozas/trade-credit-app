# Prompt log — async document processing

Feature: `async_document_processing`
Date: 2026-08-15

## Trigger

> So what's the issue with leaving the backend as it is now? if let's say 10 users are uploading
> multiple files?

Followed by:

> we dont' need super high level prod implementation for now, what we do need is a good base
> structure to prevent those inefficiencies like db open connection waiting on 3rd party and similar
> issues.
>
> look at this repo's structure, architecture @docs/ and @logs/ to determine the best way to
> implement an efficient infrastructure.

## Decisions confirmed

| Question | Answer |
|---|---|
| UI while a document is being classified | Backend only for now — "Pending classification" + existing Refresh button |
| Celery Beat + stuck-document sweep | No — task retries only |

Stack was not an open question: `docs/architecture/architecture.md` already specified Redis (broker),
Celery (tasks), Celery Beat (scheduling). This implements the first two.

## Separation request

> can you implement this plan in a diff git worktree or branch than the current one? i want to
> separate the changes

Resolved without a worktree: the user committed the in-flight work (`66083e9`), so this lands as the
next commit on the same branch. A worktree would have branched from a commit missing the then-
uncommitted `storage/views.py` edits, guaranteeing a conflict on the exact file this change rewrites.
