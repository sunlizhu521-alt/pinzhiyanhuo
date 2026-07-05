import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import xlsx from 'xlsx';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { format } from 'date-fns';
import { createHmac, randomUUID } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { initDatabase, getUsers, getUserByName, getUserById, upsertUser, createUser, deleteUser, getSessions, setSession, deleteSession, deleteSessionsByUserId, getNotices, saveNotices, getSchedule, saveSchedule, deleteSchedule, getReport, saveReport, deleteReport, getFeedback, saveFeedback, deleteFeedback, getDimensionLibrary, saveDimensionLibrary, deleteDimensionLibrary, getInitialData, saveInitialData, getSchedulesBatch, getReportsBatch, getFeedbacksBatch, deleteExpiredSessions } from './database.js';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data');
const uploadDir = path.join(dataDir, 'uploads');
const dimensionUploadDir = path.join(dataDir, 'dimension-uploads');
const dbPath = path.join(dataDir, 'db.json');
const port = Number(process.env.PORT || 4002);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DINGTALK_WEBHOOK = process.env.DINGTALK_WEBHOOK || '';
const DINGTALK_SECRET = process.env.DINGTALK_SECRET || '';
const DEFAULT_ADMIN_USER = { id: 'u-admin', name: '孙立柱', password: ADMIN_PASSWORD, role: '管理员' };
const ROLE_ADMIN = '管理员';
const ROLE_USER = '普通用户';
const LEGACY_DEFAULT_USER_IDS = new Set(['u-purchaser', 'u-inspector', 'u-settlement']);
const LEGACY_ROLE_NAMES = new Set(['采购跟单员', '验货员', '结算员']);
const PAGE_KEYS = [
  'inspectionNotice',
  'inspectionSchedule',
  'inspectionFeedback',
  'reworkRecords',
  'inspectionStamp',
  'inspectionReportLibrary',
  'inspectionReportQuery',
  'inspectionSummary',
  'inspectionLedger',
  'inspectionInitialData',
  'dimensionLibrary',
  'backupCenter',
  'permissionManagement'
];
const DEFAULT_PAGE_ACCESS_BY_ROLE = {
  [ROLE_ADMIN]: PAGE_KEYS,
  [ROLE_USER]: []
};
const DEFAULT_USERS = [
  DEFAULT_ADMIN_USER
];
const PRODUCT_CATEGORY_SLOT_ID = 'dimension-slot-1';
const PURCHASE_WORK_DIVISION_SLOT_ID = 'dimension-slot-2';
const DIMENSION_PREVIEW_ROW_LIMIT = 20;
const DIMENSION_SLOT_IDS = ['dimension-slot-1', 'dimension-slot-2', 'dimension-slot-3', 'dimension-slot-4'];
const DIMENSION_SUPPLIER_ALIASES = ['产品线明细供应商', '供应商简称', '供应商', '供应商名称', '厂家简称', '厂商简称', '工厂简称'];
const DIMENSION_ADDRESS_ALIASES = ['产品线明细地址', '供应商地址', '验货地址', '工厂地址', '详细地址', '地址', '所在地'];
const DIMENSION_PROVINCE_ALIASES = ['省', '省份', '所在省', '省区'];
const DIMENSION_CITY_ALIASES = ['市', '城市', '所在市', '地市'];
const SALES_PRODUCT_LINE_ALIASES = ['销售产品线', '产品线', '一级产品线'];
const SALES_SERIES_ALIASES = ['销售系列', '系列', '产品系列'];
const NOTICE_REQUIRED_FIELDS = [
  { key: 'inspectionNotifier', label: '验货通知人' },
  { key: 'inspectionFillTime', label: '验货填写时间' },
  { key: 'supplierFinishTime', label: '供应商完工时间' },
  { key: 'shipmentTime', label: '可验货时间' },
  { key: 'supplierShortName', label: '供应商简称' },
  { key: 'supplierAddress', label: '供应商地址' },
  { key: 'businessDepartments', label: '事业部' },
  { key: 'operation', label: '运营' },
  { key: 'firstInspection', label: '是否首批验货' },
  { key: 'salesProductLine', label: '产品线' },
  { key: 'series', label: '系列' },
  { key: 'totalQuantity', label: '合计数量' }
];

await mkdir(uploadDir, { recursive: true });
await mkdir(dimensionUploadDir, { recursive: true });

const app = express();
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '登录过于频繁，请15分钟后再试' }
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '注册过于频繁，请1小时后再试' }
});
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 20 * 1024 * 1024 }
});
const dimensionUpload = multer({
  dest: dimensionUploadDir,
  limits: { fileSize: 100 * 1024 * 1024 }
});

app.use(cors({ origin: 'https://zhugeaishiyanshi.com' }));
app.use(compression({
  threshold: 1024
}));
app.use(express.json({ limit: '10mb' }));
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false
}));
app.use('/api/', apiLimiter);
app.use('/api', (req, res, next) => {
  const mutatingMethods = new Set(['POST', 'PATCH', 'DELETE']);
  if (!mutatingMethods.has(req.method)) {
    next();
    return;
  }
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const mutation = describeMutation(req);
    if (!mutation) return;
    notifyDingTalk(req, mutation).catch((error) => {
      console.error('[dingtalk] notify middleware error:', error?.message || error);
    });
  });
  next();
});

function nowText() {
  return format(new Date(), 'yyyy-MM-dd HH:mm:ss');
}

function dingTalkSignedUrl() {
  if (!DINGTALK_WEBHOOK) return '';
  if (!DINGTALK_SECRET) return DINGTALK_WEBHOOK;
  const timestamp = Date.now();
  const sign = encodeURIComponent(
    createHmac('sha256', DINGTALK_SECRET)
      .update(`${timestamp}\n${DINGTALK_SECRET}`)
      .digest('base64')
  );
  const separator = DINGTALK_WEBHOOK.includes('?') ? '&' : '?';
  return `${DINGTALK_WEBHOOK}${separator}timestamp=${timestamp}&sign=${sign}`;
}

function safeNoticeValue(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text ? text.replace(/\s+/g, ' ').slice(0, 180) : fallback;
}

function noticeRowsSummary(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const items = rows.slice(0, 5).map((row) => {
    const supplier = safeNoticeValue(row.supplierShortName, '供应商未填');
    const series = safeNoticeValue(row.series, '系列未填');
    const quantity = safeNoticeValue(row.totalQuantity, '数量未填');
    return `${supplier} / ${series} / ${quantity}`;
  });
  const suffix = rows.length > items.length ? ` 等${rows.length}条` : '';
  return `${items.join('；')}${suffix}`;
}

function describeMutation(req) {
  const method = req.method;
  const pathName = String(req.originalUrl || req.path || '').split('?')[0];
  const body = req.body || {};
  const fileNames = [
    ...(req.file ? [req.file.originalname] : []),
    ...(Array.isArray(req.files) ? req.files.map((file) => file.originalname) : [])
  ].filter(Boolean).map(fixUploadFileName);
  const fileText = fileNames.length ? `文件：${fileNames.slice(0, 5).join('、')}${fileNames.length > 5 ? ` 等${fileNames.length}个` : ''}` : '';
  const idMatch = pathName.match(/\/([^/]+)$/);
  const targetId = idMatch ? decodeURIComponent(idMatch[1]) : '';
  const rowsCount = Array.isArray(body.rows) ? body.rows.length : 0;
  const itemsCount = Array.isArray(body.items) ? body.items.length : 0;
  const isNoticeMutation = method === 'POST' && pathName === '/api/quality-inspection/notices';
  const isScheduleMutation = /\/api\/quality-inspection\/schedules\/[^/]+$/.test(pathName);
  const isDirectFeedbackMutation = pathName === '/api/quality-inspection/direct-feedback';
  const isFeedbackMutation = /\/api\/quality-inspection\/feedback\/[^/]+$/.test(pathName);

  if (pathName === '/api/auth/login') return null;
  if (!isNoticeMutation && !isScheduleMutation && !isDirectFeedbackMutation && !isFeedbackMutation) return null;
  if (pathName === '/api/auth/register') return { action: '注册账号', detail: `账号：${safeNoticeValue(body.name)}` };
  if (pathName === '/api/auth/change-password') return { action: '修改登录密码', detail: '当前用户修改了登录密码' };
  if (/\/api\/auth\/users\/[^/]+\/access$/.test(pathName)) return { action: '调整用户权限', detail: `用户ID：${safeNoticeValue(targetId)}` };
  if (/\/api\/auth\/users\/[^/]+\/reset-password$/.test(pathName)) return { action: '重置用户密码', detail: `用户ID：${safeNoticeValue(targetId)}` };
  if (method === 'DELETE' && /\/api\/auth\/users\/[^/]+$/.test(pathName)) return { action: '删除用户账号', detail: `用户ID：${safeNoticeValue(targetId)}` };
  if (pathName.includes('/initial-data/import')) return { action: '导入验货初始数据', detail: fileText };
  if (pathName.includes('/dimension-library/sync')) return { action: '更新维度表文件库', detail: '同步服务器最新维度表数据' };
  if (/\/api\/quality-inspection\/dimension-library\/[^/]+\/apply$/.test(pathName)) {
    return { action: '上传并应用维度表', detail: `槽位：${safeNoticeValue(req.params?.slotId || targetId)}${fileText ? `；${fileText}` : ''}` };
  }
  if (method === 'DELETE' && /\/api\/quality-inspection\/dimension-library\/[^/]+$/.test(pathName)) return { action: '删除维度表槽位文件', detail: `槽位：${safeNoticeValue(req.params?.slotId || targetId)}` };
  if (method === 'POST' && pathName === '/api/quality-inspection/notices') return { action: '提交验货通知', detail: `记录数：${rowsCount}`, inspectionInfo: noticeRowsSummary(body.rows) };
  if (method === 'DELETE' && pathName === '/api/quality-inspection/notices') return { action: '清空验货通知和安排', detail: '清空全部验货通知、安排、报告和反馈' };
  if (method === 'DELETE' && /\/api\/quality-inspection\/notices\/[^/]+$/.test(pathName)) return { action: '删除单条验货通知', detail: `记录ID：${safeNoticeValue(targetId)}` };
  if (pathName === '/api/quality-inspection/direct-feedback') return { action: '新增未通知验货反馈', detail: `${safeNoticeValue(body.notice?.supplierShortName || body.supplierShortName)} / ${safeNoticeValue(body.notice?.series || body.series)}` };
  if (pathName === '/api/quality-inspection/summary-import') return { action: '导入历史台账', detail: `记录数：${itemsCount}` };
  if (/\/api\/quality-inspection\/schedules\/[^/]+$/.test(pathName)) return { action: '安排验货', detail: `验货员：${safeNoticeValue(body.inspector)}；计划时间：${safeNoticeValue(body.scheduledDate)}` };
  if (method === 'POST' && /\/api\/quality-inspection\/reports\/[^/]+$/.test(pathName)) return { action: '上传检验报告单', detail: `记录ID：${safeNoticeValue(targetId)}${fileText ? `；${fileText}` : ''}` };
  if (method === 'DELETE' && /\/api\/quality-inspection\/reports\/[^/]+$/.test(pathName)) return { action: '删除检验报告单', detail: `记录ID：${safeNoticeValue(targetId)}` };
  if (method === 'DELETE' && /\/api\/quality-inspection\/records\/[^/]+$/.test(pathName)) return { action: '删除验货记录', detail: `记录ID：${safeNoticeValue(targetId)}` };
  if (/\/api\/quality-inspection\/reports\/[^/]+\/stamp$/.test(pathName)) return { action: body.skipStamp && body.skipStamp !== '0' ? '直接保存检验报告单' : '加盖检验章', detail: `记录ID：${safeNoticeValue(req.params?.id || targetId)}${fileText ? `；${fileText}` : ''}` };
  if (/\/api\/quality-inspection\/reports\/[^/]+\/reject$/.test(pathName)) return { action: '驳回检验报告单', detail: `记录ID：${safeNoticeValue(req.params?.id || targetId)}` };
  if (method === 'POST' && pathName === '/api/quality-inspection/report-files') return { action: '上传报告单库文件', detail: fileText || `文件数：${Array.isArray(req.files) ? req.files.length : 0}` };
  if (method === 'PATCH' && /\/api\/quality-inspection\/report-files\/[^/]+$/.test(pathName)) return { action: '修改报告单库文件名', detail: `原文件：${safeNoticeValue(targetId)}；新文件：${safeNoticeValue(body.fileName)}` };
  if (pathName === '/api/quality-inspection/report-files/batch-delete') return { action: '批量删除报告单库文件', detail: `文件数：${Array.isArray(body.fileNames) ? body.fileNames.length : 0}` };
  if (method === 'DELETE' && /\/api\/quality-inspection\/report-files\/[^/]+$/.test(pathName)) return { action: '删除报告单库文件', detail: `文件：${safeNoticeValue(targetId)}` };
  if (/\/api\/quality-inspection\/feedback\/[^/]+$/.test(pathName)) return { action: '提交验货反馈/复验通知', detail: `记录ID：${safeNoticeValue(req.params?.id || targetId)}；结果：${safeNoticeValue(body.result || body.rework?.status)}` };
  return { action: `${method} ${pathName}`, detail: '业务数据已变更' };
}

