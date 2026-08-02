import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import {
  normalizeLegacyObjectStoragePath,
  PG_DUMP_EXCLUDED_TABLES,
  preprocessSqlForRestore,
  readZipBuffer,
  RESTORE_PRESERVED_TABLES,
  validateBackupZip,
} from "./backupService";

function makeBackupZip(): Buffer {
  const zip = new AdmZip();
  zip.addFile("database.sql", Buffer.from("-- valid backup"));
  zip.addFile("manifest.json", Buffer.from("{}"));
  return zip.toBuffer();
}

test("validateBackupZip accepts a ZIP with the required files", () => {
  assert.deepEqual(validateBackupZip(makeBackupZip()), { valid: true });
});

test("validateBackupZip rejects a ZIP without database.sql", () => {
  const zip = new AdmZip();
  zip.addFile("manifest.json", Buffer.from("{}"));

  assert.equal(validateBackupZip(zip.toBuffer()).valid, false);
});

test("readZipBuffer keeps read-only support for legacy local backups", async () => {
  const relativePath = `uploads/backups/test-${process.pid}.zip`;
  const absolutePath = path.join(process.cwd(), relativePath);
  const expected = makeBackupZip();

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, expected);

  try {
    const actual = await readZipBuffer(`local:${relativePath}`);
    assert.deepEqual(actual, expected);
  } finally {
    fs.rmSync(absolutePath, { force: true });
  }
});

test("legacy Object Storage entity paths are normalized while bucket paths are unchanged", () => {
  assert.equal(
    normalizeLegacyObjectStoragePath("/objects/example-bucket/backups/old.zip"),
    "example-bucket/backups/old.zip",
  );
  assert.equal(
    normalizeLegacyObjectStoragePath("/example-bucket/backups/old.zip"),
    "/example-bucket/backups/old.zip",
  );
});

test("backup archives are excluded from dumps and preserved during restore", () => {
  assert.ok(PG_DUMP_EXCLUDED_TABLES.includes("backup_archives"));
  assert.ok(PG_DUMP_EXCLUDED_TABLES.includes("public.backup_archives"));
  assert.ok(RESTORE_PRESERVED_TABLES.includes("backup_archives"));
});

test("restore preprocessing removes backup archive schema and data statements", () => {
  const sql = [
    "CREATE TABLE public.backup_archives (",
    "    id character varying NOT NULL",
    ");",
    "COPY public.backup_archives (id) FROM stdin;",
    "archive-id",
    "\\.",
    "CREATE TABLE public.suppliers (id integer NOT NULL);",
  ].join("\n");

  const processed = preprocessSqlForRestore(sql);

  assert.doesNotMatch(processed, /backup_archives/);
  assert.doesNotMatch(processed, /archive-id/);
  assert.match(processed, /CREATE TABLE public\.suppliers/);
});