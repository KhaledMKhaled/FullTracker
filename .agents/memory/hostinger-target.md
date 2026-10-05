---
name: Hostinger production target
description: User-confirmed VPS target and migration safety boundaries.
---

The user wants both the production app and production database on Hostinger VPS and identified its OS as Ubuntu 26.04 LTS.

**Why:** Explicit hosting request; do not redirect this work to publishing on Replit.

**How to apply:** Preserve current production until an authorized migration and confirmed cutover. Verify the actual target OS/package versions before executing installation commands. Full external migration snapshots must include database-stored backup archives even though ordinary in-app backups exclude them to prevent recursive growth.
