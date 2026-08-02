import { exec, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import AdmZip from "adm-zip";
import { PassThrough } from "stream";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "./db";
import {
  backupArchives,
  backupJobs,
  type BackupJob,
  type InsertBackupJob,
} from "@shared/schema";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";

const execAsync = promisify(exec);

import { execSync } from "child_process";

function resolvePgTool(toolName: string): string {
  try {
    const found = execSync(`which ${toolName}`, { encoding: "utf-8" }).trim();
    if (found) return found;
  } catch {
    // not in PATH, fall through
  }
  return toolName;
}

let pgDumpPath: string | null = null;
let psqlPath: string | null = null;

function getPgDumpPath(): string {
  if (!pgDumpPath) pgDumpPath = resolvePgTool("pg_dump");
  return pgDumpPath;
}

function getPsqlPath(): string {
  if (!psqlPath) psqlPath = resolvePgTool("psql");
  return psqlPath;
}

const objectStorage = new ObjectStorageService();

export const PG_DUMP_EXCLUDED_TABLES = [
  "replit_*",
  "public.replit_*",
  "sessions",
  "public.sessions",
  "backup_archives",
  "public.backup_archives",
] as const;

export const RESTORE_PRESERVED_TABLES = [
  "sessions",
  "backup_jobs",
  "backup_archives",
] as const;

function isLocalPath(backupPath: string): boolean {
  return backupPath.startsWith("local:");
}

function isDatabaseBackupPath(backupPath: string): boolean {
  return backupPath.startsWith("db-backup:");
}

function resolveLocalPath(backupPath: string): string {
  return path.join(process.cwd(), backupPath.replace(/^local:/, ""));
}

export function normalizeLegacyObjectStoragePath(backupPath: string): string {
  return backupPath.startsWith("/objects/")
    ? backupPath.slice("/objects/".length)
    : backupPath;
}

export async function saveZipBuffer(zipBuffer: Buffer, fileName: string): Promise<string> {
  const [archive] = await db
    .insert(backupArchives)
    .values({
      fileName,
      contentType: "application/zip",
      size: zipBuffer.length,
      data: zipBuffer,
    })
    .returning({ id: backupArchives.id });

  if (!archive) {
    throw new Error("Failed to save backup archive in the database");
  }

  return `db-backup:${archive.id}`;
}

export async function readZipBuffer(backupPath: string): Promise<Buffer> {
  if (isDatabaseBackupPath(backupPath)) {
    const archiveId = backupPath.slice("db-backup:".length);
    if (!archiveId) {
      throw new Error("Invalid database backup path");
    }

    const [archive] = await db
      .select({ data: backupArchives.data })
      .from(backupArchives)
      .where(eq(backupArchives.id, archiveId))
      .limit(1);

    if (!archive) {
      throw new Error(`Backup archive not found in the database: ${archiveId}`);
    }

    return archive.data;
  }

  // Legacy read-only support for backups created before durable DB storage.
  if (isLocalPath(backupPath)) {
    const localFilePath = resolveLocalPath(backupPath);
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`Backup file not found: ${localFilePath}`);
    }
    return fs.readFileSync(localFilePath);
  }
  return objectStorage.downloadObjectToBuffer(normalizeLegacyObjectStoragePath(backupPath));
}

export async function readZipBufferRange(
  backupPath: string,
  start: number,
  endInclusive: number,
): Promise<{ buffer: Buffer; totalSize: number }> {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(endInclusive) || start < 0 || endInclusive < start) {
    throw new Error("Invalid backup byte range");
  }

  if (isDatabaseBackupPath(backupPath)) {
    const archiveId = backupPath.slice("db-backup:".length);
    if (!archiveId) {
      throw new Error("Invalid database backup path");
    }

    const requestedLength = endInclusive - start + 1;
    const [archive] = await db
      .select({
        data: sql<Buffer>`substring(${backupArchives.data} from ${start + 1} for ${requestedLength})`,
        totalSize: backupArchives.size,
      })
      .from(backupArchives)
      .where(eq(backupArchives.id, archiveId))
      .limit(1);

    if (!archive) {
      throw new Error(`Backup archive not found in the database: ${archiveId}`);
    }

    return {
      buffer: archive.data,
      totalSize: archive.totalSize,
    };
  }

  // Legacy archives are already constrained by their old storage backends.
  // Keep them readable and slice after loading, while new DB archives are read
  // directly from PostgreSQL in bounded chunks.
  const fullBuffer = await readZipBuffer(backupPath);
  return {
    buffer: fullBuffer.subarray(start, Math.min(endInclusive + 1, fullBuffer.length)),
    totalSize: fullBuffer.length,
  };
}

