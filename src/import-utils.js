import {
  NOTICE_FIELDS,
  DIMENSION_PREVIEW_ROW_LIMIT,
  DIMENSION_SUPPLIER_ALIASES,
  DIMENSION_ADDRESS_ALIASES,
  DIMENSION_PROVINCE_ALIASES,
  DIMENSION_CITY_ALIASES,
  SALES_PRODUCT_LINE_ALIASES,
  SALES_SERIES_ALIASES,
  NOTICE_IMPORT_ALIASES,
  SUMMARY_IMPORT_ALIASES,
  FEEDBACK_IMPORT_ALIASES,
  NOTICE_IMPORT_MERGE_KEYS,
  NOTICE_OPTIONAL_KEYS,
  BUSINESS_DEPARTMENT_OPTIONS,
  PRODUCT_CATEGORY_SLOT_ID,
  PURCHASE_WORK_DIVISION_SLOT_ID
} from './constants.js';
import {
  createId,
  normalize,
  normalizeHeader,
  formatDate,
  parseQuantity,
  formatQuantity,
  hasObjectValue,
  fixMojibakeText,
  splitMultiValue,
  joinBusinessDepartments,
  uniqueValues,
  normalizeSupplierKey,
  createNoticeRow
} from './utils.js';

let cachedXLSX = null;

async function loadXlsxModule() {
  if (cachedXLSX) return cachedXLSX;
  const module = await import('xlsx');
  cachedXLSX = module;
  return module;
}

function importHeaderAliases() {
  return [
    ...NOTICE_FIELDS.flatMap((field) => [field.label, field.key, ...(NOTICE_IMPORT_ALIASES[field.key] || [])]),
    ...Object.values(SUMMARY_IMPORT_ALIASES).flat(),
    ...Object.values(FEEDBACK_IMPORT_ALIASES).flat()
  ].map(normalizeHeader).filter(Boolean);
}