async function notifyDingTalk(req, mutation) {
  const url = dingTalkSignedUrl();
  if (!url || !mutation) return;
  const operator = safeNoticeValue(req.authUser?.name || req.body?.name, '未知用户');
  const lines = [
    '### 品质验货变更提醒',
    `- 操作人：${operator}`,
    `- 操作内容：${safeNoticeValue(mutation.action)}`,
    `- 详情：${safeNoticeValue(mutation.detail)}`,
    `- 时间：${nowText()}`
  ];
  if (mutation.inspectionInfo) lines.push(`- 验货信息：${safeNoticeValue(mutation.inspectionInfo, '-')}`);
  const text = lines.join('\n');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: {
          title: '品质验货变更提醒',
          text
        }
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      console.error('[dingtalk] notify failed:', response.status, await response.text().catch(() => ''));
    }
  } catch (error) {
    console.error('[dingtalk] notify error:', error?.message || error);
  } finally {
    clearTimeout(timer);
  }
}

const BCRYPT_ROUNDS = 10;

function isBcryptHash(value) {
  const hash = String(value || '');
  return hash.startsWith('$2a$') || hash.startsWith('$2b$');
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  if (isBcryptHash(hash)) {
    return bcrypt.compare(password, hash);
  }
  return password === hash;
}

function safeFileBaseName(value, fallback) {
  const cleaned = fixUploadFileName(value)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_');
  return cleaned || fallback;
}

function fixMojibakeText(value) {
  const text = String(value || '').trim();
  if (!/[ÃÂÄÅéèç¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿]/.test(text)) return text;
  try {
    const decoded = Buffer.from(text, 'latin1').toString('utf8');
    return /[\u4e00-\u9fff]/.test(decoded) ? decoded : text;
  } catch {
    return text;
  }
}

function fixUploadFileName(value) {
  const text = String(value || '').trim();
  if (!text) return text;
  try {
    const decoded = Buffer.from(text, 'latin1').toString('utf8');
    if (/[\u4e00-\u9fff]/.test(decoded) && decoded !== text) return decoded;
  } catch {
    // Keep the original filename if it cannot be decoded safely.
  }
  return fixMojibakeText(text);
}

function normalizeRole(role, name) {
  if (name === DEFAULT_ADMIN_USER.name || role === ROLE_ADMIN) return ROLE_ADMIN;
  if (role === ROLE_USER) return ROLE_USER;
  if (LEGACY_ROLE_NAMES.has(role) || LEGACY_ROLE_NAMES.has(name)) return ROLE_USER;
  return ROLE_USER;
}

function normalizePageAccess(user) {
  if (user.name === DEFAULT_ADMIN_USER.name || user.role === ROLE_ADMIN) return PAGE_KEYS;
  const existing = Array.isArray(user.pageAccess) ? user.pageAccess : null;
  const fallback = DEFAULT_PAGE_ACCESS_BY_ROLE[normalizeRole(user.role, user.name)] || [];
  const source = existing || fallback;
  const normalized = [...new Set(source.filter((page) => PAGE_KEYS.includes(page)))];
  if (normalized.includes('inspectionSummary') && !normalized.includes('inspectionLedger')) {
    normalized.push('inspectionLedger');
  }
  return normalized;
}

let dbReady = false;

const latestBackupDir = path.join(dataDir, 'backups', 'latest');
const latestBackupManifestPath = path.join(latestBackupDir, 'manifest.json');

async function pathStat(target) {
  try {
    return await stat(target);
  } catch {
    return null;
  }
}

async function directorySize(target) {
  const info = await pathStat(target);
  if (!info) return 0;
  if (!info.isDirectory()) return info.size;
  const entries = await readdir(target, { withFileTypes: true });
  const sizes = await Promise.all(entries.map((entry) => directorySize(path.join(target, entry.name))));
  return sizes.reduce((sum, size) => sum + size, 0);
}

async function copyBackupSource(sourceName, files) {
  const source = path.join(dataDir, sourceName);
  const info = await pathStat(source);
  if (!info) return;
  const target = path.join(latestBackupDir, sourceName);
  if (info.isDirectory()) {
    await cp(source, target, { recursive: true, force: true });
  } else {
    await cp(source, target, { force: true });
  }
  files.push({
    name: sourceName,
    type: info.isDirectory() ? 'directory' : 'file',
    bytes: await directorySize(source)
  });
}

function nextMidnightText() {
  const next = new Date();
  next.setHours(24, 0, 0, 0);
  return format(next, 'yyyy-MM-dd HH:mm:ss');
}

