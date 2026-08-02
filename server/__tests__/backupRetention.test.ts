import assert from "node:assert/strict";
import test from "node:test";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { backupArchives, backupJobs } from "@shared/schema";
import {
  applyRetentionPolicy,
  cleanupOrphanedUploadedArchives,
  deleteBackup,
  getBackupSettings,
  updateBackupSettings,
  getBackupStorageUsage,
} from "../backupService";

async function insertArchive(fileName: string): Promise<string> {
  const [row] = await db
    .insert(backupArchives)
    .values({
      fileName,
      contentType: "application/zip",
      size: 4,
      data: Buffer.from("test"),
    })
    .returning({ id: backupArchives.id });
  return row.id;
}

async function insertBackupJob(
  outputPath: string | null,
  status: string,
  createdAt: Date,
  jobType: "backup" | "restore" = "backup",
): Promise<number> {
  const [row] = await db
    .insert(backupJobs)
    .values({
      jobType,
      status,
      progress: status === "completed" ? 100 : 50,
      outputPath,
      createdByUserId: "test-retention-user",
      createdAt,
    })
    .returning({ id: backupJobs.id });
  return row.id;
}

async function cleanup(jobIds: number[], archiveIds: string[]) {
  if (jobIds.length) await db.delete(backupJobs).where(inArray(backupJobs.id, jobIds));
  if (archiveIds.length) await db.delete(backupArchives).where(inArray(backupArchives.id, archiveIds));
}

test("deleteBackup removes the job and its database archive", async () => {
  const archiveId = await insertArchive("test-delete.zip");
  const jobId = await insertBackupJob(`db-backup:${archiveId}`, "completed", new Date());

  try {
    const result = await deleteBackup(jobId);
    assert.deepEqual(result, { ok: true });

    const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId));
    assert.equal(job, undefined);
    const [archive] = await db
      .select({ id: backupArchives.id })
      .from(backupArchives)
      .where(eq(backupArchives.id, archiveId));
    assert.equal(archive, undefined);
  } finally {
    await cleanup([jobId], [archiveId]);
  }
});

test("deleteBackup refuses a job that is still running", async () => {
  const jobId = await insertBackupJob(null, "running", new Date());

  try {
    const result = await deleteBackup(jobId);
    assert.equal(result.ok, false);

    const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId));
    assert.ok(job, "running job must not be deleted");
  } finally {
    await cleanup([jobId], []);
  }
});

test("deleteBackup refuses an archive used by a running restore", async () => {
  const archiveId = await insertArchive("test-in-restore.zip");
  const backupPath = `db-backup:${archiveId}`;
  const backupJobId = await insertBackupJob(backupPath, "completed", new Date());
  const restoreJobId = await insertBackupJob(backupPath, "running", new Date(), "restore");

  try {
    const result = await deleteBackup(backupJobId);
    assert.equal(result.ok, false);

    const [archive] = await db
      .select({ id: backupArchives.id })
      .from(backupArchives)
      .where(eq(backupArchives.id, archiveId));
    assert.ok(archive, "archive used by a running restore must not be deleted");
  } finally {
    await cleanup([backupJobId, restoreJobId], [archiveId]);
  }
});

test("applyRetentionPolicy keeps only the newest N completed backups", async () => {
  const original = (await getBackupSettings()).retentionCount;
  const archiveIds: string[] = [];
  const jobIds: number[] = [];

  try {
    // Three completed backups, oldest first.
    for (let i = 0; i < 3; i++) {
      const archiveId = await insertArchive(`test-retention-${i}.zip`);
      archiveIds.push(archiveId);
      jobIds.push(
        await insertBackupJob(
          `db-backup:${archiveId}`,
          "completed",
          new Date(Date.now() - (10 - i) * 60_000),
        ),
      );
    }

    await updateBackupSettings(2);
    const deleted = await applyRetentionPolicy();
    assert.ok(deleted >= 1, "at least the oldest test backup should be deleted");

    const remaining = await db
      .select({ id: backupJobs.id })
      .from(backupJobs)
      .where(inArray(backupJobs.id, jobIds));
    const remainingIds = remaining.map((r) => r.id);
    assert.ok(!remainingIds.includes(jobIds[0]), "oldest backup should be deleted");

    const archives = await db
      .select({ id: backupArchives.id })
      .from(backupArchives)
      .where(inArray(backupArchives.id, archiveIds));
    assert.ok(!archives.some((a) => a.id === archiveIds[0]), "oldest archive should be deleted");
  } finally {
    await updateBackupSettings(original);
    await cleanup(jobIds, archiveIds);
  }
});

test("retentionCount 0 keeps all backups", async () => {
  const original = (await getBackupSettings()).retentionCount;
  const archiveId = await insertArchive("test-unlimited.zip");
  const jobId = await insertBackupJob(`db-backup:${archiveId}`, "completed", new Date(0));

  try {
    await updateBackupSettings(0);
    await applyRetentionPolicy();

    const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId));
    assert.ok(job, "no backup should be deleted when retention is unlimited");
  } finally {
    await updateBackupSettings(original);
    await cleanup([jobId], [archiveId]);
  }
});

