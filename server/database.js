import initSqlJs from 'sql.js';
import { copyFileSync, readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data');
const dbPath = process.env.DB_PATH || path.join(dataDir, 'db.sqlite');

mkdirSync(dataDir, { recursive: true });

let SQL = null;
let db = null;
let lastPersistedBuffer = null;

const DATABASE_TABLES = [
  'users',
  'sessions',
  'notices',
  'schedules',
  'reports',
  'feedback',
  'dimension_library',
  'initial_data',
  'operation_logs'
];

function scalar(database, sql) {
  const result = database.exec(sql);
  return result[0]?.values?.[0]?.[0];
}

function inspectDatabase(database) {
  const integrity = String(scalar(database, 'PRAGMA integrity_check') || '');
  const counts = {};
  DATABASE_TABLES.forEach((table) => {
    counts[table] = Number(scalar(database, `SELECT COUNT(*) FROM ${table}`) || 0);
  });
  return {
    valid: integrity.toLowerCase() === 'ok',
    integrity,
    counts,
    latestOperationAt: String(scalar(database, 'SELECT MAX(created_at) FROM operation_logs') || ''),
    noticesSubmittedAt: String(scalar(database, "SELECT value FROM meta WHERE key = 'notices_submittedAt'") || ''),
    businessRows: counts.notices + counts.schedules + counts.reports + counts.feedback
      + counts.dimension_library + counts.initial_data + counts.operation_logs
  };
}

function validateDatabaseBuffer(buffer) {
  const candidate = new SQL.Database(buffer);
  try {
    const inspection = inspectDatabase(candidate);
    if (!inspection.valid) throw new Error(`SQLite integrity check failed: ${inspection.integrity}`);
    return inspection;
  } finally {
    candidate.close();
  }
}

function atomicWriteDatabase(buffer, preservePrevious = true) {
  validateDatabaseBuffer(buffer);
  const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tempPath = `${dbPath}.tmp-${nonce}`;
  writeFileSync(tempPath, Buffer.from(buffer));
  try {
    if (preservePrevious && existsSync(dbPath)) {
      const previousPath = path.join(dataDir, 'db.previous.sqlite');
      const previousTempPath = `${previousPath}.tmp-${nonce}`;
      copyFileSync(dbPath, previousTempPath);
      rmSync(previousPath, { force: true });
      renameSync(previousTempPath, previousPath);
    }
    renameSync(tempPath, dbPath);
  } finally {
    rmSync(tempPath, { force: true });
  }
}

// Initialize the SQLite database and create the first version schema.
export async function initDatabase() {
  SQL = await initSqlJs();

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
    lastPersistedBuffer = Buffer.from(buffer);
  } else {
    db = new SQL.Database();
    lastPersistedBuffer = Buffer.from(db.export());
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '普通用户',
    page_access TEXT NOT NULL DEFAULT '[]'
  )`);
  try {
    db.run('ALTER TABLE users ADD COLUMN must_reset_password INTEGER NOT NULL DEFAULT 0');
  } catch {
    // Column already exists on upgraded databases.
  }
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS notices (id TEXT, data TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS schedules (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS dimension_library (slot_id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS initial_data (id INTEGER PRIMARY KEY DEFAULT 1, data TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS operation_logs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    inspection_info TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL
  )`);

  saveDb();
}

function saveDb() {
  const buffer = Buffer.from(db.export());
  try {
    atomicWriteDatabase(buffer);
    lastPersistedBuffer = buffer;
  } catch (error) {
    if (lastPersistedBuffer) {
      const failedDatabase = db;
      db = new SQL.Database(lastPersistedBuffer);
      failedDatabase?.close();
    }
    throw error;
  }
}

export function inspectDatabaseFile(filePath) {
  if (!existsSync(filePath)) return { exists: false, valid: false, filePath };
  try {
    const inspection = validateDatabaseBuffer(readFileSync(filePath));
    const fileInfo = statSync(filePath);
    return {
      exists: true,
      ...inspection,
      bytes: fileInfo.size,
      modifiedAt: fileInfo.mtime.toISOString()
    };
  } catch (error) {
    return {
      exists: true,
      valid: false,
      error: error?.message || String(error),
      bytes: statSync(filePath).size
    };
  }
}

export function restoreDatabaseFromFile(filePath) {
  const buffer = Buffer.from(readFileSync(filePath));
  const inspection = validateDatabaseBuffer(buffer);
  atomicWriteDatabase(buffer);
  const restored = new SQL.Database(buffer);
  const previous = db;
  db = restored;
  lastPersistedBuffer = buffer;
  previous?.close();
  return inspection;
}

