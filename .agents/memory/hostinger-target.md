---
name: Hostinger production target
description: User-confirmed VPS target and migration safety boundaries.
---

The user wants both the production app and production database on Hostinger VPS and identified its OS as Ubuntu 26.04 LTS.

**Why:** Explicit hosting request; do not redirect this work to publishing on Replit.

**How to apply:** Preserve current production until an authorized migration and confirmed cutover. Verify the actual target OS/package versions before executing installation commands. Full external migration snapshots must include database-stored backup archives even though ordinary in-app backups exclude them to prevent recursive growth.

The user wants to retain the same custom domain currently used on Replit.

**Why:** Explicit user instruction; changing hosts must not change the public app address.

**How to apply:** Prepare and rehearse without touching DNS; obtain a write-freeze and cutover confirmation before switching traffic.

For external deployment, Replit-internal npm registry URLs in the lockfile need an external equivalent with the same version and integrity hash.

**Why:** The VPS cannot resolve the internal package proxy, causing npm ci to fail despite a valid lockfile. This is a network-portability issue, not a dependency vulnerability exception.

**How to apply:** Normalize only internal download URLs in the VPS release checkout; keep Replit's working lockfile and all package integrity checks intact.

Do not pass the source connection URI as PGDATABASE while inheriting workspace PG variables.

**Why:** The export client treated the URI as a literal database name and attempted to connect to the workspace database instead.

**How to apply:** Parse the authorized source URL privately into a clean child-process PG environment, never log credentials, and verify source identity before export.

The user approved continuing preparation with missing legacy files documented, rather than blocking preparation on recovery.

**Why:** Explicit response to the missing-file inventory; this was not approval for DNS cutover or deletion of the affected records.

**How to apply:** Preserve those references and the missing-file report. Keep preparation approval separate from final migration and write-freeze approval.