async function runLatestDataBackup(source = 'manual') {
  await mkdir(path.dirname(latestBackupDir), { recursive: true });
  await rm(latestBackupDir, { recursive: true, force: true });
  await mkdir(latestBackupDir, { recursive: true });
  const files = [];
  await copyBackupSource('db.sqlite', files);
  await copyBackupSource('db.json', files);
  await copyBackupSource('uploads', files);
  await copyBackupSource('dimension-uploads', files);
  const manifest = {
    status: 'success',
    source,
    backedUpAt: nowText(),
    backupDir: latestBackupDir,
    files,
    totalBytes: files.reduce((sum, item) => sum + Number(item.bytes || 0), 0)
  };
  await writeFile(latestBackupManifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

async function readLatestBackupStatus() {
  try {
    const manifest = JSON.parse(await readFile(latestBackupManifestPath, 'utf8'));
    return {
      ...manifest,
      exists: true,
      nextBackupAt: nextMidnightText()
    };
  } catch {
    return {
      exists: false,
      status: 'missing',
      backedUpAt: '',
      backupDir: latestBackupDir,
      files: [],
      totalBytes: 0,
      nextBackupAt: nextMidnightText()
    };
  }
}

function msUntilNextMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

function scheduleDailyLatestBackup() {
  setTimeout(async () => {
    try {
      await ensureDb();
      await runLatestDataBackup('daily-midnight');
    } catch (error) {
      console.error('[backup-center] daily backup failed:', error?.message || error);
    } finally {
      scheduleDailyLatestBackup();
    }
  }, msUntilNextMidnight());
}

async function ensureDb() {
  if (!dbReady) {
    await initDatabase();
    // 启动时自动备份数据库，防止代码bug导致数据损坏
    try {
      const { copyFileSync, existsSync } = await import('node:fs');
      const dbFile = path.join(dataDir, 'db.sqlite');
      const backupFile = path.join(dataDir, 'db.backup.sqlite');
      if (existsSync(dbFile)) {
        copyFileSync(dbFile, backupFile);
      }
    } catch {
      // 备份失败不阻塞启动
    }
    dbReady = true;
    deleteExpiredSessions();
  }
}

setInterval(async () => {
  try {
    const { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } = await import('node:fs');
    const backupDir = path.join(dataDir, 'backups');
    mkdirSync(backupDir, { recursive: true });
    const dbFile = path.join(dataDir, 'db.sqlite');
    if (!existsSync(dbFile)) return;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const hourStr = String(now.getHours()).padStart(2, '0');
    const backupFile = path.join(backupDir, `db-${dateStr}-${hourStr}.sqlite`);
    copyFileSync(dbFile, backupFile);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    readdirSync(backupDir).forEach((f) => {
      if (f.endsWith('.sqlite') && statSync(path.join(backupDir, f)).mtimeMs < sevenDaysAgo) {
        unlinkSync(path.join(backupDir, f));
      }
    });
  } catch {
    // 备份失败不影响服务
  }
}, 6 * 60 * 60 * 1000);

scheduleDailyLatestBackup();

async function readDb() {
  await ensureDb();
  const qualityInspection = {
    initialData: getInitialData(),
    notices: getNotices(),
    schedules: {},
    reports: {},
    feedback: {},
    dimensionLibrary: getDimensionLibrary()
  };
  // schedules/reports/feedback are loaded for known notice rows to keep the old object shape.
  const noticesRows = qualityInspection.notices.rows || [];
  const noticeIds = noticesRows.map((row) => row.id).filter(Boolean);
  const schedules = getSchedulesBatch(noticeIds);
  const reports = getReportsBatch(noticeIds);
  const feedback = getFeedbacksBatch(noticeIds);
  noticesRows.forEach((row) => {
    qualityInspection.schedules[row.id] = schedules[row.id] || {};
    qualityInspection.reports[row.id] = reports[row.id] || {};
    qualityInspection.feedback[row.id] = feedback[row.id] || {};
  });
  return {
    users: getUsers().map(({ password, ...rest }) => rest),
    sessions: getSessions(),
    qualityInspection
  };
}

async function saveDb(db) {
  await ensureDb();
  if (db.users) {
    db.users.forEach((u) => {
      if (u.password) {
        upsertUser(u);
        return;
      }
      const existing = getUserById(u.id) || getUserByName(u.name);
      if (existing) upsertUser({ ...existing, ...u, password: existing.password });
    });
  }
  if (db.sessions) {
    Object.entries(db.sessions).forEach(([token, s]) => setSession(token, s.userId, s.createdAt));
  }
  const qi = db.qualityInspection;
  if (qi?.notices?.rows) saveNotices(qi.notices.rows, qi.notices.submittedAt || '', qi.notices.submittedBy || '');
  if (qi?.schedules) Object.entries(qi.schedules).forEach(([id, data]) => { if (Object.keys(data).length) saveSchedule(id, data); });
  if (qi?.reports) Object.entries(qi.reports).forEach(([id, data]) => { if (Object.keys(data).length) saveReport(id, data); });
  if (qi?.feedback) Object.entries(qi.feedback).forEach(([id, data]) => { if (Object.keys(data).length) saveFeedback(id, data); });
  if (qi?.dimensionLibrary) Object.entries(qi.dimensionLibrary).forEach(([slotId, data]) => {
    if (data && Object.keys(data).length) saveDimensionLibrary(slotId, data);
    else deleteDimensionLibrary(slotId);
  });
  if (qi?.initialData?.columns?.length) saveInitialData(qi.initialData);
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

function scoreDimensionHeaderRow(row = []) {
  const cells = row.map(normalizeText).filter(Boolean);
  if (!cells.length) return -1;
  const uniqueCount = new Set(cells.map(normalizeHeader)).size;
  const keywordScore = cells.reduce((score, cell) => {
    const header = normalizeHeader(cell);
    if (['供应商', '供应商简称', '供应商名称', '产品线明细供应商', '销售产品线', '销售系列', '产品线', '系列', '商品分类', '地址', '省', '市', '采购', '运营'].some((keyword) => header.includes(normalizeHeader(keyword)))) {
      return score + 3;
    }
    return score;
  }, 0);
  return uniqueCount + keywordScore + Math.min(cells.length, 12);
}

function parseDimensionSheetRows(sheet) {
  const matrix = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const scored = matrix.slice(0, 10)
    .map((row, index) => ({ index, score: scoreDimensionHeaderRow(row) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);
  const headerIndex = scored[0]?.index ?? -1;
  if (headerIndex === -1) return [];
  const columns = matrix[headerIndex].map((cell, index) => normalizeText(cell) || `字段${index + 1}`);
  return matrix.slice(headerIndex + 1)
    .filter((row) => row.some((cell) => normalizeText(cell)))
    .map((row) => {
      const item = {};
      columns.forEach((column, index) => {
        item[column] = normalizeText(row[index]);
      });
      return item;
    });
}

function parseDimensionSheetPreview(sheetName, sheet) {
  const matrix = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const scored = matrix.slice(0, 10)
    .map((row, index) => ({ index, score: scoreDimensionHeaderRow(row) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);
  const headerIndex = scored[0]?.index ?? -1;
  if (headerIndex === -1) {
    return { sheetName, columns: [], rows: [], importedCount: 0, previewCount: 0 };
  }
  const columns = matrix[headerIndex].map((cell, index) => normalizeText(cell) || `字段${index + 1}`);
  const rows = matrix.slice(headerIndex + 1)
    .filter((row) => row.some((cell) => normalizeText(cell)))
    .map((row) => {
      const item = { id: randomUUID(), __cells: row.map(normalizeText) };
      columns.forEach((column, index) => {
        item[column] = normalizeText(row[index]);
      });
      return item;
    });
  return {
    sheetName,
    columns,
    rows: rows.slice(0, DIMENSION_PREVIEW_ROW_LIMIT),
    importedCount: rows.length,
    previewCount: Math.min(rows.length, DIMENSION_PREVIEW_ROW_LIMIT)
  };
}

function parseDimensionWorkbookPreview(fileName) {
  const workbook = xlsx.readFile(dimensionFilePath(fileName), { cellDates: true });
  const sheets = workbook.SheetNames.map((sheetName) => (
    parseDimensionSheetPreview(sheetName, workbook.Sheets[sheetName])
  ));
  const firstSheet = sheets[0] || { sheetName: '', columns: [], rows: [] };
  return {
    sheetName: firstSheet.sheetName || '',
    sheetNames: workbook.SheetNames,
    sheetCount: workbook.SheetNames.length,
    sheets,
    columns: firstSheet.columns || [],
    rows: firstSheet.rows || [],
    importedCount: sheets.reduce((sum, sheet) => sum + (sheet.importedCount || 0), 0),
    previewCount: sheets.reduce((sum, sheet) => sum + (sheet.previewCount || 0), 0)
  };
}

function parseCategoryOptionsFromDimensionFile(fileName) {
  const workbook = xlsx.readFile(dimensionFilePath(fileName), { cellDates: true });
  const productLines = new Map();
  const series = new Map();
  const seriesByProductLine = new Map();
  workbook.SheetNames.forEach((sheetName) => {
    parseDimensionSheetRows(workbook.Sheets[sheetName]).forEach((row) => {
      const normalizedSource = normalizedSourceMap(row);
      const productLine = readImportedValue(normalizedSource, SALES_PRODUCT_LINE_ALIASES);
      const seriesName = readImportedValue(normalizedSource, SALES_SERIES_ALIASES);
      addDimensionOption(productLines, productLine);
      addDimensionOption(series, seriesName);
      addSeriesByProductLineOption(seriesByProductLine, productLine, seriesName);
    });
  });
  return {
    salesProductLines: Array.from(productLines.values()).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    salesSeries: Array.from(series.values()).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    seriesByProductLine: formatSeriesByProductLine(seriesByProductLine)
  };
}

async function ensureProductCategoryOptionCache(db) {
  const record = db.qualityInspection.dimensionLibrary?.[PRODUCT_CATEGORY_SLOT_ID];
  if (!record?.storedFileName) return false;
  if (Array.isArray(record.salesProductLines) && record.salesProductLines.length
    && Array.isArray(record.salesSeries) && record.salesSeries.length
    && record.seriesByProductLine && Object.keys(record.seriesByProductLine).length) return false;
  try {
    const options = parseCategoryOptionsFromDimensionFile(record.storedFileName);
    record.salesProductLines = options.salesProductLines;
    record.salesSeries = options.salesSeries;
    record.seriesByProductLine = options.seriesByProductLine;
    record.updatedAt = nowText();
    return true;
  } catch {
    return false;
  }
}

function buildSupplierAddressLookupRowsFromDimensionFile(fileName) {
  const workbook = xlsx.readFile(dimensionFilePath(fileName), { cellDates: true });
  const rows = [];
  workbook.SheetNames.forEach((sheetName) => {
    parseDimensionSheetRows(workbook.Sheets[sheetName]).forEach((row) => {
      const normalizedSource = normalizedSourceMap(row);
      const supplierShortName = readImportedValue(normalizedSource, DIMENSION_SUPPLIER_ALIASES);
      const provinceCity = provinceCityFromDimensionRow(row);
      if (!supplierShortName || !provinceCity) return;
      rows.push({ supplierShortName, address: provinceCity, provinceCity });
    });
  });
  const seen = new Set();
  return rows.filter((row) => {
    const key = normalizeHeader(row.supplierShortName);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSupplierShortNamesFromDimensionFile(fileName) {
  const workbook = xlsx.readFile(dimensionFilePath(fileName), { cellDates: true });
  const options = new Map();
  workbook.SheetNames.forEach((sheetName) => {
    parseDimensionSheetRows(workbook.Sheets[sheetName]).forEach((row) => {
      const normalizedSource = normalizedSourceMap(row);
      addDimensionOption(options, readImportedValue(normalizedSource, DIMENSION_SUPPLIER_ALIASES));
    });
  });
  return Array.from(options.values()).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function dimensionRecordNeedsFileData(record = {}) {
  const hasSheets = Array.isArray(record.sheets)
    && record.sheets.some((sheet) => Array.isArray(sheet.rows) && sheet.rows.length);
  return !hasSheets || !record.fileUrl || !record.sheetCount;
}

function ensureDimensionLibraryFileDataCache(db, force = false) {
  const library = db.qualityInspection.dimensionLibrary || {};
  let changed = false;
  Object.entries(library).forEach(([slotId, record]) => {
    if (!record || typeof record !== 'object') return;
    const needsSupplierCache = slotId === PURCHASE_WORK_DIVISION_SLOT_ID
      && (!Array.isArray(record.supplierShortNames) || !record.supplierShortNames.length);
    if (!record?.storedFileName || (!force && !dimensionRecordNeedsFileData(record) && !needsSupplierCache)) return;
    try {
      const preview = parseDimensionWorkbookPreview(record.storedFileName);
      Object.assign(record, preview, {
        fileUrl: dimensionFileUrl(record.storedFileName),
        updatedAt: nowText()
      });
      if (slotId === PRODUCT_CATEGORY_SLOT_ID) {
        Object.assign(record, parseCategoryOptionsFromDimensionFile(record.storedFileName));
      }
      if (slotId === PURCHASE_WORK_DIVISION_SLOT_ID) {
        record.supplierAddressLookup = buildSupplierAddressLookupRowsFromDimensionFile(record.storedFileName);
        record.supplierShortNames = buildSupplierShortNamesFromDimensionFile(record.storedFileName);
      }
      changed = true;
    } catch {
      // Keep the existing record if the original server file cannot be parsed.
    }
  });
  return changed;
}

function dimensionFileDisplayName(slotId, storedFileName) {
  const name = path.basename(String(storedFileName || ''));
  const prefix = `${slotId}-`;
  return fixMojibakeText(name.startsWith(prefix) ? name.slice(prefix.length) : name);
}

async function latestDimensionUploadsBySlot() {
  const entries = await readdir(dimensionUploadDir, { withFileTypes: true }).catch(() => []);
  const latest = new Map();
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile()) return;
    const storedFileName = entry.name;
    const slotId = DIMENSION_SLOT_IDS.find((id) => storedFileName.startsWith(`${id}-`));
    if (!slotId) return;
    const info = await stat(dimensionFilePath(storedFileName)).catch(() => null);
    if (!info) return;
    let preview = null;
    try {
      preview = parseDimensionWorkbookPreview(storedFileName);
    } catch {
      preview = null;
    }
    const score = dimensionRecordQualityScore({
      ...(preview || {}),
      fileName: dimensionFileDisplayName(slotId, storedFileName),
      storedFileName
    });
    const existing = latest.get(slotId);
    if (!existing || score > existing.score || (score === existing.score && info.mtimeMs > existing.info.mtimeMs)) {
      latest.set(slotId, { storedFileName, info, preview, score });
    }
  }));
  return latest;
}

function dimensionRecordQualityScore(record = {}) {
  const importedCount = Number(record.importedCount || 0);
  const sheetCount = Number(record.sheetCount || 0);
  const previewCount = Number(record.previewCount || 0);
  return importedCount + (sheetCount * 100) + previewCount;
}

function isTestDimensionRecord(record = {}) {
  const text = `${record.fileName || ''} ${record.storedFileName || ''}`.toLowerCase();
  return text.includes('test-dimension');
}

async function recoverDimensionLibraryRecordsFromUploadedFiles(db, force = false) {
  const latest = await latestDimensionUploadsBySlot();
  if (!latest.size) return false;
  db.qualityInspection.dimensionLibrary = {
    ...(db.qualityInspection.dimensionLibrary || {})
  };
  let changed = false;
  for (const [slotId, { storedFileName, info, preview }] of latest.entries()) {
    const existing = db.qualityInspection.dimensionLibrary[slotId] || {};
    const existingStoredName = existing.storedFileName || '';
    const existingFileExists = existingStoredName
      ? await stat(dimensionFilePath(existingStoredName)).catch(() => null)
      : null;

    let latestPreview = preview || null;
    if (force && existingStoredName && existingFileExists && existingStoredName !== storedFileName) {
      try {
        latestPreview = parseDimensionWorkbookPreview(storedFileName);
      } catch {
        latestPreview = null;
      }
      const latestDisplayRecord = {
        ...latestPreview,
        fileName: dimensionFileDisplayName(slotId, storedFileName),
        storedFileName
      };
      const shouldKeepExisting = !isTestDimensionRecord(existing)
        && dimensionRecordQualityScore(existing) >= dimensionRecordQualityScore(latestDisplayRecord);

      // The database record is the source of truth. During manual sync, only
      // recover a different uploaded file when it is clearly better than the
      // current record, or when the current record is the old test placeholder.
      if (shouldKeepExisting) continue;
    } else if (existingStoredName && existingFileExists) {
      continue;
    }
    if (!force && existingStoredName) continue;
    if (!force && existingStoredName === storedFileName && existing.fileUrl) continue;
    if (force || existing.storedFileName !== storedFileName || !existing.fileUrl) {
      const recoveredAt = format(info.mtime, 'yyyy-MM-dd HH:mm:ss');
      const storedChanged = existing.storedFileName !== storedFileName;
      db.qualityInspection.dimensionLibrary[slotId] = {
        ...existing,
        ...(latestPreview || {}),
        id: slotId,
        fileName: storedChanged ? dimensionFileDisplayName(slotId, storedFileName) : existing.fileName || dimensionFileDisplayName(slotId, storedFileName),
        storedFileName,
        fileUrl: dimensionFileUrl(storedFileName),
        fileSize: info.size || existing.fileSize || 0,
        fileType: existing.fileType || path.extname(storedFileName).slice(1).toUpperCase() || 'UNKNOWN',
        applied: true,
        appliedAt: existing.appliedAt || recoveredAt,
        savedAt: existing.savedAt || recoveredAt,
        updatedAt: nowText(),
        updatedBy: existing.updatedBy || 'server-recovered'
      };
      changed = true;
    }
  }
  return changed;
}

function requestUser(db, req) {
  const name = String(req.query.user || req.body.user || '').trim();
  return db.users.find((user) => user.name === name) || db.users[0];
}

function tokenFromRequest(req) {
  const authorization = String(req.headers.authorization || '');
  if (authorization.startsWith('Bearer ')) return authorization.slice(7).trim();
  return String(req.headers['x-auth-token'] || '').trim();
}

async function requireAuth(req, res, next) {
  const db = await readDb();
  const token = tokenFromRequest(req);
  const session = token ? db.sessions?.[token] : null;
  const user = session ? db.users.find((item) => item.id === session.userId) : null;
  if (!user) return res.status(401).json({ error: '请先登录' });
  req.authUser = user;
  next();
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (req.authUser?.role === ROLE_ADMIN || roles.includes(req.authUser?.role)) return next();
    return res.status(403).json({ error: '无权操作' });
  };
}

function isPrimaryAdminUser(user) {
  return user?.id === DEFAULT_ADMIN_USER.id || user?.name === DEFAULT_ADMIN_USER.name;
}

function requirePrimaryAdmin(req, res, next) {
  if (isPrimaryAdminUser(req.authUser)) return next();
  return res.status(403).json({ error: '仅孙立柱管理员可以执行该操作' });
}

function hasPageAccess(user, page) {
  return Array.isArray(user?.pageAccess) && user.pageAccess.includes(page);
}

function isSubmittedScheduleRecord(record) {
  return String(record?.schedule?.status || '').trim() === '已安排'
    && String(record?.schedule?.inspector || '').trim();
}

function requirePages(...pages) {
  return (req, res, next) => {
    if (pages.some((page) => hasPageAccess(req.authUser, page))) return next();
    return res.status(403).json({ error: '该账号尚未授权访问此页面' });
  };
}

function canReadRecord(user, record) {
  if (!user) return false;
  if (
    user.role === ROLE_ADMIN
    || hasPageAccess(user, 'inspectionReportQuery')
    || hasPageAccess(user, 'inspectionSummary')
    || hasPageAccess(user, 'inspectionLedger')
    || hasPageAccess(user, 'inspectionSchedule')
    || hasPageAccess(user, 'inspectionStamp')
    || hasPageAccess(user, 'inspectionReportLibrary')
    || hasPageAccess(user, 'reworkRecords')
  ) return true;
  if (hasPageAccess(user, 'inspectionNotice')) return record.inspectionApplicant === user.name;
  if (hasPageAccess(user, 'inspectionFeedback') || hasPageAccess(user, 'reworkRecords')) {
    return isSubmittedScheduleRecord(record);
  }
  return false;
}

function canWriteFeedback(user, record) {
  if (!user || !record) return false;
  if (user.role === ROLE_ADMIN) return true;
  if (!hasPageAccess(user, 'inspectionFeedback') && !hasPageAccess(user, 'reworkRecords')) return false;
  if (isSubmittedScheduleRecord(record)) return true;
  if (normalizeText(record.report?.reportRejectedAt)) return true;
  if (normalizeText(record.importSource) === 'directFeedback') {
    return [record.inspectionApplicant, record.inspectionNotifier, record.feedback?.actualInspector]
      .map(normalizeText)
      .includes(normalizeText(user.name));
  }
  return false;
}

function reportFilePath(fileName) {
  return path.join(uploadDir, path.basename(fileName || ''));
}

function dimensionFilePath(fileName) {
  return path.join(dimensionUploadDir, path.basename(fileName || ''));
}

async function removeDimensionSlotFiles(slotId, keepFileName = '') {
  const prefix = `${slotId}-`;
  const keep = path.basename(keepFileName || '');
  const entries = await readdir(dimensionUploadDir, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile()) return;
    if (!entry.name.startsWith(prefix)) return;
    if (keep && entry.name === keep) return;
    await unlink(dimensionFilePath(entry.name)).catch(() => {});
  }));
}

function preferredUploadName(fileName, fallback = 'report') {
  const ext = path.extname(fileName || '');
  const base = safeFileBaseName(path.basename(fileName || fallback, ext), fallback);
  return `${base}${ext}`;
}

async function uniqueUploadName(fileName) {
  const preferredName = preferredUploadName(fileName, `report-${Date.now()}`);
  const ext = path.extname(preferredName || '');
  const base = path.basename(preferredName || `report-${Date.now()}`, ext);
  let candidate = `${base}${ext}`;
  let index = 1;
  while (true) {
    try {
      await stat(reportFilePath(candidate));
      candidate = `${base}-${index}${ext}`;
      index += 1;
    } catch {
      return candidate;
    }
  }
}

async function uniqueDimensionUploadName(fileName) {
  const ext = path.extname(fileName || '');
  const base = safeFileBaseName(path.basename(fileName || 'dimension', ext), `dimension-${Date.now()}`);
  let candidate = `${base}${ext}`;
  let index = 1;
  while (true) {
    try {
      await stat(dimensionFilePath(candidate));
      candidate = `${base}-${index}${ext}`;
      index += 1;
    } catch {
      return candidate;
    }
  }
}

function fileUrl(fileName) {
  return `/uploads/${encodeURIComponent(fileName)}`;
}

function dimensionFileUrl(fileName) {
  return `/dimension-uploads/${encodeURIComponent(fileName)}`;
}

function reportReferenceMap(db) {
  const map = new Map();
  composedRecords(db).forEach((record) => {
    const fileName = record.report?.fileName;
    if (!fileName) return;
    map.set(fileName, {
      recordId: record.id,
      reportNo: record.report.reportNo || '',
      supplierShortName: record.supplierShortName || '',
      productLine: record.salesProductLine || '',
      series: record.series || '',
      inspector: record.schedule?.inspector || '',
      stampedAt: record.report.stampedAt || '',
      stampedBy: record.report.stampedBy || '',
      stampSkippedAt: record.report.stampSkippedAt || '',
      stampSkippedBy: record.report.stampSkippedBy || '',
      uploadedAt: record.report.uploadedAt || '',
      updatedAt: record.report.updatedAt || ''
    });
  });
  return map;
}

async function reportFileItems(db) {
  await mkdir(uploadDir, { recursive: true });
  const references = reportReferenceMap(db);
  const entries = await readdir(uploadDir, { withFileTypes: true }).catch(() => []);
  const files = [];
  let renamed = false;
  for (const entry of entries.filter((item) => item.isFile())) {
    let fileName = entry.name;
    const preferredName = preferredUploadName(fileName, fileName);
    const linked = references.get(fileName) || {};
    if (preferredName && preferredName !== fileName) {
      const nextName = await uniqueUploadName(preferredName);
      try {
        await rename(reportFilePath(fileName), reportFilePath(nextName));
        Object.values(db.qualityInspection.reports || {}).forEach((report) => {
          if (report.fileName === fileName) {
            report.fileName = nextName;
            report.originalName = nextName;
            report.updatedAt = nowText();
          }
        });
        fileName = nextName;
        renamed = true;
      } catch {
        fileName = entry.name;
      }
    }
    const stats = await stat(reportFilePath(fileName));
    files.push({
      id: fileName,
      fileName,
      fileUrl: fileUrl(fileName),
      size: stats.size,
      modifiedAt: format(stats.mtime, 'yyyy-MM-dd HH:mm:ss'),
      source: linked.stampedAt ? '已盖章报告' : (linked.stampSkippedAt ? '无需盖章报告' : (linked.recordId ? '验货报告' : '历史上传')),
      ...linked
    });
  }
  if (renamed) await saveDb(db);
  return files.sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
}

function composedRecords(db) {
  const inspection = db.qualityInspection;
  return (inspection.notices.rows || []).map((row, index) => ({
    ...row,
    rowNumber: row.rowNumber || index + 1,
    schedule: inspection.schedules[row.id] || {},
    report: inspection.reports[row.id] || {},
    feedback: inspection.feedback[row.id] || {},
    rework: inspection.feedback[row.id]?.rework || {}
  }));
}

function hasObjectValue(value) {
  return Object.values(value || {}).some((item) => String(item || '').trim());
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function pendingReworkForFeedback(feedback = {}, user, timestamp = nowText()) {
  const existing = feedback.rework || {};
  const next = {
    ...existing,
    source: 'inspectionFeedback',
    feedbackSubmitId: normalizeText(existing.feedbackSubmitId) || randomUUID(),
    requestedAt: timestamp,
    requestedBy: user?.name || '',
    status: '待复验',
    sourceFeedback: {
      actualInspectionTime: normalizeText(feedback.actualInspectionTime),
      result: normalizeText(feedback.result),
      issueLevel: normalizeText(feedback.issueLevel),
      issueCategoryPrimary: normalizeText(feedback.issueCategoryPrimary),
      feedbackText: normalizeText(feedback.feedbackText)
    },
    updatedAt: timestamp,
    updatedBy: user?.name || ''
  };
  delete next.completedAt;
  delete next.completedBy;
  delete next.reworkCompleteTime;
  delete next.reworkRemark;
  delete next.scheduledAt;
  delete next.scheduledBy;
  return next;
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/\s+/g, '').toLowerCase();
}

function splitMultiValue(value) {
  return normalizeText(value)
    .split(/[、，,;；/|]+/)
    .map(normalizeText)
    .filter(Boolean);
}

function normalizeBusinessDepartment(value) {
  const text = normalizeText(value);
  if (text === '海外事业部一部') return '海外事业一部';
  if (text === '海外事业部二部') return '海外事业二部';
  return text;
}

function joinBusinessDepartments(values) {
  const order = ['全球招商事业部', '海外事业一部', '海外事业二部', '国内事业部', '美护事业部', '其他'];
  const items = values.map(normalizeBusinessDepartment).filter(Boolean);
  const seen = new Set();
  return [
    ...order.filter((item) => items.includes(item)),
    ...items.filter((item) => !order.includes(item))
  ].filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  }).join('、');
}

function normalizeSupplierKey(value) {
  return normalizeHeader(value)
    .replace(/有限责任公司|股份有限公司|有限公司|公司|工厂|厂/g, '');
}

function normalizedSourceMap(sourceRow = {}) {
  const normalizedSource = new Map();
  Object.entries(sourceRow || {}).forEach(([key, value]) => {
    if (key === 'id' || key === '__cells') return;
    normalizedSource.set(normalizeHeader(key), value);
  });
  return normalizedSource;
}

function readImportedValue(normalizedSource, aliases) {
  const match = aliases
    .map(normalizeHeader)
    .find((alias) => normalizedSource.has(alias));
  return match ? normalizeText(normalizedSource.get(match)) : '';
}

function extractProvinceCityFromAddress(address) {
  const text = normalizeText(address).replace(/\s+/g, '');
  if (!text) return '';
  const municipality = text.match(/^(北京市|上海市|天津市|重庆市)/);
  if (municipality) return municipality[1];
  const autonomousRegion = text.match(/^(内蒙古自治区|广西壮族自治区|宁夏回族自治区|新疆维吾尔自治区|西藏自治区)(.{1,20}?市)/);
  if (autonomousRegion) return `${autonomousRegion[1]}${autonomousRegion[2]}`;
  const provinceCity = text.match(/^(.{2,12}?(?:省|自治区|特别行政区))(.{1,20}?市)/);
  if (provinceCity) return `${provinceCity[1]}${provinceCity[2]}`;
  const provinceOnly = text.match(/^(.{2,12}?(?:省|自治区|特别行政区))/);
  if (provinceOnly) return provinceOnly[1];
  const cityOnly = text.match(/^(.{1,20}?市)/);
  return cityOnly ? cityOnly[1] : '';
}

function provinceCityFromDimensionRow(sourceRow = {}) {
  const normalizedSource = normalizedSourceMap(sourceRow);
  const province = readImportedValue(normalizedSource, DIMENSION_PROVINCE_ALIASES);
  const city = readImportedValue(normalizedSource, DIMENSION_CITY_ALIASES);
  if (province || city) {
    const normalizedProvince = normalizeText(province);
    const normalizedCity = normalizeText(city);
    return normalizedCity && !normalizedProvince.includes(normalizedCity)
      ? `${normalizedProvince}${normalizedCity}`
      : normalizedProvince || normalizedCity;
  }
  return extractProvinceCityFromAddress(readImportedValue(normalizedSource, DIMENSION_ADDRESS_ALIASES));
}

function addSupplierRecord(map, supplier, address = '') {
  const supplierShortName = normalizeText(supplier);
  if (!supplierShortName) return;
  const provinceCity = extractProvinceCityFromAddress(address) || normalizeText(address);
  const record = {
    supplierShortName,
    address: provinceCity
  };
  [normalizeHeader(supplierShortName), normalizeSupplierKey(supplierShortName)]
    .filter(Boolean)
    .forEach((key) => {
      const existing = map.get(key);
      if (!existing || (!existing.address && record.address)) map.set(key, record);
    });
}

function buildSupplierRecordMap(db) {
  const map = new Map();
  const record = db.qualityInspection.dimensionLibrary?.[PURCHASE_WORK_DIVISION_SLOT_ID] || {};
  const indexedRows = Array.isArray(record.supplierAddressLookup) ? record.supplierAddressLookup : [];
  indexedRows.forEach((item) => {
    addSupplierRecord(map, item.supplierShortName || item.supplier, item.provinceCity || item.address);
  });
  const sheets = Array.isArray(record.sheets) ? record.sheets : [];
  sheets.forEach((sheet) => {
    (sheet.rows || []).forEach((row) => {
      const normalizedSource = normalizedSourceMap(row);
      addSupplierRecord(
        map,
        readImportedValue(normalizedSource, DIMENSION_SUPPLIER_ALIASES),
        provinceCityFromDimensionRow(row)
      );
    });
  });
  return map;
}

function addDimensionOption(set, value) {
  const text = normalizeText(value);
  if (!text) return;
  set.set(normalizeHeader(text), text);
}

function addSeriesByProductLineOption(groups, productLine, series) {
  const productLineText = normalizeText(productLine);
  const seriesText = normalizeText(series);
  if (!productLineText || !seriesText) return;
  const key = normalizeHeader(productLineText);
  if (!key) return;
  if (!groups.has(key)) groups.set(key, new Map());
  addDimensionOption(groups.get(key), seriesText);
}

function formatSeriesByProductLine(groups) {
  return Object.fromEntries(
    Array.from(groups.entries()).map(([key, options]) => [
      key,
      Array.from(options.values()).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    ])
  );
}

function buildDimensionValueMapFromSheets(sheets = [], aliases = []) {
  const options = new Map();
  sheets.forEach((sheet) => {
    (sheet.rows || []).forEach((row) => {
      const normalizedSource = normalizedSourceMap(row);
      addDimensionOption(options, readImportedValue(normalizedSource, aliases));
    });
  });
  return options;
}

function buildDimensionValueMap(db, slotId, aliases = [], cacheKey = '') {
  const record = db.qualityInspection.dimensionLibrary?.[slotId] || {};
  const options = new Map();
  (Array.isArray(record[cacheKey]) ? record[cacheKey] : []).forEach((item) => addDimensionOption(options, item));
  buildDimensionValueMapFromSheets(Array.isArray(record.sheets) ? record.sheets : [], aliases)
    .forEach((value, key) => options.set(key, value));
  if (Array.isArray(record.rows) && record.rows.length) {
    buildDimensionValueMapFromSheets([{ rows: record.rows }], aliases)
      .forEach((value, key) => options.set(key, value));
  }
  return options;
}

function buildSeriesByProductLineMap(db) {
  const record = db.qualityInspection.dimensionLibrary?.[PRODUCT_CATEGORY_SLOT_ID] || {};
  const groups = new Map();
  Object.entries(record.seriesByProductLine || {}).forEach(([productLineKey, seriesList]) => {
    if (!Array.isArray(seriesList)) return;
    if (!groups.has(productLineKey)) groups.set(productLineKey, new Map());
    seriesList.forEach((series) => addDimensionOption(groups.get(productLineKey), series));
  });
  const collectRows = (rows = []) => {
    rows.forEach((row) => {
      const normalizedSource = normalizedSourceMap(row);
      addSeriesByProductLineOption(
        groups,
        readImportedValue(normalizedSource, SALES_PRODUCT_LINE_ALIASES),
        readImportedValue(normalizedSource, SALES_SERIES_ALIASES)
      );
    });
  };
  (Array.isArray(record.sheets) ? record.sheets : []).forEach((sheet) => collectRows(sheet.rows || []));
  if (Array.isArray(record.rows) && record.rows.length) collectRows(record.rows);
  return groups;
}

function buildProductCategoryMaps(db) {
  return {
    salesProductLines: buildDimensionValueMap(db, PRODUCT_CATEGORY_SLOT_ID, SALES_PRODUCT_LINE_ALIASES, 'salesProductLines'),
    salesSeries: buildDimensionValueMap(db, PRODUCT_CATEGORY_SLOT_ID, SALES_SERIES_ALIASES, 'salesSeries'),
    seriesByProductLine: buildSeriesByProductLineMap(db)
  };
}

function findDimensionValue(value, map) {
  const text = normalizeText(value);
  if (!text) return '';
  return map.get(normalizeHeader(text)) || '';
}

function findSeriesValue(series, productLine, categoryMaps) {
  const productLineKey = normalizeHeader(productLine);
  const scoped = categoryMaps.seriesByProductLine?.get(productLineKey);
  if (scoped?.size) return findDimensionValue(series, scoped);
  return findDimensionValue(series, categoryMaps.salesSeries);
}

function findSupplierRecord(value, supplierMap) {
  const text = normalizeText(value);
  if (!text) return null;
  return supplierMap.get(normalizeHeader(text))
    || supplierMap.get(normalizeSupplierKey(text))
    || null;
}

function prepareNoticeRows(rows, user, supplierMap, categoryMaps) {
  return rows.map((row) => {
    const supplierRecord = findSupplierRecord(row.supplierShortName, supplierMap);
    const salesProductLine = findDimensionValue(row.salesProductLine, categoryMaps.salesProductLines) || normalizeText(row.salesProductLine);
    const series = findSeriesValue(row.series, salesProductLine, categoryMaps) || normalizeText(row.series);
    return {
      id: row.id || randomUUID(),
      ...row,
      inspectionApplicant: normalizeText(row.inspectionApplicant) || user.name,
      inspectionNotifier: normalizeText(row.inspectionNotifier) || user.name,
      supplierShortName: supplierRecord?.supplierShortName || normalizeText(row.supplierShortName),
      supplierAddress: supplierRecord?.address || normalizeText(row.supplierAddress),
      businessDepartments: joinBusinessDepartments(splitMultiValue(row.businessDepartments)),
      salesProductLine,
      series
    };
  });
}

function validateNoticeRows(rows, supplierMap, categoryMaps) {
  if (!supplierMap.size) {
    return '请先在维度表文件库上传并应用“采购分工明细”，系统需要从里面读取供应商简称。';
  }
  if (!categoryMaps.salesProductLines.size || !categoryMaps.salesSeries.size) {
    return '请先在维度表文件库上传并应用“商品分类维表”，系统需要从里面读取销售产品线和销售系列。';
  }
  const invalidSupplierIndex = rows.findIndex((row) => !findSupplierRecord(row.supplierShortName, supplierMap));
  if (invalidSupplierIndex >= 0) {
    return `第 ${invalidSupplierIndex + 1} 行供应商简称不在采购分工明细中，请从供应商简称匹配结果里选择。`;
  }
  const invalidProductLineIndex = rows.findIndex((row) => !findDimensionValue(row.salesProductLine, categoryMaps.salesProductLines));
  if (invalidProductLineIndex >= 0) {
    return `第 ${invalidProductLineIndex + 1} 行产品线不在商品分类维表的销售产品线中，请选择正确产品线。`;
  }
  const invalidSeriesIndex = rows.findIndex((row) => !findSeriesValue(row.series, row.salesProductLine, categoryMaps));
  if (invalidSeriesIndex >= 0) {
    return `第 ${invalidSeriesIndex + 1} 行系列不在商品分类维表的销售系列中，请选择正确系列。`;
  }
  const missingIndex = rows.findIndex((row) => NOTICE_REQUIRED_FIELDS.some((field) => !normalizeText(row[field.key])));
  if (missingIndex >= 0) {
    const missingField = NOTICE_REQUIRED_FIELDS.find((field) => !normalizeText(rows[missingIndex][field.key]));
    return `第 ${missingIndex + 1} 行“${missingField.label}”不能为空，除 SKU及数量、备注 外其余字段都必填。`;
  }
  return '';
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

app.get('/api/quality-inspection/backup-center', requireAuth, requirePages('backupCenter'), requireRoles(ROLE_ADMIN), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await readLatestBackupStatus());
});