function scoreImportHeaderRow(row = []) {
  const aliases = importHeaderAliases();
  const cells = row.map(normalize).filter(Boolean);
  if (!cells.length) return -1;
  const normalizedCells = cells.map(normalizeHeader);
  const matchedCount = normalizedCells.filter((cell) => aliases.some((alias) => cell === alias || cell.includes(alias))).length;
  const uniqueCount = new Set(normalizedCells).size;
  return matchedCount * 10 + Math.min(uniqueCount, 20);
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
        const scoredRows = matrix
          .map((row, index) => ({ index, score: scoreImportHeaderRow(row) }))
          .filter((item) => item.score >= 0)
          .sort((a, b) => b.score - a.score);
        const headerIndex = scoredRows[0]?.index ?? -1;
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
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function recordToMigrationLedgerRow(record, index = 0, reportHrefFn = () => '') {
  return {
    '序号': record.rowNumber || index + 1,
    '验货填写人': record.inspectionApplicant || '',
    '验货通知人': record.inspectionNotifier || '',
    '验货填写时间': formatDate(record.inspectionFillTime),
    '供应商完工时间': formatDate(record.supplierFinishTime),
    '可验货时间': formatDate(record.shipmentTime),
    '备货OA号': record.stockOaNo || '',
    '发货OA号': record.shippingOaNo || '',
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
    '报告文件链接': reportHrefFn(record),
    '报告结论': record.report?.conclusion || '',
    '实际验货时间': formatDate(record.feedback?.actualInspectionTime),
    '实际检验员': record.feedback?.actualInspector || record.schedule?.inspector || '',
    '验货方式': record.feedback?.inspectionMethod || '',
    '实际验货数量': record.feedback?.inspectionQuantity || '',
    '检验数量': record.feedback?.checkQuantity || '',
    '验货合格数量': record.feedback?.qualifiedQuantity || '',
    '验货结果': record.feedback?.result || '',
    '问题等级': record.feedback?.issueLevel || '',
    '问题分类': record.feedback?.issueCategoryPrimary || '',
    '问题反馈': record.feedback?.feedbackText || ''
  };
}

function recordToReportExportRow(record, index = 0, reportHrefFn = () => '') {
  return {
    '序号': index + 1,
    '供应商': record.supplierShortName || '',
    '产品线': record.salesProductLine || '',
    '系列': record.series || '',
    '实际验货时间': formatDate(record.feedback?.actualInspectionTime),
    '实际检验员': record.feedback?.actualInspector || record.schedule?.inspector || '',
    '报告单号': record.report?.reportNo || '',
    '报告文件': record.report?.originalName || record.report?.fileName || '',
    '报告文件链接': reportHrefFn(record),
    '验货结果': record.feedback?.result || '',
    '事业部': record.businessDepartments || '',
    '金蝶采购订单': record.kingdeeOrderNo || '',
    '备货OA号': record.stockOaNo || '',
    '发货OA号': record.shippingOaNo || '',
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
    if ([
      '供应商',
      '供应商简称',
      '供应商名称',
      '产品线明细供应商',
      '销售产品线',
      '销售系列',
      '产品线',
      '系列',
      '商品分类',
      '分类',
      '地址',
      '省',
      '市',
      '采购',
      '运营'
    ].some((keyword) => header.includes(normalizeHeader(keyword)))) {
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

function readImportedValue(normalizedSource, aliases) {
  const normalizedAliases = aliases.map(normalizeHeader).filter(Boolean);
  const exactMatch = normalizedAliases.find((alias) => normalizedSource.has(alias));
  if (exactMatch) return normalize(normalizedSource.get(exactMatch));
  const fuzzyMatch = [...normalizedSource.keys()]
    .find((sourceKey) => normalizedAliases.some((alias) => sourceKey.includes(alias)));
  return fuzzyMatch ? normalize(normalizedSource.get(fuzzyMatch)) : '';
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
      if (!values.inspectionNotifier) values.inspectionNotifier = currentUserName;
      const supplierKey = normalizeSupplierKey(values.supplierShortName) || normalizeHeader(values.supplierShortName);
      values.supplierAddress = supplierProvinceCityLookup.get(supplierKey)
        || supplierProvinceCityLookup.get(normalizeHeader(values.supplierShortName))
        || values.supplierAddress;
      return createNoticeRow({ ...values, importSource: 'noticeImport' });
    })
    .filter((row) => NOTICE_FIELDS.some((field) => !field.readonly && normalize(row[field.key])));
}

function importedRowsToSummaryItems(importedRows, currentUserName) {
  return importedRows
    .map((sourceRow) => {
      const normalizedSource = normalizedSourceMap(sourceRow);
      const noticeValues = {};
      NOTICE_FIELDS.forEach((field) => {
        const aliases = [field.label, field.key, ...(NOTICE_IMPORT_ALIASES[field.key] || [])];
        noticeValues[field.key] = readImportedValue(normalizedSource, aliases);
      });
      if (!noticeValues.inspectionApplicant) noticeValues.inspectionApplicant = currentUserName;
      if (!noticeValues.inspectionNotifier) noticeValues.inspectionNotifier = currentUserName;
      const notice = createNoticeRow({ ...noticeValues, importSource: 'ledgerImport' });
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
        actualInspectionTime: formatDate(readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.actualInspectionTime)),
        actualInspector: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.actualInspector),
        inspectionMethod: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.inspectionMethod),
        inspectionQuantity: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.inspectionQuantity),
        checkQuantity: readImportedValue(normalizedSource, SUMMARY_IMPORT_ALIASES.checkQuantity),
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
      const normalizedSource = normalizedSourceMap(sourceRow);
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
      if (feedback.actualInspectionTime) {
        feedback.actualInspectionTime = formatDate(feedback.actualInspectionTime);
      }
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

export {
  loadXlsxModule,
  parseWorkbookInBrowser,
  exportFileStamp,
  recordToMigrationLedgerRow,
  recordToReportExportRow,
  parseWorkbookSheetsInBrowser,
  scoreDimensionHeaderRow,
  parseDimensionSheet,
  readImportedValue,
  importedRowsToNoticeRows,
  importedRowsToSummaryItems,
  feedbackMatchKey,
  feedbackFallbackMatchKey,
  importedRowsToFeedbackItems
};
