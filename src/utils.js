import { BUSINESS_DEPARTMENT_OPTIONS, PAGE_OPTIONS, ROLE_PAGE_ACCESS, ROLE_ADMIN, DEFAULT_ADMIN_USER, MENU_PAGES, NOTICE_FIELDS, NOTICE_IMPORT_MERGE_KEYS } from './constants.js';

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalize(value) {
  return String(value ?? '').trim();
}

function normalizeHeader(value) {
  return normalize(value).replace(/\s+/g, '').toLowerCase();
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

function formatCompactDate(value) {
  return formatDate(value).replace(/-/g, '');
}

function nowText() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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

function hasObjectValue(value) {
  return Object.values(value || {}).some((item) => String(item || '').trim());
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

function normalizeSupplierKey(value) {
  return normalizeHeader(value)
    .replace(/有限责任公司|股份有限公司|有限公司|公司|工厂|厂/g, '');
}

function normalizePageAccessList(pageAccess = []) {
  const allowedPages = new Set(PAGE_OPTIONS.map((page) => page.tab));
  const normalized = [...new Set((Array.isArray(pageAccess) ? pageAccess : [])
    .filter((page) => allowedPages.has(page)))];
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
    || canAccessPage(user, 'inspectionLedger')
    || canAccessPage(user, 'inspectionSchedule')
    || canAccessPage(user, 'inspectionStamp')
    || canAccessPage(user, 'inspectionReportLibrary')
    || canAccessPage(user, 'reworkRecords')
  ) return true;
  if (canAccessPage(user, 'inspectionNotice')) return record.inspectionApplicant === user.name;
  if (canAccessPage(user, 'inspectionFeedback') || canAccessPage(user, 'reworkRecords')) {
    return isSubmittedScheduleRecord(record);
  }
  return false;
}

function createNoticeRow(values = {}) {
  const row = NOTICE_FIELDS.reduce((current, field) => ({
    ...current,
    [field.key]: values[field.key] || ''
  }), {
    id: values.id || createId(),
    inspectionApplicant: values.inspectionApplicant || ''
  });
  if (!row.inspectionNotifier && row.inspectionApplicant) row.inspectionNotifier = row.inspectionApplicant;
  if (values.importSource) row.importSource = values.importSource;
  return row;
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

function latestFeedback(feedback) {
  if (Array.isArray(feedback)) {
    return feedback.filter((item) => hasObjectValue(item)).slice(-1)[0] || {};
  }
  return feedback || {};
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
  }).sort((a, b) => (a.supplierAddress || '').localeCompare(b.supplierAddress || '', 'zh-Hans-CN'));
}

function mergeFeedbackRecords(records = [], reportHrefFn = () => false) {
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
    const feedbackSource = group
      .filter((record) => hasObjectValue(latestFeedback(record.feedback)))
      .sort((left, right) => normalize(latestFeedback(right.feedback).updatedAt || latestFeedback(right.feedback).actualInspectionTime)
        .localeCompare(normalize(latestFeedback(left.feedback).updatedAt || latestFeedback(left.feedback).actualInspectionTime)))[0] || first;
    const reportSource = group.find((record) => reportHrefFn(record)) || first;
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
      feedback: { ...latestFeedback(feedbackSource.feedback) }
    };
  });
}

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

export {
  createId,
  normalize,
  normalizeHeader,
  padDatePart,
  excelSerialDateToIso,
  formatDate,
  formatCompactDate,
  nowText,
  parseQuantity,
  formatQuantity,
  hasObjectValue,
  fixMojibakeText,
  splitMultiValue,
  normalizeBusinessDepartment,
  joinBusinessDepartments,
  chineseInitial,
  supplierInitials,
  uniqueValues,
  normalizeSupplierKey,
  normalizePageAccessList,
  canAccessPage,
  homeTabForUser,
  isAdminUser,
  isPrimaryAdminUser,
  isSubmittedScheduleRecord,
  canReadClientRecord,
  createNoticeRow,
  feedbackReportNo,
  latestFeedback,
  mergeScheduleRecords,
  mergeFeedbackRecords,
  noticeImportMergeKey,
  mergeNoticeRowsForImport
};