app.post('/api/quality-inspection/backup-center/run', requireAuth, requirePages('backupCenter'), requireRoles(ROLE_ADMIN), async (req, res) => {
  await ensureDb();
  const manifest = await runLatestDataBackup('manual');
  res.json({ ...manifest, exists: true, nextBackupAt: nextMidnightText() });
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  await ensureDb();
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '').trim();
  const user = getUserByName(name);
  if (!user || !(await verifyPassword(password, user.password))) {
    return res.status(401).json({ error: '账号或密码不正确' });
  }
  if (!isBcryptHash(user.password)) {
    user.password = await hashPassword(password);
    upsertUser(user);
  }
  if (!isPrimaryAdminUser(user) && !(user.pageAccess || []).length) {
    return res.status(403).json({ error: '账号已注册，请等待管理员孙立柱授权页面后再登录' });
  }
  const token = randomUUID();
  setSession(token, user.id, nowText());
  res.json({
    id: user.id,
    name: user.name,
    role: user.role,
    pageAccess: (isPrimaryAdminUser(user) || user.role === ROLE_ADMIN) ? PAGE_KEYS : (user.pageAccess || []),
    token,
    mustResetPassword: !!user.mustResetPassword
  });
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  await ensureDb();
  const oldPassword = String(req.body.oldPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: '新密码至少4位' });
  const user = getUserById(req.authUser.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (!user.mustResetPassword && !(await verifyPassword(oldPassword, user.password))) {
    return res.status(401).json({ error: '旧密码不正确' });
  }
  user.password = await hashPassword(newPassword);
  user.mustResetPassword = false;
  upsertUser(user);
  res.json({ success: true });
});