function runPersistedTransaction(mutation) {
  db.run('BEGIN TRANSACTION');
  try {
    mutation();
    db.run('COMMIT');
    saveDb();
  } catch (error) {
    try {
      db.run('ROLLBACK');
    } catch {
      // saveDb restores the last persisted database when disk persistence fails.
    }
    throw error;
  }
}

function replaceJsonMapTable(tableName, keyName, values = {}) {
  db.run(`DELETE FROM ${tableName}`);
  const insert = db.prepare(`INSERT INTO ${tableName} (${keyName}, data) VALUES (?, ?)`);
  Object.entries(values || {}).forEach(([key, data]) => {
    if (!key) return;
    insert.run([key, JSON.stringify(data || {})]);
  });
  insert.free();
}

export function saveDatabaseState(state = {}) {
  const inspection = state.qualityInspection || {};
  const notices = inspection.notices || { rows: [], submittedAt: '', submittedBy: '' };
  const existingUsers = getUsers();
  const existingUsersById = new Map(existingUsers.map((user) => [user.id, user]));
  const existingUsersByName = new Map(existingUsers.map((user) => [user.name, user]));
  runPersistedTransaction(() => {
    const userInsert = db.prepare('INSERT OR REPLACE INTO users (id, name, password, role, page_access, must_reset_password) VALUES (?, ?, ?, ?, ?, ?)');
    (state.users || []).forEach((user) => {
      const existing = existingUsersById.get(user.id) || existingUsersByName.get(user.name);
      const password = user.password || existing?.password;
      if (!password) throw new Error(`Cannot persist user without credentials: ${user.name || user.id || 'unknown'}`);
      userInsert.run([
        user.id,
        user.name,
        password,
        user.role || '普通用户',
        JSON.stringify(user.pageAccess || []),
        user.mustResetPassword ? 1 : 0
      ]);
    });
    userInsert.free();

    const sessionInsert = db.prepare('INSERT OR REPLACE INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)');
    Object.entries(state.sessions || {}).forEach(([token, session]) => {
      sessionInsert.run([token, session.userId, session.createdAt || '']);
    });
    sessionInsert.free();

    db.run('DELETE FROM notices');
    const noticeInsert = db.prepare('INSERT INTO notices (id, data) VALUES (?, ?)');
    (notices.rows || []).forEach((row) => {
      noticeInsert.run([row.id || '', JSON.stringify(row)]);
    });
    noticeInsert.free();
    db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', ['notices_submittedAt', notices.submittedAt || '']);
    db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', ['notices_submittedBy', notices.submittedBy || '']);

    replaceJsonMapTable('schedules', 'id', inspection.schedules);
    replaceJsonMapTable('reports', 'id', inspection.reports);
    replaceJsonMapTable('feedback', 'id', inspection.feedback);
    replaceJsonMapTable('dimension_library', 'slot_id', inspection.dimensionLibrary);

    db.run('DELETE FROM initial_data');
    if (inspection.initialData && Object.keys(inspection.initialData).length) {
      db.run('INSERT INTO initial_data (id, data) VALUES (1, ?)', [JSON.stringify(inspection.initialData)]);
    }
  });
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const obj = stmt.getAsObject();
    stmt.free();
    return obj;
  }
  stmt.free();
  return null;
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function parsePageAccess(value) {
  try {
    return JSON.parse(value || '[]');
  } catch {
    return [];
  }
}

function mapUser(row) {
  if (!row) return null;
  const { page_access: pageAccessRaw, must_reset_password: mustResetPasswordRaw, ...user } = row;
  return {
    ...user,
    pageAccess: parsePageAccess(pageAccessRaw),
    mustResetPassword: Boolean(mustResetPasswordRaw)
  };
}

export function getUsers() {
  return queryAll('SELECT * FROM users').map(mapUser);
}

export function getUserByName(name) {
  return mapUser(queryOne('SELECT * FROM users WHERE name = ?', [name]));
}

export function getUserById(id) {
  return mapUser(queryOne('SELECT * FROM users WHERE id = ?', [id]));
}

export function upsertUser(user) {
  db.run('INSERT OR REPLACE INTO users (id, name, password, role, page_access, must_reset_password) VALUES (?, ?, ?, ?, ?, ?)', [
    user.id,
    user.name,
    user.password,
    user.role || '普通用户',
    JSON.stringify(user.pageAccess || []),
    user.mustResetPassword ? 1 : 0
  ]);
  saveDb();
}

