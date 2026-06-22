import cors from 'cors';
import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { format } from 'date-fns';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data');
const uploadDir = path.join(dataDir, 'uploads');
const dbPath = path.join(dataDir, 'db.json');
const port = Number(process.env.PORT || 4002);
const DEFAULT_ADMIN_USER = { id: 'u-admin', name: '孙立柱', password: '521sunlizhu', role: '管理员' };

await mkdir(uploadDir, { recursive: true });

const app = express();
const upload = multer({ dest: uploadDir });

app.use(cors());
app.use(express.json({ limit: '50mb' }));

function nowText() {
  return format(new Date(), 'yyyy-MM-dd HH:mm:ss');
}

function safeFileBaseName(value, fallback) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_');
  return cleaned || fallback;
}

function normalizeDb(db = {}) {
  const qualityInspection = db.qualityInspection || {};
  const users = Array.isArray(db.users) && db.users.length ? db.users : [
    DEFAULT_ADMIN_USER,
    { id: 'u-user', name: '验货员', password: '123456', role: '普通用户' }
  ];
  return {
    users: users.map((user) => user.id === DEFAULT_ADMIN_USER.id || user.name === '管理员'
      ? { ...user, ...DEFAULT_ADMIN_USER }
      : user),
    qualityInspection: {
      initialData: {
        sheetName: '',
        columns: [],
        rows: [],
        updatedAt: '',
        ...(qualityInspection.initialData || {})
      },
      notices: {
        rows: [],
        submittedAt: '',
        submittedBy: '',
        ...(qualityInspection.notices || {})
      },
      schedules: qualityInspection.schedules || {},
      reports: qualityInspection.reports || {},
      feedback: qualityInspection.feedback || {}
    }
  };
}

async function readDb() {
  await mkdir(dataDir, { recursive: true });
  try {
    return normalizeDb(JSON.parse(await readFile(dbPath, 'utf8')));
  } catch {
    const db = normalizeDb();
    await saveDb(db);
    return db;
  }
}

async function saveDb(db) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbPath, JSON.stringify(normalizeDb(db), null, 2), 'utf8');
}

async function removeUploadedFile(file) {
  if (!file?.path) return;
  try {
    await unlink(file.path);
  } catch {
    // Temporary upload cleanup is best effort.
  }
}

function parseWorkbook(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const matrix = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const headerIndex = matrix.findIndex((row) => row.some((cell) => String(cell || '').trim()));
  if (headerIndex === -1) return { sheetName, columns: [], rows: [], importedCount: 0 };

  const columns = matrix[headerIndex].map((cell, index) => String(cell || `字段${index + 1}`).trim());
  const rows = matrix.slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell || '').trim()))
    .map((row) => {
      const item = { id: randomUUID(), __cells: row.map((cell) => String(cell ?? '').trim()) };
      columns.forEach((column, index) => {
        item[column] = String(row[index] ?? '').trim();
      });
      return item;
    });
  return { sheetName, columns, rows, importedCount: rows.length };
}

function requestUser(db, req) {
  const name = String(req.query.user || req.body.user || '').trim();
  return db.users.find((user) => user.name === name) || db.users[0];
}

function composedRecords(db) {
  const inspection = db.qualityInspection;
  return (inspection.notices.rows || []).map((row, index) => ({
    ...row,
    rowNumber: row.rowNumber || index + 1,
    schedule: inspection.schedules[row.id] || {},
    report: inspection.reports[row.id] || {},
    feedback: inspection.feedback[row.id] || {}
  }));
}

function hasObjectValue(value) {
  return Object.values(value || {}).some((item) => String(item || '').trim());
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'quality-inspection', time: new Date().toISOString() });
});

app.get('/api/app-version', async (req, res) => {
  const targets = [
    path.join(rootDir, 'dist', 'index.html'),
    path.join(rootDir, 'package.json'),
    path.join(__dirname, 'app.js')
  ];
  const mtimes = await Promise.all(targets.map(async (target) => {
    try {
      return (await stat(target)).mtime.getTime();
    } catch {
      return 0;
    }
  }));
  const latest = new Date(Math.max(...mtimes, Date.now()));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ service: 'quality-inspection', versionTime: format(latest, 'yyyy-MM-dd HH:mm') });
});

app.post('/api/auth/login', async (req, res) => {
  const db = await readDb();
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '').trim();
  const user = db.users.find((item) => item.name === name && item.password === password);
  if (!user) return res.status(401).json({ error: '账号或密码不正确' });
  res.json({ id: user.id, name: user.name, role: user.role });
});

app.post('/api/auth/register', async (req, res) => {
  const db = await readDb();
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '').trim();
  if (!name || !password) return res.status(400).json({ error: '请输入姓名和密码' });
  if (db.users.some((user) => user.name === name)) return res.status(409).json({ error: '该姓名已存在' });
  const user = { id: randomUUID(), name, password, role: '普通用户' };
  db.users.push(user);
  await saveDb(db);
  res.json({ id: user.id, name: user.name, role: user.role });
});

