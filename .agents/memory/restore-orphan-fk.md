---
name: Restore can orphan FK rows
description: Backup/restore may leave rows referencing deleted user ids, breaking drizzle db:push
---
Rule: if `npm run db:push` fails with a foreign-key violation (code 23503), look for orphaned rows left by a backup/restore cycle (e.g. `backup_jobs.created_by_user_id` pointing to a user id not in `users`).
**Why:** restore replaces some tables (users) while others (backup_jobs history) keep old ids; drizzle-kit re-validates FKs on push and fails.
**How to apply:** find orphans with `SELECT ... WHERE fk NOT IN (SELECT id FROM parent)` and repoint them to the root user (`root`, id 9892f950-c728-4195-ba21-9fb4cf982734) or delete the history rows, then re-run push. Longer-term fix would be remapping/clearing such ids during restore.