interface BackupManifest {
  version: string;
  createdAt: string;
  databaseStats: {
    tables: number;
    size: string;
  };
  mediaFiles: {
    count: number;
    totalSize: number;
    byFolder?: Record<string, number>;
  };
  files: string[];
}

async function updateJobProgress(jobId: number, progress: number): Promise<void> {
  await db.update(backupJobs).set({ progress }).where(eq(backupJobs.id, jobId));
}

async function updateJobStatus(
  jobId: number,
  status: string,
  extras: Partial<{ outputPath: string; fileSize: number; error: string; manifest: unknown; completedAt: Date }>
): Promise<void> {
  await db.update(backupJobs).set({ status, ...extras }).where(eq(backupJobs.id, jobId));
}

async function createBackupJob(userId: string, jobType: "backup" | "restore"): Promise<BackupJob> {
  const [job] = await db
    .insert(backupJobs)
    .values({
      jobType,
      status: "running",
      progress: 0,
      createdByUserId: userId,
    } as InsertBackupJob)
    .returning();
  return job;
}

async function runPgDump(): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const excludedTableArgs = PG_DUMP_EXCLUDED_TABLES
    .map((table) => `--exclude-table='${table}'`)
    .join(" ");
  const { stdout } = await execAsync(
    `${getPgDumpPath()} "${databaseUrl}" --format=plain --no-owner --no-acl ` +
    `--exclude-schema=_system ${excludedTableArgs}`,
    { maxBuffer: 512 * 1024 * 1024 }
  );
  return stdout;
}

