import initSqlJs from 'sql.js';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data');
const backupRoot = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(rootDir, 'backups');
const keepCount = Number(process.env.BACKUP_KEEP_COUNT || 30);
const databaseTables = ['users', 'notices', 'schedules', 'reports', 'feedback', 'dimension_library', 'initial_data', 'operation_logs'];

function stamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function pruneBackups() {
  const entries = await readdir(backupRoot, { withFileTypes: true }).catch(() => []);
  const backupDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  await Promise.all(backupDirs.slice(keepCount).map((name) => (
    rm(path.join(backupRoot, name), { recursive: true, force: true })
  )));
}

async function inspectDatabase(target) {
  const SQL = await initSqlJs();
  const database = new SQL.Database(await readFile(target));
  try {
    const integrity = String(database.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0] || '');
    if (integrity.toLowerCase() !== 'ok') throw new Error(`SQLite integrity check failed: ${integrity}`);
    const counts = {};
    databaseTables.forEach((table) => {
      counts[table] = Number(database.exec(`SELECT COUNT(*) FROM ${table}`)[0]?.values?.[0]?.[0] || 0);
    });
    return { integrity, counts };
  } finally {
    database.close();
  }
}

await mkdir(backupRoot, { recursive: true });
const targetDir = path.join(backupRoot, stamp());
await mkdir(targetDir, { recursive: true });
const sourceDatabase = path.join(dataDir, 'db.sqlite');
const sourceInspection = await inspectDatabase(sourceDatabase);

const backupSources = [
  { source: sourceDatabase, target: path.join(targetDir, 'db.sqlite') },
  { source: path.join(dataDir, 'db.backup.sqlite'), target: path.join(targetDir, 'db.backup.sqlite') },
  { source: path.join(dataDir, 'db.previous.sqlite'), target: path.join(targetDir, 'db.previous.sqlite') },
  { source: path.join(dataDir, 'db.json'), target: path.join(targetDir, 'db.json') },
  { source: path.join(dataDir, 'uploads'), target: path.join(targetDir, 'uploads'), recursive: true },
  { source: path.join(dataDir, 'dimension-uploads'), target: path.join(targetDir, 'dimension-uploads'), recursive: true }
];

for (const item of backupSources) {
  if (await exists(item.source)) {
    await cp(item.source, item.target, item.recursive ? { recursive: true } : undefined);
  }
}

const copiedInspection = await inspectDatabase(path.join(targetDir, 'db.sqlite'));
await writeFile(path.join(targetDir, 'manifest.json'), JSON.stringify({
  backedUpAt: new Date().toISOString(),
  source: sourceInspection,
  copied: copiedInspection
}, null, 2), 'utf8');

await pruneBackups();
console.log(`Backup completed: ${targetDir}; counts=${JSON.stringify(copiedInspection.counts)}`);
