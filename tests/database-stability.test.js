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

test('database state is persisted as one complete snapshot', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'pinzhiyanhuo-state-test-'));
  const env = { ...process.env, DATA_DIR: tempDir };
  const code = `
    import path from 'node:path';
    import { initDatabase, saveDatabaseState, setSession, inspectDatabaseFile, getNotices } from './server/database.js';
    await initDatabase();
    const state = {
      users: [{ id: 'u1', name: 'user', password: 'hash', role: '普通用户', pageAccess: ['inspectionNotice'] }],
      sessions: { token1: { userId: 'u1', createdAt: '2026-07-20 10:00:00' } },
      qualityInspection: {
        notices: { rows: [{ id: 'n1' }, { id: 'n2' }], submittedAt: '2026-07-20 10:00:00', submittedBy: 'user' },
        schedules: { n1: { status: '已安排' } },
        reports: { n1: { reportNo: 'R1' } },
        feedback: { n1: { result: '通过' } },
        dimensionLibrary: { slot1: { id: 'slot1' } },
        initialData: { columns: ['A'], rows: [{ A: 1 }] }
      }
    };
    saveDatabaseState(state);
    const dbPath = path.join(process.env.DATA_DIR, 'db.sqlite');
    const first = inspectDatabaseFile(dbPath);
    if (!first.valid || first.counts.users !== 1 || first.counts.notices !== 2 || first.counts.schedules !== 1 || first.counts.feedback !== 1) process.exit(2);
    setSession('token2', 'u1', '2026-07-20 10:01:00');
    state.qualityInspection.notices.rows = [{ id: 'n2' }];
    state.qualityInspection.schedules = {};
    state.qualityInspection.reports = {};
    state.qualityInspection.feedback = {};
    saveDatabaseState(state);
    const second = inspectDatabaseFile(dbPath);
    if (!second.valid || second.counts.sessions !== 2 || second.counts.notices !== 1 || second.counts.schedules !== 0 || second.counts.reports !== 0 || second.counts.feedback !== 0) process.exit(3);
    if (getNotices().rows[0]?.id !== 'n2') process.exit(4);
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

test('backfill logs are synchronized idempotently and stale duplicates are removed', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'pinzhiyanhuo-log-test-'));
  const env = { ...process.env, DATA_DIR: tempDir };
  const code = `
    import path from 'node:path';
    import { initDatabase, addOperationLogs, syncBackfillOperationLogs, inspectDatabaseFile } from './server/database.js';
    await initDatabase();
    const base = { createdAt: '2026-07-20 10:00:00', userName: 'user', userRole: '历史回填', action: '提交验货通知', detail: '记录ID：n1', inspectionInfo: '', method: 'BACKFILL', path: '/api/quality-inspection/history-backfill' };
    addOperationLogs([
      { ...base, id: 'old-duplicate-1' },
      { ...base, id: 'old-duplicate-2' },
      { ...base, id: 'actual-log', method: 'POST', path: '/api/quality-inspection/notices' }
    ]);
    const desired = [
      { ...base, id: 'backfill-notice-duplicate' },
      { ...base, id: 'backfill-notice-stable', createdAt: '2026-07-20 10:01:00' }
    ];
    if (syncBackfillOperationLogs(desired) !== 1) process.exit(2);
    const dbPath = path.join(process.env.DATA_DIR, 'db.sqlite');
    const first = inspectDatabaseFile(dbPath);
    if (!first.valid || first.counts.operation_logs !== 2) process.exit(3);
    if (syncBackfillOperationLogs(desired) !== 0) process.exit(4);
    const second = inspectDatabaseFile(dbPath);
    if (second.counts.operation_logs !== 2) process.exit(5);
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

test('login sessions are capped per user', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'pinzhiyanhuo-session-test-'));
  const env = { ...process.env, DATA_DIR: tempDir };
  const code = `
    import path from 'node:path';
    import { initDatabase, setSession, inspectDatabaseFile } from './server/database.js';
    await initDatabase();
    for (let index = 0; index < 7; index += 1) {
      setSession('token-' + index, 'u1', '2026-07-20 10:00:0' + index);
    }
    const audit = inspectDatabaseFile(path.join(process.env.DATA_DIR, 'db.sqlite'));
    if (!audit.valid || audit.counts.sessions !== 5) process.exit(2);
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
