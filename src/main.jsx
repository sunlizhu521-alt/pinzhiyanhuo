import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';
import './styles.css';

const API = import.meta.env.DEV ? 'http://localhost:4002' : '';
const STATIC_MODE = import.meta.env.VITE_STATIC_MODE === '1';
const STATIC_DB_KEY = 'qualityInspectionStaticDb';
const DIMENSION_LIBRARY_KEY = 'qualityInspectionDimensionLibrary';
const REPORT_FILE_LIBRARY_KEY = 'qualityInspectionReportFileLibrary';
const DIMENSION_PREVIEW_ROW_LIMIT = 20;
const DEFAULT_ADMIN_USER = { id: 'u-admin', name: '孙立柱', password: '521sunlizhu', role: '管理员' };
const ROLE_ADMIN = '管理员';
const ROLE_PURCHASER = '采购跟单员';
const ROLE_INSPECTOR = '验货员';
const ROLE_SETTLEMENT = '结算员';
const ROLE_USER = '普通用户';
const DEFAULT_USERS = [
  DEFAULT_ADMIN_USER,
  { id: 'u-purchaser', name: '采购跟单员', password: '123456', role: ROLE_PURCHASER },
  { id: 'u-inspector', name: '验货员', password: '123456', role: ROLE_INSPECTOR },
  { id: 'u-settlement', name: '结算员', password: '123456', role: ROLE_SETTLEMENT }
];

const NOTICE_FIELDS = [
  { key: 'inspectionApplicant', label: '验货填写人', readonly: true },
  { key: 'inspectionFillTime', label: '验货填写时间', type: 'date' },
  { key: 'supplierFinishTime', label: '供应商完工时间', type: 'date' },
  { key: 'shipmentTime', label: '发货时间', type: 'date' },
  { key: 'kingdeeOrderNo', label: '金蝶采购订单' },
  { key: 'supplierShortName', label: '供应商简称' },
  { key: 'supplierAddress', label: '供应商地址' },
  { key: 'businessDepartments', label: '事业部' },
  { key: 'operation', label: '运营' },
  { key: 'firstInspection', label: '是否首批验货', options: ['是', '否'] },
  { key: 'salesProductLine', label: '产品线' },
  { key: 'series', label: '系列' },
  { key: 'totalQuantity', label: '合计数量' },
  { key: 'skuQuantity', label: 'SKU及数量', multiline: true },
  { key: 'remark', label: '备注', multiline: true }
];

const NOTICE_IMPORT_ALIASES = {
  inspectionApplicant: ['验货填写人', '填写人', '申请人', '提报人', '验货通知人'],
  inspectionFillTime: ['验货填写时间', '填写时间', '申请时间', '提报时间', '通知时间'],
  supplierFinishTime: ['供应商完工时间', '完工时间', '供应商完成时间'],
  shipmentTime: ['发货时间', '出货时间', '计划发货时间'],
  kingdeeOrderNo: ['金蝶采购订单', '采购订单', '采购订单号', '金蝶订单', '订单号', 'PO', 'PO号'],
  supplierShortName: ['供应商简称', '供应商', '供应商名称', '厂家简称'],
  supplierAddress: ['供应商地址', '地址', '验货地址', '工厂地址'],
  businessDepartments: ['事业部', '业务部门', '部门'],
  operation: ['运营', '运营人员', '运营负责人'],
  firstInspection: ['是否首批验货', '首批验货', '是否首批', '首批'],
  salesProductLine: ['产品线', '销售产品线', '一级产品线'],
  series: ['系列', '产品系列'],
  totalQuantity: ['合计数量', '总数量', '数量', '验货数量'],
  skuQuantity: ['SKU及数量', 'SKU数量', 'SKU明细', 'SKU及数量明细'],
  remark: ['备注', '备注信息', '说明']
};

const SUMMARY_IMPORT_ALIASES = {
  scheduledDate: ['计划日期', '计划验货时间', '计划验货日期', '安排日期'],
  status: ['状态', '安排状态'],
  inspector: ['验货员'],
  reportNo: ['报告单号', '报告编号'],
  conclusion: ['报告结论', '检验报告结论'],
  feedbackResult: ['反馈结果', '验货结果', '检验结果'],
  actualInspectionTime: ['实际验货时间'],
  actualInspector: ['实际验货人']
};

const FEEDBACK_IMPORT_ALIASES = {
  actualInspectionTime: ['实际验货时间', '验货时间', '实际检验时间', '检验时间'],
  inspectionDays: ['验货天数', '检验天数'],
  inspectionMethod: ['验货方式', '检验方式'],
  inspectionQuantity: ['验货数量', '检验数量'],
  qualifiedQuantity: ['验货合格数量', '合格数量', '检验合格数量'],
  result: ['验货结果', '检验结果', '反馈结果'],
  issueLevel: ['问题等级', '异常等级'],
  issueCategoryPrimary: ['问题分类', '一级问题分类', '问题大类'],
  issueCategorySecondary: ['问题分类2', '问题分类二', '二级问题分类', '问题小类'],
  feedbackText: ['问题反馈', '反馈内容', '问题描述', '验货反馈'],
  actualInspector: ['实际验货人', '实际检验人']
};

const MENU_PAGES = [
  { tab: 'inspectionNotice', label: '验货通知' },
  { tab: 'inspectionSchedule', label: '验货安排' },
  { tab: 'inspectionFeedback', label: '验货反馈' },
  { tab: 'inspectionStamp', label: '加盖检验章' },
  { tab: 'inspectionReportLibrary', label: '检验报告单文件库' },
  { tab: 'inspectionReportQuery', label: '检验报告单查询' },
  { tab: 'inspectionSummary', label: '验货信息汇总表' },
  { tab: 'dimensionLibrary', label: '维度表库存' },
  { tab: 'permissionManagement', label: '权限管理' }
];

const PAGE_OPTIONS = [
  ...MENU_PAGES,
  { tab: 'inspectionInitialData', label: '验货信息初始数据' }
];

const ROLE_PAGE_ACCESS = {
  [ROLE_ADMIN]: PAGE_OPTIONS.map((page) => page.tab),
  [ROLE_PURCHASER]: ['inspectionNotice'],
  [ROLE_INSPECTOR]: ['inspectionFeedback'],
  [ROLE_SETTLEMENT]: ['inspectionReportQuery', 'inspectionSummary'],
  [ROLE_USER]: []
};

function canAccessPage(user, tab) {
  if (!user) return false;
  const access = Array.isArray(user.pageAccess) ? user.pageAccess : (ROLE_PAGE_ACCESS[user.role] || []);
  return access.includes(tab);
}

function homeTabForUser(user) {
  const access = Array.isArray(user?.pageAccess) ? user.pageAccess : (ROLE_PAGE_ACCESS[user?.role] || []);
  return access.find((tab) => MENU_PAGES.some((page) => page.tab === tab)) || '';
}

function isAdminUser(user) {
  return user?.role === ROLE_ADMIN;
}

function canReadClientRecord(user, record) {
  if (!user) return false;
  if (
    user.role === ROLE_ADMIN
    || canAccessPage(user, 'inspectionReportQuery')
    || canAccessPage(user, 'inspectionSummary')
    || canAccessPage(user, 'inspectionSchedule')
    || canAccessPage(user, 'inspectionStamp')
    || canAccessPage(user, 'inspectionReportLibrary')
  ) return true;
  if (canAccessPage(user, 'inspectionNotice')) return record.inspectionApplicant === user.name;
  if (canAccessPage(user, 'inspectionFeedback')) return record.schedule?.inspector === user.name;
  return false;
}

const DIMENSION_LIBRARY_SLOTS = [
  { id: 'dimension-slot-1', title: '商品分类维表' },
  { id: 'dimension-slot-2', title: '采购分工明细' },
  { id: 'dimension-slot-3', title: '维度表槽位 3' },
  { id: 'dimension-slot-4', title: '维度表槽位 4' }
];

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createNoticeRow(values = {}) {
  return NOTICE_FIELDS.reduce((row, field) => ({
    ...row,
    [field.key]: values[field.key] || ''
  }), {
    id: values.id || createId()
  });
}

function normalize(value) {
  return String(value ?? '').trim();
}

function normalizeHeader(value) {
  return normalize(value).replace(/\s+/g, '').toLowerCase();
}

function formatDate(value) {
  return value ? String(value).slice(0, 10) : '';
}

function nowText() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function defaultStaticDb() {
  return {
    users: DEFAULT_USERS,
    qualityInspection: {
      initialData: { sheetName: '', columns: [], rows: [], updatedAt: '' },
      notices: { rows: [], submittedAt: '', submittedBy: '' },
      schedules: {},
      reports: {},
      feedback: {}
    }
  };
}

function normalizeStaticDb(db = {}) {
  const fallback = defaultStaticDb();
  const inspection = db.qualityInspection || {};
  const sourceUsers = Array.isArray(db.users) && db.users.length ? db.users : fallback.users;
  const usersByName = new Map(sourceUsers.map((item) => [item.name, item]));
  DEFAULT_USERS.forEach((item) => {
    if (!usersByName.has(item.name)) usersByName.set(item.name, item);
  });
  const users = Array.from(usersByName.values());
  return {
    users: users.map((user) => {
      if (user.id === DEFAULT_ADMIN_USER.id || user.name === DEFAULT_ADMIN_USER.name || user.role === ROLE_ADMIN) {
        return { ...user, ...DEFAULT_ADMIN_USER, pageAccess: ROLE_PAGE_ACCESS[ROLE_ADMIN] };
      }
      const role = [ROLE_PURCHASER, ROLE_INSPECTOR, ROLE_SETTLEMENT, ROLE_USER].includes(user.role)
        ? user.role
        : ROLE_USER;
      const pageAccess = Array.isArray(user.pageAccess)
        ? user.pageAccess.filter((page) => PAGE_OPTIONS.some((item) => item.tab === page))
        : (ROLE_PAGE_ACCESS[role] || []);
      return { ...user, id: user.id || createId(), role, pageAccess };
    }),
    qualityInspection: {
      initialData: { ...fallback.qualityInspection.initialData, ...(inspection.initialData || {}) },
      notices: { ...fallback.qualityInspection.notices, ...(inspection.notices || {}) },
      schedules: inspection.schedules || {},
      reports: inspection.reports || {},
      feedback: inspection.feedback || {}
    }
  };
}

function readStaticDb() {
  try {
    return normalizeStaticDb(JSON.parse(localStorage.getItem(STATIC_DB_KEY) || ''));
  } catch {
    return defaultStaticDb();
  }
}

function saveStaticDb(db) {
  localStorage.setItem(STATIC_DB_KEY, JSON.stringify(normalizeStaticDb(db)));
}

function readDimensionLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(DIMENSION_LIBRARY_KEY) || '{}');
    return DIMENSION_LIBRARY_SLOTS.reduce((library, slot) => ({
      ...library,
      [slot.id]: saved[slot.id] || null
    }), {});
  } catch {
    return DIMENSION_LIBRARY_SLOTS.reduce((library, slot) => ({ ...library, [slot.id]: null }), {});
  }
}