app.post('/api/auth/register', registerLimiter, async (req, res) => {
  await ensureDb();
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '').trim();
  if (!name || !password) return res.status(400).json({ error: '请输入姓名和密码' });
  if (password.length < 4) return res.status(400).json({ error: '密码至少4位' });
  if (getUserByName(name)) return res.status(409).json({ error: '该姓名已存在' });
  const hashedPassword = await hashPassword(password);
  const id = randomUUID();
  createUser({ id, name, password: hashedPassword, role: ROLE_USER, pageAccess: [], mustResetPassword: true });
  res.json({ id, name, role: ROLE_USER, pageAccess: [], mustResetPassword: true });
});

app.post('/api/auth/register-legacy-disabled', registerLimiter, async (req, res) => {
  res.status(410).json({ error: 'register legacy route disabled' });
});
app.get('/api/auth/users', requireAuth, requirePages('permissionManagement'), requireRoles(ROLE_ADMIN), async (req, res) => {
  const db = await readDb();
  res.json({
    pages: PAGE_KEYS,
    users: db.users.map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      pageAccess: user.pageAccess || []
    }))
  });
});

app.patch('/api/auth/users/:id/access', requireAuth, requirePages('permissionManagement'), requireRoles(ROLE_ADMIN), async (req, res) => {
  const db = await readDb();
  const target = db.users.find((user) => user.id === req.params.id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  const requestedPageAccess = Array.isArray(req.body.pageAccess)
    ? [...new Set(req.body.pageAccess.filter((page) => PAGE_KEYS.includes(page)))]
    : [];
  if (requestedPageAccess.includes('inspectionSummary') && !requestedPageAccess.includes('inspectionLedger')) {
    requestedPageAccess.push('inspectionLedger');
  }
  target.pageAccess = target.name === DEFAULT_ADMIN_USER.name
    ? PAGE_KEYS
    : requestedPageAccess;
  Object.entries(db.sessions || {}).forEach(([token, session]) => {
    if (session.userId === target.id) delete db.sessions[token];
  });
  deleteSessionsByUserId(target.id);
  await saveDb(db);
  res.json({
    id: target.id,
    name: target.name,
    role: target.role,
    pageAccess: target.pageAccess
  });
});

app.post('/api/auth/users/:id/reset-password', requireAuth, requirePages('permissionManagement'), requirePrimaryAdmin, async (req, res) => {
  const db = await readDb();
  const target = db.users.find((user) => user.id === req.params.id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (isPrimaryAdminUser(target)) return res.status(400).json({ error: '不能重置孙立柱管理员密码' });
  const newPassword = String(req.body.newPassword || '123456').trim();
  target.password = await hashPassword(newPassword);
  target.mustResetPassword = true;
  Object.entries(db.sessions || {}).forEach(([token, session]) => {
    if (session.userId === target.id) delete db.sessions[token];
  });
  deleteSessionsByUserId(target.id);
  await saveDb(db);
  res.json({ success: true, message: `密码已重置，新密码: ${newPassword}` });
});

app.delete('/api/auth/users/:id', requireAuth, requirePages('permissionManagement'), requirePrimaryAdmin, async (req, res) => {
  const db = await readDb();
  const target = db.users.find((user) => user.id === req.params.id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (isPrimaryAdminUser(target)) return res.status(400).json({ error: '不能删除孙立柱管理员账号' });
  db.users = db.users.filter((user) => user.id !== target.id);
  Object.entries(db.sessions || {}).forEach(([token, session]) => {
    if (session.userId === target.id) delete db.sessions[token];
  });
  deleteUser(target.id);
  await saveDb(db);
  res.json({
    users: db.users.map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      pageAccess: user.pageAccess || []
    }))
  });
});

