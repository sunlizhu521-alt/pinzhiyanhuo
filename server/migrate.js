import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data');
const dbPath = process.env.DB_PATH || path.join(dataDir, 'db.sqlite');
const jsonPath = path.join(dataDir, 'db.json');

mkdirSync(dataDir, { recursive: true });

const SQL = await initSqlJs();
const db = new SQL.Database();

db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT '普通用户', page_access TEXT NOT NULL DEFAULT '[]')`);
db.run(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL)`);
db.run(`CREATE TABLE IF NOT EXISTS notices (id TEXT, data TEXT NOT NULL)`);
db.run(`CREATE TABLE IF NOT EXISTS schedules (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
db.run(`CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
db.run(`CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
db.run(`CREATE TABLE IF NOT EXISTS dimension_library (slot_id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
db.run(`CREATE TABLE IF NOT EXISTS initial_data (id INTEGER PRIMARY KEY DEFAULT 1, data TEXT NOT NULL)`);
db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

if (!existsSync(jsonPath)) {
  console.log('No db.json found, created empty SQLite database');
  const buffer = db.export();
  writeFileSync(dbPath, Buffer.from(buffer));
  process.exit(0);
}

const json = JSON.parse(readFileSync(jsonPath, 'utf8'));

// 迁移用户
json.users?.forEach((u) => {
  db.run('INSERT OR REPLACE INTO users (id, name, password, role, page_access) VALUES (?, ?, ?, ?, ?)', [
    u.id,
    u.name,
    u.password,
    u.role || '普通用户',
    JSON.stringify(u.pageAccess || [])
  ]);
});

// 迁移会话
Object.entries(json.sessions || {}).forEach(([token, s]) => {
  db.run('INSERT OR REPLACE INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', [
    token,
    s.userId,
    s.createdAt || ''
  ]);
});

const qi = json.qualityInspection || {};

// 迁移通知
qi.notices?.rows?.forEach((r) => {
  db.run('INSERT INTO notices (id, data) VALUES (?, ?)', [r.id, JSON.stringify(r)]);
});
if (qi.notices?.submittedAt) {
  db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', ['notices_submittedAt', qi.notices.submittedAt]);
}
if (qi.notices?.submittedBy) {
  db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', ['notices_submittedBy', qi.notices.submittedBy]);
}

// 迁移安排
Object.entries(qi.schedules || {}).forEach(([id, data]) => {
  db.run('INSERT OR REPLACE INTO schedules (id, data) VALUES (?, ?)', [id, JSON.stringify(data)]);
});

// 迁移报告
Object.entries(qi.reports || {}).forEach(([id, data]) => {
  db.run('INSERT OR REPLACE INTO reports (id, data) VALUES (?, ?)', [id, JSON.stringify(data)]);
});

// 迁移反馈
Object.entries(qi.feedback || {}).forEach(([id, data]) => {
  db.run('INSERT OR REPLACE INTO feedback (id, data) VALUES (?, ?)', [id, JSON.stringify(data)]);
});

// 迁移维度表
Object.entries(qi.dimensionLibrary || {}).forEach(([slotId, data]) => {
  db.run('INSERT OR REPLACE INTO dimension_library (slot_id, data) VALUES (?, ?)', [slotId, JSON.stringify(data)]);
});

// 迁移初始数据
if (qi.initialData && qi.initialData.columns?.length) {
  db.run('INSERT OR REPLACE INTO initial_data (id, data) VALUES (1, ?)', [JSON.stringify(qi.initialData)]);
}

const buffer = db.export();
writeFileSync(dbPath, Buffer.from(buffer));

console.log('Migration completed');
console.log('Users:', json.users?.length || 0);
console.log('Notices:', qi.notices?.rows?.length || 0);
console.log('Schedules:', Object.keys(qi.schedules || {}).length);
console.log('Reports:', Object.keys(qi.reports || {}).length);
console.log('Feedback:', Object.keys(qi.feedback || {}).length);