function saveDimensionLibrary(library) {
  try {
    localStorage.setItem(DIMENSION_LIBRARY_KEY, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}

function readReportFileLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(REPORT_FILE_LIBRARY_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveReportFileLibrary(files) {
  try {
    localStorage.setItem(REPORT_FILE_LIBRARY_KEY, JSON.stringify(files));
    return true;
  } catch {
    return false;
  }
}

function composedStaticRecords(db) {
  const inspection = db.qualityInspection;
  return (inspection.notices.rows || []).map((row, index) => ({
    ...row,
    rowNumber: row.rowNumber || index + 1,
    schedule: inspection.schedules[row.id] || {},
    report: inspection.reports[row.id] || {},
    feedback: inspection.feedback[row.id] || {}
  }));
}

function parseWorkbookInBrowser(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      try {
        const workbook = XLSX.read(reader.result, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
        const headerIndex = matrix.findIndex((row) => row.some((cell) => normalize(cell)));
        if (headerIndex === -1) {
          resolve({ sheetName, columns: [], rows: [], importedCount: 0 });
          return;
        }
        const columns = matrix[headerIndex].map((cell, index) => normalize(cell) || `字段${index + 1}`);
        const rows = matrix.slice(headerIndex + 1)
          .filter((row) => row.some((cell) => normalize(cell)))
          .map((row) => {
            const item = { id: createId(), __cells: row.map((cell) => normalize(cell)) };
            columns.forEach((column, index) => {
              item[column] = normalize(row[index]);
            });
            return item;
          });
        resolve({ sheetName, columns, rows, importedCount: rows.length });
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function parseWorkbookSheetsInBrowser(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      try {
        const workbook = XLSX.read(reader.result, { type: 'array', cellDates: true });
        const sheets = workbook.SheetNames.map((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
          const headerIndex = matrix.findIndex((row) => row.some((cell) => normalize(cell)));
          if (headerIndex === -1) {
            return { sheetName, columns: [], rows: [], importedCount: 0 };
          }
          const columns = matrix[headerIndex].map((cell, index) => normalize(cell) || `字段${index + 1}`);
          const rows = matrix.slice(headerIndex + 1)
            .filter((row) => row.some((cell) => normalize(cell)))
            .map((row) => {
              const item = { id: createId(), __cells: row.map((cell) => normalize(cell)) };
              columns.forEach((column, index) => {
                item[column] = normalize(row[index]);
              });
              return item;
            });
          return { sheetName, columns, rows, importedCount: rows.length };
        });

        resolve({
          sheetName: sheets[0]?.sheetName || '',
          sheetNames: sheets.map((sheet) => sheet.sheetName),
          sheetCount: sheets.length,
          sheets,
          columns: sheets[0]?.columns || [],
          rows: sheets[0]?.rows || [],
          importedCount: sheets.reduce((sum, sheet) => sum + (sheet.importedCount || 0), 0)
        });
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function importedRowsToNoticeRows(importedRows, currentUserName) {
  return importedRows
    .map((sourceRow) => {
      const normalizedSource = new Map();
      Object.entries(sourceRow || {}).forEach(([key, value]) => {
        if (key === 'id' || key === '__cells') return;
        normalizedSource.set(normalizeHeader(key), value);
      });
      const values = {};
      NOTICE_FIELDS.forEach((field) => {
        const aliases = [field.label, field.key, ...(NOTICE_IMPORT_ALIASES[field.key] || [])];
        const match = aliases
          .map(normalizeHeader)
          .find((alias) => normalizedSource.has(alias));
        values[field.key] = match ? normalize(normalizedSource.get(match)) : '';
      });
      values.inspectionApplicant = currentUserName;
      return createNoticeRow(values);
    })
    .filter((row) => NOTICE_FIELDS.some((field) => !field.readonly && normalize(row[field.key])));
}

function readImportedValue(normalizedSource, aliases) {
  const match = aliases
    .map(normalizeHeader)
    .find((alias) => normalizedSource.has(alias));
  return match ? normalize(normalizedSource.get(match)) : '';
}

function importedRowsToSummaryItems(importedRows, currentUserName) {
  return importedRows
    .map((sourceRow) => {
      const normalizedSource = new Map();
      Object.entries(sourceRow || {}).forEach(([key, value]) => {
        if (key === 'id' || key === '__cells') return;
        normalizedSource.set(normalizeHeader(key), value);
      });
      const noticeValues = {};
      NOTICE_FIELDS.forEach((field) => {
        const aliases = [field.label, field.key, ...(NOTICE_IMPORT_ALIASES[field.key] || [])];
        noticeValues[field.key] = readImportedValue(normalizedSource, aliases);
      });
      if (!noticeValues.inspectionApplicant) noticeValues.inspectionApplicant = currentUserName;
      const notice = createNoticeRow(noticeValues);
      const schedule = {
        scheduledDate: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.scheduledDate),
        status: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.status),
        inspector: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.inspector)
      };
      if (!schedule.status && (schedule.scheduledDate || schedule.inspector)) schedule.status = '已安排';
      const report = {
        reportNo: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.reportNo),
        conclusion: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.conclusion)
      };
      const feedback = {
        result: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.feedbackResult),
        actualInspectionTime: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.actualInspectionTime),
        actualInspector: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.actualInspector)
      };
      return { id: notice.id, notice, schedule, report, feedback };
    })
    .filter((item) => [
      ...NOTICE_FIELDS.filter((field) => !field.readonly).map((field) => item.notice[field.key]),
      ...Object.values(item.schedule),
      ...Object.values(item.report),
      ...Object.values(item.feedback)
    ].some(normalize));
}

function feedbackMatchKey(values = {}) {
  return [
    values.kingdeeOrderNo,
    values.supplierShortName,
    values.salesProductLine,
    values.series,
    values.totalQuantity
  ].map(normalizeHeader).join('|');
}

function feedbackFallbackMatchKey(values = {}) {
  return [
    values.supplierShortName,
    values.salesProductLine,
    values.series,
    values.totalQuantity,
    values.businessDepartments,
    values.operation
  ].map(normalizeHeader).join('|');
}

function importedRowsToFeedbackItems(importedRows, records) {
  const recordByMainKey = new Map();
  const recordByFallbackKey = new Map();
  records.forEach((record) => {
    const mainKey = feedbackMatchKey(record);
    const fallbackKey = feedbackFallbackMatchKey(record);
    if (mainKey.replace(/\|/g, '')) recordByMainKey.set(mainKey, record);
    if (fallbackKey.replace(/\|/g, '')) recordByFallbackKey.set(fallbackKey, record);
  });

  return importedRows
    .map((sourceRow) => {
      const normalizedSource = new Map();
      Object.entries(sourceRow || {}).forEach(([key, value]) => {
        if (key === 'id' || key === '__cells') return;
        normalizedSource.set(normalizeHeader(key), value);
      });
      const noticeValues = {};
      NOTICE_FIELDS.forEach((field) => {
        const aliases = [field.label, field.key, ...(NOTICE_IMPORT_ALIASES[field.key] || [])];
        noticeValues[field.key] = readImportedValue(normalizedSource, aliases);
      });
      const feedback = Object.fromEntries(Object.entries(FEEDBACK_IMPORT_ALIASES)
        .map(([key, aliases]) => [
          key,
          readImportedValue(normalizedSource, [key, ...aliases])
        ])
        .filter(([, value]) => normalize(value)));
      const matchedRecord = recordByMainKey.get(feedbackMatchKey(noticeValues))
        || recordByFallbackKey.get(feedbackFallbackMatchKey(noticeValues));
      return {
        id: createId(),
        recordId: matchedRecord?.id || '',
        matchStatus: matchedRecord ? '已匹配' : '未匹配',
        notice: {
          supplierShortName: noticeValues.supplierShortName || matchedRecord?.supplierShortName || '',
          salesProductLine: noticeValues.salesProductLine || matchedRecord?.salesProductLine || '',
          series: noticeValues.series || matchedRecord?.series || '',
          totalQuantity: noticeValues.totalQuantity || matchedRecord?.totalQuantity || '',
          businessDepartments: noticeValues.businessDepartments || matchedRecord?.businessDepartments || '',
          operation: noticeValues.operation || matchedRecord?.operation || ''
        },
        feedback
      };
    })
    .filter((item) => hasObjectValue(item.feedback));
}

function hasObjectValue(value) {
  return Object.values(value || {}).some(normalize);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || file.size === 0) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function reportHref(record) {
  if (record.report?.fileDataUrl) return record.report.fileDataUrl;
  if (record.report?.fileName) {
    const version = encodeURIComponent(record.report?.stampedAt || record.report?.uploadedAt || record.report?.updatedAt || '');
    return `${API}/uploads/${encodeURIComponent(record.report.fileName)}${version ? `?v=${version}` : ''}`;
  }
  return '';
}

function reportFileNameFromCode(reportNo, fileName) {
  const code = normalize(reportNo);
  if (!code) return fileName;
  const ext = String(fileName || '').match(/\.[^.]+$/)?.[0] || '';
  return `${code.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_')}${ext}`;
}

function reportFileExt(record) {
  return String(record?.report?.fileName || record?.report?.originalName || '')
    .split('?')[0]
    .match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
}

function isImageReport(record) {
  return ['.png', '.jpg', '.jpeg', '.webp'].includes(reportFileExt(record));
}

function imageMimeForReport(record) {
  const ext = reportFileExt(record);
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function formatFileSize(size) {
  const value = Number(size || 0);
  if (!value) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image load failed'));
    image.src = src;
  });
}

