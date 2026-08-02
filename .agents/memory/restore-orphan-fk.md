---
name: Restore can orphan FK rows
description: Backup/restore may leave rows referencing deleted user ids, breaking drizzle db:push
---
Rule: backup-job history must not enforce a database foreign key to users; preserve the creator ID as historical metadata even when that user no longer exists.
**Why:** restore can replace users while intentionally preserving backup-job history. Re-adding the FK then fails validation and blocks publishing, despite the historical row being valid.
**How to apply:** keep the logical application relation if useful, but do not add a database FK for backup-job creators. Never delete or rewrite production history merely to satisfy this constraint.
