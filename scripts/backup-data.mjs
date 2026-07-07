import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data');
const backupRoot = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(rootDir, 'backups');
const keepCount = Number(process.env.BACKUP_KEEP_COUNT || 30);

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

await mkdir(backupRoot, { recursive: true });
const targetDir = path.join(backupRoot, stamp());
await mkdir(targetDir, { recursive: true });

const backupSources = [
  { source: path.join(dataDir, 'db.sqlite'), target: path.join(targetDir, 'db.sqlite') },
  { source: path.join(dataDir, 'db.backup.sqlite'), target: path.join(targetDir, 'db.backup.sqlite') },
  { source: path.join(dataDir, 'db.json'), target: path.join(targetDir, 'db.json') },
  { source: path.join(dataDir, 'uploads'), target: path.join(targetDir, 'uploads'), recursive: true },
  { source: path.join(dataDir, 'dimension-uploads'), target: path.join(targetDir, 'dimension-uploads'), recursive: true }
];

for (const item of backupSources) {
  if (await exists(item.source)) {
    await cp(item.source, item.target, item.recursive ? { recursive: true } : undefined);
  }
}

await pruneBackups();
console.log(`Backup completed: ${targetDir}`);