export function deleteUser(id) {
  db.run('DELETE FROM users WHERE id = ?', [id]);
  db.run('DELETE FROM sessions WHERE user_id = ?', [id]);
  saveDb();
}

export function createUser(user) {
  upsertUser(user);
}

export function getSessions() {
  const rows = queryAll('SELECT * FROM sessions');
  const sessions = {};
  rows.forEach((row) => {
    sessions[row.token] = { userId: row.user_id, createdAt: row.created_at };
  });
  return sessions;
}

export function setSession(token, userId, createdAt) {
  runPersistedTransaction(() => {
    db.run('INSERT OR REPLACE INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', [token, userId, createdAt]);
    db.run(`DELETE FROM sessions
      WHERE user_id = ? AND token NOT IN (
        SELECT token FROM sessions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 5
      )`, [userId, userId]);
  });
}

export function deleteSession(token) {
  db.run('DELETE FROM sessions WHERE token = ?', [token]);
  saveDb();
}

export function deleteSessionsByUserId(userId) {
  db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
  saveDb();
}

export function getNotices() {
  const metaAt = queryOne("SELECT value FROM meta WHERE key = 'notices_submittedAt'");
  const metaBy = queryOne("SELECT value FROM meta WHERE key = 'notices_submittedBy'");
  const rows = queryAll('SELECT * FROM notices');
  return {
    rows: rows.map((row) => JSON.parse(row.data)),
    submittedAt: metaAt?.value || '',
    submittedBy: metaBy?.value || ''
  };
}

export function saveNotices(rows, submittedAt, submittedBy) {
  db.run('DELETE FROM notices');
  const insert = db.prepare('INSERT INTO notices (id, data) VALUES (?, ?)');
  rows.forEach((row) => {
    insert.bind([row.id, JSON.stringify(row)]);
    insert.step();
    insert.reset();
  });
  insert.free();
  setMeta('notices_submittedAt', submittedAt);
  setMeta('notices_submittedBy', submittedBy);
  saveDb();
}

export function getSchedule(id) {
  const row = queryOne('SELECT * FROM schedules WHERE id = ?', [id]);
  return row ? JSON.parse(row.data) : {};
}

export function saveSchedule(id, data) {
  db.run('INSERT OR REPLACE INTO schedules (id, data) VALUES (?, ?)', [id, JSON.stringify(data)]);
  saveDb();
}

export function saveQualityInspectionBatch({ schedules = {}, feedback = {} }) {
  Object.entries(schedules).forEach(([id, data]) => {
    db.run('INSERT OR REPLACE INTO schedules (id, data) VALUES (?, ?)', [id, JSON.stringify(data)]);
  });
  Object.entries(feedback).forEach(([id, data]) => {
    db.run('INSERT OR REPLACE INTO feedback (id, data) VALUES (?, ?)', [id, JSON.stringify(data)]);
  });
  saveDb();
}

export function deleteSchedule(id) {
  db.run('DELETE FROM schedules WHERE id = ?', [id]);
  saveDb();
}

export function getReport(id) {
  const row = queryOne('SELECT * FROM reports WHERE id = ?', [id]);
  return row ? JSON.parse(row.data) : {};
}

export function saveReport(id, data) {
  db.run('INSERT OR REPLACE INTO reports (id, data) VALUES (?, ?)', [id, JSON.stringify(data)]);
  saveDb();
}

export function deleteReport(id) {
  db.run('DELETE FROM reports WHERE id = ?', [id]);
  saveDb();
}

export function getFeedback(id) {
  const row = queryOne('SELECT * FROM feedback WHERE id = ?', [id]);
  return row ? JSON.parse(row.data) : {};
}

export function saveFeedback(id, data) {
  db.run('INSERT OR REPLACE INTO feedback (id, data) VALUES (?, ?)', [id, JSON.stringify(data)]);
  saveDb();
}

export function deleteFeedback(id) {
  db.run('DELETE FROM feedback WHERE id = ?', [id]);
  saveDb();
}

// Batch query helpers - avoid N+1 queries in readDb()
export function getSchedulesBatch(ids) {
  if (!ids || !ids.length) return {};
  const placeholders = ids.map(() => '?').join(',');
  const rows = queryAll(`SELECT * FROM schedules WHERE id IN (${placeholders})`, ids);
  const result = {};
  rows.forEach((row) => { result[row.id] = JSON.parse(row.data); });
  return result;
}

