-- Backup retention settings (سياسة الاحتفاظ بالنسخ الاحتياطية)
-- Single-row table; retention_count = 0 means keep all backups (unlimited).
CREATE TABLE IF NOT EXISTS "backup_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"retention_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Seed the single settings row so reads never start from an empty table.
INSERT INTO "backup_settings" ("id", "retention_count")
VALUES (1, 0)
ON CONFLICT ("id") DO NOTHING;
