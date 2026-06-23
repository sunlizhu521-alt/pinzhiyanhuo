import cors from 'cors';
import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { format } from 'date-fns';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data');
const uploadDir = path.join(dataDir, 'uploads');
const dimensionUploadDir = path.join(dataDir, 'dimension-uploads');
const dbPath = path.join(dataDir, 'db.json');
const port = Number(process.env.PORT || 4002);
const DEFAULT_ADMIN_USER = { id: 'u-admin', name: '孙立柱', password: '521sunlizhu', role: '管理员' };
const ROLE_ADMIN = '管理员';
const ROLE_PURCHASER = '采购跟单员';
const ROLE_INSPECTOR = '验货员';
const ROLE_SETTLEMENT = '结算员';
const ROLE_USER = '普通用户';
const PAGE_KEYS = [
  'inspectionNotice',
  'inspectionSchedule',
  'inspectionFeedback',
  'inspectionStamp',
  'inspectionReportLibrary',
  'inspectionReportQuery',
  'inspectionSummary',
  'inspectionInitialData',
  'dimensionLibrary',
  'permissionManagement'
];
const DEFAULT_PAGE_ACCESS_BY_ROLE = {
  [ROLE_ADMIN]: PAGE_KEYS,
  [ROLE_PURCHASER]: ['inspectionNotice'],
  [ROLE_INSPECTOR]: ['inspectionFeedback'],
  [ROLE_SETTLEMENT]: ['inspectionReportQuery', 'inspectionSummary'],
  [ROLE_USER]: []
};
const DEFAULT_USERS = [
  DEFAULT_ADMIN_USER,
  { id: 'u-purchaser', name: '采购跟单员', password: '123456', role: ROLE_PURCHASER },
  { id: 'u-inspector', name: '验货员', password: '123456', role: ROLE_INSPECTOR },
  { id: 'u-settlement', name: '结算员', password: '123456', role: ROLE_SETTLEMENT }
];
const PRODUCT_CATEGORY_SLOT_ID = 'dimension-slot-1';
const PURCHASE_WORK_DIVISION_SLOT_ID = 'dimension-slot-2';
const DIMENSION_SUPPLIER_ALIASES = ['产品线明细供应商', '供应商简称', '供应商', '供应商名称', '厂家简称', '厂商简称', '工厂简称'];
const DIMENSION_ADDRESS_ALIASES = ['产品线明细地址', '供应商地址', '验货地址', '工厂地址', '详细地址', '地址', '所在地'];
const SALES_PRODUCT_LINE_ALIASES = ['销售产品线', '产品线', '一级产品线'];
const SALES_SERIES_ALIASES = ['销售系列', '系列', '产品系列'];
const NOTICE_REQUIRED_FIELDS = [
  { key: 'inspectionApplicant', label: '验货填写人' },
  { key: 'inspectionNotifier', label: '验货通知人' },
  { key: 'inspectionFillTime', label: '验货填写时间' },
  { key: 'supplierFinishTime', label: '供应商完工时间' },
  { key: 'shipmentTime', label: '可验货时间' },
  { key: 'kingdeeOrderNo', label: '金蝶采购订单' },
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

function normalizeRole(role, name) {
  if (name === DEFAULT_ADMIN_USER.name || role === ROLE_ADMIN) return ROLE_ADMIN;
  if ([ROLE_PURCHASER, ROLE_INSPECTOR, ROLE_SETTLEMENT, ROLE_USER].includes(role)) return role;
  if (String(name || '').includes('验货')) return ROLE_INSPECTOR;
  return ROLE_USER;
}

function normalizePageAccess(user) {
  if (user.name === DEFAULT_ADMIN_USER.name || user.role === ROLE_ADMIN) return PAGE_KEYS;
  const existing = Array.isArray(user.pageAccess) ? user.pageAccess : null;
  const fallback = DEFAULT_PAGE_ACCESS_BY_ROLE[normalizeRole(user.role, user.name)] || [];
  const source = existing || fallback;
  return [...new Set(source.filter((page) => PAGE_KEYS.includes(page)))];
}

function normalizeDb(db = {}) {
  const qualityInspection = db.qualityInspection || {};
  const sourceUsers = Array.isArray(db.users) && db.users.length ? db.users : DEFAULT_USERS;
  const usersByName = new Map(sourceUsers.map((user) => [user.name, user]));
  DEFAULT_USERS.forEach((user) => {
    if (!usersByName.has(user.name)) usersByName.set(user.name, user);
  });
  const users = Array.from(usersByName.values());
  return {
    users: users.map((user) => {
      const normalized = user.id === DEFAULT_ADMIN_USER.id || user.name === DEFAULT_ADMIN_USER.name
        ? { ...user, ...DEFAULT_ADMIN_USER }
        : user;
      return {
        ...normalized,
        id: normalized.id || randomUUID(),
        role: normalizeRole(normalized.role, normalized.name),
        pageAccess: normalizePageAccess(normalized)
      };
    }),
    sessions: db.sessions || {},
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
      feedback: qualityInspection.feedback || {},
      dimensionLibrary: qualityInspection.dimensionLibrary || {}
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
    || hasPageAccess(user, 'inspectionSchedule')
    || hasPageAccess(user, 'inspectionStamp')
    || hasPageAccess(user, 'inspectionReportLibrary')
  ) return true;
  if (hasPageAccess(user, 'inspectionNotice')) return record.inspectionApplicant === user.name;
  if (hasPageAccess(user, 'inspectionFeedback')) {
    return isSubmittedScheduleRecord(record) && record.schedule?.inspector === user.name;
  }
  return false;
}

function canWriteFeedback(user, record) {
  if (!user || !record) return false;
  if (user.role === ROLE_ADMIN) return true;
  return hasPageAccess(user, 'inspectionFeedback')
    && isSubmittedScheduleRecord(record)
    && record.schedule?.inspector === user.name;
}

function reportFilePath(fileName) {
  return path.join(uploadDir, path.basename(fileName || ''));
}

function dimensionFilePath(fileName) {
  return path.join(dimensionUploadDir, path.basename(fileName || ''));
}

async function uniqueUploadName(fileName) {
  const ext = path.extname(fileName || '');
  const base = safeFileBaseName(path.basename(fileName || 'report', ext), `report-${Date.now()}`);
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
  const files = await Promise.all(entries
    .filter((entry) => entry.isFile())
    .map(async (entry) => {
      const stats = await stat(reportFilePath(entry.name));
      const linked = references.get(entry.name) || {};
      return {
        id: entry.name,
        fileName: entry.name,
        fileUrl: fileUrl(entry.name),
        size: stats.size,
        modifiedAt: format(stats.mtime, 'yyyy-MM-dd HH:mm:ss'),
        source: linked.recordId ? '验货报告' : '历史上传',
        ...linked
      };
    }));
  return files.sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
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
  const order = ['全球招商事业部', '海外事业一部', '海外事业二部', '国内事业部', '其他'];
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

function addSupplierRecord(map, supplier, address = '') {
  const supplierShortName = normalizeText(supplier);
  if (!supplierShortName) return;
  const record = {
    supplierShortName,
    address: normalizeText(address)
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
        readImportedValue(normalizedSource, DIMENSION_ADDRESS_ALIASES)
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

function buildProductCategoryMaps(db) {
  return {
    salesProductLines: buildDimensionValueMap(db, PRODUCT_CATEGORY_SLOT_ID, SALES_PRODUCT_LINE_ALIASES, 'salesProductLines'),
    salesSeries: buildDimensionValueMap(db, PRODUCT_CATEGORY_SLOT_ID, SALES_SERIES_ALIASES, 'salesSeries')
  };
}

function findDimensionValue(value, map) {
  const text = normalizeText(value);
  if (!text) return '';
  return map.get(normalizeHeader(text)) || '';
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
    const series = findDimensionValue(row.series, categoryMaps.salesSeries) || normalizeText(row.series);
    return {
      id: row.id || randomUUID(),
      ...row,
      inspectionApplicant: user.role === ROLE_ADMIN ? row.inspectionApplicant : user.name,
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
  const invalidSeriesIndex = rows.findIndex((row) => !findDimensionValue(row.series, categoryMaps.salesSeries));
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
  const user = db.users.find((item) => item.name === name && item.password === password);
  if (!user) return res.status(401).json({ error: '账号或密码不正确' });
  const token = randomUUID();
  db.sessions[token] = { userId: user.id, createdAt: nowText() };
  await saveDb(db);
  res.json({ id: user.id, name: user.name, role: user.role, pageAccess: user.pageAccess || [], token });
});

app.post('/api/auth/register', async (req, res) => {
  const db = await readDb();
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '').trim();
  if (!name || !password) return res.status(400).json({ error: '请输入姓名和密码' });
  if (db.users.some((user) => user.name === name)) return res.status(409).json({ error: '该姓名已存在' });
  const user = { id: randomUUID(), name, password, role: ROLE_USER, pageAccess: [] };
  db.users.push(user);
  const token = randomUUID();
  db.sessions[token] = { userId: user.id, createdAt: nowText() };
  await saveDb(db);
  res.json({ id: user.id, name: user.name, role: user.role, pageAccess: user.pageAccess || [], token });
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
  const pageAccess = Array.isArray(req.body.pageAccess)
    ? [...new Set(req.body.pageAccess.filter((page) => PAGE_KEYS.includes(page)))]
    : [];
  target.pageAccess = target.name === DEFAULT_ADMIN_USER.name
    ? PAGE_KEYS
    : pageAccess;
  await saveDb(db);
  res.json({
    id: target.id,
    name: target.name,
    role: target.role,
    pageAccess: target.pageAccess
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

app.get('/api/quality-inspection/dimension-library', requireAuth, requirePages('dimensionLibrary', 'inspectionNotice', 'inspectionSchedule', 'inspectionFeedback', 'inspectionReportLibrary', 'inspectionReportQuery', 'inspectionSummary'), async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const db = await readDb();
  if (await ensureProductCategoryOptionCache(db)) await saveDb(db);
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
  const nextRows = user.role === ROLE_ADMIN
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

app.get('/api/quality-inspection/records', requireAuth, requirePages('inspectionNotice', 'inspectionSchedule', 'inspectionFeedback', 'inspectionStamp', 'inspectionReportLibrary', 'inspectionReportQuery', 'inspectionSummary'), async (req, res) => {
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

app.get('/api/quality-inspection/stamp-reports', requireAuth, requirePages('inspectionStamp'), requireRoles(ROLE_ADMIN), async (req, res) => {
  const db = await readDb();
  const rows = composedRecords(db)
    .filter((record) => record.report?.fileName && !record.report?.stampedAt)
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

  const next = {
    ...previous,
    stampedAt: nowText(),
    stampedBy: req.authUser.name,
    stampRotation: Number(req.body.rotation || 0),
    updatedAt: nowText()
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

app.patch('/api/quality-inspection/feedback/:id', requireAuth, requirePages('inspectionFeedback'), async (req, res) => {
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
app.use('/pinzhiyanhuo', express.static(distDir));
app.use(express.static(distDir));
app.get(/^\/pinzhiyanhuo\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Quality inspection server running at http://localhost:${port}`);
});
