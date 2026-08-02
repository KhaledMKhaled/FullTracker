---
name: Durable media storage on Autoscale
description: Shipment-item images use PostgreSQL media assets; remaining attachment types still use local disk
---

- Replit Object Storage (`PRIVATE_OBJECT_DIR`) is NOT configured in this environment. Any code path calling ObjectStorageService throws at runtime.
- Shipment-item images must use durable database storage. Never save new item images to an Autoscale filesystem.
- **Why:** Autoscale filesystems are ephemeral. Images uploaded after a publish disappeared on restart while older build-bundled files appeared to work, creating silent data loss.
- **How to apply:** Keep legacy files readable during migration, but route all new item-image writes to durable storage. Migrate other local attachment categories separately before switching them.
- Backup zips save to `uploads/backups/` with `local:` path prefix when Object Storage is unavailable — never construct fake bucket paths; uploads to nonexistent buckets can silently "succeed".
- Content-Disposition headers crash Node on Arabic filenames — always use ASCII fallback + RFC 5987 `filename*=UTF-8''` encoding.
- `@google-cloud/storage` is imported by the object-storage integration but was missing from package.json; `npm install` pruning it breaks server startup. It is now a declared dependency — keep it.