export function preprocessSqlForRestore(sqlContent: string): string {
  const lines = sqlContent.split("\n");
  const filteredLines: string[] = [];
  let skipMode: "none" | "until_semicolon" | "until_copy_end" = "none";
  
  // Patterns for system/internal objects to skip (also sessions to preserve user login during restore)
  const systemPatterns = [
    /^CREATE SCHEMA\s+.*_system/i,
    /^ALTER SCHEMA\s+.*_system/i,
    /^GRANT\s+.*ON SCHEMA\s+.*_system/i,
    /_system\.\w+/i,  // References to _system schema objects
    /^CREATE TABLE\s+.*replit_/i,
    /^CREATE SEQUENCE\s+.*replit_/i,
    /^ALTER TABLE\s+.*replit_/i,
    /^ALTER SEQUENCE\s+.*replit_/i,
    /^SELECT pg_catalog\.setval\('.*replit_/i,
    /^COPY\s+.*_system\./i,
    /^COPY\s+.*replit_/i,
    // Preserve sessions table, indexes, and related sequences to keep users logged in during restore
    /^CREATE TABLE\s+(public\.)?"?sessions"?/i,
    /^ALTER TABLE\s+(ONLY\s+)?(public\.)?"?sessions"?/i,
    /^COPY\s+(public\.)?"?sessions"?/i,
    /^DROP TABLE\s+.*"?sessions"?/i,
    /^TRUNCATE\s+.*"?sessions"?/i,
    /^CREATE SEQUENCE\s+(public\.)?sessions/i,
    /^ALTER SEQUENCE\s+(public\.)?sessions/i,
    /^DROP SEQUENCE\s+.*sessions/i,
    /^SELECT pg_catalog\.setval\('(public\.)?sessions/i,
    /^CREATE\s+(UNIQUE\s+)?INDEX\s+.*session/i,  // Matches IDX_session_expire and similar
    /^DROP\s+INDEX\s+.*session/i,
    /^ALTER\s+INDEX\s+.*session/i,
    // Preserve backup_jobs table, indexes, and related sequences to keep job tracking during restore
    /^CREATE TABLE\s+(public\.)?"?backup_jobs"?/i,
    /^ALTER TABLE\s+(ONLY\s+)?(public\.)?"?backup_jobs"?/i,
    /^COPY\s+(public\.)?"?backup_jobs"?/i,
    /^DROP TABLE\s+.*"?backup_jobs"?/i,
    /^TRUNCATE\s+.*"?backup_jobs"?/i,
    /^CREATE SEQUENCE\s+(public\.)?backup_jobs/i,
    /^ALTER SEQUENCE\s+(public\.)?backup_jobs/i,
    /^DROP SEQUENCE\s+.*backup_jobs/i,
    /^SELECT pg_catalog\.setval\('(public\.)?backup_jobs/i,
    /^CREATE\s+(UNIQUE\s+)?INDEX\s+.*backup_jobs/i,
    /^DROP\s+INDEX\s+.*backup_jobs/i,
    /^ALTER\s+INDEX\s+.*backup_jobs/i,
    // Preserve durable backup archives so the ZIP being restored remains
    // available throughout restore and so older archives are not destroyed.
    /^CREATE TABLE\s+(public\.)?"?backup_archives"?/i,
    /^ALTER TABLE\s+(ONLY\s+)?(public\.)?"?backup_archives"?/i,
    /^COPY\s+(public\.)?"?backup_archives"?/i,
    /^DROP TABLE\s+.*"?backup_archives"?/i,
    /^TRUNCATE\s+.*"?backup_archives"?/i,
    /^CREATE SEQUENCE\s+(public\.)?backup_archives/i,
    /^ALTER SEQUENCE\s+(public\.)?backup_archives/i,
    /^DROP SEQUENCE\s+.*backup_archives/i,
    /^SELECT pg_catalog\.setval\('(public\.)?backup_archives/i,
    /^CREATE\s+(UNIQUE\s+)?INDEX\s+.*backup_archives/i,
    /^DROP\s+INDEX\s+.*backup_archives/i,
    /^ALTER\s+INDEX\s+.*backup_archives/i,
  ];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Handle skip modes
    if (skipMode === "until_copy_end") {
      // COPY blocks end with \. on its own line
      if (trimmedLine === "\\.") {
        skipMode = "none";
      }
      continue;
    }
    
    if (skipMode === "until_semicolon") {
      if (trimmedLine.endsWith(";")) {
        skipMode = "none";
      }
      continue;
    }
    
    // Check if this line should be skipped
    let shouldSkip = false;
    for (const pattern of systemPatterns) {
      if (trimmedLine.match(pattern)) {
        shouldSkip = true;
        
        // Determine how to skip multi-line statements
        if (trimmedLine.match(/^COPY\s+/i)) {
          // COPY statements end with \. not semicolon
          skipMode = "until_copy_end";
        } else if (!trimmedLine.endsWith(";")) {
          skipMode = "until_semicolon";
        }
        break;
      }
    }
    
    if (shouldSkip) {
      continue;
    }
    
    // Skip comment lines that reference system objects (optional cleanup)
    if (trimmedLine.startsWith("--") && 
        (trimmedLine.includes("_system") || trimmedLine.includes("replit_"))) {
      continue;
    }
    
    filteredLines.push(line);
  }
  
  return filteredLines.join("\n");
}

async function clearDatabaseTables(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const preservedTablesSql = RESTORE_PRESERVED_TABLES
    .map((table) => `'${table}'`)
    .join(", ");
  
  // Preserve sessions, backup job tracking, and durable backup ZIP archives.
  const { stdout: tablesOutput } = await execAsync(
    `${getPsqlPath()} "${databaseUrl}" -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'replit_%' AND tablename NOT IN (${preservedTablesSql})"`
  );
  
  const tables = tablesOutput
    .split("\n")
    .map((t) => t.trim())
    .filter(
      (t) =>
        t.length > 0 &&
        !RESTORE_PRESERVED_TABLES.includes(
          t as (typeof RESTORE_PRESERVED_TABLES)[number],
        ),
    );
  
  // Get all sequences in public schema, excluding Replit internal sequences, sessions-related sequences, and backup_jobs sequences
  const { stdout: seqOutput } = await execAsync(
    `${getPsqlPath()} "${databaseUrl}" -t -c "SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' AND sequencename NOT LIKE 'replit_%' AND sequencename NOT LIKE 'sessions%' AND sequencename NOT LIKE 'backup_jobs%' AND sequencename NOT LIKE 'backup_archives%'"`
  );
  
  const sequences = seqOutput
    .split("\n")
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length > 0 &&
        !s.startsWith("sessions") &&
        !s.startsWith("backup_jobs") &&
        !s.startsWith("backup_archives"),
    );
  
  if (tables.length === 0 && sequences.length === 0) {
    return;
  }
  
  // Drop all tables and sequences with CASCADE
  const dropStatements = [
    ...tables.map((t) => `DROP TABLE IF EXISTS public."${t}" CASCADE;`),
    ...sequences.map((s) => `DROP SEQUENCE IF EXISTS public."${s}" CASCADE;`),
  ].join("\n");
  
  return new Promise((resolve, reject) => {
    const psql = spawn(getPsqlPath(), [databaseUrl], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    
    let stderr = "";
    
    psql.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    
    psql.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        console.warn(`Drop tables/sequences warning: ${stderr}`);
        resolve(); // Don't fail on drop errors
      }
    });
    
    psql.on("error", (err) => {
      reject(err);
    });
    
    psql.stdin.write(dropStatements);
    psql.stdin.end();
  });
}