app.get('/api/quality-inspection/initial-data', async (req, res) => {
  const db = await readDb();
  res.json(db.qualityInspection.initialData);
});

app.post('/api/quality-inspection/initial-data/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'missing file' });
  const db = await readDb();
  try {
    const result = parseWorkbook(req.file.path);
    db.qualityInspection.initialData = {
      sheetName: result.sheetName,
      columns: result.columns,
      rows: result.rows,
      updatedAt: nowText()
    };
    await saveDb(db);
    res.json({ ...db.qualityInspection.initialData, importedCount: result.importedCount });
  } finally {
    await removeUploadedFile(req.file);
  }
});

app.get('/api/quality-inspection/notices', async (req, res) => {
  const db = await readDb();
  res.json(db.qualityInspection.notices);
});

app.post('/api/quality-inspection/notices', async (req, res) => {
  const db = await readDb();
  const user = requestUser(db, req);
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  db.qualityInspection.notices = {
    rows: rows.map((row, index) => ({
      id: row.id || randomUUID(),
      rowNumber: index + 1,
      ...row
    })),
    submittedAt: nowText(),
    submittedBy: user.name
  };
  await saveDb(db);
  res.json(db.qualityInspection.notices);
});

app.get('/api/quality-inspection/records', async (req, res) => {
  const db = await readDb();
  res.json({ rows: composedRecords(db) });
});

app.post('/api/quality-inspection/summary-import', async (req, res) => {
  const db = await readDb();
  const user = requestUser(db, req);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const inspection = db.qualityInspection;
  const currentRows = inspection.notices.rows || [];
  const appendedRows = items.map((item) => ({
    ...(item.notice || {}),
    id: item.notice?.id || randomUUID()
  }));
  inspection.notices = {
    rows: [...currentRows, ...appendedRows].map((row, index) => ({
      ...row,
      id: row.id || randomUUID(),
      rowNumber: index + 1
    })),
    submittedAt: nowText(),
    submittedBy: user.name
  };
  items.forEach((item, index) => {
    const recordId = appendedRows[index]?.id;
    if (!recordId) return;
    if (hasObjectValue(item.schedule)) {
      inspection.schedules[recordId] = {
        ...(inspection.schedules[recordId] || {}),
        ...item.schedule,
        updatedAt: nowText()
      };
    }
    if (hasObjectValue(item.report)) {
      inspection.reports[recordId] = {
        ...(inspection.reports[recordId] || {}),
        ...item.report,
        updatedAt: nowText()
      };
    }
    if (hasObjectValue(item.feedback)) {
      inspection.feedback[recordId] = {
        ...(inspection.feedback[recordId] || {}),
        ...item.feedback,
        updatedAt: nowText()
      };
    }
  });
  await saveDb(db);
  res.json({ notices: inspection.notices, rows: composedRecords(db) });
});

app.patch('/api/quality-inspection/schedules/:id', async (req, res) => {
  const db = await readDb();
  db.qualityInspection.schedules[req.params.id] = {
    ...(db.qualityInspection.schedules[req.params.id] || {}),
    ...req.body,
    updatedAt: nowText()
  };
  await saveDb(db);
  res.json(db.qualityInspection.schedules[req.params.id]);
});

app.post('/api/quality-inspection/reports/:id', upload.single('file'), async (req, res) => {
  const db = await readDb();
  const previous = db.qualityInspection.reports[req.params.id] || {};
  const reportNo = String(req.body.reportNo || previous.reportNo || '').trim();
  const next = {
    ...previous,
    reportNo,
    conclusion: String(req.body.conclusion || previous.conclusion || '').trim(),
    updatedAt: nowText()
  };
  if (req.file) {
    const ext = path.extname(req.file.originalname || '');
    const originalBase = path.basename(req.file.originalname || 'report', ext);
    const storedBase = safeFileBaseName(reportNo || originalBase, `${req.params.id}-${Date.now()}`);
    const storedName = `${storedBase}${ext}`;
    const target = path.join(uploadDir, storedName);
    await unlink(target).catch(() => {});
    await rename(req.file.path, target);
    if (previous.fileName && previous.fileName !== storedName) {
      await unlink(path.join(uploadDir, path.basename(previous.fileName))).catch(() => {});
    }
    next.fileName = storedName;
    next.originalName = storedName;
    next.uploadedAt = nowText();
  }
  db.qualityInspection.reports[req.params.id] = next;
  await saveDb(db);
  res.json(next);
});

app.patch('/api/quality-inspection/feedback/:id', async (req, res) => {
  const db = await readDb();
  db.qualityInspection.feedback[req.params.id] = {
    ...(db.qualityInspection.feedback[req.params.id] || {}),
    ...req.body,
    updatedAt: nowText()
  };
  await saveDb(db);
  res.json(db.qualityInspection.feedback[req.params.id]);
});

app.get('/uploads/:fileName', (req, res) => {
  const safeName = path.basename(req.params.fileName);
  res.sendFile(path.join(uploadDir, safeName));
});

const distDir = path.join(rootDir, 'dist');
app.use(express.static(distDir));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Quality inspection server running at http://localhost:${port}`);
});
