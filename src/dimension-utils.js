import {
  DIMENSION_SUPPLIER_ALIASES,
  DIMENSION_ADDRESS_ALIASES,
  DIMENSION_PROVINCE_ALIASES,
  DIMENSION_CITY_ALIASES,
  SALES_PRODUCT_LINE_ALIASES,
  SALES_SERIES_ALIASES,
  PRODUCT_CATEGORY_SLOT_ID,
  PURCHASE_WORK_DIVISION_SLOT_ID,
  DIMENSION_LIBRARY_SLOTS,
  NOTICE_FIELDS,
  NOTICE_OPTIONAL_KEYS
} from './constants.js';
import {
  normalize,
  normalizeHeader,
  normalizeSupplierKey,
  splitMultiValue,
  joinBusinessDepartments,
  fixMojibakeText
} from './utils.js';
import { readImportedValue } from './import-utils.js';

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
  const cachedSuppliers = Array.isArray(record?.supplierShortNames) ? record.supplierShortNames : [];
  cachedSuppliers.forEach((item) => addSupplierOption(options, item));
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

function buildSupplierShortNameOptionsFromSheets(sheets = []) {
  const options = new Map();
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
  const text = normalize(value).toLowerCase();
  if (!text) return '';
  const exact = supplierOptions.find((option) => normalize(option).toLowerCase() === text);
  if (exact) return exact;
  const includes = supplierOptions.find((option) => {
    const optionText = normalize(option).toLowerCase();
    return optionText.includes(text) || text.includes(optionText);
  });
  return includes || '';
}

function optionMatchesQuery(option, query) {
  const optionText = normalizeHeader(option);
  const queryText = normalizeHeader(query);
  if (!queryText) return true;
  return optionText.includes(queryText) || queryText.includes(optionText);
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
  if (!key) {
    const withOther = [...allSeriesOptions];
    if (!withOther.includes('其他')) withOther.push('其他');
    return withOther;
  }
  const scoped = Array.isArray(seriesByProductLine[key]) ? seriesByProductLine[key] : [];
  const result = scoped.length ? scoped : allSeriesOptions;
  if (!result.includes('其他')) result.push('其他');
  return result;
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

function findProductLineForSeries(series, productLineOptions = [], seriesByProductLine = {}) {
  const seriesKey = normalizeHeader(series);
  if (!seriesKey) return '';
  const productLineEntry = Object.entries(seriesByProductLine || {})
    .find(([, seriesList]) => Array.isArray(seriesList) && seriesList.some((item) => normalizeHeader(item) === seriesKey));
  if (!productLineEntry) return '';
  const [productLineKey] = productLineEntry;
  return findDimensionOption(productLineKey, productLineOptions) || productLineKey;
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

function normalizeNoticeDimensions(row, supplierOptions, productLineOptions, seriesOptions, dimensionLibrary, seriesByProductLine = {}) {
  const supplierShortName = findSupplierShortNameOption(row.supplierShortName, supplierOptions) || normalize(row.supplierShortName);
  const matchedProductLine = findDimensionOption(row.salesProductLine, productLineOptions) || normalize(row.salesProductLine);
  const scopedSeriesOptions = seriesOptionsForProductLine(matchedProductLine, seriesOptions, seriesByProductLine);
  const series = findDimensionOption(row.series, scopedSeriesOptions) || normalize(row.series);
  const salesProductLine = matchedProductLine || findProductLineForSeries(series, productLineOptions, seriesByProductLine);
  return {
    ...row,
    supplierShortName,
    businessDepartments: joinBusinessDepartments(splitMultiValue(row.businessDepartments)),
    salesProductLine,
    series,
    supplierAddress: supplierProvinceCityForName(supplierShortName, dimensionLibrary) || normalize(row.supplierAddress)
  };
}

function validateNoticeRows(rows, supplierOptions = [], productLineOptions = [], seriesOptions = [], seriesByProductLine = {}) {
  if (!supplierOptions.length) {
    return '请先在维度表文件库上传并应用“采购分工明细”，系统需要从里面读取供应商简称。';
  }
  if (!productLineOptions.length || !seriesOptions.length) {
    return '请先在维度表文件库上传并应用“商品分类维表”，系统需要从里面读取销售产品线和销售系列。';
  }
  const requiredFields = NOTICE_FIELDS.filter((field) => !NOTICE_OPTIONAL_KEYS.has(field.key));
  const invalidSupplierIndex = rows.findIndex((row) => !findSupplierShortNameOption(row.supplierShortName, supplierOptions));
  if (invalidSupplierIndex >= 0) {
    return `第 ${invalidSupplierIndex + 1} 行供应商简称"${rows[invalidSupplierIndex].supplierShortName || '(空)'}"不在采购分工明细中，请从模糊匹配结果里选择。`;
  }
  const invalidProductLineIndex = rows.findIndex((row) => !findDimensionOption(row.salesProductLine, productLineOptions));
  if (invalidProductLineIndex >= 0) {
    return `第 ${invalidProductLineIndex + 1} 行销售产品线"${rows[invalidProductLineIndex].salesProductLine || '(空)'}"不在商品分类维表中，请从模糊匹配结果里选择。`;
  }
  const invalidSeriesIndex = rows.findIndex((row) => (
    !findDimensionOption(row.series, seriesOptionsForProductLine(row.salesProductLine, seriesOptions, seriesByProductLine))
  ));
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

export {
  normalizedSourceMap,
  extractProvinceCityFromAddress,
  provinceCityFromDimensionRow,
  buildSupplierProvinceCityLookup,
  supplierProvinceCityForName,
  addSupplierOption,
  buildSupplierShortNameOptions,
  buildSupplierShortNameOptionsFromSheets,
  supplierMatchesQuery,
  findSupplierShortNameOption,
  optionMatchesQuery,
  addDimensionOption,
  buildDimensionValueOptionsFromSheets,
  buildDimensionValueOptions,
  addSeriesByProductLineOption,
  buildSeriesByProductLineOptionsFromSheets,
  mergeSeriesByProductLineOptions,
  buildSeriesByProductLineOptions,
  seriesOptionsForProductLine,
  buildCategoryDimensionOptions,
  buildSalesProductLineOptions,
  buildSalesSeriesOptions,
  findDimensionOption,
  findProductLineForSeries,
  normalizeRecordDimensions,
  normalizeNoticeDimensions,
  validateNoticeRows,
  buildSupplierAddressLookupRows
};
