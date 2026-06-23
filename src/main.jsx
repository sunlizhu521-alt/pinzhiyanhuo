import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = import.meta.env.DEV ? 'http://localhost:4002' : '';
const STATIC_MODE = import.meta.env.VITE_STATIC_MODE === '1';
const STATIC_DB_KEY = 'qualityInspectionStaticDb';
const DIMENSION_LIBRARY_KEY = 'qualityInspectionDimensionLibrary';
const REPORT_FILE_LIBRARY_KEY = 'qualityInspectionReportFileLibrary';
const AUTH_USER_KEY = 'qualityInspectionUser';
const QUALITY_SEAL_IMAGE = `${import.meta.env.BASE_URL}assets/quality-seal.png`;
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

const BUSINESS_DEPARTMENT_OPTIONS = ['全球招商事业部', '海外事业一部', '海外事业二部', '国内事业部', '其他'];

const NOTICE_FIELDS = [
  { key: 'inspectionApplicant', label: '验货填写人', readonly: true },
  { key: 'inspectionNotifier', label: '验货通知人' },
  { key: 'inspectionFillTime', label: '验货填写时间', type: 'date' },
  { key: 'supplierFinishTime', label: '供应商完工时间', type: 'date' },
  { key: 'shipmentTime', label: '可验货时间', type: 'date' },
  { key: 'kingdeeOrderNo', label: '金蝶采购订单' },
  { key: 'supplierShortName', label: '供应商简称' },
  { key: 'supplierAddress', label: '供应商地址' },
  { key: 'businessDepartments', label: '事业部', options: BUSINESS_DEPARTMENT_OPTIONS },
  { key: 'operation', label: '运营' },
  { key: 'firstInspection', label: '是否首批验货', options: ['是', '否'] },
  { key: 'salesProductLine', label: '产品线' },
  { key: 'series', label: '系列' },
  { key: 'totalQuantity', label: '合计数量' },
  { key: 'skuQuantity', label: 'SKU及数量', multiline: true },
  { key: 'remark', label: '备注', multiline: true }
];

const NOTICE_IMPORT_ALIASES = {
  inspectionApplicant: ['验货填写人', '填写人', '申请人', '提报人'],
  inspectionNotifier: ['验货通知人', '通知人', '验货联系人', '联系人'],
  inspectionFillTime: ['验货填写时间', '填写时间', '申请时间', '提报时间', '通知时间'],
  supplierFinishTime: ['供应商完工时间', '完工时间', '供应商完成时间'],
  shipmentTime: ['可验货时间', '发货时间', '出货时间', '计划发货时间'],
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
  actualInspector: ['实际验货人', '实际检验员'],
  inspectionMethod: ['验货方式', '检验方式'],
  inspectionQuantity: ['实际验货数量', '验货数量', '检验数量'],
  qualifiedQuantity: ['验货合格数量', '合格数量', '检验合格数量'],
  issueLevel: ['问题等级', '异常等级'],
  issueCategoryPrimary: ['问题分类', '一级问题分类', '问题大类'],
  feedbackText: ['问题反馈', '反馈内容', '问题描述', '验货反馈']
};

const FEEDBACK_IMPORT_ALIASES = {
  actualInspectionTime: ['实际验货时间', '验货时间', '实际检验时间', '检验时间'],
  inspectionMethod: ['验货方式', '检验方式'],
  inspectionQuantity: ['实际验货数量', '验货数量', '检验数量'],
  qualifiedQuantity: ['验货合格数量', '合格数量', '检验合格数量'],
  result: ['验货结果', '检验结果', '反馈结果'],
  issueLevel: ['问题等级', '异常等级'],
  issueCategoryPrimary: ['问题分类', '一级问题分类', '问题大类'],
  feedbackText: ['问题反馈', '反馈内容', '问题描述', '验货反馈'],
  actualInspector: ['实际验货人', '实际检验人']
};

const MENU_PAGES = [
  { tab: 'inspectionNotice', label: '验货通知' },
  { tab: 'inspectionSchedule', label: '验货安排' },
  { tab: 'inspectionFeedback', label: '验货反馈' },
  { tab: 'inspectionStamp', label: '加盖检验章' },
  { tab: 'inspectionReportQuery', label: '查询检验单' },
  { tab: 'inspectionSummary', label: '验货反馈表' },
  { tab: 'inspectionLedger', label: '验货台账' },
  { tab: 'dimensionLibrary', label: '维度表文件库' },
  { tab: 'inspectionReportLibrary', label: '报告单文件库' },
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
  [ROLE_SETTLEMENT]: ['inspectionReportQuery', 'inspectionSummary', 'inspectionLedger'],
  [ROLE_USER]: []
};

function normalizePageAccessList(pageAccess = []) {
  const allowedPages = new Set(PAGE_OPTIONS.map((page) => page.tab));
  const normalized = [...new Set((Array.isArray(pageAccess) ? pageAccess : [])
    .filter((page) => allowedPages.has(page)))];
  if (normalized.includes('inspectionSummary') && !normalized.includes('inspectionLedger')) {
    normalized.push('inspectionLedger');
  }
  return normalized;
}

function canAccessPage(user, tab) {
  if (!user) return false;
  const access = normalizePageAccessList(Array.isArray(user.pageAccess) ? user.pageAccess : (ROLE_PAGE_ACCESS[user.role] || []));
  return access.includes(tab);
}

function homeTabForUser(user) {
  const access = normalizePageAccessList(Array.isArray(user?.pageAccess) ? user.pageAccess : (ROLE_PAGE_ACCESS[user?.role] || []));
  return access.find((tab) => MENU_PAGES.some((page) => page.tab === tab)) || '';
}

function isAdminUser(user) {
  return user?.role === ROLE_ADMIN;
}

function isPrimaryAdminUser(user) {
  return user?.id === DEFAULT_ADMIN_USER.id || user?.name === DEFAULT_ADMIN_USER.name;
}

function isSubmittedScheduleRecord(record) {
  return normalize(record.schedule?.status) === '已安排' && normalize(record.schedule?.inspector);
}

function canReadClientRecord(user, record) {
  if (!user) return false;
  if (
    user.role === ROLE_ADMIN
    || canAccessPage(user, 'inspectionReportQuery')
    || canAccessPage(user, 'inspectionSummary')
    || canAccessPage(user, 'inspectionLedger')
    || canAccessPage(user, 'inspectionSchedule')
    || canAccessPage(user, 'inspectionStamp')
    || canAccessPage(user, 'inspectionReportLibrary')
  ) return true;
  if (canAccessPage(user, 'inspectionNotice')) return record.inspectionApplicant === user.name;
  if (canAccessPage(user, 'inspectionFeedback')) {
    return isSubmittedScheduleRecord(record);
  }
  return false;
}

const DIMENSION_LIBRARY_SLOTS = [
  { id: 'dimension-slot-1', title: '商品分类维表' },
  { id: 'dimension-slot-2', title: '采购分工明细' },
  { id: 'dimension-slot-3', title: '维度表槽位 3' },
  { id: 'dimension-slot-4', title: '维度表槽位 4' }
];
const PRODUCT_CATEGORY_SLOT_ID = 'dimension-slot-1';
const PURCHASE_WORK_DIVISION_SLOT_ID = 'dimension-slot-2';
const DIMENSION_SUPPLIER_ALIASES = ['产品线明细供应商', '供应商简称', '供应商', '供应商名称', '厂家简称', '厂商简称', '工厂简称'];
const DIMENSION_ADDRESS_ALIASES = ['产品线明细地址', '供应商地址', '验货地址', '工厂地址', '详细地址', '地址', '所在地'];
const DIMENSION_PROVINCE_ALIASES = ['省', '省份', '所在省', '省区'];
const DIMENSION_CITY_ALIASES = ['市', '城市', '所在市', '地市'];
const SALES_PRODUCT_LINE_ALIASES = ['销售产品线', '产品线', '一级产品线'];
const SALES_SERIES_ALIASES = ['销售系列', '系列', '产品系列'];

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createNoticeRow(values = {}) {
  const row = NOTICE_FIELDS.reduce((current, field) => ({
    ...current,
    [field.key]: values[field.key] || ''
  }), {
    id: values.id || createId()
  });
  if (values.importSource) row.importSource = values.importSource;
  return row;
}

function normalize(value) {
  return String(value ?? '').trim();
}

function fixMojibakeText(value) {
  const text = normalize(value);
  if (!/[ÃÂÄÅéèç¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿]/.test(text)) return text;
  try {
    const decoded = decodeURIComponent(Array.from(text)
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0').slice(-2)}`)
      .join(''));
    return /[\u4e00-\u9fff]/.test(decoded) ? decoded : text;
  } catch {
    return text;
  }
}

function normalizeHeader(value) {
  return normalize(value).replace(/\s+/g, '').toLowerCase();
}

function splitMultiValue(value) {
  return normalize(value)
    .split(/[、,，;；/|]+/)
    .map(normalize)
    .filter(Boolean);
}

function normalizeBusinessDepartment(value) {
  const text = normalize(value);
  if (text === '海外事业部一部') return '海外事业一部';
  if (text === '海外事业部二部') return '海外事业二部';
  return BUSINESS_DEPARTMENT_OPTIONS.includes(text) ? text : text;
}

function joinBusinessDepartments(values) {
  const seen = new Set();
  const items = values.map(normalizeBusinessDepartment).filter(Boolean);
  const ordered = [
    ...BUSINESS_DEPARTMENT_OPTIONS.filter((option) => items.includes(option)),
    ...items.filter((item) => !BUSINESS_DEPARTMENT_OPTIONS.includes(item))
  ];
  return ordered.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  }).join('、');
}

function parseQuantity(value) {
  const text = normalize(value).replace(/,/g, '');
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function formatQuantity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(4)));
}

function formatCompactDate(value) {
  return formatDate(value).replace(/-/g, '');
}

function chineseInitial(char) {
  const text = normalize(char);
  if (!text) return '';
  if (/^[a-z0-9]$/i.test(text)) return text.toUpperCase();
  const letters = 'ABCDEFGHJKLMNOPQRSTWXYZ';
  const boundaries = '阿芭擦搭蛾发噶哈击喀垃妈拿哦啪期然撒塌挖昔压匝';
  for (let index = boundaries.length - 1; index >= 0; index -= 1) {
    if (text.localeCompare(boundaries[index], 'zh-Hans-CN') >= 0) return letters[index] || '';
  }
  return '';
}

function supplierInitials(value) {
  return Array.from(normalize(value))
    .map(chineseInitial)
    .filter(Boolean)
    .join('');
}

