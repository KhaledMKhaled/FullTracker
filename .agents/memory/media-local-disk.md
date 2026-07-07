---
name: Media stored on local disk, not Object Storage
description: All media (item images, payment attachments, invoice images) must live under uploads/ — Object Storage is unconfigured here
---

- Replit Object Storage (`PRIVATE_OBJECT_DIR`) is NOT configured in this environment. Any code path calling ObjectStorageService throws at runtime.
- **Why:** App was migrated from an old Replit instance; legacy `/objects/uploads/{uuid}` URLs pointed at the old instance's bucket. All legacy images (100 item images, 11 payment attachments) were downloaded from the old dev domain and re-homed to `uploads/items/` and `uploads/payments/` with DB URLs rewritten to `/uploads/...`.
- **How to apply:** New media features must use direct multer upload to local disk under `uploads/` + static serving, never presigned Object Storage URLs. Backups must include the new subfolder (see `server/backupService.ts`, `local-uploads/` zip entries).
- Backup zips save to `uploads/backups/` with `local:` path prefix when Object Storage is unavailable — never construct fake bucket paths; uploads to nonexistent buckets can silently "succeed".
- Content-Disposition headers crash Node on Arabic filenames — always use ASCII fallback + RFC 5987 `filename*=UTF-8''` encoding.
- `@google-cloud/storage` is imported by the object-storage integration but was missing from package.json; `npm install` pruning it breaks server startup. It is now a declared dependency — keep it.