app.get('/api/quality-inspection/initial-data', requireAuth, requirePages('inspectionInitialData'), requireRoles(ROLE_ADMIN), async (req, res) => {
  const db = await readDb();
  res.json(db.qualityInspection.initialData);
});

app.post('/api/quality-inspection/initial-data/import', requireAuth, requirePages('inspectionInitialData'), requireRoles(ROLE_ADMIN), upload.single('file'), async (req, res) => {
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

app.get('/api/quality-inspection/dimension-library', requireAuth, requirePages('dimensionLibrary', 'inspectionNotice', 'inspectionSchedule', 'inspectionFeedback', 'reworkRecords', 'inspectionReportLibrary', 'inspectionReportQuery', 'inspectionSummary', 'inspectionLedger'), async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const db = await readDb();
  const fileDataUpdated = ensureDimensionLibraryFileDataCache(db);
  const productCacheUpdated = await ensureProductCategoryOptionCache(db);
  if (fileDataUpdated || productCacheUpdated) await saveDb(db);
  const library = db.qualityInspection.dimensionLibrary || {};
  if (!hasPageAccess(req.authUser, 'dimensionLibrary')) {
    const productCategory = library[PRODUCT_CATEGORY_SLOT_ID] || {};
    const purchaseWorkDivision = library[PURCHASE_WORK_DIVISION_SLOT_ID] || {};
    res.json({
      library: {
        [PRODUCT_CATEGORY_SLOT_ID]: {
          id: PRODUCT_CATEGORY_SLOT_ID,
          fileName: productCategory.fileName || '',
          applied: Boolean(productCategory.applied),
          appliedAt: productCategory.appliedAt || '',
          salesProductLines: productCategory.salesProductLines || [],
          salesSeries: productCategory.salesSeries || [],
          seriesByProductLine: productCategory.seriesByProductLine || {}
        },
        [PURCHASE_WORK_DIVISION_SLOT_ID]: {
          id: PURCHASE_WORK_DIVISION_SLOT_ID,
          fileName: purchaseWorkDivision.fileName || '',
          applied: Boolean(purchaseWorkDivision.applied),
          appliedAt: purchaseWorkDivision.appliedAt || '',
          supplierShortNames: purchaseWorkDivision.supplierShortNames || [],
          supplierAddressLookup: purchaseWorkDivision.supplierAddressLookup || []
        }
      }
    });
    return;
  }
  res.json({ library });
});

app.post('/api/quality-inspection/dimension-library/sync', requireAuth, requirePages('dimensionLibrary'), async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const db = await readDb();
    const recovered = await recoverDimensionLibraryRecordsFromUploadedFiles(db, true);
    const fileDataUpdated = ensureDimensionLibraryFileDataCache(db, true);
    const productCacheUpdated = await ensureProductCategoryOptionCache(db);
    const updated = recovered || fileDataUpdated || productCacheUpdated;
    if (updated) await saveDb(db);
    res.json({ library: db.qualityInspection.dimensionLibrary || {}, updated, recovered });
  } catch (error) {
    res.status(500).json({
      error: `维度表文件库更新失败：${error?.message || '服务器同步异常'}`
    });
  }
});

app.post('/api/quality-inspection/dimension-library/:slotId/apply', requireAuth, requirePages('dimensionLibrary'), dimensionUpload.single('file'), async (req, res) => {
  const db = await readDb();
  const slotId = String(req.params.slotId || '').trim();
  if (!slotId) {
    if (req.file) await removeUploadedFile(req.file);
    return res.status(400).json({ error: 'missing slot id' });
  }
  if (!req.file) return res.status(400).json({ error: 'missing file' });

  let record;
  try {
    record = JSON.parse(req.body.record || '{}');
  } catch {
    await removeUploadedFile(req.file);
    return res.status(400).json({ error: 'invalid record' });
  }

  const existing = db.qualityInspection.dimensionLibrary?.[slotId] || {};
  const previousStoredName = existing.storedFileName || '';
  const originalName = fixUploadFileName(req.file.originalname || record.fileName || '');
  const storedName = await uniqueDimensionUploadName(`${slotId}-${originalName || `file-${Date.now()}`}`);
  await rename(req.file.path, dimensionFilePath(storedName));

  let parsedRecord;
  let derivedCache = {};
  try {
    parsedRecord = parseDimensionWorkbookPreview(storedName);
    if (!(parsedRecord.sheets || []).some((sheet) => (sheet.rows || []).length)) {
      throw new Error('empty dimension file');
    }
    if (slotId === PRODUCT_CATEGORY_SLOT_ID) {
      derivedCache = {
        ...derivedCache,
        ...parseCategoryOptionsFromDimensionFile(storedName)
      };
    }
    if (slotId === PURCHASE_WORK_DIVISION_SLOT_ID) {
      derivedCache = {
        ...derivedCache,
        supplierAddressLookup: buildSupplierAddressLookupRowsFromDimensionFile(storedName),
        supplierShortNames: buildSupplierShortNamesFromDimensionFile(storedName)
      };
    }
  } catch (parseErr) {
    console.error('[dimension-apply] 解析失败:', parseErr?.message || parseErr);
    console.error('[dimension-apply] slotId:', slotId);
    console.error('[dimension-apply] storedName:', storedName);
    console.error('[dimension-apply] filePath:', dimensionFilePath(storedName));
    await unlink(dimensionFilePath(storedName)).catch(() => {});
    return res.status(400).json({ error: '维度表文件解析失败，请检查文件格式、工作表内容或表头位置。' });
  }

  if (previousStoredName && previousStoredName !== storedName) {
    await unlink(dimensionFilePath(previousStoredName)).catch(() => {});
  }
  await removeDimensionSlotFiles(slotId, storedName);

  const processedAt = nowText();
  const next = {
    ...record,
    ...parsedRecord,
    ...derivedCache,
    id: slotId,
    fileName: originalName || fixMojibakeText(record.fileName) || storedName,
    storedFileName: storedName,
    fileUrl: dimensionFileUrl(storedName),
    fileSize: req.file.size || record.fileSize || 0,
    fileType: req.file.mimetype || record.fileType || '未知类型',
    applied: true,
    appliedAt: processedAt,
    savedAt: processedAt,
    updatedAt: processedAt,
    updatedBy: req.authUser.name
  };
  db.qualityInspection.dimensionLibrary = {
    ...(db.qualityInspection.dimensionLibrary || {}),
    [slotId]: next
  };
  await saveDb(db);
  res.json({ library: db.qualityInspection.dimensionLibrary, record: next });
});

app.delete('/api/quality-inspection/dimension-library/:slotId', requireAuth, requirePages('dimensionLibrary'), requirePrimaryAdmin, async (req, res) => {
  const db = await readDb();
  const slotId = String(req.params.slotId || '').trim();
  const existing = db.qualityInspection.dimensionLibrary?.[slotId];
  if (existing?.storedFileName) await unlink(dimensionFilePath(existing.storedFileName)).catch(() => {});
  await removeDimensionSlotFiles(slotId);
  db.qualityInspection.dimensionLibrary = { ...(db.qualityInspection.dimensionLibrary || {}) };
  delete db.qualityInspection.dimensionLibrary[slotId];
  deleteDimensionLibrary(slotId);
  await saveDb(db);
  res.json({ library: db.qualityInspection.dimensionLibrary });
});