async function runPsqlRestore(sqlContent: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  
  // Clear existing tables first
  await clearDatabaseTables();
  
  const processedSql = preprocessSqlForRestore(sqlContent);
  
  return new Promise((resolve, reject) => {
    // Use --single-transaction for atomicity and ON_ERROR_STOP for strict error handling
    const psql = spawn(getPsqlPath(), [databaseUrl, "-v", "ON_ERROR_STOP=1", "--single-transaction"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    
    let stderr = "";
    
    psql.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    
    psql.on("close", async (code) => {
      if (code === 0) {
        resolve();
      } else {
        // Restore failed - recreate empty schema so app can still run
        console.error(`Restore failed with code ${code}: ${stderr}`);
        try {
          await execAsync(`cd /home/runner/workspace && npm run db:push --force`);
          console.log("Recreated database schema after failed restore");
        } catch (e) {
          console.error("Failed to recreate schema:", e);
        }
        reject(new Error(`Restore failed: ${stderr.slice(0, 500)}`));
      }
    });
    
    psql.on("error", (err) => {
      reject(err);
    });
    
    psql.stdin.write(processedSql);
    psql.stdin.end();
  });
}

async function getDatabaseStats(): Promise<{ tables: number; size: string }> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return { tables: 0, size: "0 bytes" };
  }
  try {
    const { stdout: tableCountResult } = await execAsync(
      `${getPsqlPath()} "${databaseUrl}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"`
    );
    const { stdout: sizeResult } = await execAsync(
      `${getPsqlPath()} "${databaseUrl}" -t -c "SELECT pg_size_pretty(pg_database_size(current_database()))"`
    );
    return {
      tables: parseInt(tableCountResult.trim(), 10) || 0,
      size: sizeResult.trim() || "0 bytes",
    };
  } catch {
    return { tables: 0, size: "0 bytes" };
  }
}