test("retention never touches an uploaded archive used by a running restore", async () => {
  const original = (await getBackupSettings()).retentionCount;
  // Uploaded archive: exists in backup_archives with NO backup job owning it.
  const uploadedArchiveId = await insertArchive("test-uploaded-for-restore.zip");
  const restoreJobId = await insertBackupJob(
    `db-backup:${uploadedArchiveId}`,
    "running",
    new Date(Date.now() - 48 * 60 * 60 * 1000),
    "restore",
  );

  // Plus enough old completed backups to trigger retention deletions.
  const backupArchiveIds: string[] = [];
  const backupJobIds: number[] = [];
  for (let i = 0; i < 2; i++) {
    const id = await insertArchive(`test-retention-extra-${i}.zip`);
    backupArchiveIds.push(id);
    backupJobIds.push(
      await insertBackupJob(`db-backup:${id}`, "completed", new Date(Date.now() - (5 - i) * 60_000)),
    );
  }

  try {
    await updateBackupSettings(1);
    await applyRetentionPolicy();

    const [uploaded] = await db
      .select({ id: backupArchives.id })
      .from(backupArchives)
      .where(eq(backupArchives.id, uploadedArchiveId));
    assert.ok(uploaded, "uploaded archive with a running restore must survive retention");
  } finally {
    await updateBackupSettings(original);
    await cleanup([restoreJobId, ...backupJobIds], [uploadedArchiveId, ...backupArchiveIds]);
  }
});

test("deleteBackup keeps an archive shared with another backup job", async () => {
  const archiveId = await insertArchive("test-shared.zip");
  const backupPath = `db-backup:${archiveId}`;
  const jobA = await insertBackupJob(backupPath, "completed", new Date());
  const jobB = await insertBackupJob(backupPath, "completed", new Date());

  try {
    const result = await deleteBackup(jobA);
    assert.deepEqual(result, { ok: true });

    const [archive] = await db
      .select({ id: backupArchives.id })
      .from(backupArchives)
      .where(eq(backupArchives.id, archiveId));
    assert.ok(archive, "archive still referenced by another backup job must survive");
  } finally {
    await cleanup([jobA, jobB], [archiveId]);
  }
});

test("orphan cleanup removes stale uploaded archives but keeps recent or referenced ones", async () => {
  // Stale orphan: old, no referencing job at all.
  const staleId = await insertArchive("test-stale-orphan.zip");
  await db
    .update(backupArchives)
    .set({ createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) })
    .where(eq(backupArchives.id, staleId));

  // Recent orphan: no job, but inside the 24h grace period.
  const recentId = await insertArchive("test-recent-orphan.zip");

  // Old archive referenced by a completed backup job: must be kept.
  const ownedId = await insertArchive("test-owned.zip");
  await db
    .update(backupArchives)
    .set({ createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) })
    .where(eq(backupArchives.id, ownedId));
  const ownerJobId = await insertBackupJob(`db-backup:${ownedId}`, "completed", new Date());

  try {
    await cleanupOrphanedUploadedArchives();

    const remaining = await db
      .select({ id: backupArchives.id })
      .from(backupArchives)
      .where(inArray(backupArchives.id, [staleId, recentId, ownedId]));
    const ids = remaining.map((r) => r.id);
    assert.ok(!ids.includes(staleId), "stale orphaned upload should be deleted");
    assert.ok(ids.includes(recentId), "recent upload should be kept");
    assert.ok(ids.includes(ownedId), "archive owned by a backup job should be kept");
  } finally {
    await cleanup([ownerJobId], [recentId, ownedId]);
  }
});

test("concurrent delete cannot remove an archive while a restore registers it", async () => {
  const archiveId = await insertArchive("test-race.zip");
  const backupPath = `db-backup:${archiveId}`;
  const backupJobId = await insertBackupJob(backupPath, "completed", new Date());
  let restoreJobId: number | null = null;

  try {
    // Simulate restore registration: hold the archive advisory lock in a
    // transaction, insert the restore job, and only then release the lock —
    // while a deleteBackup call races against it.
    let deletePromise: Promise<Awaited<ReturnType<typeof deleteBackup>>> | null = null;

    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${backupPath}))`);

      // Start the competing delete while the lock is held.
      deletePromise = deleteBackup(backupJobId);
      await new Promise((r) => setTimeout(r, 300));

      const [restore] = await tx
        .insert(backupJobs)
        .values({
          jobType: "restore",
          status: "running",
          progress: 0,
          outputPath: backupPath,
          createdByUserId: "test-retention-user",
        })
        .returning({ id: backupJobs.id });
      restoreJobId = restore.id;
    });

    const result = await deletePromise!;
    // The delete either was refused (saw the running restore) or, if it won the
    // race entirely before the restore registered, the restore path would have
    // failed fast — in both cases the archive must still exist here because the
    // restore reference was committed under the lock.
    if (result.ok) {
      assert.fail("delete should have been refused while a restore registered the archive");
    }

    const [archive] = await db
      .select({ id: backupArchives.id })
      .from(backupArchives)
      .where(eq(backupArchives.id, archiveId));
    assert.ok(archive, "archive must survive a delete racing with restore registration");
  } finally {
    await cleanup([backupJobId, ...(restoreJobId ? [restoreJobId] : [])], [archiveId]);
  }
});

test("getBackupStorageUsage counts archives and bytes", async () => {
  const before = await getBackupStorageUsage();
  const archiveId = await insertArchive("test-usage.zip");

  try {
    const after = await getBackupStorageUsage();
    assert.equal(after.archiveCount, before.archiveCount + 1);
    assert.equal(after.totalBytes, before.totalBytes + 4);
  } finally {
    await cleanup([], [archiveId]);
  }
});