app.get('/api/quality-inspection/notices', requireAuth, requirePages('inspectionNotice'), async (req, res) => {
  const db = await readDb();
  if (req.authUser.role === ROLE_ADMIN) {
    res.json(db.qualityInspection.notices);
    return;
  }
  res.json({
    ...db.qualityInspection.notices,
    rows: (db.qualityInspection.notices.rows || []).filter((row) => row.inspectionApplicant === req.authUser.name)
  });
});

app.post('/api/quality-inspection/notices', requireAuth, requirePages('inspectionNotice'), async (req, res) => {
  const db = await readDb();
  const user = req.authUser || requestUser(db, req);
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (await ensureProductCategoryOptionCache(db)) await saveDb(db);
  const supplierMap = buildSupplierRecordMap(db);
  const categoryMaps = buildProductCategoryMaps(db);
  const preparedRows = prepareNoticeRows(rows, user, supplierMap, categoryMaps);
  const validationMessage = validateNoticeRows(preparedRows, supplierMap, categoryMaps);
  if (validationMessage) return res.status(400).json({ error: validationMessage });
  const existingRows = db.qualityInspection.notices.rows || [];
  const appendMode = req.query.append === '1' || req.body.append === true;
  const preparedIds = new Set(preparedRows.map((row) => row.id).filter(Boolean));
  const nextRows = appendMode
    ? [
        ...existingRows.filter((row) => !preparedIds.has(row.id)),
        ...preparedRows
      ]
    : [
        ...existingRows.filter((row) => row.inspectionApplicant !== user.name),
        ...preparedRows
      ];
  db.qualityInspection.notices = {
    rows: nextRows.map((row, index) => ({
      rowNumber: index + 1,
      ...row
    })),
    submittedAt: nowText(),
    submittedBy: user.name
  };
  await saveDb(db);
  if (user.role === ROLE_ADMIN) {
    res.json(db.qualityInspection.notices);
    return;
  }
  res.json({
    ...db.qualityInspection.notices,
    rows: db.qualityInspection.notices.rows.filter((row) => row.inspectionApplicant === user.name)
  });
});

app.delete('/api/quality-inspection/notices', requireAuth, requirePages('inspectionSchedule'), requireRoles(ROLE_ADMIN), async (req, res) => {
  const db = await readDb();
  db.qualityInspection.notices = {
    rows: [],
    submittedAt: nowText(),
    submittedBy: req.authUser.name
  };
  db.qualityInspection.schedules = {};
  db.qualityInspection.reports = {};
  db.qualityInspection.feedback = {};
  await saveDb(db);
  res.json({ notices: db.qualityInspection.notices, rows: [] });
});

app.delete('/api/quality-inspection/notices/:id', requireAuth, requirePages('inspectionSchedule'), requireRoles(ROLE_ADMIN), async (req, res) => {
  const db = await readDb();
  const recordId = String(req.params.id || '').trim();
  const rows = db.qualityInspection.notices.rows || [];
  db.qualityInspection.notices = {
    ...(db.qualityInspection.notices || {}),
    rows: rows
      .filter((row) => row.id !== recordId)
      .map((row, index) => ({ ...row, rowNumber: index + 1 })),
    submittedAt: nowText(),
    submittedBy: req.authUser.name
  };
  delete db.qualityInspection.schedules[recordId];
  delete db.qualityInspection.reports[recordId];
  delete db.qualityInspection.feedback[recordId];
  await saveDb(db);
  res.json({ notices: db.qualityInspection.notices, rows: composedRecords(db) });
});

app.get('/api/quality-inspection/records', requireAuth, requirePages('inspectionNotice', 'inspectionSchedule', 'inspectionFeedback', 'reworkRecords', 'inspectionStamp', 'inspectionReportLibrary', 'inspectionReportQuery', 'inspectionSummary', 'inspectionLedger'), async (req, res) => {
  const db = await readDb();
  res.json({ rows: composedRecords(db).filter((record) => canReadRecord(req.authUser, record)) });
});

app.post('/api/quality-inspection/direct-feedback', requireAuth, requirePages('inspectionFeedback'), async (req, res) => {
  const db = await readDb();
  const user = req.authUser;
  const now = nowText();
  const inputNotice = req.body?.notice || {};
  const inputFeedback = req.body?.feedback || {};
  const supplierShortName = normalizeText(inputNotice.supplierShortName || req.body?.supplierShortName);
  const salesProductLine = normalizeText(inputNotice.salesProductLine || req.body?.salesProductLine);
  const series = normalizeText(inputNotice.series || req.body?.series);
  const totalQuantity = normalizeText(inputNotice.totalQuantity || req.body?.totalQuantity);
  const actualInspectionTime = normalizeText(inputFeedback.actualInspectionTime || req.body?.actualInspectionTime);
  if (!supplierShortName || !salesProductLine || !series || !totalQuantity || !actualInspectionTime) {
    return res.status(400).json({ error: '供应商简称、产品线、系列、数量、实际验货时间不能为空' });
  }
  const id = inputNotice.id || randomUUID();
  const inspection = db.qualityInspection;
  const currentRows = inspection.notices.rows || [];
  const notice = {
    id,
    inspectionApplicant: user.name,
    inspectionNotifier: user.name,
    inspectionFillTime: inputNotice.inspectionFillTime || now,
    supplierFinishTime: normalizeText(inputNotice.supplierFinishTime),
    shipmentTime: normalizeText(inputNotice.shipmentTime) || actualInspectionTime,
    supplierShortName,
    supplierAddress: normalizeText(inputNotice.supplierAddress),
    businessDepartments: normalizeText(inputNotice.businessDepartments),
    operation: normalizeText(inputNotice.operation),
    firstInspection: normalizeText(inputNotice.firstInspection) || '否',
    salesProductLine,
    series,
    totalQuantity,
    skuQuantity: normalizeText(inputNotice.skuQuantity),
    remark: normalizeText(inputNotice.remark) || '验货员手动新增',
    importSource: 'directFeedback'
  };
  inspection.notices = {
    rows: [
      ...currentRows.filter((row) => row.id !== id),
      notice
    ].map((row, index) => ({ rowNumber: index + 1, ...row })),
    submittedAt: now,
    submittedBy: user.name
  };
  inspection.schedules[id] = {
    ...(inspection.schedules[id] || {}),
    status: '已安排',
    inspector: user.name,
    scheduledDate: actualInspectionTime,
    remark: '未通知验货',
    updatedAt: now
  };
  const feedback = {
    ...(inspection.feedback[id] || {}),
    actualInspectionTime,
    inspectionMethod: normalizeText(inputFeedback.inspectionMethod || req.body?.inspectionMethod),
    inspectionQuantity: normalizeText(inputFeedback.inspectionQuantity || req.body?.inspectionQuantity) || totalQuantity,
    checkQuantity: normalizeText(inputFeedback.checkQuantity || req.body?.checkQuantity),
    qualifiedQuantity: normalizeText(inputFeedback.qualifiedQuantity || req.body?.qualifiedQuantity),
    result: normalizeText(inputFeedback.result || req.body?.result),
    issueLevel: normalizeText(inputFeedback.issueLevel || req.body?.issueLevel),
    issueCategoryPrimary: normalizeText(inputFeedback.issueCategoryPrimary || req.body?.issueCategoryPrimary),
    feedbackText: normalizeText(inputFeedback.feedbackText || req.body?.feedbackText),
    actualInspector: user.name,
    updatedAt: now
  };
  if (normalizeText(feedback.result) === '返工') {
    feedback.rework = pendingReworkForFeedback(feedback, user, now);
  }
  inspection.feedback[id] = feedback;
  await saveDb(db);
  const rows = composedRecords(db);
  res.json({
    record: rows.find((record) => record.id === id),
    rows: rows.filter((record) => canReadRecord(user, record))
  });
});