export async function startBackup(userId: string): Promise<BackupJob> {
  const job = await createBackupJob(userId, "backup");

  (async () => {
    try {
      await updateJobProgress(job.id, 5);

      const sqlDump = await runPgDump();
      await updateJobProgress(job.id, 25);

      const databaseStats = await getDatabaseStats();
      await updateJobProgress(job.id, 30);

      let mediaObjects: Array<{ path: string; size: number; contentType: string }> = [];
      try {
        mediaObjects = await objectStorage.listAllObjects();
      } catch (err) {
        console.warn("Could not list media objects:", err);
      }
      await updateJobProgress(job.id, 35);

      const mediaBuffers: Map<string, { buffer: Buffer; contentType: string }> = new Map();
      const totalMedia = mediaObjects.length;
      let downloadedCount = 0;

      const failedFiles: string[] = [];

      for (const obj of mediaObjects) {
        try {
          const buffer = await objectStorage.downloadObjectToBuffer(`/${obj.path}`);
          mediaBuffers.set(obj.path, { buffer, contentType: obj.contentType });
        } catch (err) {
          console.warn(`Could not download ${obj.path}:`, err);
          failedFiles.push(`media/${obj.path}`);
        }
        downloadedCount++;
        const downloadProgress = 35 + Math.floor((downloadedCount / Math.max(totalMedia, 1)) * 20);
        await updateJobProgress(job.id, downloadProgress);
      }

      // Collect ALL local upload files under uploads/ (recursively), excluding uploads/backups/
      const localUploads: Map<string, { buffer: Buffer; contentType: string }> = new Map();
      const uploadsRoot = path.join(process.cwd(), "uploads");
      const EXCLUDED_TOP_DIRS = new Set(["backups"]);
      const collectDir = (dir: string, prefix: string) => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir)) {
          try {
            const fullPath = path.join(dir, entry);
            const relPath = prefix ? `${prefix}/${entry}` : entry;
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              if (!prefix && EXCLUDED_TOP_DIRS.has(entry)) continue;
              collectDir(fullPath, relPath);
            } else if (stat.isFile()) {
              localUploads.set(relPath, {
                buffer: fs.readFileSync(fullPath),
                contentType: getContentType(entry),
              });
            }
          } catch (err) {
            console.warn(`Could not read local upload ${prefix}/${entry}:`, err);
            failedFiles.push(`local-uploads/${prefix ? `${prefix}/` : ""}${entry}`);
          }
        }
      };
      collectDir(uploadsRoot, "");

      if (failedFiles.length > 0) {
        throw new Error(
          `فشل النسخ الاحتياطي: تعذر قراءة ${failedFiles.length} ملف من الصور، لضمان اكتمال النسخة لن يتم إنشاؤها. الملفات: ${failedFiles.slice(0, 10).join(", ")}${failedFiles.length > 10 ? ` و${failedFiles.length - 10} أخرى` : ""}`
        );
      }
      const localUploadsByFolder: Record<string, number> = {};
      for (const key of Array.from(localUploads.keys())) {
        const folder = key.includes("/") ? key.split("/")[0] : "(root)";
        localUploadsByFolder[folder] = (localUploadsByFolder[folder] || 0) + 1;
      }
      console.log(`[Backup] Collected ${localUploads.size} local upload files:`, JSON.stringify(localUploadsByFolder));

      await updateJobProgress(job.id, 60);

      const manifest: BackupManifest = {
        version: "1.0.0",
        createdAt: new Date().toISOString(),
        databaseStats,
        mediaFiles: {
          count: mediaBuffers.size + localUploads.size,
          totalSize:
            Array.from(mediaBuffers.values()).reduce((sum, m) => sum + m.buffer.length, 0) +
            Array.from(localUploads.values()).reduce((sum, m) => sum + m.buffer.length, 0),
          byFolder: localUploadsByFolder,
        },
        files: [
          "database.sql",
          "manifest.json",
          ...Array.from(mediaBuffers.keys()).map((p) => `media/${p}`),
          ...Array.from(localUploads.keys()).map((p) => `local-uploads/${p}`),
        ],
      };

      await updateJobProgress(job.id, 70);

      const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
        const passthrough = new PassThrough();
        const chunks: Buffer[] = [];

        passthrough.on("data", (chunk) => chunks.push(chunk));
        passthrough.on("end", () => resolve(Buffer.concat(chunks)));
        passthrough.on("error", reject);

        const archive = archiver("zip", { zlib: { level: 9 } });
        archive.on("error", reject);
        archive.pipe(passthrough);

        archive.append(sqlDump, { name: "database.sql" });
        archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

        Array.from(mediaBuffers.entries()).forEach(([p, { buffer }]) => {
          archive.append(buffer, { name: `media/${p}` });
        });

        Array.from(localUploads.entries()).forEach(([p, { buffer }]) => {
          archive.append(buffer, { name: `local-uploads/${p}` });
        });

        archive.finalize();
      });

      await updateJobProgress(job.id, 85);

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = await saveZipBuffer(zipBuffer, `${timestamp}.zip`);

      await updateJobProgress(job.id, 95);

      await updateJobStatus(job.id, "completed", {
        outputPath: backupPath,
        fileSize: zipBuffer.length,
        manifest: manifest as unknown,
        completedAt: new Date(),
      });

      await updateJobProgress(job.id, 100);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Backup failed:", errorMessage);
      await updateJobStatus(job.id, "failed", {
        error: errorMessage,
        completedAt: new Date(),
      });
    }
  })();

  return job;
}

export function validateBackupZip(zipBuffer: Buffer): { valid: boolean; error?: string } {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    return { valid: false, error: "الملف تالف أو ليس ملف ZIP صالح" };
  }
  let entries;
  try {
    entries = zip.getEntries();
  } catch {
    return { valid: false, error: "الملف تالف أو ليس ملف ZIP صالح" };
  }
  if (!entries.some((e) => e.entryName === "database.sql")) {
    return { valid: false, error: "نسخة احتياطية غير صالحة: ملف database.sql غير موجود داخل الملف" };
  }
  if (!entries.some((e) => e.entryName === "manifest.json")) {
    return { valid: false, error: "نسخة احتياطية غير صالحة: ملف manifest.json غير موجود داخل الملف" };
  }
  return { valid: true };
}

