---
name: Durable backup archive storage
description: Backup ZIPs live in PostgreSQL but must be excluded from dumps and preserved during restore
---

- Store final backup ZIP archives in durable PostgreSQL storage, never on the Autoscale filesystem.
- Exclude the archive table from every database dump and preserve it while clearing/restoring database tables.
- **Why:** Local Autoscale files can disappear or be unavailable on another instance, while including prior ZIPs in new dumps causes recursive, unbounded backup growth. Deleting the archive table during restore can also remove the ZIP currently being read.
- **How to apply:** New backup creation and uploaded backup files write to the durable archive table. Keep legacy local/Object Storage paths read-only for older records.
- Download large database-backed archives with verified HTTP byte ranges rather than one large response.
- **Why:** Autoscale can begin a large response and log HTTP 200 even when the browser later receives an incomplete body. This made a valid ~45 MB archive appear to fail repeatedly.
- **How to apply:** Read bounded PostgreSQL `bytea` slices, return strict `206 Content-Range` responses, and verify every client chunk and the final assembled size.