async function createStampedImageDataUrl(record, rotation) {
  const image = await loadImageElement(reportHref(record));
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const swapSize = normalizedRotation === 90 || normalizedRotation === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swapSize ? image.naturalHeight : image.naturalWidth;
  canvas.height = swapSize ? image.naturalWidth : image.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normalizedRotation * Math.PI) / 180);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  ctx.restore();

  const minSide = Math.min(canvas.width, canvas.height);
  const radius = Math.max(72, Math.min(150, minSide * 0.12));
  const x = canvas.width - radius * 1.45;
  const y = canvas.height - radius * 1.45;
  const red = '#d30f1f';

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.strokeStyle = red;
  ctx.fillStyle = red;
  ctx.lineWidth = Math.max(5, radius * 0.055);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.72, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, radius * 0.025);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(radius * 0.26)}px "Microsoft YaHei", Arial`;
  ctx.fillText('品质验货', x, y - radius * 0.16);
  ctx.font = `700 ${Math.round(radius * 0.30)}px "Microsoft YaHei", Arial`;
  ctx.fillText('检验章', x, y + radius * 0.20);
  ctx.font = `600 ${Math.round(radius * 0.14)}px "Microsoft YaHei", Arial`;
  ctx.fillText(nowText().slice(0, 10), x, y + radius * 0.52);
  ctx.restore();

  return canvas.toDataURL(imageMimeForReport(record), 0.92);
}

function shouldShowFeedbackRecord(record) {
  const result = normalize(record.feedback?.result);
  if (['通过', '让步', '合格', '让步接收'].includes(result)) return false;
  return !normalize(record.feedback?.actualInspectionTime) || result === '返工';
}

function App() {
  const [activeTab, setActiveTab] = useState('inspectionNotice');
  const [authMode, setAuthMode] = useState('login');
  const [loginName, setLoginName] = useState('孙立柱');
  const [password, setPassword] = useState('521sunlizhu');
  const [registerName, setRegisterName] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('qualityInspectionUser') || 'null'));
  const [message, setMessage] = useState('');
  const [appVersionTime, setAppVersionTime] = useState('读取中...');
  const [noticeRows, setNoticeRows] = useState(() => [createNoticeRow()]);
  const [noticeSubmission, setNoticeSubmission] = useState({ rows: [], submittedAt: '', submittedBy: '' });
  const [noticeImportPreview, setNoticeImportPreview] = useState(null);
  const [summaryImportPreview, setSummaryImportPreview] = useState(null);
  const [feedbackImportPreview, setFeedbackImportPreview] = useState(null);
  const [initialData, setInitialData] = useState({ sheetName: '', columns: [], rows: [], updatedAt: '' });
  const [initialImportResult, setInitialImportResult] = useState(null);
  const [dimensionLibrary, setDimensionLibrary] = useState(readDimensionLibrary);
  const [reportFiles, setReportFiles] = useState(() => readReportFileLibrary());
  const [permissionUsers, setPermissionUsers] = useState([]);
  const [records, setRecords] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [savingId, setSavingId] = useState('');
  const accessibleMenuPages = useMemo(
    () => MENU_PAGES.filter((page) => canAccessPage(user, page.tab)),
    [user]
  );

  function authFetch(url, options = {}) {
    const headers = {
      ...(options.headers || {}),
      ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {})
    };
    return fetch(url, { ...options, headers });
  }

  useEffect(() => {
    if (STATIC_MODE) {
      setAppVersionTime(nowText().slice(0, 16));
      return;
    }
    fetch(`${API}/api/app-version`, { cache: 'no-store' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setAppVersionTime(data?.versionTime || '未读取'))
      .catch(() => setAppVersionTime('未读取'));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!canAccessPage(user, activeTab)) setActiveTab(homeTabForUser(user));
  }, [activeTab, user]);

  useEffect(() => {
    if (!user || activeTab !== 'inspectionReportLibrary') return;
    refreshReportFiles();
  }, [activeTab, user]);

  useEffect(() => {
    if (!user || activeTab !== 'permissionManagement') return;
    refreshPermissionUsers();
  }, [activeTab, user]);

  async function loadData() {
    if (STATIC_MODE) {
      const db = readStaticDb();
      const inspection = db.qualityInspection;
      const visibleNotices = isAdminUser(user)
        ? (inspection.notices.rows || [])
        : (inspection.notices.rows || []).filter((row) => row.inspectionApplicant === user.name);
      setInitialData(inspection.initialData);
      setNoticeSubmission({ ...inspection.notices, rows: visibleNotices });
      setNoticeRows(visibleNotices.length
        ? visibleNotices.map((row) => createNoticeRow(row))
        : [createNoticeRow({ inspectionApplicant: user.name })]);
      setRecords(composedStaticRecords(db).filter((record) => canReadClientRecord(user, record)));
      return;
    }
    const [initialRes, noticeRes, recordsRes] = await Promise.all([
      authFetch(`${API}/api/quality-inspection/initial-data`, { cache: 'no-store' }),
      authFetch(`${API}/api/quality-inspection/notices`, { cache: 'no-store' }),
      authFetch(`${API}/api/quality-inspection/records`, { cache: 'no-store' })
    ]);
    if ([initialRes, noticeRes, recordsRes].some((res) => res.status === 401)) {
      logout();
      setMessage('登录已失效，请重新登录。');
      return;
    }
    if (initialRes.ok) setInitialData(await initialRes.json());
    if (noticeRes.ok) {
      const payload = await noticeRes.json();
      setNoticeSubmission(payload);
      setNoticeRows(payload.rows?.length
        ? payload.rows.map((row) => createNoticeRow(row))
        : [createNoticeRow({ inspectionApplicant: user.name })]);
    }
    if (recordsRes.ok) setRecords((await recordsRes.json()).rows || []);
  }

  async function submitAuth(event) {
    event.preventDefault();
    setMessage('');
    const isLogin = authMode === 'login';
    if (STATIC_MODE) {
      const db = readStaticDb();
      const name = normalize(isLogin ? loginName : registerName);
      const inputPassword = normalize(isLogin ? password : registerPassword);
      if (!name || !inputPassword) {
        setMessage('请输入姓名和密码。');
        return;
      }
      if (isLogin) {
        const matchedUser = db.users.find((item) => item.name === name && item.password === inputPassword);
        if (!matchedUser) {
          setMessage('账号或密码不正确。');
          return;
        }
        const payload = { id: matchedUser.id, name: matchedUser.name, role: matchedUser.role, pageAccess: matchedUser.pageAccess || [] };
        localStorage.setItem('qualityInspectionUser', JSON.stringify(payload));
        setUser(payload);
        setActiveTab(homeTabForUser(payload));
        return;
      }
      if (db.users.some((item) => item.name === name)) {
        setMessage('该姓名已存在。');
        return;
      }
      const newUser = { id: createId(), name, password: inputPassword, role: ROLE_USER, pageAccess: [] };
      db.users.push(newUser);
      saveStaticDb(db);
      const payload = { id: newUser.id, name: newUser.name, role: newUser.role, pageAccess: newUser.pageAccess };
      localStorage.setItem('qualityInspectionUser', JSON.stringify(payload));
      setUser(payload);
      setActiveTab(homeTabForUser(payload));
      setMessage('注册成功，请等待管理员孙立柱授权可访问页面。');
      return;
    }
    const res = await fetch(`${API}/api/auth/${isLogin ? 'login' : 'register'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: isLogin ? loginName : registerName,
        password: isLogin ? password : registerPassword
      })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(payload.error || '登录失败');
      return;
    }
    localStorage.setItem('qualityInspectionUser', JSON.stringify(payload));
    setUser(payload);
    setActiveTab(homeTabForUser(payload));
    if (!payload.pageAccess?.length) setMessage('注册成功，请等待管理员孙立柱授权可访问页面。');
  }

  function logout() {
    localStorage.removeItem('qualityInspectionUser');
    setUser(null);
  }

  function updateNoticeRow(id, key, value) {
    setNoticeRows((rows) => rows.map((row) => row.id === id ? { ...row, [key]: value } : row));
  }

  function addNoticeRow() {
    setNoticeRows((rows) => [...rows, createNoticeRow({ inspectionApplicant: user.name })]);
  }

  async function previewNoticeRows(files) {
    const file = files?.[0];
    if (!file) return;
    try {
      const result = await parseWorkbookInBrowser(file);
      const importedRows = importedRowsToNoticeRows(result.rows || [], user.name);
      if (!importedRows.length) {
        setMessage('未识别到可导入的验货通知数据，请检查表头。');
        return;
      }
      setNoticeImportPreview({
        fileName: file.name,
        sheetName: result.sheetName || '',
        rows: importedRows,
        parsedAt: nowText()
      });
      setMessage(`验货通知已解析：共 ${importedRows.length} 条，请检查预览后确认导入。`);
    } catch {
      setMessage('验货通知批量导入失败，请检查文件格式。');
    }
  }

  function confirmNoticeImport() {
    const previewRows = noticeImportPreview?.rows || [];
    if (!previewRows.length) {
      setMessage('暂无可导入的预览数据。');
      return;
    }
    setNoticeRows((rows) => {
      const activeRows = rows.filter((row) => NOTICE_FIELDS.some((field) => !field.readonly && normalize(row[field.key])));
      return [...activeRows, ...previewRows];
    });
    setMessage(`批量导入成功：已加入 ${previewRows.length} 条验货通知。`);
    setNoticeImportPreview(null);
  }

  function clearNoticeImportPreview() {
    setNoticeImportPreview(null);
    setMessage('已清空验货通知导入预览。');
  }

  async function previewSummaryRows(files) {
    const file = files?.[0];
    if (!file) return;
    try {
      const result = await parseWorkbookInBrowser(file);
      const items = importedRowsToSummaryItems(result.rows || [], user.name);
      if (!items.length) {
        setMessage('未识别到可追加的汇总表数据，请检查表头。');
        return;
      }
      setSummaryImportPreview({
        fileName: file.name,
        sheetName: result.sheetName || '',
        items,
        parsedAt: nowText()
      });
      setMessage(`验货信息汇总表已解析：共 ${items.length} 条，请检查预览后确认追加。`);
    } catch {
      setMessage('验货信息汇总表批量上传失败，请检查文件格式。');
    }
  }

  function clearSummaryImportPreview() {
    setSummaryImportPreview(null);
    setMessage('已清空验货信息汇总表导入预览。');
  }

  async function confirmSummaryImport() {
    const items = summaryImportPreview?.items || [];
    if (!items.length) {
      setMessage('暂无可追加的汇总表预览数据。');
      return;
    }
    if (STATIC_MODE) {
      const db = readStaticDb();
      const inspection = db.qualityInspection;
      const currentRows = inspection.notices.rows || [];
      const appendedRows = items.map((item) => item.notice);
      const rows = [...currentRows, ...appendedRows].map((row, index) => ({
        ...row,
        id: row.id || createId(),
        rowNumber: index + 1
      }));
      inspection.notices = {
        rows,
        submittedAt: nowText(),
        submittedBy: user.name
      };
      items.forEach((item) => {
        if (hasObjectValue(item.schedule)) {
          inspection.schedules[item.notice.id] = {
            ...(inspection.schedules[item.notice.id] || {}),
            ...item.schedule,
            updatedAt: nowText()
          };
        }
        if (hasObjectValue(item.report)) {
          inspection.reports[item.notice.id] = {
            ...(inspection.reports[item.notice.id] || {}),
            ...item.report,
            updatedAt: nowText()
          };
        }
        if (hasObjectValue(item.feedback)) {
          inspection.feedback[item.notice.id] = {
            ...(inspection.feedback[item.notice.id] || {}),
            ...item.feedback,
            updatedAt: nowText()
          };
        }
      });
      saveStaticDb(db);
      setNoticeSubmission(inspection.notices);
      setNoticeRows(rows.map((row) => createNoticeRow(row)));
      setRecords(composedStaticRecords(db).filter((record) => canReadClientRecord(user, record)));
      setSummaryImportPreview(null);
      setMessage(`验货信息汇总表已追加：新增 ${items.length} 条，原有信息已保留。`);
      return;
    }
    const res = await authFetch(`${API}/api/quality-inspection/summary-import?user=${encodeURIComponent(user.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, user: user.name })
    });
    if (!res.ok) {
      setMessage('验货信息汇总表追加失败。');
      return;
    }
    const payload = await res.json();
    setNoticeSubmission(payload.notices);
    setNoticeRows(payload.notices.rows.map((row) => createNoticeRow(row)));
    setRecords(payload.rows || []);
    setSummaryImportPreview(null);
    setMessage(`验货信息汇总表已追加：新增 ${items.length} 条，原有信息已保留。`);
  }

  async function previewFeedbackRows(files) {
    const file = files?.[0];
    if (!file) return;
    try {
      const result = await parseWorkbookInBrowser(file);
      const items = importedRowsToFeedbackItems(result.rows || [], records);
      if (!items.length) {
        setMessage('未识别到可导入的验货反馈数据，请检查表头。');
        return;
      }
      setFeedbackImportPreview({
        fileName: file.name,
        sheetName: result.sheetName || '',
        items,
        parsedAt: nowText()
      });
      const matchedCount = items.filter((item) => item.recordId).length;
      setMessage(`验货反馈已解析：共 ${items.length} 条，已匹配 ${matchedCount} 条，请检查预览后确认导入。`);
    } catch {
      setMessage('验货反馈批量上传失败，请检查文件格式。');
    }
  }

  function clearFeedbackImportPreview() {
    setFeedbackImportPreview(null);
    setMessage('已清空验货反馈导入预览。');
  }

  async function confirmFeedbackImport() {
    const items = feedbackImportPreview?.items || [];
    const matchedItems = items.filter((item) => item.recordId);
    if (!matchedItems.length) {
      setMessage('暂无已匹配的验货反馈数据可导入。');
      return;
    }
    if (STATIC_MODE) {
      const db = readStaticDb();
      const inspection = db.qualityInspection;
      matchedItems.forEach((item) => {
        inspection.feedback[item.recordId] = {
          ...(inspection.feedback[item.recordId] || {}),
          ...item.feedback,
          updatedAt: nowText()
        };
      });
      saveStaticDb(db);
      setRecords(composedStaticRecords(db).filter((record) => canReadClientRecord(user, record)));
      setFeedbackImportPreview(null);
      setMessage(`验货反馈批量导入成功：已更新 ${matchedItems.length} 条。`);
      return;
    }

    const recordById = new Map(records.map((record) => [record.id, record]));
    const responses = await Promise.all(matchedItems.map((item) => {
      const current = recordById.get(item.recordId);
      return authFetch(`${API}/api/quality-inspection/feedback/${encodeURIComponent(item.recordId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(current?.feedback || {}), ...item.feedback })
      });
    }));
    if (responses.some((res) => !res.ok)) {
      setMessage('验货反馈批量导入失败，请稍后重试。');
      return;
    }
    await refreshRecords();
    setFeedbackImportPreview(null);
    setMessage(`验货反馈批量导入成功：已更新 ${matchedItems.length} 条。`);
  }

  function deleteNoticeRow(id) {
    setNoticeRows((rows) => rows.length > 1 ? rows.filter((row) => row.id !== id) : [createNoticeRow({ inspectionApplicant: user.name })]);
  }

  async function submitNotices() {
    const rows = noticeRows
      .map((row) => ({ ...row, inspectionApplicant: user.name }))
      .filter((row) => NOTICE_FIELDS.some((field) => !field.readonly && normalize(row[field.key])));
    if (!rows.length) {
      setMessage('请至少填写一条验货通知后再提交。');
      return;
    }
    if (STATIC_MODE) {
      const db = readStaticDb();
      const existingRows = db.qualityInspection.notices.rows || [];
      const nextRows = isAdminUser(user)
        ? rows
        : [
            ...existingRows.filter((row) => row.inspectionApplicant !== user.name),
            ...rows
          ];
      const payload = {
        rows: nextRows.map((row, index) => ({ ...row, id: row.id || createId(), rowNumber: index + 1 })),
        submittedAt: nowText(),
        submittedBy: user.name
      };
      db.qualityInspection.notices = payload;
      saveStaticDb(db);
      const visibleRows = isAdminUser(user)
        ? payload.rows
        : payload.rows.filter((row) => row.inspectionApplicant === user.name);
      setNoticeSubmission({ ...payload, rows: visibleRows });
      setNoticeRows(visibleRows.map((row) => createNoticeRow(row)));
      setRecords(composedStaticRecords(db).filter((record) => canReadClientRecord(user, record)));
      setMessage(`验货通知已提交：共 ${payload.rows.length} 条。`);
      return;
    }
    const res = await authFetch(`${API}/api/quality-inspection/notices?user=${encodeURIComponent(user.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, user: user.name })
    });
    if (!res.ok) {
      setMessage('验货通知提交失败。');
      return;
    }
    const payload = await res.json();
    setNoticeSubmission(payload);
    setNoticeRows(payload.rows.map((row) => createNoticeRow(row)));
    setMessage(`验货通知已提交：共 ${payload.rows.length} 条。`);
    await refreshRecords();
  }

  async function refreshRecords() {
    if (STATIC_MODE) {
      setRecords(composedStaticRecords(readStaticDb()).filter((record) => canReadClientRecord(user, record)));
      return;
    }
    const res = await authFetch(`${API}/api/quality-inspection/records`, { cache: 'no-store' });
    if (res.ok) setRecords((await res.json()).rows || []);
  }

  async function refreshReportFiles() {
    if (STATIC_MODE) {
      setReportFiles(readReportFileLibrary());
      return;
    }
    const res = await authFetch(`${API}/api/quality-inspection/report-files`, { cache: 'no-store' });
    if (res.ok) setReportFiles((await res.json()).files || []);
  }

  async function refreshPermissionUsers() {
    if (STATIC_MODE) {
      setPermissionUsers(readStaticDb().users || []);
      return;
    }
    const res = await authFetch(`${API}/api/auth/users`, { cache: 'no-store' });
    if (res.ok) setPermissionUsers((await res.json()).users || []);
  }

  async function saveUserPageAccess(targetUser, pageAccess) {
    if (!targetUser?.id) return;
    setSavingId(targetUser.id);
    if (STATIC_MODE) {
      const db = readStaticDb();
      const target = db.users.find((item) => item.id === targetUser.id);
      if (target) {
        target.pageAccess = target.name === DEFAULT_ADMIN_USER.name ? ROLE_PAGE_ACCESS[ROLE_ADMIN] : pageAccess;
        saveStaticDb(db);
        setPermissionUsers(db.users);
        if (target.id === user.id) {
          const nextUser = { ...user, pageAccess: target.pageAccess };
          localStorage.setItem('qualityInspectionUser', JSON.stringify(nextUser));
          setUser(nextUser);
        }
      }
      setSavingId('');
      setMessage('用户页面权限已保存。');
      return;
    }
    const res = await authFetch(`${API}/api/auth/users/${encodeURIComponent(targetUser.id)}/access`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageAccess })
    });
    setSavingId('');
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setMessage(payload.error || '用户页面权限保存失败。');
      return;
    }
    await refreshPermissionUsers();
    setMessage('用户页面权限已保存。');
  }

  async function uploadInitialData(files) {
    const file = files?.[0];
    if (!file) return;
    if (STATIC_MODE) {
      try {
        const result = await parseWorkbookInBrowser(file);
        const payload = {
          sheetName: result.sheetName,
          columns: result.columns,
          rows: result.rows,
          updatedAt: nowText(),
          importedCount: result.importedCount
        };
        const db = readStaticDb();
        db.qualityInspection.initialData = payload;
        saveStaticDb(db);
        setInitialData(payload);
        setInitialImportResult(payload);
        setMessage(`验货信息初始数据已读取：成功 ${payload.importedCount || 0} 行。`);
      } catch {
        setMessage('验货信息初始数据导入失败，请检查文件格式。');
      }
      return;
    }
    const form = new FormData();
    form.append('file', file);
    const res = await authFetch(`${API}/api/quality-inspection/initial-data/import`, { method: 'POST', body: form });
    if (!res.ok) {
      setMessage('验货信息初始数据导入失败，请检查文件格式。');
      return;
    }
    const payload = await res.json();
    setInitialData(payload);
    setInitialImportResult(payload);
    setMessage(`验货信息初始数据已读取：成功 ${payload.importedCount || 0} 行。`);
  }

  async function uploadDimensionSlot(slotId, files) {
    const file = files?.[0];
    if (!file) return;
    try {
      const result = await parseWorkbookSheetsInBrowser(file);
      const sheets = (result.sheets || []).map((sheet) => ({
        sheetName: sheet.sheetName,
        columns: sheet.columns || [],
        rows: (sheet.rows || []).slice(0, DIMENSION_PREVIEW_ROW_LIMIT),
        importedCount: sheet.importedCount || 0,
        previewCount: Math.min(sheet.importedCount || 0, DIMENSION_PREVIEW_ROW_LIMIT)
      }));
      const firstSheet = sheets[0] || { sheetName: '', columns: [], rows: [] };
      const record = {
        id: slotId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || '未知类型',
        sheetName: firstSheet.sheetName || '',
        sheetNames: result.sheetNames || sheets.map((sheet) => sheet.sheetName),
        sheetCount: result.sheetCount || sheets.length,
        sheets,
        columns: firstSheet.columns || [],
        rows: firstSheet.rows || [],
        importedCount: result.importedCount || 0,
        previewCount: sheets.reduce((sum, sheet) => sum + (sheet.previewCount || 0), 0),
        savedAt: nowText(),
        applied: false,
        appliedAt: ''
      };
      const next = { ...dimensionLibrary, [slotId]: record };
      const saved = saveDimensionLibrary(next);
      setDimensionLibrary(next);
      setMessage(saved
        ? `维度表库存已读取：${file.name}，共 ${record.sheetCount} 个工作表、${record.importedCount} 行，请确认后应用刷新。`
        : `维度表库存已读取：${file.name}，共 ${record.sheetCount} 个工作表、${record.importedCount} 行；文件较大，已保留预览信息但浏览器缓存保存失败。`);
    } catch {
      setMessage('维度表库存读取失败，请检查文件格式。');
    }
  }

  function applyDimensionSlot(slotId) {
    const existing = dimensionLibrary[slotId];
    if (!existing) {
      setMessage('该槽位暂无可应用文件。');
      return;
    }
    const next = {
      ...dimensionLibrary,
      [slotId]: { ...existing, applied: true, appliedAt: nowText() }
    };
    const saved = saveDimensionLibrary(next);
    setDimensionLibrary(next);
    setMessage(saved ? `${existing.fileName} 已应用刷新。` : `${existing.fileName} 已应用刷新，但浏览器缓存保存失败。`);
  }

  function deleteDimensionSlot(slotId) {
    const next = { ...dimensionLibrary, [slotId]: null };
    const saved = saveDimensionLibrary(next);
    setDimensionLibrary(next);
    setMessage(saved ? '已清除该维度表槽位。' : '已清除该维度表槽位，但浏览器缓存保存失败。');
  }

  async function saveSchedules(scheduleDrafts) {
    const entries = Object.entries(scheduleDrafts || {});
    if (!entries.length) {
      setMessage('暂无可提交的验货安排。');
      return;
    }
    setSavingId('inspectionSchedule');
    if (STATIC_MODE) {
      const db = readStaticDb();
      entries.forEach(([recordId, draft]) => {
        const scheduledDate = normalize(draft.scheduledDate);
        const inspector = normalize(draft.inspector);
        db.qualityInspection.schedules[recordId] = {
          ...(db.qualityInspection.schedules[recordId] || {}),
          scheduledDate,
          inspector,
          remark: normalize(draft.remark),
          status: scheduledDate || inspector ? '已安排' : '未安排',
          updatedAt: nowText()
        };
      });
      saveStaticDb(db);
      setSavingId('');
      setRecords(composedStaticRecords(db).filter((record) => canReadClientRecord(user, record)));
      setMessage(`验货安排已一键提交：共 ${entries.length} 条。`);
      return;
    }
    const responses = await Promise.all(entries.map(([recordId, draft]) => {
      const scheduledDate = normalize(draft.scheduledDate);
      const inspector = normalize(draft.inspector);
      return authFetch(`${API}/api/quality-inspection/schedules/${encodeURIComponent(recordId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledDate,
          inspector,
          remark: normalize(draft.remark),
          status: scheduledDate || inspector ? '已安排' : '未安排'
        })
      });
    }));
    setSavingId('');
    if (responses.some((res) => !res.ok)) {
      setMessage('验货安排保存失败。');
      return;
    }
    await refreshRecords();
    setMessage(`验货安排已一键提交：共 ${entries.length} 条。`);
  }

  async function saveReport(record, formElement) {
    setSavingId(record.id);
    if (STATIC_MODE) {
      const form = new FormData(formElement);
      const file = form.get('file');
      let fileDataUrl = record.report?.fileDataUrl || '';
      if (file instanceof File && file.size > 0) {
        fileDataUrl = await readFileAsDataUrl(file);
      }
      const db = readStaticDb();
      const reportNo = normalize(form.get('reportNo'));
      db.qualityInspection.reports[record.id] = {
        ...(db.qualityInspection.reports[record.id] || {}),
        reportNo,
        conclusion: normalize(form.get('conclusion')),
        originalName: file instanceof File && file.size > 0 ? reportFileNameFromCode(reportNo, file.name) : record.report?.originalName || '',
        fileDataUrl,
        uploadedAt: file instanceof File && file.size > 0 ? nowText() : record.report?.uploadedAt || '',
        updatedAt: nowText()
      };
      saveStaticDb(db);
      formElement.reset();
      setSavingId('');
      setRecords(composedStaticRecords(db).filter((record) => canReadClientRecord(user, record)));
      setMessage('检验报告单已回传。');
      return;
    }
    const form = new FormData(formElement);
    const res = await authFetch(`${API}/api/quality-inspection/reports/${encodeURIComponent(record.id)}`, {
      method: 'POST',
      body: form
    });
    setSavingId('');
    if (!res.ok) {
      setMessage('检验报告单回传失败。');
      return;
    }
    formElement.reset();
    await refreshRecords();
    setMessage('检验报告单已回传。');
  }

  async function saveFeedback(record, formElement) {
    setSavingId(record.id);
    const form = new FormData(formElement);
    const file = form.get('reportFile');
    const reportNo = normalize(form.get('reportNo')) || normalize(record.report?.reportNo);
    if (file instanceof File && file.size > 0 && !reportNo) {
      setSavingId('');
      setMessage('请先填写检验报告单编码，再上传检验报告单。');
      return;
    }
    const feedbackPatch = {
      actualInspectionTime: normalize(form.get('actualInspectionTime')),
      inspectionDays: normalize(form.get('inspectionDays')),
      inspectionMethod: normalize(form.get('inspectionMethod')),
      inspectionQuantity: normalize(form.get('inspectionQuantity')),
      qualifiedQuantity: normalize(form.get('qualifiedQuantity')),
      result: normalize(form.get('result')),
      issueLevel: normalize(form.get('issueLevel')),
      issueCategoryPrimary: normalize(form.get('issueCategoryPrimary')),
      issueCategorySecondary: normalize(form.get('issueCategorySecondary')),
      actualInspector: normalize(form.get('actualInspector')),
      feedbackText: normalize(form.get('feedbackText'))
    };
    if (STATIC_MODE) {
      const db = readStaticDb();
      db.qualityInspection.feedback[record.id] = {
        ...(db.qualityInspection.feedback[record.id] || {}),
        ...feedbackPatch,
        updatedAt: nowText()
      };
      if (file instanceof File && file.size > 0) {
        const reportFileName = reportFileNameFromCode(reportNo, file.name);
        db.qualityInspection.reports[record.id] = {
          ...(db.qualityInspection.reports[record.id] || {}),
          reportNo,
          originalName: reportFileName,
          fileDataUrl: await readFileAsDataUrl(file),
          uploadedAt: nowText(),
          updatedAt: nowText()
        };
      } else if (reportNo) {
        db.qualityInspection.reports[record.id] = {
          ...(db.qualityInspection.reports[record.id] || {}),
          reportNo,
          updatedAt: nowText()
        };
      }
      saveStaticDb(db);
      setSavingId('');
      setRecords(composedStaticRecords(db).filter((record) => canReadClientRecord(user, record)));
      setMessage('验货反馈已保存。');
      return;
    }
    const res = await authFetch(`${API}/api/quality-inspection/feedback/${encodeURIComponent(record.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(record.feedback || {}), ...feedbackPatch })
    });
    setSavingId('');
    if (!res.ok) {
      setMessage('验货反馈保存失败。');
      return;
    }
    if (file instanceof File && file.size > 0) {
      const reportForm = new FormData();
      reportForm.append('file', file);
      reportForm.append('reportNo', reportNo);
      const reportRes = await authFetch(`${API}/api/quality-inspection/reports/${encodeURIComponent(record.id)}`, {
        method: 'POST',
        body: reportForm
      });
      if (!reportRes.ok) {
        setMessage('验货反馈已保存，但检验报告单上传失败。');
        await refreshRecords();
        return;
      }
    } else if (reportNo && reportNo !== normalize(record.report?.reportNo)) {
      const reportForm = new FormData();
      reportForm.append('reportNo', reportNo);
      const reportRes = await authFetch(`${API}/api/quality-inspection/reports/${encodeURIComponent(record.id)}`, {
        method: 'POST',
        body: reportForm
      });
      if (!reportRes.ok) {
        setMessage('验货反馈已保存，但检验报告单编码保存失败。');
        await refreshRecords();
        return;
      }
    }
    await refreshRecords();
    setMessage('验货反馈已保存。');
  }

  async function stampReport(record, rotation) {
    if (!record?.id || !reportHref(record)) {
      setMessage('当前没有可盖章的检验报告单。');
      return;
    }
    if (!isImageReport(record)) {
      setMessage('当前文件不是图片格式，暂不支持直接盖章，请上传 JPG/PNG 图片版检验报告单。');
      return;
    }
    setSavingId(record.id);
    try {
      const fileDataUrl = await createStampedImageDataUrl(record, rotation);
      if (STATIC_MODE) {
        const db = readStaticDb();
        db.qualityInspection.reports[record.id] = {
          ...(db.qualityInspection.reports[record.id] || {}),
          fileDataUrl,
          stampedAt: nowText(),
          stampedBy: user.name,
          stampRotation: rotation,
          updatedAt: nowText()
        };
        saveStaticDb(db);
        setRecords(composedStaticRecords(db).filter((item) => canReadClientRecord(user, item)));
        setMessage('检验章已加盖，文件已覆盖保存。');
        return;
      }
      const res = await authFetch(`${API}/api/quality-inspection/reports/${encodeURIComponent(record.id)}/stamp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileDataUrl, rotation })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setMessage(payload.error || '检验章加盖失败。');
        return;
      }
      await refreshRecords();
      setMessage('检验章已加盖，文件已覆盖保存到检验报告单文件库。');
    } catch {
      setMessage('检验章加盖失败，请确认报告单图片可以正常打开。');
    } finally {
      setSavingId('');
    }
  }

  const reportLibraryItems = useMemo(() => {
    if (!STATIC_MODE) return reportFiles;
    const linkedFiles = records
      .filter((record) => reportHref(record))
      .map((record) => ({
        id: `record-${record.id}`,
        recordId: record.id,
        fileName: record.report?.originalName || record.report?.fileName || record.report?.reportNo || '检验报告单',
        fileUrl: reportHref(record),
        source: record.report?.stampedAt ? '已盖章报告' : '验货报告',
        reportNo: record.report?.reportNo || '',
        supplierShortName: record.supplierShortName || '',
        productLine: record.salesProductLine || '',
        series: record.series || '',
        stampedAt: record.report?.stampedAt || '',
        stampedBy: record.report?.stampedBy || '',
        uploadedAt: record.report?.uploadedAt || '',
        modifiedAt: record.report?.updatedAt || record.report?.uploadedAt || ''
      }));
    return [...reportFiles, ...linkedFiles];
  }, [reportFiles, records]);

  async function uploadReportLibraryFiles(files) {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;
    setSavingId('inspectionReportLibrary');
    if (STATIC_MODE) {
      try {
        const uploaded = await Promise.all(selectedFiles.map(async (file) => ({
          id: createId(),
          fileName: file.name,
          fileUrl: await readFileAsDataUrl(file),
          size: file.size,
          source: '历史上传',
          modifiedAt: nowText()
        })));
        const nextFiles = [...readReportFileLibrary(), ...uploaded];
        saveReportFileLibrary(nextFiles);
        setReportFiles(nextFiles);
        setMessage(`检验报告单文件已上传：${uploaded.length} 个。`);
      } catch {
        setMessage('检验报告单文件上传失败。');
      } finally {
        setSavingId('');
      }
      return;
    }
    const form = new FormData();
    selectedFiles.forEach((file) => form.append('files', file));
    const res = await authFetch(`${API}/api/quality-inspection/report-files`, { method: 'POST', body: form });
    setSavingId('');
    if (!res.ok) {
      setMessage('检验报告单文件上传失败。');
      return;
    }
    const payload = await res.json();
    setReportFiles(payload.files || []);
    setMessage(`检验报告单文件已上传：${selectedFiles.length} 个。`);
  }

  async function renameReportLibraryFile(file, nextName) {
    const fileName = normalize(nextName);
    if (!fileName) {
      setMessage('文件名不能为空。');
      return;
    }
    setSavingId(file.id || file.fileName);
    if (STATIC_MODE) {
      if (file.recordId) {
        const db = readStaticDb();
        db.qualityInspection.reports[file.recordId] = {
          ...(db.qualityInspection.reports[file.recordId] || {}),
          fileName,
          originalName: fileName,
          updatedAt: nowText()
        };
        saveStaticDb(db);
        setRecords(composedStaticRecords(db).filter((record) => canReadClientRecord(user, record)));
      } else {
        const nextFiles = readReportFileLibrary().map((item) => (
          item.id === file.id ? { ...item, fileName, modifiedAt: nowText() } : item
        ));
        saveReportFileLibrary(nextFiles);
        setReportFiles(nextFiles);
      }
      setSavingId('');
      setMessage('文件名已修改。');
      return;
    }
    const res = await authFetch(`${API}/api/quality-inspection/report-files/${encodeURIComponent(file.fileName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName })
    });
    setSavingId('');
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setMessage(payload.error || '文件名修改失败。');
      return;
    }
    const payload = await res.json();
    setReportFiles(payload.files || []);
    await refreshRecords();
    setMessage('文件名已修改。');
  }

  async function deleteReportLibraryFile(file) {
    if (!window.confirm(`确认删除文件：${file.fileName}？`)) return;
    setSavingId(file.id || file.fileName);
    if (STATIC_MODE) {
      if (file.recordId) {
        const db = readStaticDb();
        const report = db.qualityInspection.reports[file.recordId] || {};
        delete report.fileName;
        delete report.originalName;
        delete report.fileDataUrl;
        delete report.uploadedAt;
        delete report.stampedAt;
        delete report.stampedBy;
        delete report.stampRotation;
        report.updatedAt = nowText();
        db.qualityInspection.reports[file.recordId] = report;
        saveStaticDb(db);
        setRecords(composedStaticRecords(db).filter((record) => canReadClientRecord(user, record)));
      } else {
        const nextFiles = readReportFileLibrary().filter((item) => item.id !== file.id);
        saveReportFileLibrary(nextFiles);
        setReportFiles(nextFiles);
      }
      setSavingId('');
      setMessage('文件已删除。');
      return;
    }
    const res = await authFetch(`${API}/api/quality-inspection/report-files/${encodeURIComponent(file.fileName)}`, {
      method: 'DELETE'
    });
    setSavingId('');
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setMessage(payload.error || '文件删除失败。');
      return;
    }
    const payload = await res.json();
    setReportFiles(payload.files || []);
    await refreshRecords();
    setMessage('文件已删除。');
  }

  const filteredRecords = useMemo(() => {
    const keyword = normalize(query).toLowerCase();
    return records.filter((record) => {
      const text = [
        record.kingdeeOrderNo,
        record.supplierShortName,
        record.salesProductLine,
        record.series,
        record.operation,
        record.report?.reportNo,
        record.feedback?.result,
        record.schedule?.status
      ].map(normalize).join(' ').toLowerCase();
      const matchesKeyword = !keyword || text.includes(keyword);
      const matchesStatus = !statusFilter || normalize(record.schedule?.status || '未安排') === statusFilter;
      return matchesKeyword && matchesStatus;
    });
  }, [records, query, statusFilter]);

  const summary = useMemo(() => {
    const total = records.length;
    const scheduled = records.filter((row) => normalize(row.schedule?.scheduledDate)).length;
    const reported = records.filter((row) => normalize(row.report?.fileName || row.report?.reportNo)).length;
    const passed = records.filter((row) => row.feedback?.result === '合格').length;
    const failed = records.filter((row) => row.feedback?.result === '不合格').length;
    return { total, scheduled, reported, passed, failed };
  }, [records]);

  if (!user) {
    return (
      <main className="login-shell">
        <form className="login-panel" onSubmit={submitAuth}>
          <h1>品质验货</h1>
          <p className="auth-note">首次使用请先注册账号，注册后需要管理员孙立柱授权页面后才能进入系统。</p>
          {message && <p className="message">{message}</p>}
          {authMode === 'login' ? (
            <>
              <label>
                姓名
                <input value={loginName} onChange={(event) => setLoginName(event.target.value)} />
              </label>
              <label>
                密码
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              <button type="submit">登录</button>
              <button type="button" className="ghost auth-switch-button" onClick={() => setAuthMode('register')}>注册新账号</button>
            </>
          ) : (
            <>
              <label>
                姓名
                <input value={registerName} onChange={(event) => setRegisterName(event.target.value)} />
              </label>
              <label>
                密码
                <input type="password" value={registerPassword} onChange={(event) => setRegisterPassword(event.target.value)} />
              </label>
              <button type="submit">注册并进入</button>
              <button type="button" className="ghost auth-switch-button" onClick={() => setAuthMode('login')}>返回登录</button>
            </>
          )}
        </form>
      </main>
    );
  }

  if (accessibleMenuPages.length === 0) {
    return (
      <main className="login-shell">
        <section className="login-panel waiting-panel">
          <h1>等待授权</h1>
          <p className="auth-note">账号 {user.name} 已注册，请联系管理员孙立柱在“权限管理”页面授权可访问页面。</p>
          {message && <p className="message">{message}</p>}
          <button type="button" onClick={logout}>退出登录</button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell" onClick={() => setMessage('')}>
      <aside className="sidebar" onClick={(event) => event.stopPropagation()}>
        <h1>品质验货</h1>
        <span className="app-version-time">更新时间：{appVersionTime}</span>
        <div className="menu-group">
          <button type="button" className="menu-group-title">品质验货 <span>▼</span></button>
          <div className="submenu-list">
            {accessibleMenuPages.map((page) => (
              <button
                key={page.tab}
                type="button"
                className={activeTab === page.tab ? 'active' : ''}
                onClick={() => setActiveTab(page.tab)}
              >
                {page.label}
              </button>
            ))}
          </div>
        </div>
        <div className="user-box">
          <strong>{user.name}</strong>
          <span>{user.role}</span>
          <button type="button" className="ghost" onClick={logout}>退出登录</button>
        </div>
      </aside>

      <section className="content" onClick={(event) => event.stopPropagation()}>
        {message && <p className="message">{message}</p>}
        {canAccessPage(user, 'inspectionNotice') && activeTab === 'inspectionNotice' && (
          <InspectionNoticePage
            rows={noticeRows}
            submission={noticeSubmission}
            user={user}
            onAdd={addNoticeRow}
            onDelete={deleteNoticeRow}
            onChange={updateNoticeRow}
            importPreview={noticeImportPreview}
            onUpload={previewNoticeRows}
            onConfirmImport={confirmNoticeImport}
            onClearImportPreview={clearNoticeImportPreview}
            onSubmit={submitNotices}
          />
        )}
        {canAccessPage(user, 'inspectionSchedule') && activeTab === 'inspectionSchedule' && (
          <InspectionSchedulePage records={records} savingId={savingId} onSubmit={saveSchedules} />
        )}
        {canAccessPage(user, 'inspectionReportUpload') && activeTab === 'inspectionReportUpload' && (
          <ReportUploadPage records={records} savingId={savingId} onSave={saveReport} />
        )}
        {canAccessPage(user, 'inspectionFeedback') && activeTab === 'inspectionFeedback' && (
          <FeedbackPage
            records={records.filter(shouldShowFeedbackRecord)}
            savingId={savingId}
            canImport={isAdminUser(user)}
            importPreview={feedbackImportPreview}
            onUpload={previewFeedbackRows}
            onConfirmImport={confirmFeedbackImport}
            onClearImportPreview={clearFeedbackImportPreview}
            onSave={saveFeedback}
          />
        )}
        {canAccessPage(user, 'inspectionStamp') && activeTab === 'inspectionStamp' && (
          <InspectionStampPage
            records={records.filter((record) => reportHref(record) && !record.report?.stampedAt)}
            savingId={savingId}
            onStamp={stampReport}
          />
        )}
        {canAccessPage(user, 'inspectionReportLibrary') && activeTab === 'inspectionReportLibrary' && (
          <ReportFileLibraryPage
            files={reportLibraryItems}
            savingId={savingId}
            onUpload={uploadReportLibraryFiles}
            onRename={renameReportLibraryFile}
            onDelete={deleteReportLibraryFile}
          />
        )}
        {canAccessPage(user, 'inspectionReportQuery') && activeTab === 'inspectionReportQuery' && (
          <ReportQueryPage
            records={filteredRecords}
            query={query}
            statusFilter={statusFilter}
            onQuery={setQuery}
            onStatusFilter={setStatusFilter}
          />
        )}
        {canAccessPage(user, 'inspectionSummary') && activeTab === 'inspectionSummary' && (
          <SummaryPage
            summary={summary}
            records={filteredRecords}
            canImport={isAdminUser(user)}
            importPreview={summaryImportPreview}
            onUpload={previewSummaryRows}
            onConfirmImport={confirmSummaryImport}
            onClearImportPreview={clearSummaryImportPreview}
          />
        )}
        {canAccessPage(user, 'inspectionInitialData') && activeTab === 'inspectionInitialData' && (
          <InitialDataPage data={initialData} result={initialImportResult} onUpload={uploadInitialData} />
        )}
        {canAccessPage(user, 'dimensionLibrary') && activeTab === 'dimensionLibrary' && (
          <DimensionLibraryPage
            slots={DIMENSION_LIBRARY_SLOTS}
            library={dimensionLibrary}
            onUpload={uploadDimensionSlot}
            onApply={applyDimensionSlot}
            onDelete={deleteDimensionSlot}
          />
        )}
        {canAccessPage(user, 'permissionManagement') && activeTab === 'permissionManagement' && (
          <PermissionManagementPage
            users={permissionUsers}
            savingId={savingId}
            onSave={saveUserPageAccess}
          />
        )}
      </section>
    </main>
  );
}

function InspectionNoticePage({
  rows,
  submission,
  user,
  importPreview,
  onAdd,
  onDelete,
  onChange,
  onUpload,
  onConfirmImport,
  onClearImportPreview,
  onSubmit
}) {
  const previewRows = importPreview?.rows || [];
  const previewColumns = NOTICE_FIELDS.map((field) => field.label);
  const previewLimitedRows = previewRows.slice(0, 10);

  return (
    <>
      <div className="section-heading-row">
        <h2>验货通知</h2>
        <span className="section-count">共 {rows.length} 条</span>
        {submission.submittedAt && <span className="section-count">已提交：{submission.submittedAt}</span>}
        <button type="button" className="ghost compact-button" onClick={onAdd}>新增一行</button>
        <label className="upload-button">
          批量上传
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(event) => {
              onUpload(event.target.files);
              event.target.value = '';
            }}
          />
        </label>
        <button type="button" onClick={onSubmit}>确认提交</button>
      </div>
      <label
        className="notice-upload-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          onUpload(event.dataTransfer.files);
        }}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(event) => {
            onUpload(event.target.files);
            event.target.value = '';
          }}
        />
        <strong>拖拽验货通知文件到这里，或点击选择文件</strong>
        <span>支持 .xlsx / .xls / .csv，解析后先预览，确认后再导入表格</span>
      </label>
      {importPreview && (
        <section className="notice-import-preview">
          <div className="section-heading-row">
            <h3>导入预览</h3>
            <span className="section-count">
              文件：{importPreview.fileName}；工作表：{importPreview.sheetName || '默认'}；共 {previewRows.length} 条
            </span>
            <button type="button" onClick={onConfirmImport}>确认导入</button>
            <button type="button" className="ghost compact-button" onClick={onClearImportPreview}>清空预览</button>
          </div>
          <DataTable
            className="inspection-notice-preview-table"
            rows={previewLimitedRows}
            columns={previewColumns}
            render={(row) => NOTICE_FIELDS.map((field) => field.readonly ? user.name : row[field.key] || '')}
          />
          {previewRows.length > previewLimitedRows.length && (
            <p className="preview-note">当前仅预览前 {previewLimitedRows.length} 条，确认导入会导入全部 {previewRows.length} 条。</p>
          )}
        </section>
      )}
      <DataTable
        className="inspection-notice-table"
        rows={rows}
        columns={[...NOTICE_FIELDS.map((field) => field.label), '操作']}
        render={(row) => [
          ...NOTICE_FIELDS.map((field) => {
            if (field.readonly) return <span className="readonly-cell">{user.name}</span>;
            if (field.options) {
              return (
                <select
                  className="table-input inspection-notice-input"
                  value={row[field.key] || ''}
                  onChange={(event) => onChange(row.id, field.key, event.target.value)}
                >
                  <option value="">选择</option>
                  {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              );
            }
            if (field.multiline) {
              return (
                <textarea
                  className="table-textarea inspection-notice-input"
                  value={row[field.key] || ''}
                  onChange={(event) => onChange(row.id, field.key, event.target.value)}
                />
              );
            }
            return (
              <input
                type={field.type || 'text'}
                className="table-input inspection-notice-input"
                value={row[field.key] || ''}
                onChange={(event) => onChange(row.id, field.key, event.target.value)}
              />
            );
          }),
          <button type="button" className="danger-button compact-button" onClick={() => onDelete(row.id)}>删除</button>
        ]}
      />
    </>
  );
}

function InspectionSchedulePage({ records, savingId, onSubmit }) {
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    setDrafts(Object.fromEntries(records.map((record) => [
      record.id,
      {
        scheduledDate: formatDate(record.schedule?.scheduledDate),
        inspector: record.schedule?.inspector || '',
        remark: record.schedule?.remark || ''
      }
    ])));
  }, [records]);

  function updateDraft(recordId, key, value) {
    setDrafts((current) => ({
      ...current,
      [recordId]: {
        ...(current[recordId] || {}),
        [key]: value
      }
    }));
  }

  return (
    <>
      <div className="section-heading-row">
        <h2>验货安排</h2>
        <span className="section-count">来自验货通知 {records.length} 条</span>
        <button
          type="button"
          disabled={savingId === 'inspectionSchedule' || records.length === 0}
          onClick={() => onSubmit(drafts)}
        >
          一键提交
        </button>
      </div>
      <DataTable
        className="inspection-schedule-table"
        rows={records}
        columns={['供应商简称', '地址', '产品线', '系列', '数量', '事业部', '运营', '验货通知人', '计划验货时间', '验货员', '安排备注']}
        render={(record) => [
          record.supplierShortName,
          record.supplierAddress,
          record.salesProductLine,
          record.series,
          record.totalQuantity,
          record.businessDepartments,
          record.operation,
          record.inspectionApplicant,
          <input
            className="table-input"
            type="date"
            value={drafts[record.id]?.scheduledDate || ''}
            onChange={(event) => updateDraft(record.id, 'scheduledDate', event.target.value)}
          />,
          <input
            className="table-input"
            value={drafts[record.id]?.inspector || ''}
            onChange={(event) => updateDraft(record.id, 'inspector', event.target.value)}
          />,
          <input
            className="table-input wide-input"
            value={drafts[record.id]?.remark || ''}
            onChange={(event) => updateDraft(record.id, 'remark', event.target.value)}
          />
        ]}
      />
    </>
  );
}

function ReportUploadPage({ records, savingId, onSave }) {
  return (
    <>
      <div className="section-heading-row">
        <h2>检验报告单回传</h2>
        <span className="section-count">支持 PDF、图片、Excel 文件</span>
      </div>
      <div className="report-list">
        {records.length === 0 && <EmptyState text="暂无验货通知，请先在验货通知页面提交数据。" />}
        {records.map((record) => (
          <form key={record.id} className="report-card" onSubmit={(event) => { event.preventDefault(); onSave(record, event.currentTarget); }}>
            <div>
              <h3>{record.supplierShortName || '未填写供应商'}</h3>
              <p>{record.kingdeeOrderNo || '未填写采购订单'} · {record.salesProductLine || '未填写产品线'}</p>
              {record.report?.originalName && reportHref(record) && (
                <a href={reportHref(record)} target="_blank" rel="noreferrer">{record.report.originalName}</a>
              )}
            </div>
            <input name="reportNo" placeholder="报告单号" defaultValue={record.report?.reportNo || ''} />
            <select name="conclusion" defaultValue={record.report?.conclusion || ''}>
              <option value="">检验结论</option>
              <option value="合格">合格</option>
              <option value="不合格">不合格</option>
              <option value="让步接收">让步接收</option>
              <option value="待复检">待复检</option>
            </select>
            <input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx" />
            <button type="submit" disabled={savingId === record.id}>回传</button>
          </form>
        ))}
      </div>
    </>
  );
}

function FeedbackPage({ records, savingId, canImport, importPreview, onUpload, onConfirmImport, onClearImportPreview, onSave }) {
  const previewRows = importPreview?.items || [];
  const previewLimitedRows = previewRows.slice(0, 10);
  const matchedCount = previewRows.filter((item) => item.recordId).length;
  return (
    <>
      <div className="section-heading-row">
        <h2>验货反馈</h2>
        <span className="section-count">待反馈 {records.length} 条</span>
        {canImport && (
          <label className="upload-button">
            批量上传
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => {
                onUpload(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
        )}
      </div>
      {canImport && (
        <label
          className="feedback-upload-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            onUpload(event.dataTransfer.files);
          }}
        >
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(event) => {
              onUpload(event.target.files);
              event.target.value = '';
            }}
          />
          <strong>拖拽历史验货反馈文件到这里，或点击选择文件</strong>
          <span>支持 .xlsx / .xls / .csv，解析后先预览，确认后写入已匹配的验货反馈</span>
        </label>
      )}
      {canImport && importPreview && (
        <section className="feedback-import-preview">
          <div className="section-heading-row">
            <h3>批量上传预览</h3>
            <span className="section-count">
              {importPreview.fileName}，工作表 {importPreview.sheetName || '未识别'}，共 {previewRows.length} 条，已匹配 {matchedCount} 条
            </span>
            <button type="button" className="compact-button" onClick={onConfirmImport}>确认导入</button>
            <button type="button" className="ghost compact-button" onClick={onClearImportPreview}>清空预览</button>
          </div>
          <DataTable
            className="feedback-preview-table"
            rows={previewLimitedRows}
            columns={['匹配状态', '供应商简称', '产品线', '系列', '数量', '实际验货时间', '验货天数', '验货方式', '验货数量', '合格数量', '验货结果', '问题等级', '问题分类', '问题分类', '问题反馈', '实际验货人']}
            render={(item) => [
              item.matchStatus,
              item.notice.supplierShortName,
              item.notice.salesProductLine,
              item.notice.series,
              item.notice.totalQuantity,
              item.feedback.actualInspectionTime,
              item.feedback.inspectionDays,
              item.feedback.inspectionMethod,
              item.feedback.inspectionQuantity,
              item.feedback.qualifiedQuantity,
              item.feedback.result,
              item.feedback.issueLevel,
              item.feedback.issueCategoryPrimary,
              item.feedback.issueCategorySecondary,
              item.feedback.feedbackText,
              item.feedback.actualInspector
            ]}
          />
          {previewRows.length > previewLimitedRows.length && (
            <p className="preview-note">仅展示前 {previewLimitedRows.length} 条，确认后会导入全部已匹配数据。</p>
          )}
        </section>
      )}
      <DataTable
        className="inspection-feedback-table"
        rows={records}
        columns={[
          '供应商简称',
          '产品线',
          '系列',
          '数量',
          '事业部',
          '运营',
          '验货通知人',
          '实际验货时间',
          '验货天数',
          '验货方式',
          '验货数量',
          '验货合格数量',
          '验货结果',
          '问题等级',
          '问题分类',
          '问题分类',
          '问题反馈',
          '检验报告单编码',
          '检验报告单上传功能',
          '验货员',
          '实际验货人',
          '提交按钮'
        ]}
        render={(record) => [
          record.supplierShortName,
          record.salesProductLine,
          record.series,
          record.totalQuantity,
          record.businessDepartments,
          record.operation,
          record.inspectionApplicant,
          <input name="actualInspectionTime" form={`feedback-form-${record.id}`} className="table-input" type="date" defaultValue={formatDate(record.feedback?.actualInspectionTime)} />,
          <input name="inspectionDays" form={`feedback-form-${record.id}`} className="table-input narrow-input" defaultValue={record.feedback?.inspectionDays || ''} />,
          <input name="inspectionMethod" form={`feedback-form-${record.id}`} className="table-input" defaultValue={record.feedback?.inspectionMethod || ''} />,
          <input name="inspectionQuantity" form={`feedback-form-${record.id}`} className="table-input narrow-input" defaultValue={record.feedback?.inspectionQuantity || ''} />,
          <input name="qualifiedQuantity" form={`feedback-form-${record.id}`} className="table-input narrow-input" defaultValue={record.feedback?.qualifiedQuantity || ''} />,
          <select name="result" form={`feedback-form-${record.id}`} className="table-input" defaultValue={record.feedback?.result || ''}>
            <option value="">选择</option>
            <option value="通过">通过</option>
            <option value="让步">让步</option>
            <option value="返工">返工</option>
          </select>,
          <select name="issueLevel" form={`feedback-form-${record.id}`} className="table-input" defaultValue={record.feedback?.issueLevel || ''}>
            <option value="">选择</option>
            <option value="一般">一般</option>
            <option value="重要">重要</option>
            <option value="严重">严重</option>
          </select>,
          <input name="issueCategoryPrimary" form={`feedback-form-${record.id}`} className="table-input" defaultValue={record.feedback?.issueCategoryPrimary || ''} />,
          <input name="issueCategorySecondary" form={`feedback-form-${record.id}`} className="table-input" defaultValue={record.feedback?.issueCategorySecondary || ''} />,
          <textarea name="feedbackText" form={`feedback-form-${record.id}`} className="table-textarea wide-textarea" defaultValue={record.feedback?.feedbackText || ''} />,
          <input name="reportNo" form={`feedback-form-${record.id}`} className="table-input" defaultValue={record.report?.reportNo || ''} />,
          <div className="feedback-report-cell">
            {reportHref(record) && <a href={reportHref(record)} target="_blank" rel="noreferrer">{record.report?.originalName || '查看报告'}</a>}
            <input name="reportFile" form={`feedback-form-${record.id}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx" />
          </div>,
          record.schedule?.inspector || '',
          <input name="actualInspector" form={`feedback-form-${record.id}`} className="table-input" defaultValue={record.feedback?.actualInspector || ''} />,
          <form id={`feedback-form-${record.id}`} onSubmit={(event) => { event.preventDefault(); onSave(record, event.currentTarget); }}>
            <button type="submit" className="compact-button" disabled={savingId === record.id}>提交</button>
          </form>
        ]}
      />
    </>
  );
}