app.post('/api/quality-inspection/summary-import', requireAuth, requirePages('inspectionSummary'), requireRoles(ROLE_ADMIN), async (req, res) => {
  const db = await readDb();
  const user = req.authUser || requestUser(db, req);
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

app.patch('/api/quality-inspection/schedules/:id', requireAuth, requirePages('inspectionSchedule'), requireRoles(ROLE_ADMIN), async (req, res) => {
  const db = await readDb();
  const { reportNo: _ignoredReportNo, ...schedulePayload } = req.body || {};
  const updatedAt = nowText();
  const nextSchedule = {
    ...(db.qualityInspection.schedules[req.params.id] || {}),
    ...schedulePayload,
    updatedAt
  };
  db.qualityInspection.schedules[req.params.id] = nextSchedule;
  const feedback = db.qualityInspection.feedback[req.params.id] || {};
  const rework = feedback.rework || {};
  const isReworkSchedule = normalizeText(rework.completedAt) || normalizeText(rework.reworkCompleteTime);
  if (normalizeText(nextSchedule.status) === '已安排' && isReworkSchedule) {
    db.qualityInspection.feedback[req.params.id] = {
      ...feedback,
      rework: {
        ...rework,
        status: '待验货',
        scheduledAt: updatedAt,
        scheduledBy: req.authUser.name,
        updatedAt,
        updatedBy: req.authUser.name
      },
      updatedAt
    };
  }
  await saveDb(db);
  res.json(db.qualityInspection.schedules[req.params.id]);
});

app.post('/api/quality-inspection/reports/:id', requireAuth, requirePages('inspectionFeedback'), upload.single('file'), async (req, res) => {
  const db = await readDb();
  const record = composedRecords(db).find((item) => item.id === req.params.id);
  if (!canWriteFeedback(req.authUser, record)) {
    await removeUploadedFile(req.file);
    return res.status(403).json({ error: '无权上传该检验报告单' });
  }
  const previous = db.qualityInspection.reports[req.params.id] || {};
  const reportNo = String(req.body.reportNo || previous.reportNo || '').trim();
  const next = {
    ...previous,
    reportNo,
    conclusion: String(req.body.conclusion || previous.conclusion || '').trim(),
    updatedAt: nowText()
  };
  delete next.reportRejectedAt;
  delete next.reportRejectedBy;
  delete next.stampedAt;
  delete next.stampedBy;
  delete next.stampSkippedAt;
  delete next.stampSkippedBy;
  delete next.stampRotation;
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

app.delete('/api/quality-inspection/reports/:id', requireAuth, requirePages('inspectionFeedback'), async (req, res) => {
  const db = await readDb();
  const record = composedRecords(db).find((item) => item.id === req.params.id);
  if (!canWriteFeedback(req.authUser, record)) {
    return res.status(403).json({ error: '无权删除该检验报告单' });
  }
  const report = db.qualityInspection.reports[req.params.id] || {};
  if (report.fileName) {
    await unlink(reportFilePath(report.fileName)).catch(() => {});
  }
  delete db.qualityInspection.reports[req.params.id];
  deleteReport(req.params.id);
  await saveDb(db);
  res.json({ ok: true });
});

app.delete('/api/quality-inspection/records/:id', requireAuth, requirePages('inspectionFeedback', 'inspectionReportQuery', 'inspectionSummary', 'inspectionLedger'), requirePrimaryAdmin, async (req, res) => {
  const db = await readDb();
  const recordId = String(req.params.id || '').trim();
  const report = db.qualityInspection.reports[recordId] || {};
  if (report.fileName) {
    await unlink(reportFilePath(report.fileName)).catch(() => {});
  }
  db.qualityInspection.notices = {
    ...(db.qualityInspection.notices || {}),
    rows: (db.qualityInspection.notices.rows || [])
      .filter((row) => row.id !== recordId)
      .map((row, index) => ({ ...row, rowNumber: index + 1 })),
    submittedAt: nowText(),
    submittedBy: req.authUser.name
  };
  delete db.qualityInspection.schedules[recordId];
  delete db.qualityInspection.reports[recordId];
  delete db.qualityInspection.feedback[recordId];
  await saveDb(db);
  res.json({ rows: composedRecords(db), files: await reportFileItems(db) });
});

app.get('/api/quality-inspection/stamp-reports', requireAuth, requirePages('inspectionStamp'), requireRoles(ROLE_ADMIN), async (req, res) => {
  const db = await readDb();
  const rows = composedRecords(db)
    .filter((record) => record.report?.fileName && !record.report?.stampedAt && !record.report?.stampSkippedAt && !record.report?.reportRejectedAt)
    .map((record) => ({
      ...record,
      report: {
        ...record.report,
        fileUrl: `/uploads/${encodeURIComponent(record.report.fileName)}`
      }
    }));
  res.json({ rows });
});

app.post('/api/quality-inspection/reports/:id/stamp', requireAuth, requirePages('inspectionStamp'), requireRoles(ROLE_ADMIN), upload.single('file'), async (req, res) => {
  const db = await readDb();
  const record = composedRecords(db).find((item) => item.id === req.params.id);
  const previous = db.qualityInspection.reports[req.params.id] || {};
  if (!record || !previous.fileName) return res.status(404).json({ error: '检验报告单不存在' });

  const skipStamp = Boolean(req.body.skipStamp && req.body.skipStamp !== '0');
  const processedAt = nowText();
  const rotation = Number(req.body.rotation || 0);

  if (req.file) {
    await rename(req.file.path, reportFilePath(previous.fileName));
  } else {
    const dataUrl = String(req.body.fileDataUrl || '');
    if (dataUrl) {
      const match = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,([a-zA-Z0-9+/=]+)$/);
      if (!match) return res.status(400).json({ error: '仅支持图片格式检验报告单盖章' });
      await writeFile(reportFilePath(previous.fileName), Buffer.from(match[2], 'base64'));
    } else if (!skipStamp) {
      return res.status(400).json({ error: '缺少已盖章图片文件' });
    }
  }

  db.qualityInspection.reports[req.params.id] = {
    ...previous,
    ...(skipStamp
      ? { stampSkippedAt: processedAt, stampSkippedBy: req.authUser.name }
      : { stampedAt: processedAt, stampedBy: req.authUser.name }),
    stampRotation: rotation,
    updatedAt: processedAt
  };
  await saveDb(db);
  res.json(db.qualityInspection.reports[req.params.id]);
});

app.post('/api/quality-inspection/reports/:id/reject', requireAuth, requirePages('inspectionStamp'), requireRoles(ROLE_ADMIN), async (req, res) => {
  const db = await readDb();
  const record = composedRecords(db).find((item) => item.id === req.params.id);
  const previous = db.qualityInspection.reports[req.params.id] || {};
  if (!record || !previous.fileName) return res.status(404).json({ error: '检验报告单不存在' });
  const rejectedAt = nowText();
  const nextReport = {
    ...previous,
    reportRejectedAt: rejectedAt,
    reportRejectedBy: req.authUser.name,
    updatedAt: rejectedAt
  };
  delete nextReport.stampedAt;
  delete nextReport.stampedBy;
  delete nextReport.stampSkippedAt;
  delete nextReport.stampSkippedBy;
  db.qualityInspection.reports[req.params.id] = nextReport;
  await saveDb(db);
  res.json(nextReport);
});

app.get('/api/quality-inspection/report-files', requireAuth, requirePages('inspectionReportLibrary', 'inspectionReportQuery'), async (req, res) => {
  const db = await readDb();
  res.json({ files: await reportFileItems(db) });
});

app.post('/api/quality-inspection/report-files', requireAuth, requirePages('inspectionReportLibrary', 'inspectionStamp'), requireRoles(ROLE_ADMIN), upload.array('files', 300), async (req, res) => {
  const db = await readDb();
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) return res.status(400).json({ error: 'missing files' });
  const uploaded = [];
  for (const file of files) {
    const storedName = await uniqueUploadName(file.originalname || `report-${Date.now()}`);
    await rename(file.path, reportFilePath(storedName));
    uploaded.push(storedName);
  }
  res.json({ uploaded, files: await reportFileItems(db) });
});

app.patch('/api/quality-inspection/report-files/:fileName', requireAuth, requirePages('inspectionReportLibrary'), requireRoles(ROLE_ADMIN), async (req, res) => {
  const db = await readDb();
  const currentName = path.basename(req.params.fileName || '');
  const currentPath = reportFilePath(currentName);
  const ext = path.extname(currentName);
  const requestedName = String(req.body.fileName || '').trim();
  const requestedExt = path.extname(requestedName);
  const targetBase = safeFileBaseName(path.basename(requestedName, requestedExt || ext), '');
  if (!currentName || !targetBase) return res.status(400).json({ error: '文件名不能为空' });
  const nextName = `${targetBase}${requestedExt || ext}`;
  if (nextName !== currentName) {
    const nextPath = reportFilePath(nextName);
    try {
      await stat(currentPath);
    } catch {
      return res.status(404).json({ error: '文件不存在' });
    }
    try {
      await stat(nextPath);
      return res.status(409).json({ error: '目标文件名已存在' });
    } catch {
      await rename(currentPath, nextPath);
    }
    Object.values(db.qualityInspection.reports || {}).forEach((report) => {
      if (report.fileName === currentName) {
        report.fileName = nextName;
        report.originalName = nextName;
        report.updatedAt = nowText();
      }
    });
    await saveDb(db);
  }
  res.json({ files: await reportFileItems(db) });
});

app.post('/api/quality-inspection/report-files/batch-delete', requireAuth, requirePages('inspectionReportLibrary'), requireRoles(ROLE_ADMIN), async (req, res) => {
  const db = await readDb();
  const fileNames = [...new Set((Array.isArray(req.body.fileNames) ? req.body.fileNames : [])
    .map((fileName) => path.basename(String(fileName || '').trim()))
    .filter(Boolean))];
  if (!fileNames.length) return res.status(400).json({ error: '请选择要删除的文件' });

  await Promise.all(fileNames.map((fileName) => unlink(reportFilePath(fileName)).catch(() => {})));
  const fileNameSet = new Set(fileNames);
  Object.values(db.qualityInspection.reports || {}).forEach((report) => {
    if (fileNameSet.has(report.fileName)) {
      delete report.fileName;
      delete report.originalName;
      delete report.uploadedAt;
      delete report.stampedAt;
      delete report.stampedBy;
      delete report.stampRotation;
      report.updatedAt = nowText();
    }
  });
  await saveDb(db);
  res.json({ deleted: fileNames.length, files: await reportFileItems(db) });
});

app.delete('/api/quality-inspection/report-files/:fileName', requireAuth, requirePages('inspectionReportLibrary'), requireRoles(ROLE_ADMIN), async (req, res) => {
  const db = await readDb();
  const fileName = path.basename(req.params.fileName || '');
  if (!fileName) return res.status(400).json({ error: '文件名不能为空' });
  await unlink(reportFilePath(fileName)).catch(() => {});
  Object.values(db.qualityInspection.reports || {}).forEach((report) => {
    if (report.fileName === fileName) {
      delete report.fileName;
      delete report.originalName;
      delete report.uploadedAt;
      delete report.stampedAt;
      delete report.stampedBy;
      delete report.stampRotation;
      report.updatedAt = nowText();
    }
  });
  await saveDb(db);
  res.json({ files: await reportFileItems(db) });
});

app.patch('/api/quality-inspection/feedback/:id', requireAuth, requirePages('inspectionFeedback', 'reworkRecords'), async (req, res) => {
  const db = await readDb();
  const record = composedRecords(db).find((item) => item.id === req.params.id);
  if (!canWriteFeedback(req.authUser, record)) return res.status(403).json({ error: '无权保存该验货反馈' });
  const updatedAt = nowText();
  const nextFeedback = {
    ...(db.qualityInspection.feedback[req.params.id] || {}),
    ...req.body,
    updatedAt
  };
  const result = normalizeText(nextFeedback.result);
  const hasCompletedRework = normalizeText(nextFeedback.rework?.reworkCompleteTime) || normalizeText(nextFeedback.rework?.completedAt);
  const reworkDeleted = normalizeText(nextFeedback.rework?.status) === '已删除' || normalizeText(nextFeedback.rework?.deletedAt);
  if (result === '返工' && !hasCompletedRework && !reworkDeleted) {
    nextFeedback.rework = pendingReworkForFeedback(nextFeedback, req.authUser, updatedAt);
  } else if (result !== '返工' && normalizeText(nextFeedback.rework?.status) === '待验货') {
    nextFeedback.rework = {
      ...(nextFeedback.rework || {}),
      status: '已复验',
      reinspectedAt: updatedAt,
      reinspectedBy: req.authUser.name,
      updatedAt,
      updatedBy: req.authUser.name
    };
  }
  const reworkCompleteTime = String(nextFeedback.rework?.reworkCompleteTime || '').trim();
  if (reworkCompleteTime) {
    nextFeedback.rework = {
      ...(nextFeedback.rework || {}),
      status: '待安排验货'
    };
    db.qualityInspection.notices = {
      ...(db.qualityInspection.notices || {}),
      rows: (db.qualityInspection.notices.rows || []).map((row) => (
        row.id === req.params.id ? { ...row, shipmentTime: reworkCompleteTime } : row
      )),
      submittedAt: db.qualityInspection.notices?.submittedAt || nowText(),
      submittedBy: db.qualityInspection.notices?.submittedBy || req.authUser.name
    };
    const incomingSchedule = req.body?.reworkSchedule || {};
    db.qualityInspection.schedules[req.params.id] = {
      ...(db.qualityInspection.schedules[req.params.id] || {}),
      ...incomingSchedule,
      scheduledDate: '',
      inspector: '',
      status: '未安排',
      reworkRequestedAt: incomingSchedule.reworkRequestedAt || nowText(),
      updatedAt: nowText()
    };
  }
  delete nextFeedback.reworkSchedule;
  db.qualityInspection.feedback[req.params.id] = nextFeedback;
  await saveDb(db);
  res.json(db.qualityInspection.feedback[req.params.id]);
});

app.get('/uploads/:fileName', (req, res) => {
  const safeName = path.basename(req.params.fileName);
  res.sendFile(reportFilePath(safeName));
});

app.get('/dimension-uploads/:fileName', requireAuth, requirePages('dimensionLibrary'), (req, res) => {
  const safeName = path.basename(req.params.fileName);
  res.sendFile(dimensionFilePath(safeName));
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    const limitMb = req.path.includes('/dimension-library/') ? 100 : 20;
    return res.status(413).json({ error: `上传文件超过 ${limitMb}MB 限制，请压缩文件后重新上传。` });
  }
  return next(error);
});

const distDir = path.join(rootDir, 'dist');
const staticOptions = {
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return;
    }
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
};
app.use('/pinzhiyanhuo', express.static(distDir, staticOptions));
app.use(express.static(distDir, staticOptions));
app.get(/^\/pinzhiyanhuo\/(?!api).*/, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(distDir, 'index.html'));
});
app.get(/^\/(?!api).*/, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Quality inspection server running at http://localhost:${port}`);
});