function uniqueValues(values) {
  const seen = new Set();
  return values.map(normalize).filter(Boolean).filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function feedbackReportNo(record, actualInspectionTime, inspectionQuantity) {
  const actualTime = normalize(actualInspectionTime);
  const quantity = normalize(inspectionQuantity);
  if (!actualTime || !quantity) return '';
  return [
    supplierInitials(record.supplierShortName),
    formatCompactDate(actualTime),
    normalize(record.series),
    quantity
  ].filter(Boolean).join('-');
}

function mergeScheduleRecords(records = []) {
  const groups = new Map();
  records.forEach((record) => {
    const key = normalize(record.series) || record.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  return Array.from(groups.values()).map((group) => {
    const first = group[0] || {};
    const totalQuantity = group.reduce((sum, record) => sum + (parseQuantity(record.totalQuantity) || 0), 0);
    const hasQuantity = group.some((record) => parseQuantity(record.totalQuantity) !== null);
    const businessDepartments = uniqueValues(group.flatMap((record) => splitMultiValue(record.businessDepartments)));
    const remarks = uniqueValues(group.map((record) => record.remark));
    const quantityDetail = group
      .map((record) => {
        const departments = splitMultiValue(record.businessDepartments);
        const departmentText = departments.length ? joinBusinessDepartments(departments) : '未填写事业部';
        const quantity = parseQuantity(record.totalQuantity);
        return quantity === null ? '' : `${departmentText}${formatQuantity(quantity)}`;
      })
      .filter(Boolean)
      .join('；');
    const mergedRemarkParts = [...remarks];
    if (group.length > 1 && quantityDetail) mergedRemarkParts.push(`合并验货：${quantityDetail}`);
    const merged = {
      ...first,
      id: first.id,
      sourceIds: group.map((record) => record.id),
      sourceCount: group.length,
      totalQuantity: hasQuantity ? formatQuantity(totalQuantity) : normalize(first.totalQuantity),
      businessDepartments: businessDepartments.join('/'),
      remark: mergedRemarkParts.join('；'),
      schedule: first.schedule || {},
      report: { ...(first.report || {}) }
    };
    return merged;
  });
}

function mergeFeedbackRecords(records = []) {
  const groups = new Map();
  records.forEach((record) => {
    const keyParts = [normalizeHeader(record.supplierShortName), normalizeHeader(record.series)];
    const key = keyParts.some(Boolean) ? keyParts.join('|') : record.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  return Array.from(groups.values()).map((group) => {
    const first = group[0] || {};
    const totalQuantity = group.reduce((sum, record) => sum + (parseQuantity(record.totalQuantity) || 0), 0);
    const hasQuantity = group.some((record) => parseQuantity(record.totalQuantity) !== null);
    const businessDepartments = uniqueValues(group.flatMap((record) => splitMultiValue(record.businessDepartments)));
    const remarks = uniqueValues(group.map((record) => record.remark));
    const operations = uniqueValues(group.map((record) => record.operation));
    const firstInspections = uniqueValues(group.map((record) => record.firstInspection));
    const inspectors = uniqueValues(group.map((record) => record.schedule?.inspector));
    const quantityDetail = group
      .map((record) => {
        const departments = splitMultiValue(record.businessDepartments);
        const departmentText = departments.length ? joinBusinessDepartments(departments) : '未填写事业部';
        const quantity = parseQuantity(record.totalQuantity);
        return quantity === null ? '' : `${departmentText}${formatQuantity(quantity)}个`;
      })
      .filter(Boolean)
      .join('+');
    const mergedRemarkParts = [];
    const originalRemark = remarks.join('+');
    if (originalRemark) mergedRemarkParts.push(originalRemark);
    if (group.length > 1 && quantityDetail) mergedRemarkParts.push(`合并：${quantityDetail}`);
    const feedbackSource = group.find((record) => hasObjectValue(record.feedback)) || first;
    const reportSource = group.find((record) => reportHref(record)) || first;
    return {
      ...first,
      id: first.id,
      sourceIds: group.map((record) => record.id),
      sourceCount: group.length,
      totalQuantity: hasQuantity ? formatQuantity(totalQuantity) : normalize(first.totalQuantity),
      businessDepartments: businessDepartments.join('/'),
      operation: operations.join('/'),
      firstInspection: firstInspections.join('/'),
      remark: mergedRemarkParts.join('+'),
      schedule: {
        ...(first.schedule || {}),
        inspector: inspectors.join('/')
      },
      report: { ...(reportSource.report || {}) },
      feedback: { ...(feedbackSource.feedback || {}) }
    };
  });
}

const NOTICE_IMPORT_MERGE_KEYS = [
  'inspectionApplicant',
  'inspectionNotifier',
  'inspectionFillTime',
  'supplierFinishTime',
  'shipmentTime',
  'kingdeeOrderNo',
  'supplierShortName',
  'supplierAddress',
  'operation',
  'firstInspection',
  'salesProductLine',
  'series',
  'skuQuantity'
];

const NOTICE_OPTIONAL_KEYS = new Set(['skuQuantity', 'remark']);

function noticeImportMergeKey(row) {
  if (!normalize(row.series)) return `${row.id || createId()}`;
  return NOTICE_IMPORT_MERGE_KEYS.map((key) => normalize(row[key])).join('\u0001');
}

function mergeNoticeRowsForImport(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = noticeImportMergeKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  return Array.from(groups.values()).map((group) => {
    const first = group[0] || {};
    const quantityTotal = group.reduce((sum, row) => sum + (parseQuantity(row.totalQuantity) || 0), 0);
    const hasQuantity = group.some((row) => parseQuantity(row.totalQuantity) !== null);
    const remarks = new Set();
    const departmentQuantityMap = new Map();
    const departmentValues = [];

    group.forEach((row) => {
      if (normalize(row.remark)) remarks.add(normalize(row.remark));
      const departments = splitMultiValue(row.businessDepartments);
      departmentValues.push(...departments);
      const quantity = parseQuantity(row.totalQuantity);
      const departmentKey = departments.length ? joinBusinessDepartments(departments) : '未填写事业部';
      if (quantity !== null) {
        departmentQuantityMap.set(departmentKey, (departmentQuantityMap.get(departmentKey) || 0) + quantity);
      }
    });

    const departmentQuantityText = Array.from(departmentQuantityMap.entries())
      .map(([department, quantity]) => `${department}${formatQuantity(quantity)}`)
      .join('；');
    const remarkParts = [...remarks];
    if (group.length > 1 && departmentQuantityText && !remarkParts.some((part) => part.includes('事业部数量：'))) {
      remarkParts.push(`事业部数量：${departmentQuantityText}`);
    }

    return {
      ...first,
      id: first.id || createId(),
      businessDepartments: departmentValues[0] || normalize(first.businessDepartments),
      totalQuantity: hasQuantity ? formatQuantity(quantityTotal) : normalize(first.totalQuantity),
      remark: remarkParts.join('；')
    };
  });
}

function normalizeSupplierKey(value) {
  return normalizeHeader(value)
    .replace(/有限责任公司|股份有限公司|有限公司|公司|工厂|厂/g, '');
}

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function excelSerialDateToIso(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial <= 0) return '';
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(date.getUTCDate())}`;
}

function formatDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${padDatePart(value.getMonth() + 1)}-${padDatePart(value.getDate())}`;
  }
  const text = normalize(value);
  if (!text) return '';
  const iso = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (iso) return `${iso[1]}-${padDatePart(iso[2])}-${padDatePart(iso[3])}`;
  const shortYear = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (shortYear) {
    const year = Number(shortYear[3]);
    return `20${padDatePart(year)}-${padDatePart(shortYear[1])}-${padDatePart(shortYear[2])}`;
  }
  const slash = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (slash) return `${slash[3]}-${padDatePart(slash[1])}-${padDatePart(slash[2])}`;
  if (/^\d{5}(\.\d+)?$/.test(text)) return excelSerialDateToIso(text);
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${padDatePart(parsed.getMonth() + 1)}-${padDatePart(parsed.getDate())}`;
  }
  return text.slice(0, 10);
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
      feedback: {},
      dimensionLibrary: {}
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
      const pageAccess = normalizePageAccessList(Array.isArray(user.pageAccess)
        ? user.pageAccess
        : (ROLE_PAGE_ACCESS[role] || []));
      return { ...user, id: user.id || createId(), role, pageAccess };
    }),
    qualityInspection: {
      initialData: { ...fallback.qualityInspection.initialData, ...(inspection.initialData || {}) },
      notices: { ...fallback.qualityInspection.notices, ...(inspection.notices || {}) },
      schedules: inspection.schedules || {},
      reports: inspection.reports || {},
      feedback: inspection.feedback || {},
      dimensionLibrary: inspection.dimensionLibrary || {}
    }
  };
}

function normalizeDimensionLibrary(library = {}) {
  return DIMENSION_LIBRARY_SLOTS.reduce((normalized, slot) => ({
    ...normalized,
    [slot.id]: library[slot.id] ? {
      ...library[slot.id],
      fileName: fixMojibakeText(library[slot.id].fileName)
    } : null
  }), {});
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
    return normalizeDimensionLibrary(saved);
  } catch {
    return normalizeDimensionLibrary();
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

function clearDimensionLibraryCache() {
  try {
    localStorage.removeItem(DIMENSION_LIBRARY_KEY);
  } catch {
    // Ignore unavailable browser storage.
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

function readStoredUser() {
  const storage = STATIC_MODE ? localStorage : sessionStorage;
  if (!STATIC_MODE) localStorage.removeItem(AUTH_USER_KEY);
  try {
    return JSON.parse(storage.getItem(AUTH_USER_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveStoredUser(user) {
  const storage = STATIC_MODE ? localStorage : sessionStorage;
  if (!STATIC_MODE) localStorage.removeItem(AUTH_USER_KEY);
  storage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearStoredUser() {
  localStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
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

let xlsxModulePromise = null;

function loadXlsxModule() {
  if (!xlsxModulePromise) xlsxModulePromise = import('xlsx');
  return xlsxModulePromise;
}

function parseWorkbookInBrowser(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = async () => {
      try {
        const XLSX = await loadXlsxModule();
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

function exportFileStamp() {
  return nowText().replace(/[-:\s]/g, '').slice(0, 12);
}

async function exportRowsToWorkbook(rows, sheetName, fileName) {
  if (!rows.length) return false;
  const XLSX = await loadXlsxModule();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
  return true;
}

function recordToMigrationLedgerRow(record, index = 0) {
  return {
    '序号': record.rowNumber || index + 1,
    '验货填写人': record.inspectionApplicant || '',
    '验货通知人': record.inspectionNotifier || '',
    '验货填写时间': formatDate(record.inspectionFillTime),
    '供应商完工时间': formatDate(record.supplierFinishTime),
    '可验货时间': formatDate(record.shipmentTime),
    '金蝶采购订单': record.kingdeeOrderNo || '',
    '供应商简称': record.supplierShortName || '',
    '供应商地址': record.supplierAddress || '',
    '事业部': record.businessDepartments || '',
    '运营': record.operation || '',
    '是否首批验货': record.firstInspection || '',
    '产品线': record.salesProductLine || '',
    '系列': record.series || '',
    '合计数量': record.totalQuantity || '',
    'SKU及数量': record.skuQuantity || '',
    '备注': record.remark || '',
    '计划验货时间': formatDate(record.schedule?.scheduledDate),
    '状态': record.schedule?.status || '',
    '验货员': record.schedule?.inspector || '',
    '安排备注': record.schedule?.remark || '',
    '报告单号': record.report?.reportNo || '',
    '报告文件名': record.report?.originalName || record.report?.fileName || '',
    '报告文件链接': reportHref(record),
    '报告结论': record.report?.conclusion || '',
    '实际验货时间': formatDate(record.feedback?.actualInspectionTime),
    '实际检验员': record.feedback?.actualInspector || record.schedule?.inspector || '',
    '验货方式': record.feedback?.inspectionMethod || '',
    '实际验货数量': record.feedback?.inspectionQuantity || '',
    '验货合格数量': record.feedback?.qualifiedQuantity || '',
    '验货结果': record.feedback?.result || '',
    '问题等级': record.feedback?.issueLevel || '',
    '问题分类': record.feedback?.issueCategoryPrimary || '',
    '问题反馈': record.feedback?.feedbackText || ''
  };
}

function recordToReportExportRow(record, index = 0) {
  return {
    '序号': index + 1,
    '供应商': record.supplierShortName || '',
    '产品线': record.salesProductLine || '',
    '系列': record.series || '',
    '实际验货时间': formatDate(record.feedback?.actualInspectionTime),
    '实际检验员': record.feedback?.actualInspector || record.schedule?.inspector || '',
    '报告单号': record.report?.reportNo || '',
    '报告文件': record.report?.originalName || record.report?.fileName || '',
    '报告文件链接': reportHref(record),
    '验货结果': record.feedback?.result || '',
    '事业部': record.businessDepartments || '',
    '金蝶采购订单': record.kingdeeOrderNo || '',
    '数量': record.totalQuantity || '',
    '来源': record.reportLibrarySource ? '报告单文件库历史检验单' : '验货流程记录'
  };
}

function parseWorkbookSheetsInBrowser(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = async () => {
      try {
        const XLSX = await loadXlsxModule();
        const workbook = XLSX.read(reader.result, { type: 'array', cellDates: true });
        const sheets = workbook.SheetNames.map((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          return parseDimensionSheet(sheetName, sheet, XLSX);
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

function scoreDimensionHeaderRow(row = []) {
  const cells = row.map(normalize).filter(Boolean);
  if (!cells.length) return -1;
  const uniqueCount = new Set(cells.map(normalizeHeader)).size;
  const keywordScore = cells.reduce((score, cell) => {
    const header = normalizeHeader(cell);
    if (['供应商', '供应商简称', '供应商名称', '产品线明细供应商', '销售产品线', '销售系列', '产品线', '系列', '商品分类', '分类', '地址', '省', '市', '采购', '运营'].some((keyword) => header.includes(normalizeHeader(keyword)))) {
      return score + 3;
    }
    return score;
  }, 0);
  return uniqueCount + keywordScore + Math.min(cells.length, 12);
}

function parseDimensionSheet(sheetName, sheet, XLSX) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const candidateRows = matrix.slice(0, 10);
  const scored = candidateRows
    .map((row, index) => ({ index, score: scoreDimensionHeaderRow(row) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);
  const headerIndex = scored[0]?.index ?? -1;
  if (headerIndex === -1) {
    return { sheetName, columns: [], rows: [], importedCount: 0, headerRow: 0 };
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
  return { sheetName, columns, rows, importedCount: rows.length, headerRow: headerIndex + 1 };
}

function normalizedSourceMap(sourceRow = {}) {
  const normalizedSource = new Map();
  Object.entries(sourceRow || {}).forEach(([key, value]) => {
    if (key === 'id' || key === '__cells') return;
    normalizedSource.set(normalizeHeader(key), value);
  });
  return normalizedSource;
}

function extractProvinceCityFromAddress(address) {
  const text = normalize(address).replace(/\s+/g, '');
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
    const normalizedProvince = normalize(province);
    const normalizedCity = normalize(city);
    return normalizedCity && !normalizedProvince.includes(normalizedCity)
      ? `${normalizedProvince}${normalizedCity}`
      : normalizedProvince || normalizedCity;
  }
  return extractProvinceCityFromAddress(readImportedValue(normalizedSource, DIMENSION_ADDRESS_ALIASES));
}

function buildSupplierProvinceCityLookup(dimensionLibrary = {}) {
  const record = dimensionLibrary[PURCHASE_WORK_DIVISION_SLOT_ID];
  const lookup = new Map();
  const indexedRows = Array.isArray(record?.supplierAddressLookup) ? record.supplierAddressLookup : [];
  indexedRows.forEach((item) => {
    const supplier = normalize(item.supplierShortName || item.supplier || '');
    const address = normalize(item.provinceCity || item.address || '');
    if (!supplier || !address) return;
    lookup.set(normalizeHeader(supplier), address);
    lookup.set(normalizeSupplierKey(supplier), address);
  });
  const sheets = Array.isArray(record?.sheets) ? record.sheets : [];
  sheets.forEach((sheet) => {
    (sheet.rows || []).forEach((row) => {
      const normalizedSource = normalizedSourceMap(row);
      const supplier = readImportedValue(normalizedSource, DIMENSION_SUPPLIER_ALIASES);
      const provinceCity = provinceCityFromDimensionRow(row);
      if (!supplier || !provinceCity) return;
      lookup.set(normalizeHeader(supplier), provinceCity);
      lookup.set(normalizeSupplierKey(supplier), provinceCity);
    });
  });
  return lookup;
}

function supplierProvinceCityForName(supplierShortName, dimensionLibrary = {}) {
  const lookup = buildSupplierProvinceCityLookup(dimensionLibrary);
  const supplierKey = normalizeSupplierKey(supplierShortName) || normalizeHeader(supplierShortName);
  return lookup.get(supplierKey) || lookup.get(normalizeHeader(supplierShortName)) || '';
}

function addSupplierOption(options, supplier) {
  const value = normalize(supplier);
  if (!value) return;
  const key = normalizeSupplierKey(value) || normalizeHeader(value);
  if (!key || options.has(key)) return;
  options.set(key, value);
}

function buildSupplierShortNameOptions(dimensionLibrary = {}) {
  const record = dimensionLibrary[PURCHASE_WORK_DIVISION_SLOT_ID];
  const options = new Map();
  const indexedRows = Array.isArray(record?.supplierAddressLookup) ? record.supplierAddressLookup : [];
  indexedRows.forEach((item) => addSupplierOption(options, item.supplierShortName || item.supplier));
  const sheets = Array.isArray(record?.sheets) ? record.sheets : [];
  sheets.forEach((sheet) => {
    (sheet.rows || []).forEach((row) => {
      const normalizedSource = normalizedSourceMap(row);
      addSupplierOption(options, readImportedValue(normalizedSource, DIMENSION_SUPPLIER_ALIASES));
    });
  });
  return Array.from(options.values()).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function supplierMatchesQuery(supplier, query) {
  const supplierText = normalizeHeader(supplier);
  const supplierKey = normalizeSupplierKey(supplier);
  const queryText = normalizeHeader(query);
  const queryKey = normalizeSupplierKey(query);
  if (!queryText) return true;
  return supplierText.includes(queryText)
    || (queryKey && supplierKey.includes(queryKey))
    || queryText.includes(supplierText)
    || (queryKey && supplierKey && queryKey.includes(supplierKey));
}

function findSupplierShortNameOption(value, supplierOptions = []) {
  const text = normalize(value);
  if (!text) return '';
  const header = normalizeHeader(text);
  const key = normalizeSupplierKey(text) || header;
  return supplierOptions.find((supplier) => normalizeHeader(supplier) === header)
    || supplierOptions.find((supplier) => normalizeSupplierKey(supplier) === key)
    || '';
}

function addDimensionOption(options, value) {
  const text = normalize(value);
  if (!text) return;
  const key = normalizeHeader(text);
  if (!key || options.has(key)) return;
  options.set(key, text);
}

function buildDimensionValueOptionsFromSheets(sheets = [], aliases = []) {
  const options = new Map();
  sheets.forEach((sheet) => {
    (sheet.rows || []).forEach((row) => {
      const normalizedSource = normalizedSourceMap(row);
      addDimensionOption(options, readImportedValue(normalizedSource, aliases));
    });
  });
  return Array.from(options.values()).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function buildDimensionValueOptions(dimensionLibrary = {}, slotId, aliases = [], cacheKey = '') {
  const record = dimensionLibrary[slotId] || {};
  const cached = Array.isArray(record?.[cacheKey]) ? record[cacheKey] : [];
  const options = new Map();
  cached.forEach((item) => addDimensionOption(options, item));
  buildDimensionValueOptionsFromSheets(Array.isArray(record?.sheets) ? record.sheets : [], aliases)
    .forEach((item) => addDimensionOption(options, item));
  if (Array.isArray(record?.rows) && record.rows.length) {
    buildDimensionValueOptionsFromSheets([{ rows: record.rows }], aliases)
      .forEach((item) => addDimensionOption(options, item));
  }
  return Array.from(options.values()).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function addSeriesByProductLineOption(groups, productLine, series) {
  const productLineText = normalize(productLine);
  const seriesText = normalize(series);
  if (!productLineText || !seriesText) return;
  const key = normalizeHeader(productLineText);
  if (!key) return;
  if (!groups.has(key)) groups.set(key, new Map());
  addDimensionOption(groups.get(key), seriesText);
}

function buildSeriesByProductLineOptionsFromSheets(sheets = []) {
  const groups = new Map();
  sheets.forEach((sheet) => {
    (sheet.rows || []).forEach((row) => {
      const normalizedSource = normalizedSourceMap(row);
      addSeriesByProductLineOption(
        groups,
        readImportedValue(normalizedSource, SALES_PRODUCT_LINE_ALIASES),
        readImportedValue(normalizedSource, SALES_SERIES_ALIASES)
      );
    });
  });
  return Object.fromEntries(
    Array.from(groups.entries()).map(([key, options]) => [
      key,
      Array.from(options.values()).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    ])
  );
}

function mergeSeriesByProductLineOptions(target, source = {}) {
  Object.entries(source || {}).forEach(([productLine, seriesList]) => {
    const key = normalizeHeader(productLine);
    if (!key || !Array.isArray(seriesList)) return;
    if (!target.has(key)) target.set(key, new Map());
    seriesList.forEach((series) => addDimensionOption(target.get(key), series));
  });
}

function buildSeriesByProductLineOptions(dimensionLibrary = {}) {
  const record = dimensionLibrary[PRODUCT_CATEGORY_SLOT_ID] || {};
  const groups = new Map();
  mergeSeriesByProductLineOptions(groups, record.seriesByProductLine || {});
  mergeSeriesByProductLineOptions(
    groups,
    buildSeriesByProductLineOptionsFromSheets(Array.isArray(record?.sheets) ? record.sheets : [])
  );
  if (Array.isArray(record?.rows) && record.rows.length) {
    mergeSeriesByProductLineOptions(groups, buildSeriesByProductLineOptionsFromSheets([{ rows: record.rows }]));
  }
  return Object.fromEntries(
    Array.from(groups.entries()).map(([key, options]) => [
      key,
      Array.from(options.values()).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    ])
  );
}

function seriesOptionsForProductLine(productLine, allSeriesOptions = [], seriesByProductLine = {}) {
  const key = normalizeHeader(productLine);
  if (!key) return allSeriesOptions;
  const scoped = Array.isArray(seriesByProductLine[key]) ? seriesByProductLine[key] : [];
  return scoped.length ? scoped : allSeriesOptions;
}

function buildCategoryDimensionOptions(sheets = []) {
  return {
    salesProductLines: buildDimensionValueOptionsFromSheets(sheets, SALES_PRODUCT_LINE_ALIASES),
    salesSeries: buildDimensionValueOptionsFromSheets(sheets, SALES_SERIES_ALIASES),
    seriesByProductLine: buildSeriesByProductLineOptionsFromSheets(sheets)
  };
}

function buildSalesProductLineOptions(dimensionLibrary = {}) {
  return buildDimensionValueOptions(dimensionLibrary, PRODUCT_CATEGORY_SLOT_ID, SALES_PRODUCT_LINE_ALIASES, 'salesProductLines');
}

function buildSalesSeriesOptions(dimensionLibrary = {}) {
  return buildDimensionValueOptions(dimensionLibrary, PRODUCT_CATEGORY_SLOT_ID, SALES_SERIES_ALIASES, 'salesSeries');
}

function findDimensionOption(value, options = []) {
  const text = normalize(value);
  if (!text) return '';
  const key = normalizeHeader(text);
  return options.find((option) => normalizeHeader(option) === key) || '';
}

function normalizeRecordDimensions(record, supplierOptions = [], productLineOptions = [], seriesOptions = [], dimensionLibrary = {}) {
  const supplierShortName = findSupplierShortNameOption(record.supplierShortName, supplierOptions) || record.supplierShortName;
  const salesProductLine = findDimensionOption(record.salesProductLine, productLineOptions) || record.salesProductLine;
  const series = findDimensionOption(record.series, seriesOptions) || record.series;
  return {
    ...record,
    supplierShortName,
    supplierAddress: supplierProvinceCityForName(supplierShortName, dimensionLibrary) || record.supplierAddress,
    businessDepartments: joinBusinessDepartments(splitMultiValue(record.businessDepartments)),
    salesProductLine,
    series
  };
}

function normalizeNoticeDimensions(row, supplierOptions, productLineOptions, seriesOptions, dimensionLibrary) {
  const supplierShortName = findSupplierShortNameOption(row.supplierShortName, supplierOptions) || normalize(row.supplierShortName);
  const salesProductLine = findDimensionOption(row.salesProductLine, productLineOptions) || normalize(row.salesProductLine);
  const series = findDimensionOption(row.series, seriesOptions) || normalize(row.series);
  return {
    ...row,
    supplierShortName,
    businessDepartments: joinBusinessDepartments(splitMultiValue(row.businessDepartments)),
    salesProductLine,
    series,
    supplierAddress: supplierProvinceCityForName(supplierShortName, dimensionLibrary)
  };
}

function validateNoticeRows(rows, supplierOptions = [], productLineOptions = [], seriesOptions = []) {
  if (!supplierOptions.length) {
    return '请先在维度表文件库上传并应用“采购分工明细”，系统需要从里面读取供应商简称。';
  }
  if (!productLineOptions.length || !seriesOptions.length) {
    return '请先在维度表文件库上传并应用“商品分类维表”，系统需要从里面读取销售产品线和销售系列。';
  }
  const requiredFields = NOTICE_FIELDS.filter((field) => !NOTICE_OPTIONAL_KEYS.has(field.key));
  const invalidSupplierIndex = rows.findIndex((row) => !findSupplierShortNameOption(row.supplierShortName, supplierOptions));
  if (invalidSupplierIndex >= 0) {
    return `第 ${invalidSupplierIndex + 1} 行供应商简称不在采购分工明细中，请从模糊匹配结果里选择。`;
  }
  const invalidProductLineIndex = rows.findIndex((row) => !findDimensionOption(row.salesProductLine, productLineOptions));
  if (invalidProductLineIndex >= 0) {
    return `第 ${invalidProductLineIndex + 1} 行产品线不在商品分类维表的销售产品线中，请选择正确产品线。`;
  }
  const invalidSeriesIndex = rows.findIndex((row) => !findDimensionOption(row.series, seriesOptions));
  if (invalidSeriesIndex >= 0) {
    return `第 ${invalidSeriesIndex + 1} 行系列不在商品分类维表的销售系列中，请选择正确系列。`;
  }
  const missingIndex = rows.findIndex((row) => requiredFields.some((field) => !normalize(row[field.key])));
  if (missingIndex >= 0) {
    const missingField = requiredFields.find((field) => !normalize(rows[missingIndex][field.key]));
    return `第 ${missingIndex + 1} 行“${missingField.label}”不能为空，除 SKU及数量、备注 外其余字段都必填。`;
  }
  return '';
}

function buildSupplierAddressLookupRows(sheets = []) {
  const lookup = new Map();
  sheets.forEach((sheet) => {
    (sheet.rows || []).forEach((row) => {
      const normalizedSource = normalizedSourceMap(row);
      const supplier = readImportedValue(normalizedSource, DIMENSION_SUPPLIER_ALIASES);
      const provinceCity = provinceCityFromDimensionRow(row);
      if (!supplier || !provinceCity) return;
      const key = normalizeSupplierKey(supplier) || normalizeHeader(supplier);
      if (!lookup.has(key)) {
        lookup.set(key, {
          supplierShortName: supplier,
          provinceCity,
          sheetName: sheet.sheetName || ''
        });
      }
    });
  });
  return Array.from(lookup.values());
}

function importedRowsToNoticeRows(importedRows, currentUserName, dimensionLibrary = {}) {
  const supplierProvinceCityLookup = buildSupplierProvinceCityLookup(dimensionLibrary);
  return importedRows
    .map((sourceRow) => {
      const normalizedSource = normalizedSourceMap(sourceRow);
      const values = {};
      NOTICE_FIELDS.forEach((field) => {
        const aliases = [field.label, field.key, ...(NOTICE_IMPORT_ALIASES[field.key] || [])];
        const match = aliases
          .map(normalizeHeader)
          .find((alias) => normalizedSource.has(alias));
        const value = match ? normalizedSource.get(match) : '';
        values[field.key] = field.type === 'date' ? formatDate(value) : normalize(value);
      });
      values.inspectionApplicant = currentUserName;
      const supplierKey = normalizeSupplierKey(values.supplierShortName) || normalizeHeader(values.supplierShortName);
      values.supplierAddress = supplierProvinceCityLookup.get(supplierKey) || supplierProvinceCityLookup.get(normalizeHeader(values.supplierShortName)) || '';
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
      const notice = createNoticeRow({ ...noticeValues, importSource: 'summaryImport' });
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
        actualInspector: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.actualInspector),
        inspectionMethod: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.inspectionMethod),
        inspectionQuantity: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.inspectionQuantity),
        qualifiedQuantity: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.qualifiedQuantity),
        issueLevel: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.issueLevel),
        issueCategoryPrimary: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.issueCategoryPrimary),
        feedbackText: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.feedbackText)
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

const REPORT_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const REPORT_LIBRARY_EXTENSIONS = new Set(['.pdf', ...REPORT_IMAGE_EXTENSIONS, '.xlsx', '.xls', '.doc', '.docx']);

function isReportLibraryFile(file) {
  const name = String(file?.name || '').toLowerCase();
  return REPORT_LIBRARY_EXTENSIONS.has(name.match(/\.[^.]+$/)?.[0] || '');
}

function isReportImageFile(file) {
  const name = String(file?.name || '').toLowerCase();
  return REPORT_IMAGE_EXTENSIONS.has(name.match(/\.[^.]+$/)?.[0] || '');
}

async function dataUrlToFile(dataUrl, fileName) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || 'image/png' });
}

function readEntryFiles(entry) {
  if (!entry) return Promise.resolve([]);
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file((file) => resolve([file]), () => resolve([]));
    });
  }
  if (!entry.isDirectory) return Promise.resolve([]);
  const reader = entry.createReader();
  const entries = [];
  return new Promise((resolve) => {
    const readBatch = () => {
      reader.readEntries(async (batch) => {
        if (!batch.length) {
          const nested = await Promise.all(entries.map(readEntryFiles));
          resolve(nested.flat());
          return;
        }
        entries.push(...batch);
        readBatch();
      }, () => resolve([]));
    };
    readBatch();
  });
}

async function reportLibraryFilesFromDrop(dataTransfer) {
  const items = Array.from(dataTransfer?.items || []);
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter(Boolean);
  const files = entries.length
    ? (await Promise.all(entries.map(readEntryFiles))).flat()
    : Array.from(dataTransfer?.files || []);
  return files.filter(isReportLibraryFile);
}

function reportHref(record) {
  if (record.report?.fileDataUrl) return record.report.fileDataUrl;
  if (record.report?.fileUrl) {
    const url = record.report.fileUrl;
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    return `${API}${url}`;
  }
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
  return String(record?.report?.fileName || record?.report?.originalName || record?.report?.fileUrl || '')
    .split('?')[0]
    .match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
}

function isImageReport(record) {
  if (String(record?.report?.fileDataUrl || '').startsWith('data:image/')) return true;
  return REPORT_IMAGE_EXTENSIONS.has(reportFileExt(record));
}

function imageMimeForReport(record) {
  const ext = reportFileExt(record);
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function normalizeStampUploadFileName(nextName, currentName) {
  const current = normalize(currentName);
  const fallbackExt = current.match(/\.[^.]+$/)?.[0] || '.png';
  const raw = normalize(nextName) || current || `stamp-${Date.now()}${fallbackExt}`;
  const ext = raw.match(/\.[^.]+$/)?.[0] || fallbackExt;
  const base = raw.replace(/\.[^.]+$/, '').trim() || `stamp-${Date.now()}`;
  return `${base.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_')}${ext}`;
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

async function renderRotatedReportCanvas(record, rotation, maxSide = 0) {
  const image = await loadImageElement(reportHref(record));
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const swapSize = normalizedRotation === 90 || normalizedRotation === 270;
  const rotatedWidth = swapSize ? image.naturalHeight : image.naturalWidth;
  const rotatedHeight = swapSize ? image.naturalWidth : image.naturalHeight;
  const scale = maxSide && Math.max(rotatedWidth, rotatedHeight) > maxSide
    ? maxSide / Math.max(rotatedWidth, rotatedHeight)
    : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rotatedWidth * scale);
  canvas.height = Math.round(rotatedHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(scale, scale);
  ctx.rotate((normalizedRotation * Math.PI) / 180);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  ctx.restore();
  return canvas;
}

async function createRotatedReportImageDataUrl(record, rotation, options = {}) {
  const canvas = await renderRotatedReportCanvas(record, rotation, options.maxSide || 0);
  return canvas.toDataURL(options.mime || imageMimeForReport(record), options.quality ?? 0.92);
}

async function createStampedImageDataUrl(record, rotation) {
  const canvas = await renderRotatedReportCanvas(record, rotation);
  const ctx = canvas.getContext('2d');
  const stampImage = await loadImageElement(QUALITY_SEAL_IMAGE);
  const sealWidth = Math.round(canvas.width * 0.18);
  const sealHeight = Math.round((stampImage.naturalHeight * sealWidth) / stampImage.naturalWidth);
  const sealCanvas = document.createElement('canvas');
  const angle = (-5 * Math.PI) / 180;
  const extra = Math.ceil(Math.max(sealWidth, sealHeight) * 0.18);
  sealCanvas.width = sealWidth + extra * 2;
  sealCanvas.height = sealHeight + extra * 2;
  const sealCtx = sealCanvas.getContext('2d');
  sealCtx.translate(sealCanvas.width / 2, sealCanvas.height / 2);
  sealCtx.rotate(angle);
  sealCtx.drawImage(stampImage, -sealWidth / 2, -sealHeight / 2, sealWidth, sealHeight);

  const x = canvas.width - sealCanvas.width - Math.round(canvas.width * 0.055);
  const y = canvas.height - sealCanvas.height - Math.round(canvas.height * 0.045);
  ctx.drawImage(sealCanvas, x, y);

  return canvas.toDataURL(imageMimeForReport(record), 0.92);
}

function scoreOcrResult(data = {}) {
  const text = normalize(data.text);
  const meaningfulChars = (text.match(/[\u4e00-\u9fffA-Za-z0-9]/g) || []).length;
  const lineCount = Array.isArray(data.lines) ? data.lines.length : 0;
  return Number(data.confidence || 0) + meaningfulChars * 1.2 + lineCount * 4;
}

async function detectReportTextRotation(record) {
  const { recognize } = await import('tesseract.js');
  const candidates = [0, 90, 180, 270];
  const results = [];
  for (const candidate of candidates) {
    const dataUrl = await createRotatedReportImageDataUrl(record, candidate, {
      maxSide: 1100,
      mime: 'image/png',
      quality: 0.9
    });
    const result = await recognize(dataUrl, 'chi_sim+eng');
    results.push({
      rotation: candidate,
      score: scoreOcrResult(result.data),
      textLength: normalize(result.data?.text).length
    });
  }
  results.sort((a, b) => b.score - a.score);
  const best = results[0] || { rotation: 0, score: 0 };
  const second = results[1] || { score: 0 };
  return {
    rotation: best.rotation,
    confident: best.score >= 18 && best.score - second.score >= 4,
    score: best.score
  };
}

function shouldShowFeedbackRecord(record) {
  if (normalize(record.schedule?.status) !== '已安排') return false;
  const result = normalize(record.feedback?.result);
  if (['通过', '让步', '合格', '让步接收'].includes(result)) return false;
  return !normalize(record.feedback?.actualInspectionTime) || result === '返工';
}

function shouldShowScheduleRecord(record) {
  return !hasObjectValue(record.schedule);
}

function shouldShowSummaryRecord(record) {
  return hasObjectValue(record.feedback) || normalize(record.importSource) === 'summaryImport';
}

function recordIdSignature(rows = []) {
  return rows.map((row) => row.id).filter(Boolean).join('|');
}

const RECORD_REFRESH_PAGES = [
  'inspectionSchedule',
  'inspectionFeedback',
  'inspectionStamp',
  'inspectionReportLibrary',
  'inspectionReportQuery',
  'inspectionSummary',
  'inspectionLedger'
];

const DIMENSION_REFRESH_PAGES = [
  'dimensionLibrary',
  'inspectionNotice',
  'inspectionSchedule',
  'inspectionFeedback',
  'inspectionReportLibrary',
  'inspectionReportQuery',
  'inspectionSummary',
  'inspectionLedger'
];

const REPORT_FILE_REFRESH_PAGES = ['inspectionReportLibrary', 'inspectionReportQuery', 'inspectionStamp'];

function App() {
  const [activeTab, setActiveTab] = useState('inspectionNotice');
  const [authMode, setAuthMode] = useState('login');
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [user, setUser] = useState(readStoredUser);
  const [message, setMessage] = useState('');
  const [appVersionTime, setAppVersionTime] = useState('读取中...');
  const [noticeRows, setNoticeRows] = useState(() => [createNoticeRow()]);
  const [noticeSubmission, setNoticeSubmission] = useState({ rows: [], submittedAt: '', submittedBy: '' });
  const [noticeImportPreview, setNoticeImportPreview] = useState(null);
  const [summaryImportPreview, setSummaryImportPreview] = useState(null);
  const [feedbackImportPreview, setFeedbackImportPreview] = useState(null);
  const [initialData, setInitialData] = useState({ sheetName: '', columns: [], rows: [], updatedAt: '' });
  const [initialImportResult, setInitialImportResult] = useState(null);
  const [dimensionLibrary, setDimensionLibrary] = useState(() => STATIC_MODE ? readDimensionLibrary() : normalizeDimensionLibrary());
  const [dimensionLibraryLoading, setDimensionLibraryLoading] = useState(false);
  const [dimensionPendingFiles, setDimensionPendingFiles] = useState({});
  const [reportFiles, setReportFiles] = useState(() => STATIC_MODE ? readReportFileLibrary() : []);
  const [permissionUsers, setPermissionUsers] = useState([]);
  const [records, setRecords] = useState([]);
  const [clearedScheduleSignature, setClearedScheduleSignature] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [recordFilters, setRecordFilters] = useState({
    supplierShortName: '',
    businessDepartments: '',
    salesProductLine: '',
    series: ''
  });
  const [savingId, setSavingId] = useState('');
  const accessibleMenuPages = useMemo(
    () => MENU_PAGES.filter((page) => canAccessPage(user, page.tab)),
    [user]
  );
  const supplierOptions = useMemo(
    () => buildSupplierShortNameOptions(dimensionLibrary),
    [dimensionLibrary]
  );
  const productLineOptions = useMemo(
    () => buildSalesProductLineOptions(dimensionLibrary),
    [dimensionLibrary]
  );
  const seriesOptions = useMemo(
    () => buildSalesSeriesOptions(dimensionLibrary),
    [dimensionLibrary]
  );
  const seriesByProductLine = useMemo(
    () => buildSeriesByProductLineOptions(dimensionLibrary),
    [dimensionLibrary]
  );
  const displayRecords = useMemo(
    () => records.map((record) => normalizeRecordDimensions(record, supplierOptions, productLineOptions, seriesOptions, dimensionLibrary)),
    [records, supplierOptions, productLineOptions, seriesOptions, dimensionLibrary]
  );
  const pendingScheduleRecords = useMemo(
    () => displayRecords.filter(shouldShowScheduleRecord),
    [displayRecords]
  );
  const currentRecordSignature = useMemo(() => recordIdSignature(pendingScheduleRecords), [pendingScheduleRecords]);
  const schedulePageRecords = clearedScheduleSignature && clearedScheduleSignature === currentRecordSignature
    ? []
    : pendingScheduleRecords;

  function authFetch(url, options = {}) {
    const headers = {
      ...(options.headers || {}),
      ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {})
    };
    return fetch(url, { ...options, headers });
  }

  useEffect(() => {
    if (!STATIC_MODE) clearDimensionLibraryCache();
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
    if (!user || STATIC_MODE) return;
    refreshServerDataForActiveTab(activeTab, { silent: true });
  }, [activeTab, user]);

  useEffect(() => {
    if (!user || STATIC_MODE) return undefined;
    const refreshCurrentPage = () => {
      if (document.visibilityState === 'visible') {
        refreshServerDataForActiveTab(activeTab, { silent: true });
      }
    };
    const timer = window.setInterval(refreshCurrentPage, 30000);
    window.addEventListener('focus', refreshCurrentPage);
    document.addEventListener('visibilitychange', refreshCurrentPage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshCurrentPage);
      document.removeEventListener('visibilitychange', refreshCurrentPage);
    };
  }, [activeTab, user]);

  async function loadData() {
    if (STATIC_MODE) {
      const db = readStaticDb();
      const inspection = db.qualityInspection;
      const visibleNotices = isAdminUser(user)
        ? (inspection.notices.rows || [])
        : (inspection.notices.rows || []).filter((row) => row.inspectionApplicant === user.name);
      setInitialData(inspection.initialData);
      setDimensionLibrary(readDimensionLibrary());
      setNoticeSubmission({ ...inspection.notices, rows: visibleNotices });
      setNoticeRows([createNoticeRow({ inspectionApplicant: user.name })]);
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
    if (['dimensionLibrary', 'inspectionNotice', 'inspectionSchedule', 'inspectionFeedback', 'inspectionReportLibrary', 'inspectionReportQuery', 'inspectionSummary', 'inspectionLedger'].some((page) => canAccessPage(user, page))) {
      await refreshDimensionLibrary();
    }
    if (noticeRes.ok) {
      const payload = await noticeRes.json();
      setNoticeSubmission(payload);
      setNoticeRows([createNoticeRow({ inspectionApplicant: user.name })]);
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
        if (!isPrimaryAdminUser(matchedUser) && !(matchedUser.pageAccess || []).length) {
          setMessage('账号已注册，请等待管理员孙立柱授权页面后再登录。');
          return;
        }
        const payload = { id: matchedUser.id, name: matchedUser.name, role: matchedUser.role, pageAccess: matchedUser.pageAccess || [] };
        saveStoredUser(payload);
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
      setRegisterName('');
      setRegisterPassword('');
      setAuthMode('login');
      setMessage('注册成功，请等待管理员孙立柱授权页面后再登录。');
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
    if (!isLogin) {
      setRegisterName('');
      setRegisterPassword('');
      setAuthMode('login');
      setMessage('注册成功，请等待管理员孙立柱授权页面后再登录。');
      return;
    }
    saveStoredUser(payload);
    setUser(payload);
    setActiveTab(homeTabForUser(payload));
  }

  function logout() {
    clearStoredUser();
    setUser(null);
  }

  function updateNoticeRow(id, key, value) {
    setNoticeRows((rows) => rows.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, [key]: value };
      if (key === 'supplierShortName') {
        const supplierShortName = findSupplierShortNameOption(value, supplierOptions) || value;
        next.supplierAddress = supplierProvinceCityForName(supplierShortName, dimensionLibrary);
      }
      return next;
    }));
  }

  function addNoticeRow() {
    setNoticeRows((rows) => [...rows, createNoticeRow({ inspectionApplicant: user.name })]);
  }

  async function previewNoticeRows(files) {
    const file = files?.[0];
    if (!file) return;
    try {
      const result = await parseWorkbookInBrowser(file);
      const latestDimensionLibrary = await refreshDimensionLibrary();
      const importedRows = importedRowsToNoticeRows(result.rows || [], user.name, latestDimensionLibrary || dimensionLibrary);
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
    const normalizedRows = previewRows.map((row) => normalizeNoticeDimensions(row, supplierOptions, productLineOptions, seriesOptions, dimensionLibrary));
    const validationMessage = validateNoticeRows(normalizedRows, supplierOptions, productLineOptions, seriesOptions);
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }
    const mergedRows = mergeNoticeRowsForImport(normalizedRows);
    setNoticeRows((rows) => {
      const activeRows = rows.filter((row) => NOTICE_FIELDS.some((field) => !field.readonly && normalize(row[field.key])));
      return [...activeRows, ...mergedRows];
    });
    const mergeText = mergedRows.length === previewRows.length ? '' : `，由 ${previewRows.length} 条合并为 ${mergedRows.length} 条`;
    setMessage(`批量导入成功：已加入 ${mergedRows.length} 条验货通知${mergeText}。`);
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
        setMessage('未识别到可追加的验货反馈表数据，请检查表头。');
        return;
      }
      setSummaryImportPreview({
        fileName: file.name,
        sheetName: result.sheetName || '',
        items,
        parsedAt: nowText()
      });
      setMessage(`验货反馈表已解析：共 ${items.length} 条，请检查预览后确认追加。`);
    } catch {
      setMessage('验货反馈表批量上传失败，请检查文件格式。');
    }
  }

  function clearSummaryImportPreview() {
    setSummaryImportPreview(null);
    setMessage('已清空验货反馈表导入预览。');
  }

  async function confirmSummaryImport() {
    const items = summaryImportPreview?.items || [];
    if (!items.length) {
      setMessage('暂无可追加的验货反馈表预览数据。');
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
      setMessage(`验货反馈表已追加：新增 ${items.length} 条，原有信息已保留。`);
      return;
    }
    const res = await authFetch(`${API}/api/quality-inspection/summary-import?user=${encodeURIComponent(user.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, user: user.name })
    });
    if (!res.ok) {
      setMessage('验货反馈表追加失败。');
      return;
    }
    const payload = await res.json();
    setNoticeSubmission(payload.notices);
    setNoticeRows(payload.notices.rows.map((row) => createNoticeRow(row)));
    setRecords(payload.rows || []);
    setSummaryImportPreview(null);
    setMessage(`验货反馈表已追加：新增 ${items.length} 条，原有信息已保留。`);
  }

  async function previewFeedbackRows(files) {
    const file = files?.[0];
    if (!file) return;
    try {
      const result = await parseWorkbookInBrowser(file);
      const items = importedRowsToFeedbackItems(result.rows || [], displayRecords);
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
      const recordById = new Map(composedStaticRecords(db).map((record) => [record.id, record]));
      matchedItems.forEach((item) => {
        inspection.feedback[item.recordId] = {
          ...(inspection.feedback[item.recordId] || {}),
          ...item.feedback,
          updatedAt: nowText()
        };
        const current = recordById.get(item.recordId);
        const reportNo = feedbackReportNo(
          current || item.notice || {},
          item.feedback?.actualInspectionTime,
          item.feedback?.inspectionQuantity
        );
        if (reportNo) {
          inspection.reports[item.recordId] = {
            ...(inspection.reports[item.recordId] || {}),
            reportNo,
            updatedAt: nowText()
          };
        }
      });
      saveStaticDb(db);
      setRecords(composedStaticRecords(db).filter((record) => canReadClientRecord(user, record)));
      setFeedbackImportPreview(null);
      setMessage(`验货反馈批量导入成功：已更新 ${matchedItems.length} 条。`);
      return;
    }

    const recordById = new Map(displayRecords.map((record) => [record.id, record]));
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
    const reportResponses = await Promise.all(matchedItems.map((item) => {
      const current = recordById.get(item.recordId);
      const reportNo = feedbackReportNo(
        current || item.notice || {},
        item.feedback?.actualInspectionTime,
        item.feedback?.inspectionQuantity
      );
      if (!reportNo) return Promise.resolve({ ok: true });
      const reportForm = new FormData();
      reportForm.append('reportNo', reportNo);
      return authFetch(`${API}/api/quality-inspection/reports/${encodeURIComponent(item.recordId)}`, {
        method: 'POST',
        body: reportForm
      });
    }));
    if (reportResponses.some((res) => !res.ok)) {
      setMessage('验货反馈已导入，但检验报告单编码保存失败。');
      await refreshRecords();
      return;
    }
    await refreshRecords();
    setFeedbackImportPreview(null);
    setMessage(`验货反馈批量导入成功：已更新 ${matchedItems.length} 条。`);
  }

  function deleteNoticeRow(id) {
    setNoticeRows((rows) => rows.length > 1 ? rows.filter((row) => row.id !== id) : [createNoticeRow({ inspectionApplicant: user.name })]);
  }

  function clearNoticeRows() {
    setNoticeRows([createNoticeRow({ inspectionApplicant: user.name })]);
    setNoticeImportPreview(null);
    setMessage('已清除当前验货通知填写内容。');
  }

  async function submitNotices() {
    const rows = mergeNoticeRowsForImport(noticeRows
      .map((row) => ({
        ...row,
        businessDepartments: joinBusinessDepartments(splitMultiValue(row.businessDepartments)),
        inspectionApplicant: user.name
      }))
      .map((row) => normalizeNoticeDimensions(row, supplierOptions, productLineOptions, seriesOptions, dimensionLibrary))
      .filter((row) => NOTICE_FIELDS.some((field) => !field.readonly && normalize(row[field.key]))));
    if (!rows.length) {
      setMessage('请至少填写一条验货通知后再提交。');
      return;
    }
    const validationMessage = validateNoticeRows(rows, supplierOptions, productLineOptions, seriesOptions);
    if (validationMessage) {
      setMessage(validationMessage);
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
      setNoticeRows([createNoticeRow({ inspectionApplicant: user.name })]);
      setNoticeImportPreview(null);
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
      const payload = await res.json().catch(() => ({}));
      setMessage(payload.error || '验货通知提交失败。');
      return;
    }
    const payload = await res.json();
    setNoticeSubmission(payload);
    setNoticeRows([createNoticeRow({ inspectionApplicant: user.name })]);
    setNoticeImportPreview(null);
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

  async function refreshNoticeSubmissionFromServer() {
    if (STATIC_MODE) return;
    if (!canAccessPage(user, 'inspectionNotice')) return;
    const res = await authFetch(`${API}/api/quality-inspection/notices`, { cache: 'no-store' });
    if (res.ok) setNoticeSubmission(await res.json());
  }

  async function refreshServerDataForActiveTab(tab = activeTab, options = {}) {
    if (STATIC_MODE || !user) return;
    const tasks = [];
    if (RECORD_REFRESH_PAGES.includes(tab)) tasks.push(refreshRecords());
    if (DIMENSION_REFRESH_PAGES.includes(tab)) tasks.push(refreshDimensionLibrary({ silent: options.silent }));
    if (REPORT_FILE_REFRESH_PAGES.includes(tab)) tasks.push(refreshReportFiles());
    if (tab === 'inspectionNotice' || tab === 'inspectionSchedule') tasks.push(refreshNoticeSubmissionFromServer());
    if (tab === 'permissionManagement') tasks.push(refreshPermissionUsers());
    await Promise.allSettled(tasks);
  }

  async function refreshDimensionLibrary(options = {}) {
    if (STATIC_MODE) {
      const library = readDimensionLibrary();
      setDimensionLibrary(library);
      return library;
    }
    if (!options.silent) setDimensionLibraryLoading(true);
    try {
      const res = await authFetch(`${API}/api/quality-inspection/dimension-library`, { cache: 'no-store' });
      if (res.ok) {
        const library = normalizeDimensionLibrary((await res.json()).library || {});
        setDimensionLibrary(library);
        clearDimensionLibraryCache();
        return library;
      }
    } finally {
      if (!options.silent) setDimensionLibraryLoading(false);
    }
    return dimensionLibrary;
  }

  async function syncDimensionLibraryFromServer() {
    if (STATIC_MODE) {
      const library = readDimensionLibrary();
      setDimensionLibrary(library);
      setMessage('当前是静态预览模式，已读取浏览器本地维度表文件库。');
      return;
    }
    setSavingId('dimensionLibrarySync');
    setDimensionLibraryLoading(true);
    const res = await authFetch(`${API}/api/quality-inspection/dimension-library/sync`, {
      method: 'POST',
      cache: 'no-store'
    });
    setSavingId('');
    setDimensionLibraryLoading(false);
    if (!res.ok) {
      setMessage('下载同步腾讯云维度表数据失败，请稍后重试。');
      return;
    }
    const payload = await res.json();
    const library = normalizeDimensionLibrary(payload.library || {});
    setDimensionLibrary(library);
    clearDimensionLibraryCache();
    const appliedCount = DIMENSION_LIBRARY_SLOTS.filter((slot) => library[slot.id]?.applied).length;
    setMessage(`已下载同步腾讯云最新维度表数据：已应用 ${appliedCount} 个槽位。`);
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
        target.pageAccess = target.name === DEFAULT_ADMIN_USER.name
          ? ROLE_PAGE_ACCESS[ROLE_ADMIN]
          : normalizePageAccessList(pageAccess);
        saveStaticDb(db);
        setPermissionUsers(db.users);
        if (target.id === user.id) {
          const nextUser = { ...user, pageAccess: target.pageAccess };
          saveStoredUser(nextUser);
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

  async function deleteUserAccount(targetUser) {
    if (!targetUser?.id || targetUser.name === DEFAULT_ADMIN_USER.name) return;
    if (!isPrimaryAdminUser(user)) {
      setMessage('仅孙立柱管理员可以删除账号。');
      return;
    }
    if (!window.confirm(`确认删除账号：${targetUser.name}？`)) return;
    setSavingId(targetUser.id);
    if (STATIC_MODE) {
      const db = readStaticDb();
      db.users = (db.users || []).filter((item) => item.id !== targetUser.id);
      saveStaticDb(db);
      setPermissionUsers(db.users);
      setSavingId('');
      setMessage('账号已删除。');
      return;
    }
    const res = await authFetch(`${API}/api/auth/users/${encodeURIComponent(targetUser.id)}`, {
      method: 'DELETE'
    });
    setSavingId('');
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setMessage(payload.error || '账号删除失败。');
      return;
    }
    const payload = await res.json();
    setPermissionUsers(payload.users || []);
    setMessage('账号已删除。');
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
    const displayFileName = fixMojibakeText(file.name);
    try {
      const result = await parseWorkbookSheetsInBrowser(file);
      if (!(result.sheets || []).some((sheet) => (sheet.rows || []).length)) {
        throw new Error('未识别到有效表头或数据，请确认前 10 行内包含字段名。');
      }
      const supplierAddressLookup = slotId === PURCHASE_WORK_DIVISION_SLOT_ID
        ? buildSupplierAddressLookupRows(result.sheets || [])
        : [];
      const categoryOptions = slotId === PRODUCT_CATEGORY_SLOT_ID
        ? buildCategoryDimensionOptions(result.sheets || [])
        : {};
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
        fileName: displayFileName,
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
        supplierAddressLookup,
        ...categoryOptions,
        savedAt: nowText(),
        applied: false,
        appliedAt: ''
      };
      const next = { ...dimensionLibrary, [slotId]: record };
      const saved = STATIC_MODE ? saveDimensionLibrary(next) : true;
      setDimensionLibrary(next);
      setDimensionPendingFiles((current) => ({ ...current, [slotId]: file }));
      setMessage(saved
        ? `维度表文件库已读取：${displayFileName}，共 ${record.sheetCount} 个工作表、${record.importedCount} 行，请点击应用刷新同步。`
        : `维度表文件库已读取：${displayFileName}，共 ${record.sheetCount} 个工作表、${record.importedCount} 行；文件较大，已保留预览信息但浏览器缓存保存失败。`);
    } catch (error) {
      setMessage(`维度表文件库读取失败：${error?.message || '请检查文件格式、工作表内容或表头位置。'}`);
    }
  }

  async function applyDimensionSlot(slotId) {
    const existing = dimensionLibrary[slotId];
    if (!existing) {
      setMessage('该槽位暂无可应用文件。');
      return;
    }
    const pendingFile = dimensionPendingFiles[slotId];
    if (!STATIC_MODE && !pendingFile && !existing.storedFileName) {
      setMessage('请先重新上传维度表文件，再应用刷新到服务器。');
      return;
    }
    if (!STATIC_MODE && !pendingFile && existing.applied) {
      setMessage(`${existing.fileName} 已是服务器当前应用文件。`);
      return;
    }
    const next = {
      ...dimensionLibrary,
      [slotId]: { ...existing, applied: true, appliedAt: nowText() }
    };
    if (STATIC_MODE) {
      const saved = saveDimensionLibrary(next);
      setDimensionLibrary(next);
      setDimensionPendingFiles((current) => ({ ...current, [slotId]: null }));
      setMessage(saved ? `${existing.fileName} 已应用刷新。` : `${existing.fileName} 已应用刷新，但浏览器缓存保存失败。`);
      return;
    }
    setSavingId(slotId);
    const form = new FormData();
    form.append('file', pendingFile, existing.fileName || fixMojibakeText(pendingFile.name));
    form.append('record', JSON.stringify(next[slotId]));
    const res = await authFetch(`${API}/api/quality-inspection/dimension-library/${encodeURIComponent(slotId)}/apply`, {
      method: 'POST',
      body: form
    });
    setSavingId('');
    if (!res.ok) {
      setMessage(`${existing.fileName} 应用刷新失败，服务器未保存。`);
      return;
    }
    const payload = await res.json();
    setDimensionLibrary(normalizeDimensionLibrary(payload.library || {}));
    setDimensionPendingFiles((current) => ({ ...current, [slotId]: null }));
    setMessage(`${existing.fileName} 已上传到腾讯云服务器并应用，其他用户可读取最新文件。`);
  }

  async function deleteDimensionSlot(slotId) {
    const next = { ...dimensionLibrary, [slotId]: null };
    if (STATIC_MODE) {
      const saved = saveDimensionLibrary(next);
      setDimensionLibrary(next);
      setDimensionPendingFiles((current) => ({ ...current, [slotId]: null }));
      setMessage(saved ? '已清除该维度表槽位。' : '已清除该维度表槽位，但浏览器缓存保存失败。');
      return;
    }
    setSavingId(slotId);
    const res = await authFetch(`${API}/api/quality-inspection/dimension-library/${encodeURIComponent(slotId)}`, { method: 'DELETE' });
    setSavingId('');
    if (!res.ok) {
      setMessage('维度表槽位删除失败。');
      return;
    }
    const payload = await res.json();
    setDimensionLibrary(normalizeDimensionLibrary(payload.library || {}));
    setDimensionPendingFiles((current) => ({ ...current, [slotId]: null }));
    setMessage('已清除该维度表槽位，服务器文件同步删除。');
  }

  async function saveSchedules(scheduleDrafts, options = {}) {
    const entries = Object.entries(scheduleDrafts || {});
    if (!entries.length) {
      setMessage('暂无可提交的验货安排。');
      return;
    }
    const singleSubmit = options.single === true;
    const savingKey = options.savingId || 'inspectionSchedule';
    setSavingId(savingKey);
    if (STATIC_MODE) {
      const db = readStaticDb();
      entries.forEach(([recordId, draft]) => {
        const targetIds = Array.isArray(draft.sourceIds) && draft.sourceIds.length ? draft.sourceIds : [recordId];
        const scheduledDate = normalize(draft.scheduledDate);
        const inspector = normalize(draft.inspector);
        targetIds.forEach((targetId) => {
          db.qualityInspection.schedules[targetId] = {
            ...(db.qualityInspection.schedules[targetId] || {}),
            scheduledDate,
            inspector,
            remark: normalize(draft.remark),
            status: scheduledDate || inspector ? '已安排' : '未安排',
            updatedAt: nowText()
          };
        });
      });
      saveStaticDb(db);
      setSavingId('');
      setRecords(composedStaticRecords(db).filter((record) => canReadClientRecord(user, record)));
      if (!singleSubmit) setClearedScheduleSignature(currentRecordSignature);
      setMessage(singleSubmit ? '验货安排已提交：1 条。' : `验货安排已一键提交：共 ${entries.length} 条。`);
      return;
    }
    const responses = await Promise.all(entries.flatMap(([recordId, draft]) => {
      const targetIds = Array.isArray(draft.sourceIds) && draft.sourceIds.length ? draft.sourceIds : [recordId];
      const scheduledDate = normalize(draft.scheduledDate);
      const inspector = normalize(draft.inspector);
      return targetIds.map((targetId) => authFetch(`${API}/api/quality-inspection/schedules/${encodeURIComponent(targetId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledDate,
          inspector,
          remark: normalize(draft.remark),
          status: scheduledDate || inspector ? '已安排' : '未安排'
        })
      }));
    }));
    setSavingId('');
    if (responses.some((res) => !res.ok)) {
      setMessage('验货安排保存失败。');
      return;
    }
    await refreshRecords();
    if (!singleSubmit) setClearedScheduleSignature(currentRecordSignature);
    setMessage(singleSubmit ? '验货安排已提交：1 条。' : `验货安排已一键提交：共 ${entries.length} 条。`);
  }

  async function clearScheduleContent() {
    setSavingId('inspectionScheduleClear');
    if (STATIC_MODE) {
      const db = readStaticDb();
      db.qualityInspection.notices = {
        rows: [],
        submittedAt: nowText(),
        submittedBy: user.name
      };
      db.qualityInspection.schedules = {};
      db.qualityInspection.reports = {};
      db.qualityInspection.feedback = {};
      saveStaticDb(db);
      setNoticeSubmission(db.qualityInspection.notices);
      setNoticeRows([createNoticeRow({ inspectionApplicant: user.name })]);
      setRecords([]);
      setSavingId('');
      setMessage('验货安排内容已全部清除，请重新提交验货通知。');
      return;
    }
    const res = await authFetch(`${API}/api/quality-inspection/notices`, { method: 'DELETE' });
    setSavingId('');
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setMessage(payload.error || '验货安排内容清除失败。');
      return;
    }
    const payload = await res.json();
    setNoticeSubmission(payload.notices || { rows: [], submittedAt: '', submittedBy: '' });
    setNoticeRows([createNoticeRow({ inspectionApplicant: user.name })]);
    setRecords([]);
    setMessage('验货安排内容已全部清除，请重新提交验货通知。');
  }

  async function deleteScheduleNotice(recordIds) {
    const targetIds = Array.isArray(recordIds) ? recordIds.filter(Boolean) : [recordIds].filter(Boolean);
    if (!targetIds.length) return;
    setSavingId(targetIds[0]);
    if (STATIC_MODE) {
      const db = readStaticDb();
      db.qualityInspection.notices = {
        ...(db.qualityInspection.notices || {}),
        rows: (db.qualityInspection.notices.rows || [])
          .filter((row) => !targetIds.includes(row.id))
          .map((row, index) => ({ ...row, rowNumber: index + 1 })),
        submittedAt: nowText(),
        submittedBy: user.name
      };
      targetIds.forEach((targetId) => {
        delete db.qualityInspection.schedules[targetId];
        delete db.qualityInspection.reports[targetId];
        delete db.qualityInspection.feedback[targetId];
      });
      saveStaticDb(db);
      setNoticeSubmission(db.qualityInspection.notices);
      setRecords(composedStaticRecords(db).filter((record) => canReadClientRecord(user, record)));
      setSavingId('');
      setMessage('已删除该条验货通知。');
      return;
    }
    const responses = await Promise.all(targetIds.map((targetId) => (
      authFetch(`${API}/api/quality-inspection/notices/${encodeURIComponent(targetId)}`, { method: 'DELETE' })
    )));
    setSavingId('');
    if (responses.some((res) => !res.ok)) {
      const payload = await responses.find((res) => !res.ok)?.json().catch(() => ({}));
      setMessage(payload.error || '删除验货通知失败。');
      return;
    }
    await refreshRecords();
    const noticeRes = await authFetch(`${API}/api/quality-inspection/notices`, { cache: 'no-store' });
    if (noticeRes.ok) setNoticeSubmission(await noticeRes.json());
    setMessage('已删除该条验货通知。');
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
    const sourceIds = Array.isArray(record.sourceIds) && record.sourceIds.length ? record.sourceIds : [record.id];
    const feedbackPatch = {
      actualInspectionTime: normalize(form.get('actualInspectionTime')),
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
    const reportNo = feedbackReportNo(record, feedbackPatch.actualInspectionTime, feedbackPatch.inspectionQuantity);
    if (file instanceof File && file.size > 0 && !reportNo) {
      setSavingId('');
      setMessage('请先填写实际验货时间和实际验货数量，系统会自动生成检验报告单编码后再上传检验报告单。');
      return false;
    }
    if (STATIC_MODE) {
      const db = readStaticDb();
      sourceIds.forEach((sourceId) => {
        db.qualityInspection.feedback[sourceId] = {
          ...(db.qualityInspection.feedback[sourceId] || {}),
          ...feedbackPatch,
          updatedAt: nowText()
        };
      });
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
      formElement.reset();
      setMessage('验货反馈已保存。');
      return true;
    }
    const feedbackResponses = await Promise.all(sourceIds.map((sourceId) => {
      const sourceRecord = records.find((item) => item.id === sourceId) || record;
      return authFetch(`${API}/api/quality-inspection/feedback/${encodeURIComponent(sourceId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(sourceRecord.feedback || {}), ...feedbackPatch })
      });
    }));
    setSavingId('');
    if (feedbackResponses.some((res) => !res.ok)) {
      setMessage('验货反馈保存失败。');
      return false;
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
        return false;
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
        return false;
      }
    }
    formElement.reset();
    await refreshRecords();
    setMessage('验货反馈已保存。');
    return true;
  }

  async function stampReport(record, rotation, stampedDataUrl = '', skipStamp = false) {
    if (!record?.id || !reportHref(record)) {
      setMessage('当前没有可盖章的检验报告单。');
      return false;
    }
    if (!isImageReport(record)) {
      setMessage('当前文件不是图片格式，暂不支持直接盖章，请上传 JPG/PNG 图片版检验报告单。');
      return false;
    }
    setSavingId(record.id);
    try {
      const fileDataUrl = stampedDataUrl || (
        skipStamp
          ? await createRotatedReportImageDataUrl(record, rotation)
          : await createStampedImageDataUrl(record, rotation)
      );
      if (record.isStampUpload) {
        const fileName = normalizeStampUploadFileName(record.report?.fileName || record.report?.originalName, record.report?.originalName || `stamped-${Date.now()}.png`);
        if (STATIC_MODE) {
          const nextFiles = [
            ...readReportFileLibrary(),
            {
              id: createId(),
              fileName,
              fileUrl: fileDataUrl,
              size: record.report?.size || 0,
              source: skipStamp ? '无需盖章上传' : '加盖上传',
              stampedAt: skipStamp ? '' : nowText(),
              stampSkippedAt: skipStamp ? nowText() : '',
              modifiedAt: nowText()
            }
          ];
          saveReportFileLibrary(nextFiles);
          setReportFiles(nextFiles);
        } else {
          const form = new FormData();
          form.append('files', await dataUrlToFile(fileDataUrl, fileName));
          const res = await authFetch(`${API}/api/quality-inspection/report-files`, { method: 'POST', body: form });
          if (!res.ok) {
            setMessage('检验章已生成，但保存到报告单文件库失败。');
            return false;
          }
          const payload = await res.json();
          setReportFiles(payload.files || []);
        }
        setMessage(skipStamp ? '图片已按当前方向保存到报告单文件库。' : '检验章已加盖，图片已保存到报告单文件库。');
        return true;
      }
      if (STATIC_MODE) {
        const db = readStaticDb();
        db.qualityInspection.reports[record.id] = {
          ...(db.qualityInspection.reports[record.id] || {}),
          fileDataUrl,
          ...(skipStamp
            ? { stampSkippedAt: nowText(), stampSkippedBy: user.name }
            : { stampedAt: nowText(), stampedBy: user.name }),
          stampRotation: rotation,
          updatedAt: nowText()
        };
        saveStaticDb(db);
        setRecords(composedStaticRecords(db).filter((item) => canReadClientRecord(user, item)));
        setMessage(skipStamp ? '图片已按当前方向保存，文件已覆盖保存。' : '检验章已加盖，文件已覆盖保存。');
        return true;
      }
      const res = await authFetch(`${API}/api/quality-inspection/reports/${encodeURIComponent(record.id)}/stamp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileDataUrl, rotation, skipStamp })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setMessage(payload.error || '检验章加盖失败。');
        return false;
      }
      await refreshRecords();
      setMessage(skipStamp ? '图片已按当前方向保存到报告单文件库。' : '检验章已加盖，文件已覆盖保存到报告单文件库。');
      return true;
    } catch {
      setMessage('检验章加盖失败，请确认报告单图片可以正常打开。');
      return false;
    } finally {
      setSavingId('');
    }
  }

  const reportLibraryItems = useMemo(() => {
    if (!STATIC_MODE) return reportFiles;
    const linkedFiles = displayRecords
      .filter((record) => reportHref(record))
      .map((record) => ({
        id: `record-${record.id}`,
        recordId: record.id,
        fileName: record.report?.originalName || record.report?.fileName || record.report?.reportNo || '检验报告单',
        fileUrl: reportHref(record),
        source: record.report?.stampedAt ? '已盖章报告' : (record.report?.stampSkippedAt ? '无需盖章报告' : '验货报告'),
        reportNo: record.report?.reportNo || '',
        supplierShortName: record.supplierShortName || '',
        productLine: record.salesProductLine || '',
        series: record.series || '',
        inspector: record.schedule?.inspector || '',
        stampedAt: record.report?.stampedAt || '',
        stampedBy: record.report?.stampedBy || '',
        stampSkippedAt: record.report?.stampSkippedAt || '',
        stampSkippedBy: record.report?.stampSkippedBy || '',
        uploadedAt: record.report?.uploadedAt || '',
        modifiedAt: record.report?.updatedAt || record.report?.uploadedAt || ''
      }));
    return [...reportFiles, ...linkedFiles];
  }, [reportFiles, displayRecords]);
  const reportLibraryRecordIds = useMemo(() => (
    new Set(reportLibraryItems.map((file) => normalize(file.recordId)).filter(Boolean))
  ), [reportLibraryItems]);
  const reportLibraryQueryRecords = useMemo(() => {
    const keyword = normalize(query).toLowerCase();
    const normalizedFilters = Object.fromEntries(
      Object.entries(recordFilters).map(([key, value]) => [key, normalize(value).toLowerCase()])
    );
    if (statusFilter) return [];
    return reportLibraryItems
      .filter((file) => !normalize(file.recordId))
      .map((file) => {
        const reportNo = normalize(file.reportNo) || normalize(file.fileName).replace(/\.[^.]+$/, '');
        return {
          id: `report-file-${file.id || file.fileName}`,
          supplierShortName: file.supplierShortName || '',
          salesProductLine: file.productLine || '',
          series: file.series || '',
          businessDepartments: '',
          schedule: { inspector: file.inspector || '' },
          feedback: {
            actualInspectionTime: file.actualInspectionTime || '',
            actualInspector: file.actualInspector || file.inspector || '历史检验单',
            result: file.result || ''
          },
          report: {
            reportNo,
            originalName: file.fileName || reportNo,
            fileName: file.fileName || '',
            fileUrl: file.fileUrl || '',
            uploadedAt: file.uploadedAt || file.modifiedAt || '',
            updatedAt: file.modifiedAt || file.uploadedAt || ''
          },
          reportLibraryFileId: file.id || file.fileName,
          reportLibraryFileName: file.fileName || '',
          reportLibrarySource: true
        };
      })
      .filter((record) => {
        const text = [
          record.supplierShortName,
          record.salesProductLine,
          record.series,
          record.report?.reportNo,
          record.report?.originalName,
          record.feedback?.result
        ].map(normalize).join(' ').toLowerCase();
        const matchesKeyword = !keyword || text.includes(keyword);
        const matchesSupplier = !normalizedFilters.supplierShortName
          || normalize(record.supplierShortName).toLowerCase() === normalizedFilters.supplierShortName;
        const matchesBusinessDepartment = !normalizedFilters.businessDepartments;
        const matchesProductLine = !normalizedFilters.salesProductLine
          || normalize(record.salesProductLine).toLowerCase() === normalizedFilters.salesProductLine;
        const matchesSeries = !normalizedFilters.series
          || normalize(record.series).toLowerCase() === normalizedFilters.series;
        return matchesKeyword && matchesSupplier && matchesBusinessDepartment && matchesProductLine && matchesSeries;
      });
  }, [reportLibraryItems, query, statusFilter, recordFilters]);

  async function uploadReportLibraryFiles(files) {
    const selectedFiles = Array.from(files || []).filter(isReportLibraryFile);
    if (!selectedFiles.length) {
      setMessage('没有可上传的检验报告单文件。');
      return;
    }
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

  async function deleteInspectionRecord(record) {
    if (!isPrimaryAdminUser(user)) {
      setMessage('仅孙立柱管理员可以删除单条信息。');
      return;
    }
    if (!record) return;
    if (record.reportLibrarySource) {
      const fileName = normalize(record.reportLibraryFileName || record.report?.fileName || record.report?.originalName);
      if (!fileName) {
        setMessage('未找到可删除的报告文件名。');
        return;
      }
      if (!window.confirm(`确认删除报告文件：${fileName}？`)) return;
      setSavingId(record.id);
      if (STATIC_MODE) {
        const nextFiles = readReportFileLibrary().filter((item) => item.fileName !== fileName && item.id !== record.reportLibraryFileId);
        saveReportFileLibrary(nextFiles);
        setReportFiles(nextFiles);
        setSavingId('');
        setMessage('报告文件已删除。');
        return;
      }
      const res = await authFetch(`${API}/api/quality-inspection/report-files/${encodeURIComponent(fileName)}`, {
        method: 'DELETE'
      });
      setSavingId('');
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setMessage(payload.error || '报告文件删除失败。');
        return;
      }
      const payload = await res.json();
      setReportFiles(payload.files || []);
      await refreshRecords();
      setMessage('报告文件已删除。');
      return;
    }

    const targetIds = Array.isArray(record.sourceIds) && record.sourceIds.length ? record.sourceIds : [record.id];
    if (!window.confirm(`确认删除选中的 ${targetIds.length} 条验货信息？`)) return;
    setSavingId(record.id);
    if (STATIC_MODE) {
      const db = readStaticDb();
      db.qualityInspection.notices = {
        ...(db.qualityInspection.notices || {}),
        rows: (db.qualityInspection.notices.rows || [])
          .filter((row) => !targetIds.includes(row.id))
          .map((row, index) => ({ ...row, rowNumber: index + 1 })),
        submittedAt: nowText(),
        submittedBy: user.name
      };
      targetIds.forEach((targetId) => {
        delete db.qualityInspection.schedules[targetId];
        delete db.qualityInspection.reports[targetId];
        delete db.qualityInspection.feedback[targetId];
      });
      saveStaticDb(db);
      setNoticeSubmission(db.qualityInspection.notices);
      setRecords(composedStaticRecords(db).filter((item) => canReadClientRecord(user, item)));
      setSavingId('');
      setMessage('单条验货信息已删除。');
      return;
    }

    let payload = null;
    for (const targetId of targetIds) {
      const res = await authFetch(`${API}/api/quality-inspection/records/${encodeURIComponent(targetId)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        setSavingId('');
        const errorPayload = await res.json().catch(() => ({}));
        setMessage(errorPayload.error || '单条验货信息删除失败。');
        return;
      }
      payload = await res.json();
    }
    setSavingId('');
    if (payload?.rows) {
      setRecords((payload.rows || []).filter((item) => canReadClientRecord(user, item)));
    } else {
      await refreshRecords();
    }
    if (payload?.files) setReportFiles(payload.files || []);
    const noticeRes = await authFetch(`${API}/api/quality-inspection/notices`, { cache: 'no-store' });
    if (noticeRes.ok) setNoticeSubmission(await noticeRes.json());
    setMessage('单条验货信息已删除。');
  }

  async function exportReportQueryData() {
    const rows = reportQueryRecords.map(recordToReportExportRow);
    if (!rows.length) {
      setMessage('暂无可导出的检验单数据。');
      return;
    }
    await exportRowsToWorkbook(rows, '查询检验单', `查询检验单导出-${exportFileStamp()}.xlsx`);
    setMessage(`查询检验单已导出：${rows.length} 条。`);
  }

  async function exportSummaryData(title = '验货台账') {
    const rows = summaryRecords.map(recordToMigrationLedgerRow);
    if (!rows.length) {
      setMessage(`暂无可导出的${title}数据。`);
      return;
    }
    await exportRowsToWorkbook(rows, title, `${title}导出-${exportFileStamp()}.xlsx`);
    setMessage(`${title}已导出：${rows.length} 条，可用于后续批量上传迁移。`);
  }

  const filteredRecords = useMemo(() => {
    const keyword = normalize(query).toLowerCase();
    const normalizedFilters = Object.fromEntries(
      Object.entries(recordFilters).map(([key, value]) => [key, normalize(value).toLowerCase()])
    );
    return displayRecords.filter((record) => {
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
      const matchesSupplier = !normalizedFilters.supplierShortName
        || normalize(record.supplierShortName).toLowerCase() === normalizedFilters.supplierShortName;
      const matchesBusinessDepartment = !normalizedFilters.businessDepartments
        || splitMultiValue(record.businessDepartments).some((item) => normalize(item).toLowerCase() === normalizedFilters.businessDepartments);
      const matchesProductLine = !normalizedFilters.salesProductLine
        || normalize(record.salesProductLine).toLowerCase() === normalizedFilters.salesProductLine;
      const matchesSeries = !normalizedFilters.series
        || normalize(record.series).toLowerCase() === normalizedFilters.series;
      return matchesKeyword && matchesStatus && matchesSupplier && matchesBusinessDepartment && matchesProductLine && matchesSeries;
    });
  }, [displayRecords, query, statusFilter, recordFilters]);
  const reportQueryRecords = useMemo(() => (
    [
      ...filteredRecords.filter((record) => reportLibraryRecordIds.has(normalize(record.id))),
      ...reportLibraryQueryRecords
    ]
  ), [filteredRecords, reportLibraryRecordIds, reportLibraryQueryRecords]);
  const summaryRecords = useMemo(() => (
    filteredRecords.filter(shouldShowSummaryRecord)
  ), [filteredRecords]);

  const summary = useMemo(() => {
    const total = summaryRecords.length;
    const scheduled = summaryRecords.filter((row) => normalize(row.schedule?.scheduledDate)).length;
    const reported = summaryRecords.filter((row) => normalize(row.report?.fileName || row.report?.reportNo)).length;
    const passed = summaryRecords.filter((row) => row.feedback?.result === '合格').length;
    const failed = summaryRecords.filter((row) => row.feedback?.result === '不合格').length;
    return { total, scheduled, reported, passed, failed };
  }, [summaryRecords]);
  const canDeleteInspectionInfo = isPrimaryAdminUser(user);

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
      <SecurityWatermark user={user} />
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
            supplierOptions={supplierOptions}
            productLineOptions={productLineOptions}
            seriesOptions={seriesOptions}
            seriesByProductLine={seriesByProductLine}
            onAdd={addNoticeRow}
            onDelete={deleteNoticeRow}
            onClearRows={clearNoticeRows}
            onChange={updateNoticeRow}
            importPreview={noticeImportPreview}
            onUpload={previewNoticeRows}
            onConfirmImport={confirmNoticeImport}
            onClearImportPreview={clearNoticeImportPreview}
            onSubmit={submitNotices}
          />
        )}
        {canAccessPage(user, 'inspectionSchedule') && activeTab === 'inspectionSchedule' && (
          <InspectionSchedulePage
            records={schedulePageRecords}
            savingId={savingId}
            onSubmit={saveSchedules}
            onClear={clearScheduleContent}
            onDelete={deleteScheduleNotice}
          />
        )}
        {canAccessPage(user, 'inspectionReportUpload') && activeTab === 'inspectionReportUpload' && (
          <ReportUploadPage records={displayRecords} savingId={savingId} onSave={saveReport} />
        )}
        {canAccessPage(user, 'inspectionFeedback') && activeTab === 'inspectionFeedback' && (
          <FeedbackPage
            records={displayRecords.filter(shouldShowFeedbackRecord)}
            supplierOptions={supplierOptions}
            productLineOptions={productLineOptions}
            seriesOptions={seriesOptions}
            savingId={savingId}
            canImport={isAdminUser(user)}
            importPreview={feedbackImportPreview}
            onUpload={previewFeedbackRows}
            onConfirmImport={confirmFeedbackImport}
            onClearImportPreview={clearFeedbackImportPreview}
            onSave={saveFeedback}
            canDelete={canDeleteInspectionInfo}
            onDelete={deleteInspectionRecord}
          />
        )}
        {canAccessPage(user, 'inspectionStamp') && activeTab === 'inspectionStamp' && (
          <InspectionStampPage
            records={displayRecords.filter((record) => reportHref(record) && !record.report?.stampedAt && !record.report?.stampSkippedAt)}
            savingId={savingId}
            onStamp={stampReport}
          />
        )}
        {canAccessPage(user, 'inspectionReportLibrary') && activeTab === 'inspectionReportLibrary' && (
          <ReportFileLibraryPage
            files={reportLibraryItems}
            supplierOptions={supplierOptions}
            productLineOptions={productLineOptions}
            seriesOptions={seriesOptions}
            savingId={savingId}
            onUpload={uploadReportLibraryFiles}
            onRename={renameReportLibraryFile}
            onDelete={deleteReportLibraryFile}
          />
        )}
        {canAccessPage(user, 'inspectionReportQuery') && activeTab === 'inspectionReportQuery' && (
          <ReportQueryPage
            records={reportQueryRecords}
            query={query}
            statusFilter={statusFilter}
            filters={recordFilters}
            supplierOptions={supplierOptions}
            productLineOptions={productLineOptions}
            seriesOptions={seriesOptions}
            onQuery={setQuery}
            onStatusFilter={setStatusFilter}
            onFilterChange={(key, value) => setRecordFilters((current) => ({ ...current, [key]: value }))}
            onClearFilters={() => {
              setQuery('');
              setStatusFilter('');
              setRecordFilters({ supplierShortName: '', businessDepartments: '', salesProductLine: '', series: '' });
            }}
            savingId={savingId}
            canDelete={canDeleteInspectionInfo}
            onDelete={deleteInspectionRecord}
            onExport={exportReportQueryData}
          />
        )}
        {canAccessPage(user, 'inspectionSummary') && activeTab === 'inspectionSummary' && (
          <SummaryPage
            title="验货反馈表"
            summary={summary}
            records={summaryRecords}
            canImport={isAdminUser(user)}
            importPreview={summaryImportPreview}
            onUpload={previewSummaryRows}
            onConfirmImport={confirmSummaryImport}
            onClearImportPreview={clearSummaryImportPreview}
            savingId={savingId}
            canDelete={canDeleteInspectionInfo}
            onDelete={deleteInspectionRecord}
            onExport={() => exportSummaryData('验货反馈表')}
          />
        )}
        {canAccessPage(user, 'inspectionLedger') && activeTab === 'inspectionLedger' && (
          <SummaryPage
            title="验货台账"
            summary={summary}
            records={summaryRecords}
            canImport={isAdminUser(user)}
            importPreview={summaryImportPreview}
            onUpload={previewSummaryRows}
            onConfirmImport={confirmSummaryImport}
            onClearImportPreview={clearSummaryImportPreview}
            savingId={savingId}
            canDelete={canDeleteInspectionInfo}
            onDelete={deleteInspectionRecord}
            onExport={() => exportSummaryData('验货台账')}
          />
        )}
        {canAccessPage(user, 'inspectionInitialData') && activeTab === 'inspectionInitialData' && (
          <InitialDataPage data={initialData} result={initialImportResult} onUpload={uploadInitialData} />
        )}
        {canAccessPage(user, 'dimensionLibrary') && activeTab === 'dimensionLibrary' && (
          <DimensionLibraryPage
            slots={DIMENSION_LIBRARY_SLOTS}
            library={dimensionLibrary}
            loading={dimensionLibraryLoading}
            savingId={savingId}
            onSync={syncDimensionLibraryFromServer}
            onUpload={uploadDimensionSlot}
            onApply={applyDimensionSlot}
            onDelete={deleteDimensionSlot}
          />
        )}
        {canAccessPage(user, 'permissionManagement') && activeTab === 'permissionManagement' && (
          <PermissionManagementPage
            users={permissionUsers}
            savingId={savingId}
            canDeleteUsers={isPrimaryAdminUser(user)}
            onSave={saveUserPageAccess}
            onDelete={deleteUserAccount}
          />
        )}
      </section>
    </main>
  );
}

function SecurityWatermark({ user }) {
  const text = `内部资料 ${normalize(user?.name)} ${formatDate(new Date())}`;
  return (
    <div className="security-watermark" aria-hidden="true">
      {Array.from({ length: 72 }, (_, index) => (
        <span key={index}>{text}</span>
      ))}
    </div>
  );
}

function InspectionNoticePage({
  rows,
  submission,
  user,
  supplierOptions = [],
  productLineOptions = [],
  seriesOptions = [],
  seriesByProductLine = {},
  importPreview,
  onAdd,
  onDelete,
  onClearRows,
  onChange,
  onUpload,
  onConfirmImport,
  onClearImportPreview,
  onSubmit
}) {
  const [focusedSupplierRowId, setFocusedSupplierRowId] = useState('');
  const [supplierSuggestionPosition, setSupplierSuggestionPosition] = useState(null);
  const previewRows = importPreview?.rows || [];
  const previewColumns = NOTICE_FIELDS.map((field) => field.label);
  const previewLimitedRows = previewRows.slice(0, 10);

  useEffect(() => {
    if (!focusedSupplierRowId) return undefined;
    const closeSuggestions = () => {
      setFocusedSupplierRowId('');
      setSupplierSuggestionPosition(null);
    };
    window.addEventListener('scroll', closeSuggestions, true);
    window.addEventListener('resize', closeSuggestions);
    return () => {
      window.removeEventListener('scroll', closeSuggestions, true);
      window.removeEventListener('resize', closeSuggestions);
    };
  }, [focusedSupplierRowId]);

  function updateSupplierSuggestionPosition(target) {
    const rect = target?.getBoundingClientRect?.();
    if (!rect) return;
    setSupplierSuggestionPosition({
      top: Math.round(rect.bottom + 4),
      left: Math.round(rect.left),
      width: Math.max(260, Math.round(rect.width))
    });
  }

  function toggleBusinessDepartment(row, option, checked) {
    const current = new Set(splitMultiValue(row.businessDepartments).map(normalizeBusinessDepartment));
    if (checked) current.add(option);
    else current.delete(option);
    onChange(row.id, 'businessDepartments', joinBusinessDepartments(Array.from(current)));
  }

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
        <button type="button" className="ghost compact-button" onClick={onClearRows}>清除填写内容</button>
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
            if (field.key === 'supplierAddress') {
              return <span className="readonly-cell">{row[field.key] || '自动带出'}</span>;
            }
            if (field.key === 'supplierShortName') {
              const value = row[field.key] || '';
              const matchedSupplier = findSupplierShortNameOption(value, supplierOptions);
              const suggestions = supplierOptions
                .filter((supplier) => supplierMatchesQuery(supplier, value))
                .slice(0, 12);
              const showSuggestions = focusedSupplierRowId === row.id && Boolean(value) && suggestions.length > 0;
              const showInvalid = Boolean(value) && !matchedSupplier;
              return (
                <div className="supplier-combobox">
                  <input
                    type="text"
                    className={`table-input inspection-notice-input supplier-combobox-input${showInvalid ? ' invalid-input' : ''}`}
                    value={value}
                    onFocus={(event) => {
                      setFocusedSupplierRowId(row.id);
                      updateSupplierSuggestionPosition(event.currentTarget);
                    }}
                    onBlur={() => window.setTimeout(() => {
                      setFocusedSupplierRowId('');
                      setSupplierSuggestionPosition(null);
                    }, 120)}
                    onChange={(event) => {
                      updateSupplierSuggestionPosition(event.currentTarget);
                      onChange(row.id, field.key, event.target.value);
                    }}
                    onKeyUp={(event) => updateSupplierSuggestionPosition(event.currentTarget)}
                    placeholder="输入简称搜索"
                  />
                  {showSuggestions && supplierSuggestionPosition && createPortal(
                    <div
                      className="supplier-suggestion-list"
                      style={{
                        top: supplierSuggestionPosition.top,
                        left: supplierSuggestionPosition.left,
                        width: supplierSuggestionPosition.width
                      }}
                    >
                      <div className="supplier-suggestion-title">请选择正确供应商</div>
                      {suggestions.map((supplier) => (
                        <button
                          key={supplier}
                          type="button"
                          className="supplier-suggestion"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            onChange(row.id, field.key, supplier);
                            setFocusedSupplierRowId('');
                            setSupplierSuggestionPosition(null);
                          }}
                        >
                          {supplier}
                        </button>
                      ))}
                    </div>,
                    document.body
                  )}
                </div>
              );
            }
            const dimensionOptions = field.key === 'salesProductLine'
              ? productLineOptions
              : field.key === 'series'
                ? seriesOptionsForProductLine(row.salesProductLine, seriesOptions, seriesByProductLine)
                : null;
            if (dimensionOptions) {
              return (
                <select
                  className="table-input inspection-notice-input"
                  value={row[field.key] || ''}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    onChange(row.id, field.key, nextValue);
                    if (field.key === 'salesProductLine') {
                      const nextSeriesOptions = seriesOptionsForProductLine(nextValue, seriesOptions, seriesByProductLine);
                      if (row.series && !findDimensionOption(row.series, nextSeriesOptions)) {
                        onChange(row.id, 'series', '');
                      }
                    }
                  }}
                >
                  <option value="">选择</option>
                  {dimensionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              );
            }
            if (field.options) {
              if (field.key === 'businessDepartments') {
                const selected = new Set(splitMultiValue(row[field.key]).map(normalizeBusinessDepartment));
                return (
                  <div className="business-department-checks">
                    {field.options.map((option) => (
                      <label key={option} className="business-department-option">
                        <input
                          type="checkbox"
                          checked={selected.has(option)}
                          onChange={(event) => toggleBusinessDepartment(row, option, event.target.checked)}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                );
              }
              const selectValue = field.key === 'businessDepartments'
                ? (splitMultiValue(row[field.key])[0] || row[field.key] || '')
                : (row[field.key] || '');
              return (
                <select
                  className="table-input inspection-notice-input"
                  value={selectValue}
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
                value={field.type === 'date' ? formatDate(row[field.key]) : (row[field.key] || '')}
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

function InspectionSchedulePage({ records, savingId, onSubmit, onClear, onDelete }) {
  const [drafts, setDrafts] = useState({});
  const scheduleRows = useMemo(() => mergeScheduleRecords(records), [records]);

  useEffect(() => {
    setDrafts(Object.fromEntries(scheduleRows.map((record) => [
      record.id,
      {
        scheduledDate: formatDate(record.schedule?.scheduledDate),
        inspector: record.schedule?.inspector || '',
        remark: record.schedule?.remark || '',
        sourceIds: record.sourceIds || [record.id]
      }
    ])));
  }, [scheduleRows]);

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
        <span className="section-count">来自验货通知 {records.length} 条，按系列合并 {scheduleRows.length} 条</span>
        <button
          type="button"
          disabled={savingId === 'inspectionSchedule' || scheduleRows.length === 0}
          onClick={() => onSubmit(drafts)}
        >
          一键提交
        </button>
        <button
          type="button"
          className="ghost compact-button"
          disabled={savingId === 'inspectionScheduleClear' || scheduleRows.length === 0}
          onClick={onClear}
        >
          清除内容
        </button>
      </div>
      <DataTable
        className="inspection-schedule-table"
        rows={scheduleRows}
        columns={['供应商简称', '地址', '产品线', '系列', '数量', '事业部', '运营', '验货通知人', '备注', '验货员', '计划验货时间', '安排备注', '操作']}
        render={(record) => [
          record.supplierShortName,
          record.supplierAddress,
          record.salesProductLine,
          record.series,
          record.totalQuantity,
          record.businessDepartments,
          record.operation,
          record.inspectionNotifier || record.inspectionApplicant,
          <span className="readonly-cell wide-readonly-cell">{record.remark || ''}</span>,
          <input
            className="table-input"
            value={drafts[record.id]?.inspector || ''}
            onChange={(event) => updateDraft(record.id, 'inspector', event.target.value)}
          />,
          <input
            className="table-input"
            type="date"
            value={drafts[record.id]?.scheduledDate || ''}
            onChange={(event) => updateDraft(record.id, 'scheduledDate', event.target.value)}
          />,
          <input
            className="table-input wide-input"
            value={drafts[record.id]?.remark || ''}
            onChange={(event) => updateDraft(record.id, 'remark', event.target.value)}
          />,
          <div className="table-action-row">
            <button
              type="button"
              className="compact-button"
              disabled={savingId === record.id}
              onClick={() => onSubmit({ [record.id]: drafts[record.id] || {} }, { single: true, savingId: record.id })}
            >
              提交
            </button>
            <button
              type="button"
              className="danger-button compact-button"
              disabled={(record.sourceIds || [record.id]).includes(savingId)}
              onClick={() => onDelete(record.sourceIds || [record.id])}
            >
              删除
            </button>
          </div>
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

function FeedbackPage({
  records,
  supplierOptions = [],
  productLineOptions = [],
  seriesOptions = [],
  savingId,
  canImport,
  importPreview,
  onUpload,
  onConfirmImport,
  onClearImportPreview,
  onSave,
  canDelete = false,
  onDelete
}) {
  const [filters, setFilters] = useState({
    supplierShortName: '',
    salesProductLine: '',
    series: '',
    inspector: ''
  });
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const previewRows = importPreview?.items || [];
  const previewLimitedRows = previewRows.slice(0, 10);
  const matchedCount = previewRows.filter((item) => item.recordId).length;
  const mergedRecords = useMemo(() => mergeFeedbackRecords(records), [records]);
  const filteredRecords = useMemo(() => {
    const normalizedFilters = Object.fromEntries(
      Object.entries(filters).map(([key, value]) => [key, normalize(value).toLowerCase()])
    );
    return mergedRecords.filter((record) => {
      const values = {
        supplierShortName: record.supplierShortName,
        salesProductLine: record.salesProductLine,
        series: record.series,
        inspector: record.schedule?.inspector
      };
      return Object.entries(normalizedFilters).every(([key, value]) => (
        !value || normalize(values[key]).toLowerCase().includes(value)
      ));
    });
  }, [mergedRecords, filters]);
  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  function clearFilters() {
    setFilters({
      supplierShortName: '',
      salesProductLine: '',
      series: '',
      inspector: ''
    });
  }
  function feedbackDraft(record) {
    return {
      actualInspectionTime: record.feedback?.actualInspectionTime || '',
      inspectionQuantity: record.feedback?.inspectionQuantity || '',
      ...(feedbackDrafts[record.id] || {})
    };
  }
  function updateFeedbackDraft(recordId, key, value) {
    setFeedbackDrafts((current) => ({
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
        <h2>验货反馈</h2>
        <span className="section-count">筛选 {filteredRecords.length} 条 / 合并后 {mergedRecords.length} 条 / 待反馈 {records.length} 条</span>
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
      <div className="toolbar feedback-filter-toolbar">
        <select value={filters.supplierShortName} onChange={(event) => updateFilter('supplierShortName', event.target.value)}>
          <option value="">全部供应商简称</option>
          {supplierOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select value={filters.salesProductLine} onChange={(event) => updateFilter('salesProductLine', event.target.value)}>
          <option value="">全部产品线</option>
          {productLineOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select value={filters.series} onChange={(event) => updateFilter('series', event.target.value)}>
          <option value="">全部系列</option>
          {seriesOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <input
          placeholder="筛选验货员"
          value={filters.inspector}
          onChange={(event) => updateFilter('inspector', event.target.value)}
        />
        <button type="button" className="ghost compact-button" onClick={clearFilters}>清除筛选</button>
      </div>
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
            columns={['匹配状态', '供应商简称', '产品线', '系列', '数量', '实际验货时间', '验货方式', '实际验货数量', '合格数量', '验货结果', '问题等级', '问题分类', '问题反馈', '实际验货人']}
            render={(item) => [
              item.matchStatus,
              item.notice.supplierShortName,
              item.notice.salesProductLine,
              item.notice.series,
              item.notice.totalQuantity,
              item.feedback.actualInspectionTime,
              item.feedback.inspectionMethod,
              item.feedback.inspectionQuantity,
              item.feedback.qualifiedQuantity,
              item.feedback.result,
              item.feedback.issueLevel,
              item.feedback.issueCategoryPrimary,
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
        rows={filteredRecords}
        columns={[
          '供应商简称',
          '产品线',
          '系列',
          '数量',
          '是否首批验货',
          '事业部',
          '运营',
          '验货通知人',
          '备注',
          '验货员',
          '实际验货人',
          '实际验货时间',
          '验货方式',
          '实际验货数量',
          '验货合格数量',
          '验货结果',
          '检验报告单编码',
          '问题等级',
          '问题分类',
          '问题反馈',
          '检验报告单上传功能',
          '提交按钮'
        ]}
        render={(record) => {
          const draft = feedbackDraft(record);
          const reportNo = feedbackReportNo(record, draft.actualInspectionTime, draft.inspectionQuantity);
          return [
            record.supplierShortName,
            record.salesProductLine,
            record.series,
            record.totalQuantity,
            record.firstInspection,
            record.businessDepartments,
            record.operation,
            record.inspectionNotifier || record.inspectionApplicant,
            <span className="readonly-cell wide-readonly-cell">{record.remark}</span>,
            <span className="readonly-cell">{normalize(record.schedule?.inspector)}</span>,
            <input name="actualInspector" form={`feedback-form-${record.id}`} className="table-input" defaultValue={record.feedback?.actualInspector || ''} />,
            <input
              name="actualInspectionTime"
              form={`feedback-form-${record.id}`}
              className="table-input"
              type="date"
              defaultValue={formatDate(record.feedback?.actualInspectionTime)}
              onChange={(event) => updateFeedbackDraft(record.id, 'actualInspectionTime', event.target.value)}
            />,
            <select name="inspectionMethod" form={`feedback-form-${record.id}`} className="table-input" defaultValue={record.feedback?.inspectionMethod || ''}>
              <option value="">选择</option>
              <option value="抽检">抽检</option>
              <option value="全检">全检</option>
              <option value="视频检验">视频检验</option>
              <option value="随线检验">随线检验</option>
            </select>,
            <input
              name="inspectionQuantity"
              form={`feedback-form-${record.id}`}
              className="table-input narrow-input"
              defaultValue={record.feedback?.inspectionQuantity || ''}
              onChange={(event) => updateFeedbackDraft(record.id, 'inspectionQuantity', event.target.value)}
            />,
            <input name="qualifiedQuantity" form={`feedback-form-${record.id}`} className="table-input narrow-input" defaultValue={record.feedback?.qualifiedQuantity || ''} />,
            <select name="result" form={`feedback-form-${record.id}`} className="table-input" defaultValue={record.feedback?.result || ''}>
              <option value="">选择</option>
              <option value="通过">通过</option>
              <option value="让步">让步</option>
              <option value="返工">返工</option>
            </select>,
            <span className="readonly-cell wide-readonly-cell">{reportNo}</span>,
            <select name="issueLevel" form={`feedback-form-${record.id}`} className="table-input" defaultValue={record.feedback?.issueLevel || ''}>
              <option value="">选择</option>
              <option value="严重">严重</option>
              <option value="中等">中等</option>
              <option value="不严重">不严重</option>
            </select>,
            <select name="issueCategoryPrimary" form={`feedback-form-${record.id}`} className="table-input" defaultValue={record.feedback?.issueCategoryPrimary || ''}>
              <option value="">选择</option>
              <option value="包装">包装</option>
              <option value="性能">性能</option>
              <option value="外观">外观</option>
            </select>,
            <textarea name="feedbackText" form={`feedback-form-${record.id}`} className="table-textarea wide-textarea" defaultValue={record.feedback?.feedbackText || ''} />,
            <div className="feedback-report-cell">
              {reportHref(record) && <a href={reportHref(record)} target="_blank" rel="noreferrer">{record.report?.originalName || '查看报告'}</a>}
              <input name="reportFile" form={`feedback-form-${record.id}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx" />
            </div>,
            <div className="table-action-row">
              <form
                id={`feedback-form-${record.id}`}
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!window.confirm('确认提交当前验货反馈？')) return;
                  const saved = await onSave(record, event.currentTarget);
                  if (saved) {
                    setFeedbackDrafts((current) => {
                      const next = { ...current };
                      delete next[record.id];
                      return next;
                    });
                  }
                }}
              >
                <button type="submit" className="compact-button" disabled={savingId === record.id}>提交</button>
              </form>
              {canDelete && (
                <button
                  type="button"
                  className="danger-button compact-button"
                  disabled={savingId === record.id}
                  onClick={() => onDelete(record)}
                >
                  删除
                </button>
              )}
            </div>
          ];
        }}
      />
    </>
  );
}

