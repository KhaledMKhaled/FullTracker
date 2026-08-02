---
name: Backup archive ownership
description: Durable rules for deleting/retaining backup ZIP archives safely.
---

## Rules
- A backup archive can be referenced by multiple jobs; never assume one job owns one archive. Delete an archive only when no other backup job references it and no pending/running job (backup or restore) is using it.
- ZIPs uploaded only to be restored have no owning backup job; they must be cleaned up after use (or after a grace period) or they leak database space forever.
- **Why:** naive retention can delete archives mid-restore or leak uploaded archives when ownership and active references are not considered.
- **How to apply:** any future change to backup deletion/retention must preserve these reference checks and the uploaded-archive lifecycle.
