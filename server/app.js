import cors from 'cors';
import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import compression from 'compression';
import { format } from 'date-fns';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { initDatabase, getUsers, getUserByName, getUserById, upsertUser, createUser, deleteUser, getSessions, setSession, deleteSession, deleteSessionsByUserId, getNotices, saveNotices, getSchedule, saveSchedule, deleteSchedule, getReport, saveReport, deleteReport, getFeedback, saveFeedback, deleteFeedback, getDimensionLibrary, saveDimensionLibrary, deleteDimensionLibrary, getInitialData, saveInitialData } from './database.js';
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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '521sunlizhu';
const DEFAULT_ADMIN_USER = { id: 'u-admin', name: '孙立柱', password: ADMIN_PASSWORD, role: '管理员' };
const ROLE_ADMIN = '管理员';
const ROLE_USER = '普通用户';
const LEGACY_DEFAULT_USER_IDS = new Set(['u-purchaser', 'u-inspector', 'u-settlement']);
const LEGACY_ROLE_NAMES = new Set(['采购跟单员', '验货员', '结算员']);
const PAGE_KEYS = [
  'inspectionNotice',
  'inspectionSchedule',
  'inspectionFeedback',
  'inspectionStamp',
  'inspectionReportLibrary',
  'inspectionReportQuery',
  'inspectionSummary',
  'inspectionLedger',
  'inspectionInitialData',
  'dimensionLibrary',
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
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 20 * 1024 * 1024 }
});

app.use(cors());
app.use(compression({
  threshold: 1024
}));
app.use(express.json({ limit: '50mb' }));

function nowText() {
  return format(new Date(), 'yyyy-MM-dd HH:mm:ss');
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

async function ensureDb() {
  if (!dbReady) {
    await initDatabase();
    dbReady = true;
  }
}

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
  noticesRows.forEach((row) => {
    qualityInspection.schedules[row.id] = getSchedule(row.id);
    qualityInspection.reports[row.id] = getReport(row.id);
    qualityInspection.feedback[row.id] = getFeedback(row.id);
  });
  return {
    users: getUsers(),
    sessions: getSessions(),
    qualityInspection
  };
}

async function saveDb(db) {
  await ensureDb();
  if (db.users) db.users.forEach((u) => upsertUser(u));
  if (db.sessions) {
    Object.entries(db.sessions).forEach(([token, s]) => setSession(token, s.userId, s.createdAt));
  }
  const qi = db.qualityInspection;
  if (qi?.notices?.rows) saveNotices(qi.notices.rows, qi.notices.submittedAt || '', qi.notices.submittedBy || '');
  if (qi?.schedules) Object.entries(qi.schedules).forEach(([id, data]) => { if (Object.keys(data).length) saveSchedule(id, data); });
  if (qi?.reports) Object.entries(qi.reports).forEach(([id, data]) => { if (Object.keys(data).length) saveReport(id, data); });
  if (qi?.feedback) Object.entries(qi.feedback).forEach(([id, data]) => { if (Object.keys(data).length) saveFeedback(id, data); });
  if (qi?.dimensionLibrary) Object.entries(qi.dimensionLibrary).forEach(([slotId, data]) => saveDimensionLibrary(slotId, data));
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

function dimensionRecordNeedsFileData(record = {}) {
  const hasSheets = Array.isArray(record.sheets)
    && record.sheets.some((sheet) => Array.isArray(sheet.rows) && sheet.rows.length);
  return !hasSheets || !record.fileUrl || !record.sheetCount;
}

function ensureDimensionLibraryFileDataCache(db, force = false) {
  const library = db.qualityInspection.dimensionLibrary || {};
  let changed = false;
  Object.entries(library).forEach(([slotId, record]) => {
    if (!record?.storedFileName || (!force && !dimensionRecordNeedsFileData(record))) return;
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
    const existing = latest.get(slotId);
    if (!existing || info.mtimeMs > existing.info.mtimeMs) {
      latest.set(slotId, { storedFileName, info });
    }
  }));
  return latest;
}