function InspectionStampPage({ records, savingId, onStamp }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [uploadedRecords, setUploadedRecords] = useState([]);
  const [stampPreview, setStampPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const stampRecords = useMemo(() => [...uploadedRecords, ...records], [uploadedRecords, records]);
  const safeIndex = stampRecords.length ? Math.min(currentIndex, stampRecords.length - 1) : 0;
  const current = stampRecords[safeIndex];
  const canStamp = current && isImageReport(current);
  const activePreview = stampPreview?.recordId === current?.id && stampPreview?.rotation === rotation ? stampPreview : null;

  useEffect(() => {
    if (currentIndex > Math.max(stampRecords.length - 1, 0)) setCurrentIndex(0);
  }, [stampRecords.length, currentIndex]);

  useEffect(() => {
    setRotation(0);
  }, [current?.id]);

  useEffect(() => {
    setStampPreview(null);
    setPreviewError('');
  }, [current?.id, rotation]);

  function go(delta) {
    if (!stampRecords.length) return;
    setCurrentIndex((index) => (index + delta + stampRecords.length) % stampRecords.length);
  }

  async function previewStamp() {
    if (!canStamp) return;
    setPreviewing(true);
    setPreviewError('');
    try {
      const dataUrl = await createStampedImageDataUrl(current, rotation);
      setStampPreview({ recordId: current.id, rotation, dataUrl });
    } catch {
      setPreviewError('预览生成失败，请确认报告单图片可以正常打开。');
    } finally {
      setPreviewing(false);
    }
  }

  async function confirmStamp() {
    if (!activePreview) return;
    const stamped = await onStamp(current, activePreview.rotation, activePreview.dataUrl);
    if (stamped) {
      setStampPreview(null);
      if (current?.isStampUpload) {
        setUploadedRecords((items) => items.filter((item) => item.id !== current.id));
      }
    }
  }

  async function saveWithoutStamp() {
    if (!canStamp) return;
    setPreviewing(true);
    setPreviewError('');
    try {
      const dataUrl = await createRotatedReportImageDataUrl(current, rotation);
      const saved = await onStamp(current, rotation, dataUrl, true);
      if (saved && current?.isStampUpload) {
        setUploadedRecords((items) => items.filter((item) => item.id !== current.id));
      }
      if (saved) setStampPreview(null);
    } catch {
      setPreviewError('保存失败，请确认报告单图片可以正常打开。');
    } finally {
      setPreviewing(false);
    }
  }

  function updateUploadedImageFileName(recordId, nextName, commit = false) {
    setUploadedRecords((items) => items.map((item) => {
      if (item.id !== recordId) return item;
      const fileName = commit
        ? normalizeStampUploadFileName(nextName, item.report?.originalName || item.report?.fileName)
        : nextName;
      return {
        ...item,
        report: {
          ...(item.report || {}),
          fileName,
          originalName: fileName
        }
      };
    }));
  }

  async function uploadStampImages(files) {
    const selectedFiles = Array.from(files || []).filter(isReportImageFile);
    if (!selectedFiles.length) {
      setUploadMessage('未识别到可上传的图片，请选择 JPG、PNG 或 WebP。');
      return;
    }
    const uploaded = await Promise.all(selectedFiles.map(async (file) => ({
      id: `stamp-upload-${createId()}`,
      isStampUpload: true,
      supplierShortName: '页面上传',
      salesProductLine: '',
      series: '',
      report: {
        fileName: file.name,
        originalName: file.name,
        fileDataUrl: await readFileAsDataUrl(file),
        size: file.size,
        uploadedAt: nowText()
      }
    })));
    setUploadedRecords((current) => [...uploaded, ...current]);
    setCurrentIndex(0);
    setStampPreview(null);
    setPreviewError('');
    setUploadMessage(`已批量上传 ${uploaded.length} 张图片，请在左侧列表逐张处理。`);
  }

  return (
    <section className="stamp-page">
      <div className="section-heading-row">
        <h2>加盖检验章</h2>
        <span className="section-count">待盖章 {stampRecords.length} 份</span>
        <label className="upload-button">
          批量上传图片
          <input
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.webp"
            onChange={(event) => {
              uploadStampImages(event.target.files);
              event.target.value = '';
            }}
          />
        </label>
        <button type="button" className="ghost compact-button" onClick={() => go(-1)} disabled={stampRecords.length < 2}>上一张</button>
        <button type="button" className="ghost compact-button" onClick={() => go(1)} disabled={stampRecords.length < 2}>下一张</button>
        <button type="button" className="ghost compact-button" onClick={() => setRotation((value) => (value + 90) % 360)} disabled={!current}>旋转</button>
        <button
          type="button"
          className="compact-button"
          disabled={!canStamp || previewing || savingId === current?.id}
          onClick={previewStamp}
        >
          {previewing ? '生成预览中' : '加盖印章'}
        </button>
        <button
          type="button"
          className="compact-button"
          disabled={!canStamp || previewing || savingId === current?.id}
          onClick={saveWithoutStamp}
        >
          {savingId === current?.id ? '保存中' : '保存'}
        </button>
        {activePreview && (
          <>
            <button
              type="button"
              className="compact-button"
              disabled={savingId === current?.id}
              onClick={confirmStamp}
            >
              {savingId === current?.id ? '保存中' : '确认保存'}
            </button>
            <button type="button" className="ghost compact-button" onClick={() => setStampPreview(null)} disabled={savingId === current?.id}>取消预览</button>
          </>
        )}
      </div>

      <label
        className="stamp-upload-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          uploadStampImages(event.dataTransfer.files);
        }}
      >
        <input
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp"
          onChange={(event) => {
            uploadStampImages(event.target.files);
            event.target.value = '';
          }}
        />
        <strong>批量上传待加盖图片</strong>
        <span>可一次选择或拖拽多张 JPG / PNG / WebP，上传后在左侧列表逐张改名、加盖或保存</span>
        {uploadMessage && <em>{uploadMessage}</em>}
      </label>

      {!current ? (
        <EmptyState text="暂无待加盖检验章的报告单" />
      ) : (
        <div className="stamp-workspace">
          <aside className="stamp-list">
            {stampRecords.map((record, index) => (
              <button
                type="button"
                key={record.id}
                className={index === safeIndex ? 'active' : ''}
                onClick={() => setCurrentIndex(index)}
              >
                <strong>{record.isStampUpload ? '页面上传图片' : (record.report?.reportNo || '未填写报告编码')}</strong>
                <span>{record.isStampUpload ? '页面上传图片' : (record.supplierShortName || '未填写供应商')}</span>
                <span>{record.report?.originalName || record.report?.fileName}</span>
              </button>
            ))}
          </aside>
          <section className="stamp-viewer">
            <div className="stamp-meta">
              <strong>{current.isStampUpload ? '页面上传图片' : (current.report?.reportNo || '未填写报告编码')}</strong>
              {current.isStampUpload && (
                <label className="stamp-file-name-editor">
                  <span>文件名</span>
                  <input
                    className="table-input wide-input"
                    value={current.report?.fileName || ''}
                    onChange={(event) => updateUploadedImageFileName(current.id, event.target.value)}
                    onBlur={(event) => updateUploadedImageFileName(current.id, event.target.value, true)}
                  />
                </label>
              )}
              <span>{current.supplierShortName || ''}</span>
              <span>{current.salesProductLine || ''} {current.series || ''}</span>
              {activePreview && <span className="stamp-preview-note">当前为盖章预览，确认保存后才会覆盖原文件。</span>}
              {previewError && <span className="stamp-warning">{previewError}</span>}
              {!canStamp && <span className="stamp-warning">当前文件不是图片格式，只能查看，不能直接加盖图片印章。</span>}
            </div>
            <div className="stamp-canvas">
              {isImageReport(current) ? (
                <img
                  src={activePreview?.dataUrl || reportHref(current)}
                  alt="检验报告单"
                  style={activePreview ? undefined : { transform: `rotate(${rotation}deg)` }}
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

function ReportFileLibraryPage({ files, supplierOptions = [], productLineOptions = [], seriesOptions = [], savingId, onUpload, onRename, onDelete }) {
  const [drafts, setDrafts] = useState({});
  const [previewFile, setPreviewFile] = useState(null);
  const [filters, setFilters] = useState({
    supplierShortName: '',
    productLine: '',
    series: '',
    inspector: ''
  });
  const filteredFiles = useMemo(() => {
    const normalizedFilters = Object.fromEntries(
      Object.entries(filters).map(([key, value]) => [key, normalize(value).toLowerCase()])
    );
    return files.filter((file) => (
      (!normalizedFilters.supplierShortName || normalize(file.supplierShortName).toLowerCase() === normalizedFilters.supplierShortName)
      && (!normalizedFilters.productLine || normalize(file.productLine).toLowerCase() === normalizedFilters.productLine)
      && (!normalizedFilters.series || normalize(file.series).toLowerCase() === normalizedFilters.series)
      && (!normalizedFilters.inspector || normalize(file.inspector).toLowerCase().includes(normalizedFilters.inspector))
    ));
  }, [files, filters]);
  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  function clearFilters() {
    setFilters({ supplierShortName: '', productLine: '', series: '', inspector: '' });
  }

  useEffect(() => {
    setDrafts(Object.fromEntries(files.map((file) => [file.id || file.fileName, file.fileName || ''])));
  }, [files]);

  useEffect(() => {
    if (previewFile && !files.some((file) => (file.id || file.fileName) === (previewFile.id || previewFile.fileName))) {
      setPreviewFile(null);
    }
  }, [files, previewFile]);

  const previewExt = String(previewFile?.fileName || previewFile?.fileUrl || '')
    .split('?')[0]
    .match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';

  return (
    <section className="report-library-page">
      <div className="section-heading-row">
        <h2>报告单文件库</h2>
        <span className="section-count">筛选 {filteredFiles.length} 个 / 共 {files.length} 个文件</span>
      </div>
      <div
        className="report-library-upload-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={async (event) => {
          event.preventDefault();
          onUpload(await reportLibraryFilesFromDrop(event.dataTransfer));
        }}
      >
        <strong>拖拽历史检验报告单文件或文件夹到这里</strong>
        <span>上传时读取文件名；支持图片、PDF、Excel、Word；加盖章后的报告单也会在这里展示</span>
        <div className="report-library-upload-actions">
          <label className="upload-button">
            上传文件
            <input
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.doc,.docx"
              onChange={(event) => {
                onUpload(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
          <label className="upload-button">
            上传文件夹
            <input
              type="file"
              multiple
              webkitdirectory=""
              directory=""
              onChange={(event) => {
                onUpload(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
        </div>
      </div>
      <div className="toolbar feedback-filter-toolbar">
        <select value={filters.supplierShortName} onChange={(event) => updateFilter('supplierShortName', event.target.value)}>
          <option value="">全部供应商简称</option>
          {supplierOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select value={filters.productLine} onChange={(event) => updateFilter('productLine', event.target.value)}>
          <option value="">全部产品线</option>
          {productLineOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select value={filters.series} onChange={(event) => updateFilter('series', event.target.value)}>
          <option value="">全部系列</option>
          {seriesOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <input
          placeholder="筛选验货员"
          value={filters.inspector}
          onChange={(event) => updateFilter('inspector', event.target.value)}
        />
        <button type="button" className="ghost compact-button" onClick={clearFilters}>清除筛选</button>
      </div>
      <DataTable
        className="report-library-table"
        rows={filteredFiles}
        columns={['文件名', '来源', '报告编码', '供应商', '产品线/系列', '验货员', '盖章状态', '大小', '更新时间', '查看', '操作']}
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
            file.inspector || '',
            file.stampedAt ? `已盖章 ${file.stampedAt}` : '未盖章',
            formatFileSize(file.size),
            file.modifiedAt || file.updatedAt || file.uploadedAt || '',
            file.fileUrl ? (
              <button type="button" className="link-button" onClick={() => setPreviewFile(file)}>
                查看文件
              </button>
            ) : '',
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
      {previewFile && (
        <ReportPreviewModal
          title={previewFile.fileName || '报告文件预览'}
          url={previewFile.fileUrl}
          ext={previewExt}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </section>
  );
}

function ReportQueryPage({
  records,
  query,
  statusFilter,
  filters,
  supplierOptions,
  productLineOptions,
  seriesOptions,
  onQuery,
  onStatusFilter,
  onFilterChange,
  onClearFilters,
  savingId = '',
  canDelete = false,
  onDelete,
  onExport
}) {
  const [previewRecord, setPreviewRecord] = useState(null);
  const previewUrl = previewRecord ? reportHref(previewRecord) : '';
  const previewExt = previewRecord ? reportFileExt(previewRecord) : '';
  const columns = canDelete
    ? ['供应商', '实际验货时间', '实际验货员', '报告单号', '报告文件', '验货结果', '操作']
    : ['供应商', '实际验货时间', '实际验货员', '报告单号', '报告文件', '验货结果'];

  useEffect(() => {
    if (previewRecord && !records.some((record) => record.id === previewRecord.id)) {
      setPreviewRecord(null);
    }
  }, [records, previewRecord]);

  return (
    <>
      <div className="section-heading-row">
        <h2>查询检验单</h2>
        <span className="section-count">筛选结果 {records.length} 条</span>
        <button
          type="button"
          className="ghost compact-button"
          disabled={!records.length}
          onClick={onExport}
        >
          导出检验单
        </button>
      </div>
      <div className="toolbar">
        <input placeholder="搜索供应商、采购订单、产品线、报告单号" value={query} onChange={(event) => onQuery(event.target.value)} />
        <select value={filters.supplierShortName} onChange={(event) => onFilterChange('supplierShortName', event.target.value)}>
          <option value="">全部供应商简称</option>
          {supplierOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.businessDepartments} onChange={(event) => onFilterChange('businessDepartments', event.target.value)}>
          <option value="">全部事业部</option>
          {BUSINESS_DEPARTMENT_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.salesProductLine} onChange={(event) => onFilterChange('salesProductLine', event.target.value)}>
          <option value="">全部产品线</option>
          {productLineOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.series} onChange={(event) => onFilterChange('series', event.target.value)}>
          <option value="">全部系列</option>
          {seriesOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => onStatusFilter(event.target.value)}>
          <option value="">全部状态</option>
          {['未安排', '已安排', '验货中', '已完成', '已取消'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" className="ghost compact-button" onClick={onClearFilters}>清除筛选</button>
      </div>
      <DataTable
        className="report-query-table"
        rows={records}
        columns={columns}
        render={(record) => {
          const cells = [
            record.supplierShortName,
            formatDate(record.feedback?.actualInspectionTime),
            record.feedback?.actualInspector || record.schedule?.inspector || '',
            record.report?.reportNo || '',
            reportHref(record)
              ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setPreviewRecord(record)}
                >
                  {record.report.originalName || '查看文件'}
                </button>
              )
              : '',
            record.feedback?.result || ''
          ];
          if (canDelete) {
            cells.push(
              <button
                type="button"
                className="danger-button compact-button"
                disabled={savingId === record.id}
                onClick={() => onDelete(record)}
              >
                删除
              </button>
            );
          }
          return cells;
        }}
      />
      {previewRecord && (
        <ReportPreviewModal
          title={previewRecord.report?.originalName || previewRecord.report?.reportNo || '报告文件预览'}
          url={previewUrl}
          ext={previewExt}
          onClose={() => setPreviewRecord(null)}
        />
      )}
    </>
  );
}

function ReportPreviewModal({ title, url, ext, onClose }) {
  return createPortal(
    <div className="report-preview-modal" role="dialog" aria-modal="true">
      <div className="report-preview-backdrop" onClick={onClose} />
      <section className="report-preview-dialog">
        <div className="report-preview-header">
          <h3>{title || '报告文件预览'}</h3>
          <div className="table-action-row">
            {url && <a className="compact-button" href={url} target="_blank" rel="noreferrer">打开原文件</a>}
            <button type="button" className="ghost compact-button" onClick={onClose}>关闭预览</button>
          </div>
        </div>
        <div className="report-preview-body">
          {REPORT_IMAGE_EXTENSIONS.has(ext) ? (
            <img src={url} alt="报告文件预览" />
          ) : ext === '.pdf' ? (
            <iframe title="报告文件预览" src={url} />
          ) : (
            <div className="empty-state">当前文件格式暂不支持本页直接预览，请点击“打开原文件”查看。</div>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}

function SummaryPage({
  title = '验货反馈表',
  summary,
  records,
  canImport,
  importPreview,
  onUpload,
  onConfirmImport,
  onClearImportPreview,
  savingId = '',
  canDelete = false,
  onDelete,
  onExport
}) {
  const previewRows = importPreview?.items || [];
  const previewLimitedRows = previewRows.slice(0, 10);
  const columns = canDelete
    ? ['序号', '供应商', '事业部', '产品线', '系列', '数量', '计划日期', '状态', '报告结论', '反馈结果', '操作']
    : ['序号', '供应商', '事业部', '产品线', '系列', '数量', '计划日期', '状态', '报告结论', '反馈结果'];
  return (
    <>
      <div className="section-heading-row">
        <h2>{title}</h2>
        <span className="section-count">按当前数据实时汇总</span>
        <button
          type="button"
          className="ghost compact-button"
          disabled={!records.length}
          onClick={onExport}
        >
          导出
        </button>
      </div>
      {canImport && (
        <label
          className="summary-upload-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); onUpload(event.dataTransfer.files); }}
        >
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => onUpload(event.target.files)} />
          <strong>拖拽验货反馈表文件到这里，或点击批量上传</strong>
          <span>支持 .xlsx / .xls / .csv，解析后先预览，确认后追加到现有反馈信息</span>
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
        columns={columns}
        render={(record) => {
          const cells = [
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
          ];
          if (canDelete) {
            cells.push(
              <button
                type="button"
                className="danger-button compact-button"
                disabled={savingId === record.id}
                onClick={() => onDelete(record)}
              >
                删除
              </button>
            );
          }
          return cells;
        }}
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

function DimensionLibraryPage({ slots, library, loading, savingId, onSync, onUpload, onApply, onDelete }) {
  const filledCount = slots.filter((slot) => library[slot.id]).length;
  const appliedCount = slots.filter((slot) => library[slot.id]?.applied).length;
  return (
    <>
      <div className="section-heading-row">
        <h2>维度表文件库</h2>
        <span className="section-count">{loading ? '正在同步腾讯云服务器最新维度表...' : `4 个槽位，已上传 ${filledCount} 个，已应用 ${appliedCount} 个`}</span>
        <button
          type="button"
          className="ghost compact-button"
          disabled={savingId === 'dimensionLibrarySync'}
          onClick={onSync}
        >
          {savingId === 'dimensionLibrarySync' ? '下载同步中' : '下载腾讯云数据'}
        </button>
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
                <input type="file" accept=".xlsx,.xlsm,.xls,.csv" onChange={(event) => onUpload(slot.id, event.target.files)} />
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
                    <button type="button" className="compact-button" disabled={savingId === slot.id} onClick={() => onApply(slot.id)}>
                      {savingId === slot.id ? '应用中' : '应用刷新'}
                    </button>
                    <button type="button" className="ghost compact-button" disabled={savingId === slot.id} onClick={() => onDelete(slot.id)}>删除</button>
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

function PermissionManagementPage({ users, savingId, canDeleteUsers = false, onSave, onDelete }) {
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
            <div className="table-action-row">
              <button
                type="button"
                className="compact-button"
                disabled={savingId === targetUser.id || isBuiltInAdmin}
                onClick={() => onSave(targetUser, selected)}
              >
                保存授权
              </button>
              {canDeleteUsers && !isBuiltInAdmin && (
                <button
                  type="button"
                  className="danger-button compact-button"
                  disabled={savingId === targetUser.id}
                  onClick={() => onDelete(targetUser)}
                >
                  删除账号
                </button>
              )}
            </div>
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
