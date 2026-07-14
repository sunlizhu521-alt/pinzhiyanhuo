import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('database writes are atomic and a validated backup can be restored', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'pinzhiyanhuo-db-test-'));
  const env = { ...process.env, DATA_DIR: tempDir };
  const code = `
    import { copyFileSync, existsSync } from 'node:fs';
    import path from 'node:path';
    import { initDatabase, upsertUser, saveNotices, getNotices, inspectDatabaseFile, restoreDatabaseFromFile } from './server/database.js';
    await initDatabase();
    upsertUser({ id: 'admin', name: 'admin', password: 'hash', role: 'admin', pageAccess: [] });
    saveNotices([{ id: 'n1' }], '2026-07-14 00:00:00', 'admin');
    const dbPath = path.join(process.env.DATA_DIR, 'db.sqlite');
    const backupPath = path.join(process.env.DATA_DIR, 'known-good.sqlite');
    copyFileSync(dbPath, backupPath);
    saveNotices([], '2026-07-14 00:01:00', 'admin');
    if (!existsSync(path.join(process.env.DATA_DIR, 'db.previous.sqlite'))) process.exit(2);
    const backupAudit = inspectDatabaseFile(backupPath);
    if (!backupAudit.valid || backupAudit.counts.notices !== 1) process.exit(3);
    restoreDatabaseFromFile(backupPath);
    const currentAudit = inspectDatabaseFile(dbPath);
    if (!currentAudit.valid || getNotices().rows.length !== 1) process.exit(4);
  `;
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      cwd: process.cwd(),
      env,
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('deployment backup validates the copied SQLite database', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'pinzhiyanhuo-backup-test-'));
  const env = { ...process.env, DATA_DIR: tempDir };
  try {
    const seed = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { initDatabase, upsertUser } from './server/database.js';
      await initDatabase();
      upsertUser({ id: 'admin', name: 'admin', password: 'hash', role: 'admin', pageAccess: [] });
    `], { cwd: process.cwd(), env, encoding: 'utf8' });
    assert.equal(seed.status, 0, seed.stderr || seed.stdout);
    const backup = spawnSync(process.execPath, ['scripts/backup-data.mjs'], {
      cwd: process.cwd(),
      env: { ...env, BACKUP_DIR: path.join(tempDir, 'backups') },
      encoding: 'utf8'
    });
    assert.equal(backup.status, 0, backup.stderr || backup.stdout);
    assert.match(backup.stdout, /counts=/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