export async function startRestore(userId: string, backupPath: string): Promise<BackupJob> {
  const job = await createBackupJob(userId, "restore");

  (async () => {
    try {
      await updateJobProgress(job.id, 5);

      const zipBuffer = await readZipBuffer(backupPath);
      await updateJobProgress(job.id, 20);

      const validation = validateBackupZip(zipBuffer);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const zip = new AdmZip(zipBuffer);
      const zipEntries = zip.getEntries();

      const manifestEntry = zipEntries.find((e) => e.entryName === "manifest.json")!;
      let manifest: BackupManifest;
      try {
        manifest = JSON.parse(manifestEntry.getData().toString("utf-8"));
      } catch {
        throw new Error("نسخة احتياطية غير صالحة: ملف manifest.json تالف");
      }
      await updateJobProgress(job.id, 25);

      const databaseEntry = zipEntries.find((e) => e.entryName === "database.sql")!;

      const sqlContent = databaseEntry.getData().toString("utf-8");
      await runPsqlRestore(sqlContent);
      // Older backups do not contain tables introduced in newer app versions.
      // Reapply the current Drizzle schema before accepting new requests.
      await execAsync("npm run db:push -- --force", {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
      });
      await updateJobProgress(job.id, 50);

      const mediaEntries = zipEntries.filter((e) => e.entryName.startsWith("media/") && !e.isDirectory);
      const localUploadEntries = zipEntries.filter((e) => e.entryName.startsWith("local-uploads/") && !e.isDirectory);
      const totalMedia = mediaEntries.length + localUploadEntries.length;
      let restoredCount = 0;

      let bucketName: string | null = null;
      try {
        bucketName = objectStorage.getBucketAndPrefix().bucketName;
      } catch {
        console.warn("[backupService] Object Storage not available, media files will not be restored to cloud");
      }

      for (const entry of mediaEntries) {
        try {
          const objectPath = entry.entryName.replace(/^media\//, "");
          const buffer = entry.getData();
          if (bucketName) {
            const uploadPath = `/${bucketName}/${objectPath}`;
            const contentType = getContentType(objectPath);
            await objectStorage.uploadObjectFromBuffer(uploadPath, buffer, contentType);
          } else {
            // Fallback: save media to local uploads directory
            const localMediaPath = path.join(process.cwd(), "uploads", objectPath);
            const localMediaDir = path.dirname(localMediaPath);
            if (!fs.existsSync(localMediaDir)) fs.mkdirSync(localMediaDir, { recursive: true });
            fs.writeFileSync(localMediaPath, buffer);
          }
        } catch (err) {
          console.warn(`Could not restore ${entry.entryName}:`, err);
        }
        restoredCount++;
        const restoreProgress = 50 + Math.floor((restoredCount / Math.max(totalMedia, 1)) * 45);
        await updateJobProgress(job.id, restoreProgress);
      }

      // Restore local upload files (items + payments) directly to local disk
      for (const entry of localUploadEntries) {
        try {
          const relativePath = entry.entryName.replace(/^local-uploads\//, "");
          const localPath = path.join(process.cwd(), "uploads", relativePath);
          const localDir = path.dirname(localPath);
          if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
          fs.writeFileSync(localPath, entry.getData());
          console.log(`[Restore] Restored local file: uploads/${relativePath}`);
        } catch (err) {
          console.warn(`Could not restore ${entry.entryName}:`, err);
        }
        restoredCount++;
        const restoreProgress = 50 + Math.floor((restoredCount / Math.max(totalMedia, 1)) * 45);
        await updateJobProgress(job.id, restoreProgress);
      }

      await updateJobStatus(job.id, "completed", {
        manifest: manifest as unknown,
        completedAt: new Date(),
      });

      await updateJobProgress(job.id, 100);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Restore failed:", errorMessage);
      await updateJobStatus(job.id, "failed", {
        error: errorMessage,
        completedAt: new Date(),
      });
    }
  })();

  return job;
}

export async function getBackupJobs(): Promise<BackupJob[]> {
  return db.select().from(backupJobs).orderBy(desc(backupJobs.createdAt));
}

export async function getBackupJob(id: number): Promise<BackupJob | undefined> {
  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, id));
  return job;
}

function getContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    json: "application/json",
    txt: "text/plain",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
  };
  return mimeTypes[ext || ""] || "application/octet-stream";
}