function InspectionStampPage({ records, savingId, onStamp }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [rotation, setRotation] = useState(0);
  const safeIndex = records.length ? Math.min(currentIndex, records.length - 1) : 0;
  const current = records[safeIndex];
  const canStamp = current && isImageReport(current);

  useEffect(() => {
    if (currentIndex > Math.max(records.length - 1, 0)) setCurrentIndex(0);
  }, [records.length, currentIndex]);

  useEffect(() => {
    setRotation(0);
  }, [current?.id]);

  function go(delta) {
    if (!records.length) return;
    setCurrentIndex((index) => (index + delta + records.length) % records.length);
  }

  return (
    <section className="stamp-page">
      <div className="section-heading-row">
        <h2>加盖检验章</h2>
        <span className="section-count">待盖章 {records.length} 份</span>
        <button type="button" className="ghost compact-button" onClick={() => go(-1)} disabled={records.length < 2}>上一张</button>
        <button type="button" className="ghost compact-button" onClick={() => go(1)} disabled={records.length < 2}>下一张</button>
        <button type="button" className="ghost compact-button" onClick={() => setRotation((value) => (value + 90) % 360)} disabled={!current}>旋转</button>
        <button
          type="button"
          className="compact-button"
          disabled={!canStamp || savingId === current?.id}
          onClick={() => onStamp(current, rotation)}
        >
          {savingId === current?.id ? '加盖中' : '加盖印章'}
        </button>
      </div>

      {!current ? (
        <EmptyState text="暂无待加盖检验章的报告单" />
      ) : (
        <div className="stamp-workspace">
          <aside className="stamp-list">
            {records.map((record, index) => (
              <button
                type="button"
                key={record.id}
                className={index === safeIndex ? 'active' : ''}
                onClick={() => setCurrentIndex(index)}
              >
                <strong>{record.report?.reportNo || '未填写报告编码'}</strong>
                <span>{record.supplierShortName || '未填写供应商'}</span>
                <span>{record.report?.originalName || record.report?.fileName}</span>
              </button>
            ))}
          </aside>
          <section className="stamp-viewer">
            <div className="stamp-meta">
              <strong>{current.report?.reportNo || '未填写报告编码'}</strong>
              <span>{current.supplierShortName || ''}</span>
              <span>{current.salesProductLine || ''} {current.series || ''}</span>
              {!canStamp && <span className="stamp-warning">当前文件不是图片格式，只能查看，不能直接加盖图片印章。</span>}
            </div>
            <div className="stamp-canvas">
              {isImageReport(current) ? (
                <img
                  src={reportHref(current)}
                  alt="检验报告单"
                  style={{ transform: `rotate(${rotation}deg)` }}
                />
              ) : (
                <iframe title="检验报告单预览" src={reportHref(current)} />
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function ReportFileLibraryPage({ files, savingId, onUpload, onRename, onDelete }) {
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    setDrafts(Object.fromEntries(files.map((file) => [file.id || file.fileName, file.fileName || ''])));
  }, [files]);

  return (
    <section className="report-library-page">
      <div className="section-heading-row">
        <h2>检验报告单文件库</h2>
        <span className="section-count">共 {files.length} 个文件</span>
      </div>
      <label
        className="report-library-upload-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          onUpload(event.dataTransfer.files);
        }}
      >
        <input
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.doc,.docx"
          onChange={(event) => {
            onUpload(event.target.files);
            event.target.value = '';
          }}
        />
        <strong>拖拽历史检验报告单到这里，或点击上传</strong>
        <span>支持图片、PDF、Excel、Word；加盖章后的报告单也会在这里展示</span>
      </label>
      <DataTable
        className="report-library-table"
        rows={files}
        columns={['文件名', '来源', '报告编码', '供应商', '产品线/系列', '盖章状态', '大小', '更新时间', '查看', '操作']}
        render={(file) => {
          const key = file.id || file.fileName;
          const draftName = drafts[key] ?? file.fileName ?? '';
          return [
            <input
              className="table-input wide-input"
              value={draftName}
              onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
            />,
            file.source || '',
            file.reportNo || '',
            file.supplierShortName || '',
            [file.productLine, file.series].filter(Boolean).join(' / '),
            file.stampedAt ? `已盖章 ${file.stampedAt}` : '未盖章',
            formatFileSize(file.size),
            file.modifiedAt || file.updatedAt || file.uploadedAt || '',
            file.fileUrl ? <a href={file.fileUrl} target="_blank" rel="noreferrer">查看文件</a> : '',
            <div className="table-action-row">
              <button
                type="button"
                className="compact-button"
                disabled={savingId === key || draftName === file.fileName}
                onClick={() => onRename(file, draftName)}
              >
                保存
              </button>
              <button
                type="button"
                className="danger-button compact-button"
                disabled={savingId === key}
                onClick={() => onDelete(file)}
              >
                删除
              </button>
            </div>
          ];
        }}
      />
    </section>
  );
}

function ReportQueryPage({ records, query, statusFilter, onQuery, onStatusFilter }) {
  return (
    <>
      <div className="section-heading-row">
        <h2>检验报告单查询</h2>
        <span className="section-count">筛选结果 {records.length} 条</span>
      </div>
      <div className="toolbar">
        <input placeholder="搜索供应商、采购订单、产品线、报告单号" value={query} onChange={(event) => onQuery(event.target.value)} />
        <select value={statusFilter} onChange={(event) => onStatusFilter(event.target.value)}>
          <option value="">全部状态</option>
          {['未安排', '已安排', '验货中', '已完成', '已取消'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <DataTable
        rows={records}
        columns={['供应商', '采购订单', '计划日期', '验货员', '状态', '报告单号', '报告文件', '反馈结果']}
        render={(record) => [
          record.supplierShortName,
          record.kingdeeOrderNo,
          record.schedule?.scheduledDate || '',
          record.schedule?.inspector || '',
          record.schedule?.status || '未安排',
          record.report?.reportNo || '',
          reportHref(record)
            ? <a href={reportHref(record)} target="_blank" rel="noreferrer">{record.report.originalName || '查看文件'}</a>
            : '',
          record.feedback?.result || ''
        ]}
      />
    </>
  );
}

function SummaryPage({ summary, records, canImport, importPreview, onUpload, onConfirmImport, onClearImportPreview }) {
  const previewRows = importPreview?.items || [];
  const previewLimitedRows = previewRows.slice(0, 10);
  return (
    <>
      <div className="section-heading-row">
        <h2>验货信息汇总表</h2>
        <span className="section-count">按当前数据实时汇总</span>
      </div>
      {canImport && (
        <label
          className="summary-upload-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); onUpload(event.dataTransfer.files); }}
        >
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => onUpload(event.target.files)} />
          <strong>拖拽汇总表文件到这里，或点击批量上传</strong>
          <span>支持 .xlsx / .xls / .csv，解析后先预览，确认后追加到现有汇总信息</span>
        </label>
      )}
      {canImport && importPreview && (
        <section className="summary-import-preview">
          <div className="section-heading-row">
            <h3>批量上传预览</h3>
            <span className="section-count">
              {importPreview.fileName}，工作表 {importPreview.sheetName || '未识别'}，共 {previewRows.length} 条
            </span>
            <button type="button" className="compact-button" onClick={onConfirmImport}>确认追加</button>
            <button type="button" className="ghost compact-button" onClick={onClearImportPreview}>清空预览</button>
          </div>
          <DataTable
            className="summary-preview-table"
            rows={previewLimitedRows}
            columns={['供应商', '事业部', '产品线', '系列', '数量', '计划日期', '状态', '验货员', '报告结论', '反馈结果']}
            render={(item) => [
              item.notice.supplierShortName,
              item.notice.businessDepartments,
              item.notice.salesProductLine,
              item.notice.series,
              item.notice.totalQuantity,
              item.schedule.scheduledDate,
              item.schedule.status,
              item.schedule.inspector,
              item.report.conclusion,
              item.feedback.result
            ]}
          />
          {previewRows.length > previewLimitedRows.length && <p className="preview-note">仅展示前 10 条，确认后会追加全部 {previewRows.length} 条。</p>}
        </section>
      )}
      <div className="metric-grid">
        <MetricCard label="验货通知" value={summary.total} />
        <MetricCard label="已安排" value={summary.scheduled} />
        <MetricCard label="已回传报告" value={summary.reported} />
        <MetricCard label="合格" value={summary.passed} />
        <MetricCard label="不合格" value={summary.failed} />
      </div>
      <DataTable
        rows={records}
        columns={['序号', '供应商', '事业部', '产品线', '系列', '数量', '计划日期', '状态', '报告结论', '反馈结果']}
        render={(record) => [
          record.rowNumber,
          record.supplierShortName,
          record.businessDepartments,
          record.salesProductLine,
          record.series,
          record.totalQuantity,
          record.schedule?.scheduledDate || '',
          record.schedule?.status || '未安排',
          record.report?.conclusion || '',
          record.feedback?.result || ''
        ]}
      />
    </>
  );
}

function InitialDataPage({ data, result, onUpload }) {
  const columns = data.columns?.length ? data.columns : ['暂无字段'];
  return (
    <>
      <div className="section-heading-row">
        <h2>验货信息初始数据</h2>
        <span className="section-count">共 {data.rows?.length || 0} 行</span>
      </div>
      <section className="single-management-panel">
        <label
          className="mini-drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); onUpload(event.dataTransfer.files); }}
        >
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => onUpload(event.target.files)} />
          <span>点击或拖拽上传验货信息初始数据</span>
        </label>
        {(result || data.updatedAt) && (
          <div className="import-summary">
            <strong>读取结果</strong>
            <span>工作表：{data.sheetName || result?.sheetName || '未识别'}</span>
            <span>成功 {result?.importedCount ?? data.rows?.length ?? 0} 行</span>
            {data.updatedAt && <span>更新时间：{data.updatedAt}</span>}
          </div>
        )}
        <DataTable
          className="inspection-initial-table"
          rows={data.rows || []}
          columns={columns}
          render={(row) => columns.map((column) => row[column] || '')}
        />
      </section>
    </>
  );
}

function DimensionLibraryPage({ slots, library, onUpload, onApply, onDelete }) {
  const filledCount = slots.filter((slot) => library[slot.id]).length;
  const appliedCount = slots.filter((slot) => library[slot.id]?.applied).length;
  return (
    <>
      <div className="section-heading-row">
        <h2>维度表库存</h2>
        <span className="section-count">4 个槽位，已上传 {filledCount} 个，已应用 {appliedCount} 个</span>
      </div>
      <section className="dimension-library-grid">
        {slots.map((slot, index) => {
          const record = library[slot.id];
          const sheetPreviews = record?.sheets?.length
            ? record.sheets
            : record
              ? [{
                  sheetName: record.sheetName || '默认工作表',
                  columns: record.columns || [],
                  rows: record.rows || [],
                  importedCount: record.importedCount || 0
                }]
              : [];
          const sheetNames = record?.sheetNames?.length
            ? record.sheetNames
            : sheetPreviews.map((sheet) => sheet.sheetName).filter(Boolean);
          const previewCount = sheetPreviews.reduce((sum, sheet) => sum + (sheet.rows?.length || 0), 0);
          return (
            <article key={slot.id} className="dimension-slot-card">
              <div className="slot-head">
                <div>
                  <span className="slot-kicker">槽位 {index + 1}</span>
                  <h3>{slot.title}</h3>
                </div>
                <span className={`slot-state ${record?.applied ? 'applied' : record ? 'pending' : ''}`}>
                  {record?.applied ? '已应用' : record ? '待应用' : '缺失'}
                </span>
              </div>
              <label
                className="dimension-drop-zone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); onUpload(slot.id, event.dataTransfer.files); }}
              >
                <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => onUpload(slot.id, event.target.files)} />
                <strong>{record ? '替换维度表文件' : '上传维度表文件'}</strong>
                <span>点击或拖拽 Excel / CSV 到此槽位</span>
              </label>
              {record ? (
                <>
                  <div className="slot-info">
                    <span>文件：{record.fileName}</span>
                    <span>工作表数：{record.sheetCount || sheetPreviews.length || 0}</span>
                    <span>工作表：{sheetNames.join('、') || '未识别'}</span>
                    <span>总行数：{record.importedCount || 0}</span>
                    <span>预览：{previewCount} 行</span>
                    <span>保存：{record.savedAt}</span>
                    {record.appliedAt && <span>应用：{record.appliedAt}</span>}
                  </div>
                  <div className="dimension-sheet-list">
                    {sheetPreviews.map((sheet, sheetIndex) => {
                      const columns = sheet.columns?.length ? sheet.columns.slice(0, 8) : ['暂无字段'];
                      const previewRows = sheet.rows?.slice(0, 5) || [];
                      return (
                        <div key={`${sheet.sheetName || 'sheet'}-${sheetIndex}`} className="dimension-sheet-preview">
                          <div className="dimension-sheet-head">
                            <strong>{sheet.sheetName || `工作表 ${sheetIndex + 1}`}</strong>
                            <span>{sheet.importedCount || 0} 行，预览 {previewRows.length} 行</span>
                          </div>
                          <DataTable
                            className="dimension-preview-table"
                            rows={previewRows}
                            columns={columns}
                            render={(row) => columns.map((column) => row[column] || '')}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="card-actions">
                    <button type="button" className="compact-button" onClick={() => onApply(slot.id)}>应用刷新</button>
                    <button type="button" className="ghost compact-button" onClick={() => onDelete(slot.id)}>删除</button>
                  </div>
                </>
              ) : (
                <EmptyState text="暂无维度表文件" />
              )}
            </article>
          );
        })}
      </section>
    </>
  );
}

function PermissionManagementPage({ users, savingId, onSave }) {
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    setDrafts(Object.fromEntries(users.map((user) => [user.id, user.pageAccess || []])));
  }, [users]);

  function togglePage(userId, page, checked) {
    setDrafts((current) => {
      const selected = new Set(current[userId] || []);
      if (checked) selected.add(page);
      else selected.delete(page);
      return { ...current, [userId]: [...selected] };
    });
  }

  return (
    <section className="permission-page">
      <div className="section-heading-row">
        <h2>权限管理</h2>
        <span className="section-count">注册用户 {users.length} 个</span>
      </div>
      <DataTable
        className="permission-table"
        rows={users}
        columns={['用户', '角色', '可访问页面', '操作']}
        render={(targetUser) => {
          const selected = drafts[targetUser.id] || [];
          const isBuiltInAdmin = targetUser.name === DEFAULT_ADMIN_USER.name;
          return [
            targetUser.name,
            targetUser.role,
            <div className="permission-checkbox-grid">
              {PAGE_OPTIONS.map((page) => (
                <label key={page.tab} className="permission-checkbox">
                  <input
                    type="checkbox"
                    checked={selected.includes(page.tab)}
                    disabled={isBuiltInAdmin}
                    onChange={(event) => togglePage(targetUser.id, page.tab, event.target.checked)}
                  />
                  <span>{page.label}</span>
                </label>
              ))}
            </div>,
            <button
              type="button"
              className="compact-button"
              disabled={savingId === targetUser.id || isBuiltInAdmin}
              onClick={() => onSave(targetUser, selected)}
            >
              保存授权
            </button>
          ];
        }}
      />
    </section>
  );
}

function MetricCard({ label, value }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

function DataTable({ rows, columns, render, className = '' }) {
  return (
    <div className={`table-wrap ${className}`}>
      <table>
        <thead><tr>{columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length} className="empty">暂无数据</td></tr>}
          {rows.map((row) => (
            <tr key={row.id || `${row.name}-${row.rowNumber}`}>
              {render(row).map((cell, index) => <td key={index}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
