import { exec, spawn } from "child_process";
import { promisify } from "util";
import archiver from "archiver";
import AdmZip from "adm-zip";
import { PassThrough } from "stream";
import { eq, desc } from "drizzle-orm";
import { db } from "./db";
import { backupJobs, type BackupJob, type InsertBackupJob } from "@shared/schema";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";

const execAsync = promisify(exec);

const PG_DUMP_PATH = "/nix/store/r8ivqqhsp8v042nhw5sap9kz2g6ar4v1-postgresql-16.9/bin/pg_dump";
const PSQL_PATH = "/nix/store/r8ivqqhsp8v042nhw5sap9kz2g6ar4v1-postgresql-16.9/bin/psql";

const objectStorage = new ObjectStorageService();

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
  const { stdout } = await execAsync(
    `${PG_DUMP_PATH} "${databaseUrl}" --format=plain --no-owner --no-acl ` +
    `--exclude-schema=_system ` +
    `--exclude-table='replit_*' ` +
    `--exclude-table='public.replit_*' ` +
    `--exclude-table='sessions' ` +
    `--exclude-table='public.sessions'`
  );
  return stdout;
}

function preprocessSqlForRestore(sqlContent: string): string {
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
  
  // Get all tables in public schema, excluding Replit internal tables, sessions (to preserve user login), and backup_jobs (to preserve job tracking)
  const { stdout: tablesOutput } = await execAsync(
    `${PSQL_PATH} "${databaseUrl}" -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'replit_%' AND tablename NOT IN ('sessions', 'backup_jobs')"`
  );
  
  const tables = tablesOutput
    .split("\n")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t !== "sessions" && t !== "backup_jobs");
  
  // Get all sequences in public schema, excluding Replit internal sequences, sessions-related sequences, and backup_jobs sequences
  const { stdout: seqOutput } = await execAsync(
    `${PSQL_PATH} "${databaseUrl}" -t -c "SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' AND sequencename NOT LIKE 'replit_%' AND sequencename NOT LIKE 'sessions%' AND sequencename NOT LIKE 'backup_jobs%'"`
  );
  
  const sequences = seqOutput
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("sessions") && !s.startsWith("backup_jobs"));
  
  if (tables.length === 0 && sequences.length === 0) {
    return;
  }
  
  // Drop all tables and sequences with CASCADE
  const dropStatements = [
    ...tables.map((t) => `DROP TABLE IF EXISTS public."${t}" CASCADE;`),
    ...sequences.map((s) => `DROP SEQUENCE IF EXISTS public."${s}" CASCADE;`),
  ].join("\n");
  
  return new Promise((resolve, reject) => {
    const psql = spawn(PSQL_PATH, [databaseUrl], {
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
    const psql = spawn(PSQL_PATH, [databaseUrl, "-v", "ON_ERROR_STOP=1", "--single-transaction"], {
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
      `${PSQL_PATH} "${databaseUrl}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"`
    );
    const { stdout: sizeResult } = await execAsync(
      `${PSQL_PATH} "${databaseUrl}" -t -c "SELECT pg_size_pretty(pg_database_size(current_database()))"`
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

      for (const obj of mediaObjects) {
        try {
          const buffer = await objectStorage.downloadObjectToBuffer(`/${obj.path}`);
          mediaBuffers.set(obj.path, { buffer, contentType: obj.contentType });
        } catch (err) {
          console.warn(`Could not download ${obj.path}:`, err);
        }
        downloadedCount++;
        const downloadProgress = 35 + Math.floor((downloadedCount / Math.max(totalMedia, 1)) * 30);
        await updateJobProgress(job.id, downloadProgress);
      }

      const manifest: BackupManifest = {
        version: "1.0.0",
        createdAt: new Date().toISOString(),
        databaseStats,
        mediaFiles: {
          count: mediaBuffers.size,
          totalSize: Array.from(mediaBuffers.values()).reduce((sum, m) => sum + m.buffer.length, 0),
        },
        files: ["database.sql", "manifest.json", ...Array.from(mediaBuffers.keys()).map((p) => `media/${p}`)],
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

        Array.from(mediaBuffers.entries()).forEach(([path, { buffer }]) => {
          archive.append(buffer, { name: `media/${path}` });
        });

        archive.finalize();
      });

      await updateJobProgress(job.id, 85);

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const { bucketName } = objectStorage.getBucketAndPrefix();
      const backupPath = `/${bucketName}/backups/${timestamp}.zip`;

      await objectStorage.uploadObjectFromBuffer(backupPath, zipBuffer, "application/zip");

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

export async function startRestore(userId: string, backupPath: string): Promise<BackupJob> {
  const job = await createBackupJob(userId, "restore");

  (async () => {
    try {
      await updateJobProgress(job.id, 5);

      const zipBuffer = await objectStorage.downloadObjectToBuffer(backupPath);
      await updateJobProgress(job.id, 20);

      const zip = new AdmZip(zipBuffer);
      const zipEntries = zip.getEntries();

      const manifestEntry = zipEntries.find((e) => e.entryName === "manifest.json");
      if (!manifestEntry) {
        throw new Error("Invalid backup: manifest.json not found");
      }

      const manifest: BackupManifest = JSON.parse(manifestEntry.getData().toString("utf-8"));
      await updateJobProgress(job.id, 25);

      const databaseEntry = zipEntries.find((e) => e.entryName === "database.sql");
      if (!databaseEntry) {
        throw new Error("Invalid backup: database.sql not found");
      }

      const sqlContent = databaseEntry.getData().toString("utf-8");
      await runPsqlRestore(sqlContent);
      await updateJobProgress(job.id, 50);

      const mediaEntries = zipEntries.filter((e) => e.entryName.startsWith("media/") && !e.isDirectory);
      const totalMedia = mediaEntries.length;
      let restoredCount = 0;

      const { bucketName } = objectStorage.getBucketAndPrefix();

      for (const entry of mediaEntries) {
        try {
          const objectPath = entry.entryName.replace(/^media\//, "");
          const buffer = entry.getData();
          const uploadPath = `/${bucketName}/${objectPath}`;
          const contentType = getContentType(objectPath);
          await objectStorage.uploadObjectFromBuffer(uploadPath, buffer, contentType);
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