async function recoverDimensionLibraryRecordsFromUploadedFiles(db, force = false) {
  const latest = await latestDimensionUploadsBySlot();
  if (!latest.size) return false;
  db.qualityInspection.dimensionLibrary = {
    ...(db.qualityInspection.dimensionLibrary || {})
  };
  let changed = false;
  latest.forEach(({ storedFileName, info }, slotId) => {
    const existing = db.qualityInspection.dimensionLibrary[slotId] || {};
    if (!force && existing.storedFileName) return;
    if (!force && existing.storedFileName === storedFileName && existing.fileUrl) return;
    if (force || existing.storedFileName !== storedFileName || !existing.fileUrl) {
      const recoveredAt = format(info.mtime, 'yyyy-MM-dd HH:mm:ss');
      const storedChanged = existing.storedFileName !== storedFileName;
      db.qualityInspection.dimensionLibrary[slotId] = {
        ...existing,
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
  });
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
  return (hasPageAccess(user, 'inspectionFeedback') || hasPageAccess(user, 'reworkRecords'))
    && isSubmittedScheduleRecord(record);
}

function reportFilePath(fileName) {
  return path.join(uploadDir, path.basename(fileName || ''));
}

function dimensionFilePath(fileName) {
  return path.join(dimensionUploadDir, path.basename(fileName || ''));
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

app.post('/api/auth/login', async (req, res) => {
  const db = await readDb();
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '').trim();
  const user = db.users.find((item) => item.name === name);
  if (!user || !(await verifyPassword(password, user.password))) {
    return res.status(401).json({ error: '账号或密码不正确' });
  }
  if (!isBcryptHash(user.password)) {
    user.password = await hashPassword(password);
    await saveDb(db);
  }
  if (!isPrimaryAdminUser(user) && !(user.pageAccess || []).length) {
    return res.status(403).json({ error: '账号已注册，请等待管理员孙立柱授权页面后再登录' });
  }
  const token = randomUUID();
  db.sessions[token] = { userId: user.id, createdAt: nowText() };
  await saveDb(db);
  res.json({ id: user.id, name: user.name, role: user.role, pageAccess: user.pageAccess || [], token });
});

app.post('/api/auth/register', requireAuth, requirePrimaryAdmin, async (req, res) => {
  const db = await readDb();
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '').trim();
  if (!name || !password) return res.status(400).json({ error: '请输入姓名和密码' });
  if (db.users.some((user) => user.name === name)) return res.status(409).json({ error: '该姓名已存在' });
  const hashedPassword = await hashPassword(password);
  const user = { id: randomUUID(), name, password: hashedPassword, role: ROLE_USER, pageAccess: [] };
  db.users.push(user);
  await saveDb(db);
  res.json({ id: user.id, name: user.name, role: user.role, pageAccess: user.pageAccess || [] });
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
  await saveDb(db);
  res.json({
    id: target.id,
    name: target.name,
    role: target.role,
    pageAccess: target.pageAccess
  });
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

app.get('/api/quality-inspection/dimension-library', requireAuth, requirePages('dimensionLibrary', 'inspectionNotice', 'inspectionSchedule', 'inspectionFeedback', 'inspectionReportLibrary', 'inspectionReportQuery', 'inspectionSummary', 'inspectionLedger'), async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const db = await readDb();
  const recovered = await recoverDimensionLibraryRecordsFromUploadedFiles(db);
  const fileDataUpdated = ensureDimensionLibraryFileDataCache(db);
  const productCacheUpdated = await ensureProductCategoryOptionCache(db);
  if (recovered || fileDataUpdated || productCacheUpdated) await saveDb(db);
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
  const db = await readDb();
  const recovered = await recoverDimensionLibraryRecordsFromUploadedFiles(db, true);
  const fileDataUpdated = ensureDimensionLibraryFileDataCache(db, true);
  const productCacheUpdated = await ensureProductCategoryOptionCache(db);
  const updated = recovered || fileDataUpdated || productCacheUpdated;
  if (updated) await saveDb(db);
  res.json({ library: db.qualityInspection.dimensionLibrary || {}, updated, recovered });
});

app.post('/api/quality-inspection/dimension-library/:slotId/apply', requireAuth, requirePages('dimensionLibrary'), upload.single('file'), async (req, res) => {
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
  const originalName = fixMojibakeText(req.file.originalname || '');
  const storedName = await uniqueDimensionUploadName(`${slotId}-${originalName || `file-${Date.now()}`}`);
  await rename(req.file.path, dimensionFilePath(storedName));
  if (previousStoredName && previousStoredName !== storedName) {
    await unlink(dimensionFilePath(previousStoredName)).catch(() => {});
  }

  const next = {
    ...record,
    id: slotId,
    fileName: originalName || fixMojibakeText(record.fileName) || storedName,
    storedFileName: storedName,
    fileUrl: dimensionFileUrl(storedName),
    fileSize: req.file.size || record.fileSize || 0,
    fileType: req.file.mimetype || record.fileType || '未知类型',
    applied: true,
    appliedAt: nowText(),
    savedAt: record.savedAt || nowText(),
    updatedAt: nowText(),
    updatedBy: req.authUser.name
  };
  db.qualityInspection.dimensionLibrary = {
    ...(db.qualityInspection.dimensionLibrary || {}),
    [slotId]: next
  };
  await saveDb(db);
  res.json({ library: db.qualityInspection.dimensionLibrary, record: next });
});

app.delete('/api/quality-inspection/dimension-library/:slotId', requireAuth, requirePages('dimensionLibrary'), async (req, res) => {
  const db = await readDb();
  const slotId = String(req.params.slotId || '').trim();
  const existing = db.qualityInspection.dimensionLibrary?.[slotId];
  if (existing?.storedFileName) await unlink(dimensionFilePath(existing.storedFileName)).catch(() => {});
  db.qualityInspection.dimensionLibrary = { ...(db.qualityInspection.dimensionLibrary || {}) };
  delete db.qualityInspection.dimensionLibrary[slotId];
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
    : user.role === ROLE_ADMIN
      ? preparedRows
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
  db.qualityInspection.schedules[req.params.id] = {
    ...(db.qualityInspection.schedules[req.params.id] || {}),
    ...schedulePayload,
    updatedAt: nowText()
  };
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
    .filter((record) => record.report?.fileName && !record.report?.stampedAt && !record.report?.stampSkippedAt)
    .map((record) => ({
      ...record,
      report: {
        ...record.report,
        fileUrl: `/uploads/${encodeURIComponent(record.report.fileName)}`
      }
    }));
  res.json({ rows });
});

app.post('/api/quality-inspection/reports/:id/stamp', requireAuth, requirePages('inspectionStamp'), requireRoles(ROLE_ADMIN), async (req, res) => {
  const db = await readDb();
  const record = composedRecords(db).find((item) => item.id === req.params.id);
  const previous = db.qualityInspection.reports[req.params.id] || {};
  if (!record || !previous.fileName) return res.status(404).json({ error: '检验报告单不存在' });

  const dataUrl = String(req.body.fileDataUrl || '');
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) return res.status(400).json({ error: '仅支持图片格式检验报告单盖章' });

  const target = reportFilePath(previous.fileName);
  await writeFile(target, Buffer.from(match[2], 'base64'));
  const skipStamp = Boolean(req.body.skipStamp);
  const processedAt = nowText();

  const next = {
    ...previous,
    ...(skipStamp
      ? { stampSkippedAt: processedAt, stampSkippedBy: req.authUser.name }
      : { stampedAt: processedAt, stampedBy: req.authUser.name }),
    stampRotation: Number(req.body.rotation || 0),
    updatedAt: processedAt
  };
  db.qualityInspection.reports[req.params.id] = next;
  await saveDb(db);
  res.json(next);
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
  res.sendFile(reportFilePath(safeName));
});

app.get('/dimension-uploads/:fileName', requireAuth, requirePages('dimensionLibrary'), (req, res) => {
  const safeName = path.basename(req.params.fileName);
  res.sendFile(dimensionFilePath(safeName));
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