export function getReportsBatch(ids) {
  if (!ids || !ids.length) return {};
  const placeholders = ids.map(() => '?').join(',');
  const rows = queryAll(`SELECT * FROM reports WHERE id IN (${placeholders})`, ids);
  const result = {};
  rows.forEach((row) => { result[row.id] = JSON.parse(row.data); });
  return result;
}

export function getFeedbacksBatch(ids) {
  if (!ids || !ids.length) return {};
  const placeholders = ids.map(() => '?').join(',');
  const rows = queryAll(`SELECT * FROM feedback WHERE id IN (${placeholders})`, ids);
  const result = {};
  rows.forEach((row) => { result[row.id] = JSON.parse(row.data); });
  return result;
}

export function getDimensionLibrary() {
  const rows = queryAll('SELECT * FROM dimension_library');
  const library = {};
  rows.forEach((row) => {
    library[row.slot_id] = JSON.parse(row.data);
  });
  return library;
}

export function saveDimensionLibrary(slotId, data) {
  db.run('INSERT OR REPLACE INTO dimension_library (slot_id, data) VALUES (?, ?)', [slotId, JSON.stringify(data)]);
  saveDb();
}

export function deleteDimensionLibrary(slotId) {
  db.run('DELETE FROM dimension_library WHERE slot_id = ?', [slotId]);
  saveDb();
}

export function getInitialData() {
  const row = queryOne('SELECT * FROM initial_data WHERE id = 1');
  return row ? JSON.parse(row.data) : { sheetName: '', columns: [], rows: [], updatedAt: '' };
}

export function saveInitialData(data) {
  db.run('INSERT OR REPLACE INTO initial_data (id, data) VALUES (1, ?)', [JSON.stringify(data)]);
  saveDb();
}

function insertOperationLog(log) {
  db.run('INSERT OR REPLACE INTO operation_logs (id, created_at, user_name, user_role, action, detail, inspection_info, method, path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    log.id,
    log.createdAt,
    log.userName || '',
    log.userRole || '',
    log.action || '',
    log.detail || '',
    log.inspectionInfo || '',
    log.method || '',
    log.path || ''
  ]);
}

export function addOperationLog(log) {
  insertOperationLog(log);
  saveDb();
}

export function addOperationLogs(logs) {
  if (!Array.isArray(logs) || !logs.length) return 0;
  runPersistedTransaction(() => logs.forEach(insertOperationLog));
  return logs.length;
}

function comparableOperationLog(log = {}) {
  return {
    id: String(log.id || ''),
    createdAt: String(log.createdAt || log.created_at || ''),
    userName: String(log.userName || log.user_name || ''),
    userRole: String(log.userRole || log.user_role || ''),
    action: String(log.action || ''),
    detail: String(log.detail || ''),
    inspectionInfo: String(log.inspectionInfo || log.inspection_info || ''),
    method: String(log.method || ''),
    path: String(log.path || '')
  };
}

export function syncBackfillOperationLogs(logs = []) {
  const actualOperationKeys = new Set(
    queryAll("SELECT action, created_at FROM operation_logs WHERE method <> 'BACKFILL'")
      .map((row) => `${row.action}\u0000${row.created_at}`)
  );
  const desired = logs
    .map(comparableOperationLog)
    .filter((log) => log.id && !actualOperationKeys.has(`${log.action}\u0000${log.createdAt}`))
    .sort((a, b) => a.id.localeCompare(b.id));
  const current = queryAll("SELECT * FROM operation_logs WHERE method = 'BACKFILL'")
    .map(comparableOperationLog)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (JSON.stringify(current) === JSON.stringify(desired)) return 0;
  runPersistedTransaction(() => {
    db.run("DELETE FROM operation_logs WHERE method = 'BACKFILL'");
    desired.forEach(insertOperationLog);
  });
  return desired.length;
}

export function getOperationLogs(limit = 500) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 2000));
  return queryAll(`SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT ${safeLimit}`).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    userName: row.user_name,
    userRole: row.user_role,
    action: row.action,
    detail: row.detail,
    inspectionInfo: row.inspection_info,
    method: row.method,
    path: row.path
  }));
}

function setMeta(key, value) {
  db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
  saveDb();
}

// Session cleanup - delete sessions older than maxAgeMs (default 7 days)
export function deleteExpiredSessions(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString().replace('T', ' ').slice(0, 19);
  db.run('DELETE FROM sessions WHERE created_at < ?', [cutoff]);
  const changed = db.getRowsModified();
  if (changed > 0) saveDb();
  return changed;
}
