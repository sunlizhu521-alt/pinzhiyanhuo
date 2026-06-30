import { useEffect, useMemo, useRef, useState } from 'react';
import { API, STATIC_MODE, DEFAULT_ADMIN_USER, ROLE_ADMIN, ROLE_USER, BUSINESS_DEPARTMENT_OPTIONS, NOTICE_FIELDS, MENU_PAGES, PAGE_OPTIONS, DIMENSION_LIBRARY_SLOTS, PRODUCT_CATEGORY_SLOT_ID, PURCHASE_WORK_DIVISION_SLOT_ID, RECORD_REFRESH_PAGES, DIMENSION_REFRESH_PAGES, REPORT_FILE_REFRESH_PAGES } from '../constants.js';
import { createId, normalize, formatDate, nowText, splitMultiValue, joinBusinessDepartments, canAccessPage, homeTabForUser, isAdminUser, isPrimaryAdminUser, canReadClientRecord, createNoticeRow, feedbackReportNo, mergeNoticeRowsForImport } from '../utils.js';
import { readStaticDb, saveStaticDb, readDimensionLibrary, saveDimensionLibrary, clearDimensionLibraryCache, readReportFileLibrary, saveReportFileLibrary, readStoredUser, saveStoredUser, clearStoredUser, composedStaticRecords, normalizeStaticDb, normalizeDimensionLibrary } from '../db-utils.js';
import { loadXlsxModule, parseWorkbookInBrowser, exportFileStamp, recordToMigrationLedgerRow, recordToReportExportRow, parseWorkbookSheetsInBrowser, parseDimensionSheet, importedRowsToNoticeRows, importedRowsToSummaryItems, importedRowsToFeedbackItems } from '../import-utils.js';
import { buildSupplierShortNameOptions, buildSalesProductLineOptions, buildSalesSeriesOptions, buildSeriesByProductLineOptions, buildCategoryDimensionOptions, buildSupplierAddressLookupRows, normalizeRecordDimensions, normalizeNoticeDimensions, validateNoticeRows, findSupplierShortNameOption, supplierProvinceCityForName } from '../dimension-utils.js';
import { readFileAsDataUrl, dataUrlToFile, reportHref, reportFileNameFromCode, isImageReport, isReportLibraryFile, normalizeStampUploadFileName, createRotatedReportImageDataUrl, createStampedImageDataUrl, scoreOcrResult, shouldShowFeedbackRecord, shouldShowScheduleRecord, shouldShowSummaryRecord, recordIdSignature } from '../file-utils.js';
import SecurityWatermark from './SecurityWatermark.jsx';
import InitialDataPage from './InitialDataPage.jsx';
import DimensionLibraryPage from './DimensionLibraryPage.jsx';
import ReportUploadPage from './ReportUploadPage.jsx';
import FeedbackPage from './FeedbackPage.jsx';
import InspectionSchedulePage from './InspectionSchedulePage.jsx';
import InspectionStampPage from './InspectionStampPage.jsx';
import ReportFileLibraryPage from './ReportFileLibraryPage.jsx';
import ReportQueryPage from './ReportQueryPage.jsx';
import ReworkRecordsPage from './ReworkRecordsPage.jsx';
import InspectionNoticePage from './InspectionNoticePage.jsx';
import LedgerPage from './LedgerPage.jsx';
import PermissionManagementPage from './PermissionManagementPage.jsx';

async function exportRowsToWorkbook(rows, sheetName, fileName) {
  if (!rows.length) return false;
  const XLSX = await loadXlsxModule();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
  return true;
}

const ACTIVE_TAB_KEY = 'qualityInspectionActiveTab';

function readStoredActiveTab() {
  try {
    return localStorage.getItem(ACTIVE_TAB_KEY) || 'inspectionNotice';
  } catch {
    return 'inspectionNotice';
  }
}

function saveStoredActiveTab(tab) {
  try {
    if (tab) localStorage.setItem(ACTIVE_TAB_KEY, tab);
  } catch {
    // localStorage may be unavailable in private or restricted browser contexts.
  }
}

function createBlankNoticeRow(values = {}) {
  return createNoticeRow({
    inspectionFillTime: formatDate(new Date()),
    ...values
  });
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

function App() {
  const [activeTab, setActiveTab] = useState(readStoredActiveTab);
  const [authMode, setAuthMode] = useState('login');
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [user, setUser] = useState(readStoredUser);
  const [pendingPasswordChange, setPendingPasswordChange] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [appVersionTime, setAppVersionTime] = useState('读取中...');
  const [noticeRows, setNoticeRows] = useState(() => [createBlankNoticeRow()]);
  const [noticeSubmission, setNoticeSubmission] = useState({ rows: [], submittedAt: '', submittedBy: '' });
  const [noticeImportPreview, setNoticeImportPreview] = useState(null);
  const [feedbackImportPreview, setFeedbackImportPreview] = useState(null);
  const [ledgerImportPreview, setLedgerImportPreview] = useState(null);
  const [initialData, setInitialData] = useState({ sheetName: '', columns: [], rows: [], updatedAt: '' });
  const [initialImportResult, setInitialImportResult] = useState(null);
  const [dimensionLibrary, setDimensionLibrary] = useState(() => STATIC_MODE ? readDimensionLibrary() : normalizeDimensionLibrary());
  const [dimensionLibraryLoading, setDimensionLibraryLoading] = useState(false);
  const [dimensionPendingFiles, setDimensionPendingFiles] = useState({});
  const dimensionLibraryRef = useRef(dimensionLibrary);
  const dimensionPendingFilesRef = useRef(dimensionPendingFiles);
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
  const reworkRecords = useMemo(
    () => displayRecords.filter((record) => (
      record.feedback?.result === '返工'
      && !record.rework?.completedAt
      && normalize(record.rework?.status) !== '已删除'
      && !normalize(record.rework?.deletedAt)
    )),
    [displayRecords]
  );
  const pendingScheduleRecords = useMemo(
    () => displayRecords.filter(shouldShowScheduleRecord),
    [displayRecords]
  );
  const currentRecordSignature = useMemo(() => recordIdSignature(pendingScheduleRecords), [pendingScheduleRecords]);
  const schedulePageRecords = clearedScheduleSignature && clearedScheduleSignature === currentRecordSignature
    ? []
    : pendingScheduleRecords;

  useEffect(() => {
    dimensionLibraryRef.current = dimensionLibrary;
  }, [dimensionLibrary]);

  useEffect(() => {
    dimensionPendingFilesRef.current = dimensionPendingFiles;
  }, [dimensionPendingFiles]);

  function completeLogin(payload) {
    const nextUser = {
      id: payload.id,
      name: payload.name,
      role: payload.role,
      pageAccess: payload.pageAccess || [],
      token: payload.token
    };
    saveStoredUser(nextUser);
    setUser(nextUser);
    setPendingPasswordChange(null);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setActiveTab(homeTabForUser(nextUser));
  }

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
    if (canAccessPage(user, activeTab)) {
      saveStoredActiveTab(activeTab);
      return;
    }
    const fallbackTab = homeTabForUser(user);
    setActiveTab(fallbackTab);
    saveStoredActiveTab(fallbackTab);
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

  useEffect(() => {
    if (user || authMode !== 'login') return undefined;
    const clearLoginFields = () => {
      setLoginName('');
      setPassword('');
      document.querySelectorAll('[data-login-clear="true"]').forEach((input) => {
        input.value = '';
      });
    };
    clearLoginFields();
    const timers = [50, 300, 900].map((delay) => window.setTimeout(clearLoginFields, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [authMode, user]);

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
      setNoticeRows([createBlankNoticeRow({ inspectionApplicant: user.name })]);
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
    if (['dimensionLibrary', 'inspectionNotice', 'inspectionSchedule', 'inspectionFeedback', 'reworkRecords', 'inspectionReportLibrary', 'inspectionReportQuery', 'inspectionLedger'].some((page) => canAccessPage(user, page))) {
      await refreshDimensionLibrary();
    }
    if (noticeRes.ok) {
      const payload = await noticeRes.json();
      setNoticeSubmission(payload);
      setNoticeRows([createBlankNoticeRow({ inspectionApplicant: user.name })]);
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
        if (matchedUser.mustResetPassword) {
          setPendingPasswordChange(payload);
          setPasswordError('');
          return;
        }
        completeLogin(payload);
        return;
      }
      if (db.users.some((item) => item.name === name)) {
        setMessage('该姓名已存在。');
        return;
      }
      const newUser = { id: createId(), name, password: inputPassword, role: ROLE_USER, pageAccess: [], mustResetPassword: true };
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
    if (payload.mustResetPassword) {
      setPendingPasswordChange(payload);
      setPasswordError('');
      setNewPassword('');
      setConfirmPassword('');
      return;
    }
    completeLogin(payload);
  }

  function logout() {
    clearStoredUser();
    setUser(null);
    setPendingPasswordChange(null);
  }

  async function handleChangePassword() {
    if (!pendingPasswordChange) return;
    setPasswordError('');
    const nextPassword = normalize(newPassword);
    const confirmedPassword = normalize(confirmPassword);
    if (!nextPassword || nextPassword.length < 4) {
      setPasswordError('新密码至少4位');
      return;
    }
    if (nextPassword !== confirmedPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }
    setChangingPassword(true);
    if (STATIC_MODE) {
      const db = readStaticDb();
      const target = (db.users || []).find((item) => item.id === pendingPasswordChange.id);
      if (!target) {
        setPasswordError('用户不存在');
        setChangingPassword(false);
        return;
      }
      target.password = nextPassword;
      target.mustResetPassword = false;
      saveStaticDb(db);
      setChangingPassword(false);
      completeLogin(pendingPasswordChange);
      return;
    }
    const res = await fetch(`${API}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pendingPasswordChange.token}`
      },
      body: JSON.stringify({ newPassword: nextPassword })
    });
    setChangingPassword(false);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setPasswordError(payload.error || '密码修改失败');
      return;
    }
    completeLogin(pendingPasswordChange);
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
    setNoticeRows((rows) => [...rows, createBlankNoticeRow({ inspectionApplicant: user.name })]);
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
    const normalizedRows = previewRows.map((row) => normalizeNoticeDimensions(row, supplierOptions, productLineOptions, seriesOptions, dimensionLibrary, seriesByProductLine));
    const validationMessage = validateNoticeRows(normalizedRows, supplierOptions, productLineOptions, seriesOptions, seriesByProductLine);
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }
    const mergedRows = mergeNoticeRowsForImport(normalizedRows);
    setNoticeRows((rows) => {
      const activeRows = rows.filter((row) =>
        NOTICE_FIELDS.some((field) => !field.readonly && normalize(row[field.key])) ||
        normalize(row.inspectionApplicant)
      );
      const combined = [...activeRows, ...mergedRows];
      const userFillableKeys = [
        'supplierFinishTime', 'shipmentTime',
        'supplierShortName', 'supplierAddress', 'businessDepartments',
        'operation', 'firstInspection', 'salesProductLine', 'series',
        'totalQuantity', 'skuQuantity', 'remark'
      ];
      const hasContent = (row) => userFillableKeys.some((key) => normalize(row[key]));
      const nonBlank = combined.filter(hasContent);
      return nonBlank.length > 0 ? nonBlank : [createBlankNoticeRow({ inspectionApplicant: user.name })];
    });
    const mergeText = mergedRows.length === previewRows.length ? '' : `，由 ${previewRows.length} 条合并为 ${mergedRows.length} 条`;
    setMessage(`批量导入成功：已加入 ${mergedRows.length} 条验货通知${mergeText}。`);
    setNoticeImportPreview(null);
  }

  function clearNoticeImportPreview() {
    setNoticeImportPreview(null);
    setMessage('已清空验货通知导入预览。');
  }

  async function previewLedgerRows(files) {
    const file = files?.[0];
    if (!file) return;
    try {
      const result = await parseWorkbookInBrowser(file);
      const items = importedRowsToSummaryItems(result.rows || [], user.name);
      if (!items.length) {
        setMessage('未识别到可导入的台账数据，请检查表头是否包含供应商/产品线/系列等列。');
        return;
      }
      setLedgerImportPreview({
        fileName: file.name,
        sheetName: result.sheetName || '',
        items,
        parsedAt: nowText()
      });
      setMessage(`台账文件已解析：共 ${items.length} 条，请检查预览后确认导入。`);
    } catch {
      setMessage('台账文件解析失败，请检查文件格式。');
    }
  }

  async function confirmLedgerImport() {
    const items = ledgerImportPreview?.items || [];
    if (!items.length) {
      setMessage('暂无可导入的台账预览数据。');
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
      setNoticeRows((currentNoticeRows) => {
        const currentIds = new Set(currentNoticeRows.map((row) => row.id));
        const newRows = rows
          .filter((row) => !currentIds.has(row.id))
          .map((row) => createNoticeRow(row));
        return [...currentNoticeRows, ...newRows];
      });
      setRecords(composedStaticRecords(db).filter((record) => canReadClientRecord(user, record)));
      setLedgerImportPreview(null);
      setMessage(`历史台账数据已导入：新增 ${items.length} 条，原有数据已保留。`);
      return;
    }
    const res = await authFetch(`${API}/api/quality-inspection/summary-import?user=${encodeURIComponent(user.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, user: user.name })
    });
    if (!res.ok) {
      setMessage('台账数据导入失败。');
      return;
    }
    const payload = await res.json();
    setNoticeSubmission(payload.notices);
    setNoticeRows(payload.notices.rows.map((row) => createNoticeRow(row)));
    setRecords(payload.rows || []);
    setLedgerImportPreview(null);
    setMessage(`历史台账数据已导入：新增 ${items.length} 条，原有数据已保留。`);
  }

  function clearLedgerImportPreview() {
    setLedgerImportPreview(null);
    setMessage('已清空台账导入预览。');
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
    if (!isPrimaryAdminUser(user)) {
      setMessage('仅孙立柱管理员可以删除验货通知行。');
      return;
    }
    setNoticeRows((rows) => rows.length > 1 ? rows.filter((row) => row.id !== id) : [createBlankNoticeRow({ inspectionApplicant: user.name })]);
  }

  function clearNoticeRows() {
    if (!isPrimaryAdminUser(user)) {
      setMessage('仅孙立柱管理员可以清除验货通知内容。');
      return;
    }
    setNoticeRows([createBlankNoticeRow({ inspectionApplicant: user.name })]);
    setNoticeImportPreview(null);
    setMessage('已清除当前验货通知填写内容。');
  }

  async function submitNoticesRows(sourceRows, { append = false, clearRows = true, successText = '' } = {}) {
    const userFillableKeys = [
      'supplierFinishTime', 'shipmentTime',
      'supplierShortName', 'supplierAddress', 'businessDepartments',
      'operation', 'firstInspection', 'salesProductLine', 'series',
      'totalQuantity', 'skuQuantity', 'remark'
    ];
    const rows = mergeNoticeRowsForImport(sourceRows
      .map((row) => ({
        ...row,
        businessDepartments: joinBusinessDepartments(splitMultiValue(row.businessDepartments)),
        inspectionApplicant: user.name,
        inspectionNotifier: normalize(row.inspectionNotifier) || user.name
      }))
      .map((row) => normalizeNoticeDimensions(row, supplierOptions, productLineOptions, seriesOptions, dimensionLibrary, seriesByProductLine))
      .filter((row) => userFillableKeys.some((key) => normalize(row[key]))));
    if (!rows.length) {
      setMessage('请至少填写一条验货通知后再提交。');
      return;
    }
    const validationMessage = validateNoticeRows(rows, supplierOptions, productLineOptions, seriesOptions, seriesByProductLine);
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }
    const effectiveAppend = append || rows.some((row) => normalize(row.importSource) === 'noticeImport');
    if (STATIC_MODE) {
      const db = readStaticDb();
      const existingRows = db.qualityInspection.notices.rows || [];
      const rowIds = new Set(rows.map((row) => row.id).filter(Boolean));
      const nextRows = effectiveAppend
        ? [
            ...existingRows.filter((row) => !rowIds.has(row.id)),
            ...rows
          ]
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
      if (clearRows) setNoticeRows([createBlankNoticeRow({ inspectionApplicant: user.name })]);
      setNoticeImportPreview(null);
      setRecords(composedStaticRecords(db).filter((record) => canReadClientRecord(user, record)));
      setMessage(successText || `验货通知已提交：共 ${payload.rows.length} 条。`);
      return true;
    }
    const params = new URLSearchParams({ user: user.name });
    if (effectiveAppend) params.set('append', '1');
    const res = await authFetch(`${API}/api/quality-inspection/notices?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, user: user.name, append: effectiveAppend })
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setMessage(payload.error || '验货通知提交失败。');
      return false;
    }
    const payload = await res.json();
    setNoticeSubmission(payload);
    if (clearRows) setNoticeRows([createBlankNoticeRow({ inspectionApplicant: user.name })]);
    setNoticeImportPreview(null);
    setMessage(successText || `验货通知已提交：共 ${payload.rows.length} 条。`);
    await refreshRecords();
    return true;
  }

  async function submitNotices() {
    await submitNoticesRows(noticeRows);
  }

  async function submitNoticeRow(row) {
    const saved = await submitNoticesRows([row], {
      append: true,
      clearRows: false,
      successText: '已提交 1 条验货通知。'
    });
    if (!saved) return;
    setNoticeRows((rows) => {
      const nextRows = rows.filter((item) => item.id !== row.id);
      return nextRows.length ? nextRows : [createBlankNoticeRow({ inspectionApplicant: user.name })];
    });
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
        const serverLibrary = normalizeDimensionLibrary((await res.json()).library || {});
        const nextLibrary = { ...serverLibrary };
        Object.entries(dimensionPendingFilesRef.current || {}).forEach(([slotId, pendingFile]) => {
          const pendingRecord = dimensionLibraryRef.current?.[slotId];
          if (!pendingFile || !pendingRecord || pendingRecord.applied) return;
          nextLibrary[slotId] = pendingRecord;
        });
        dimensionLibraryRef.current = nextLibrary;
        setDimensionLibrary(nextLibrary);
        clearDimensionLibraryCache();
        return nextLibrary;
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
    dimensionLibraryRef.current = library;
    dimensionPendingFilesRef.current = {};
    setDimensionLibrary(library);
    setDimensionPendingFiles({});
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

  async function createUserAccount(name, password) {
    if (!isPrimaryAdminUser(user)) {
      setMessage('仅孙立柱管理员可以创建账号。');
      return false;
    }
    setSavingId('creating');
    if (STATIC_MODE) {
      const db = readStaticDb();
      const exists = (db.users || []).some((item) => item.name === name);
      if (exists) {
        setMessage('该用户已存在。');
        setSavingId('');
        return false;
      }
      const createdUser = { id: createId(), name, password, role: ROLE_USER, pageAccess: [] };
      db.users = [...(db.users || []), createdUser];
      saveStaticDb(db);
      setPermissionUsers(db.users);
      setSavingId('');
      setMessage(`用户 ${name} 已创建。`);
      return true;
    }
    const res = await authFetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password })
    });
    setSavingId('');
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setMessage(payload.error || '创建失败。');
      return false;
    }
    const payload = await res.json();
    setPermissionUsers((current) => [
      ...current,
      { id: payload.id, name: payload.name, role: payload.role, pageAccess: payload.pageAccess || [] }
    ]);
    setMessage(`用户 ${name} 已创建。`);
    return true;
  }

  async function resetUserPassword(targetUser) {
    if (!targetUser?.id) return;
    if (!isPrimaryAdminUser(user)) {
      setMessage('仅孙立柱管理员可以重置密码。');
      return;
    }
    if (!window.confirm(`确认重置 ${targetUser.name} 的密码？重置后密码为 123456，用户需在首次登录时修改。`)) return;
    setSavingId(targetUser.id);
    if (STATIC_MODE) {
      const db = readStaticDb();
      const target = (db.users || []).find((item) => item.id === targetUser.id);
      if (target) {
        target.password = '123456';
        target.mustResetPassword = true;
        saveStaticDb(db);
      }
      setSavingId('');
      setMessage(`${targetUser.name} 的密码已重置为 123456。`);
      return;
    }
    const res = await authFetch(`${API}/api/auth/users/${encodeURIComponent(targetUser.id)}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: '123456' })
    });
    setSavingId('');
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setMessage(payload.error || '重置失败。');
      return;
    }
    const payload = await res.json();
    setMessage(payload.message || `${targetUser.name} 的密码已重置。`);
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
      dimensionLibraryRef.current = next;
      setDimensionLibrary(next);
      setDimensionPendingFiles((current) => {
        const pending = { ...current, [slotId]: file };
        dimensionPendingFilesRef.current = pending;
        return pending;
      });
      setMessage(saved
        ? `维度表文件库已读取：${displayFileName}，共 ${record.sheetCount} 个工作表、${record.importedCount} 行，请点击应用刷新同步。`
        : `维度表文件库已读取：${displayFileName}，共 ${record.sheetCount} 个工作表、${record.importedCount} 行；文件较大，已保留预览信息但浏览器缓存保存失败。`);
    } catch (error) {
      setMessage(`维度表文件库读取失败：${error?.message || '请检查文件格式、工作表内容或表头位置。'}`);
    }
  }

  async function applyDimensionSlot(slotId) {
    const currentLibrary = dimensionLibraryRef.current || dimensionLibrary;
    const currentPendingFiles = dimensionPendingFilesRef.current || dimensionPendingFiles;
    const existing = currentLibrary[slotId];
    if (!existing) {
      setMessage('该槽位暂无可应用文件。');
      return;
    }
    const pendingFile = currentPendingFiles[slotId];
    if (!STATIC_MODE && !pendingFile && !existing.storedFileName) {
      setMessage('请先重新上传维度表文件，再应用刷新到服务器。');
      return;
    }
    if (!STATIC_MODE && !pendingFile && existing.applied) {
      setMessage(`${existing.fileName} 已是服务器当前应用文件。`);
      return;
    }
    const next = {
      ...currentLibrary,
      [slotId]: { ...existing, applied: true, appliedAt: nowText() }
    };
    if (STATIC_MODE) {
      const saved = saveDimensionLibrary(next);
      dimensionLibraryRef.current = next;
      setDimensionLibrary(next);
      setDimensionPendingFiles((current) => {
        const pending = { ...current, [slotId]: null };
        dimensionPendingFilesRef.current = pending;
        return pending;
      });
      setMessage(saved ? `${existing.fileName} 已应用刷新。` : `${existing.fileName} 已应用刷新，但浏览器缓存保存失败。`);
      return;
    }
    setSavingId(slotId);
    const form = new FormData();
    const uploadFileName = fixMojibakeText(pendingFile.name) || existing.fileName || `dimension-${Date.now()}`;
    form.append('file', pendingFile, uploadFileName);
    form.append('record', JSON.stringify(next[slotId]));
    const res = await authFetch(`${API}/api/quality-inspection/dimension-library/${encodeURIComponent(slotId)}/apply`, {
      method: 'POST',
      body: form
    });
    setSavingId('');
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setMessage(payload.error || `${existing.fileName} 应用刷新失败，服务器未保存。`);
      return;
    }
    const payload = await res.json();
    const library = normalizeDimensionLibrary(payload.library || {});
    dimensionLibraryRef.current = library;
    setDimensionLibrary(library);
    setDimensionPendingFiles((current) => {
      const pending = { ...current, [slotId]: null };
      dimensionPendingFilesRef.current = pending;
      return pending;
    });
    setMessage(`${existing.fileName} 已上传到腾讯云服务器并应用，其他用户可读取最新文件。`);
  }

  async function deleteDimensionSlot(slotId) {
    if (!isPrimaryAdminUser(user)) {
      setMessage('仅孙立柱管理员可以删除维度表槽位。');
      return;
    }
    const next = { ...dimensionLibrary, [slotId]: null };
    if (STATIC_MODE) {
      const saved = saveDimensionLibrary(next);
      dimensionLibraryRef.current = next;
      setDimensionLibrary(next);
      setDimensionPendingFiles((current) => {
        const pending = { ...current, [slotId]: null };
        dimensionPendingFilesRef.current = pending;
        return pending;
      });
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
    const library = normalizeDimensionLibrary(payload.library || {});
    dimensionLibraryRef.current = library;
    setDimensionLibrary(library);
    setDimensionPendingFiles((current) => {
      const pending = { ...current, [slotId]: null };
      dimensionPendingFilesRef.current = pending;
      return pending;
    });
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
    const missingRequired = entries.find(([, draft]) => !normalize(draft.inspector) || !normalize(draft.scheduledDate));
    if (missingRequired) {
      setMessage('验货安排提交失败：验货员和计划验货时间为必填项。');
      return;
    }
    setSavingId(savingKey);
    if (STATIC_MODE) {
      const db = readStaticDb();
      entries.forEach(([recordId, draft]) => {
        const targetIds = Array.isArray(draft.sourceIds) && draft.sourceIds.length ? draft.sourceIds : [recordId];
        const scheduledDate = normalize(draft.scheduledDate);
        const inspector = normalize(draft.inspector);
        targetIds.forEach((targetId) => {
          const status = scheduledDate || inspector ? '已安排' : '未安排';
          db.qualityInspection.schedules[targetId] = {
            ...(db.qualityInspection.schedules[targetId] || {}),
            scheduledDate,
            inspector,
            remark: normalize(draft.remark),
            status,
            updatedAt: nowText()
          };
          const feedback = db.qualityInspection.feedback[targetId] || {};
          const rework = feedback.rework || {};
          if (status === '已安排' && (normalize(rework.completedAt) || normalize(rework.reworkCompleteTime))) {
            db.qualityInspection.feedback[targetId] = {
              ...feedback,
              rework: {
                ...rework,
                status: '待验货',
                scheduledAt: nowText(),
                scheduledBy: user.name,
                updatedAt: nowText(),
                updatedBy: user.name
              },
              updatedAt: nowText()
            };
          }
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
    if (!isPrimaryAdminUser(user)) {
      setMessage('仅孙立柱管理员可以清除验货安排内容。');
      return;
    }
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
      setNoticeRows([createBlankNoticeRow({ inspectionApplicant: user.name })]);
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
    setNoticeRows([createBlankNoticeRow({ inspectionApplicant: user.name })]);
    setRecords([]);
    setMessage('验货安排内容已全部清除，请重新提交验货通知。');
  }

  async function deleteScheduleNotice(recordIds) {
    if (!isPrimaryAdminUser(user)) {
      setMessage('仅孙立柱管理员可以删除验货安排记录。');
      return;
    }
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

  async function saveFeedback(record, formElement, cachedReportFile) {
    setSavingId(record.id);
    const form = new FormData(formElement);
    const formFile = form.get('reportFile');
    const file = cachedReportFile instanceof File && cachedReportFile.size > 0 ? cachedReportFile : formFile;
    const sourceIds = Array.isArray(record.sourceIds) && record.sourceIds.length ? record.sourceIds : [record.id];
    const savedAt = nowText();
    const feedbackPatch = {
      actualInspectionTime: normalize(form.get('actualInspectionTime')),
      inspectionMethod: normalize(form.get('inspectionMethod')),
      inspectionQuantity: normalize(form.get('inspectionQuantity')),
      checkQuantity: normalize(form.get('checkQuantity')),
      qualifiedQuantity: normalize(form.get('qualifiedQuantity')),
      result: normalize(form.get('result')),
      issueLevel: normalize(form.get('issueLevel')),
      issueCategoryPrimary: normalize(form.get('issueCategoryPrimary')),
      issueCategorySecondary: normalize(form.get('issueCategorySecondary')),
      actualInspector: normalize(form.get('actualInspector')),
      feedbackText: normalize(form.get('feedbackText'))
    };
    const isRework = feedbackPatch.result === '返工';
    const feedbackSubmitId = isRework ? createId() : '';
    const feedbackPatchForRecord = (sourceRecord = record) => {
      const existingRework = sourceRecord.rework || sourceRecord.feedback?.rework || {};
      if (!isRework) {
        if (normalize(existingRework.status) === '待验货') {
          return {
            ...feedbackPatch,
            rework: {
              ...existingRework,
              status: '已复验',
              reinspectedAt: savedAt,
              reinspectedBy: user.name,
              updatedAt: savedAt,
              updatedBy: user.name
            }
          };
        }
        return feedbackPatch;
      }
      const nextRework = {
        ...existingRework,
        source: 'inspectionFeedback',
        feedbackSubmitId: normalize(existingRework.feedbackSubmitId) || feedbackSubmitId,
        requestedAt: savedAt,
        requestedBy: user.name,
        status: '待复验',
        sourceFeedback: {
          actualInspectionTime: feedbackPatch.actualInspectionTime,
          result: feedbackPatch.result,
          issueLevel: feedbackPatch.issueLevel,
          issueCategoryPrimary: feedbackPatch.issueCategoryPrimary,
          feedbackText: feedbackPatch.feedbackText
        },
        updatedAt: savedAt,
        updatedBy: user.name
      };
      delete nextRework.completedAt;
      delete nextRework.completedBy;
      delete nextRework.reworkCompleteTime;
      delete nextRework.reworkRemark;
      delete nextRework.scheduledAt;
      delete nextRework.scheduledBy;
      return {
        ...feedbackPatch,
        rework: nextRework
      };
    };
    const reportNo = isRework ? '' : feedbackReportNo(record, feedbackPatch.actualInspectionTime, feedbackPatch.inspectionQuantity);
    if (!isRework && file instanceof File && file.size > 0 && !reportNo) {
      setSavingId('');
      setMessage('请先填写实际验货时间和实际验货数量，系统会自动生成检验报告单编码后再上传检验报告单。');
      return false;
    }
    if (STATIC_MODE) {
      const db = readStaticDb();
      sourceIds.forEach((sourceId) => {
        const sourceRecord = records.find((item) => item.id === sourceId) || record;
        const patch = feedbackPatchForRecord(sourceRecord);
        db.qualityInspection.feedback[sourceId] = {
          ...(db.qualityInspection.feedback[sourceId] || {}),
          ...patch,
          updatedAt: savedAt
        };
      });
      if (!isRework && file instanceof File && file.size > 0) {
        const reportFileName = reportFileNameFromCode(reportNo, file.name);
        db.qualityInspection.reports[record.id] = {
          ...(db.qualityInspection.reports[record.id] || {}),
          reportNo,
          originalName: reportFileName,
          fileDataUrl: await readFileAsDataUrl(file),
          uploadedAt: nowText(),
          updatedAt: nowText()
        };
      } else if (!isRework && reportNo) {
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
        body: JSON.stringify({ ...(sourceRecord.feedback || {}), ...feedbackPatchForRecord(sourceRecord) })
      });
    }));
    setSavingId('');
    if (feedbackResponses.some((res) => !res.ok)) {
      setMessage('验货反馈保存失败。');
      return false;
    }
    if (!isRework && file instanceof File && file.size > 0) {
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
    } else if (!isRework && reportNo && reportNo !== normalize(record.report?.reportNo)) {
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

  async function deleteReport(record) {
    if (!isPrimaryAdminUser(user)) {
      setMessage('仅孙立柱管理员可以删除检验报告单。');
      return;
    }
    if (!window.confirm('确认删除该检验报告单？删除后可重新上传。')) return;
    setSavingId(record.id);
    if (STATIC_MODE) {
      const db = readStaticDb();
      delete db.qualityInspection.reports[record.id];
      saveStaticDb(db);
      setSavingId('');
      setRecords(composedStaticRecords(db).filter((item) => canReadClientRecord(user, item)));
      setMessage('检验报告单已删除，可以重新上传。');
      return;
    }
    const res = await authFetch(`${API}/api/quality-inspection/reports/${encodeURIComponent(record.id)}`, { method: 'DELETE' });
    setSavingId('');
    if (res.ok) {
      await refreshRecords();
      setMessage('检验报告单已删除，可以重新上传。');
    } else {
      setMessage('检验报告单删除失败。');
    }
  }

  async function addDirectFeedback(formElement) {
    setSavingId('directFeedback');
    const form = new FormData(formElement);
    const id = createId();
    const createdAt = nowText();
    const actualInspectionTime = normalize(form.get('actualInspectionTime'));
    const inspectionQuantity = normalize(form.get('inspectionQuantity'));
    const tempRecord = {
      supplierShortName: normalize(form.get('supplierShortName')),
      series: normalize(form.get('series'))
    };
    const reportNo = feedbackReportNo(tempRecord, actualInspectionTime, inspectionQuantity);
    const issueCategoryValues = form.getAll('issueCategoryPrimary').filter(Boolean);
    const file = form.get('reportFile');
    if (file instanceof File && file.size > 0 && !reportNo) {
      setSavingId('');
      setMessage('请先填写实际验货时间和实际验货数量，系统生成检验报告单编码后再上传检验报告单。');
      return false;
    }
    const newRow = {
      id,
      inspectionApplicant: user.name,
      inspectionNotifier: user.name,
      inspectionFillTime: createdAt,
      supplierFinishTime: '',
      shipmentTime: actualInspectionTime,
      supplierShortName: normalize(form.get('supplierShortName')),
      supplierAddress: '',
      businessDepartments: '',
      operation: '',
      firstInspection: '否',
      salesProductLine: normalize(form.get('salesProductLine')),
      series: normalize(form.get('series')),
      totalQuantity: normalize(form.get('totalQuantity')),
      skuQuantity: normalize(form.get('skuQuantity')),
      remark: '验货员手动新增',
      importSource: 'directFeedback'
    };
    const feedback = {
      actualInspectionTime,
      inspectionMethod: normalize(form.get('inspectionMethod')),
      inspectionQuantity,
      checkQuantity: normalize(form.get('checkQuantity')),
      qualifiedQuantity: normalize(form.get('qualifiedQuantity')),
      result: normalize(form.get('result')),
      issueLevel: normalize(form.get('issueLevel')),
      issueCategoryPrimary: issueCategoryValues.join('、'),
      feedbackText: normalize(form.get('feedbackText')),
      actualInspector: user.name,
      updatedAt: createdAt
    };
    const isRework = feedback.result === '返工';
    if (isRework) {
      feedback.rework = {
        source: 'inspectionFeedback',
        feedbackSubmitId: createId(),
        requestedAt: createdAt,
        requestedBy: user.name,
        status: '待复验',
        sourceFeedback: {
          actualInspectionTime: feedback.actualInspectionTime,
          result: feedback.result,
          issueLevel: feedback.issueLevel,
          issueCategoryPrimary: feedback.issueCategoryPrimary,
          feedbackText: feedback.feedbackText
        },
        updatedAt: createdAt,
        updatedBy: user.name
      };
    }
    if (STATIC_MODE) {
      const db = readStaticDb();
      const existingRows = db.qualityInspection.notices.rows || [];
      db.qualityInspection.notices = {
        rows: [...existingRows, newRow].map((row, index) => ({ ...row, rowNumber: index + 1 })),
        submittedAt: createdAt,
        submittedBy: user.name
      };
      db.qualityInspection.schedules[id] = {
        status: '已安排',
        inspector: user.name,
        scheduledDate: actualInspectionTime,
        remark: '未通知验货',
        updatedAt: createdAt
      };
      db.qualityInspection.feedback[id] = feedback;
      if (file instanceof File && file.size > 0 && reportNo) {
        db.qualityInspection.reports[id] = {
          reportNo,
          originalName: reportFileNameFromCode(reportNo, file.name),
          fileDataUrl: await readFileAsDataUrl(file),
          uploadedAt: createdAt,
          updatedAt: createdAt
        };
      } else if (reportNo) {
        db.qualityInspection.reports[id] = { reportNo, updatedAt: createdAt };
      }
      saveStaticDb(db);
      setRecords(composedStaticRecords(db).filter((record) => canReadClientRecord(user, record)));
      setSavingId('');
      setMessage('验货反馈已新增。');
      return true;
    }
    const res = await authFetch(`${API}/api/quality-inspection/direct-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notice: newRow, feedback, report: reportNo ? { reportNo } : undefined })
    });
    if (!res.ok) {
      setSavingId('');
      const payload = await res.json().catch(() => ({}));
      setMessage(payload.error || '验货反馈新增失败。');
      return false;
    }
    const payload = await res.json().catch(() => ({}));
    if (reportNo) {
      const reportForm = new FormData();
      reportForm.append('reportNo', reportNo);
      if (file instanceof File && file.size > 0) reportForm.append('file', file);
      const reportRes = await authFetch(`${API}/api/quality-inspection/reports/${encodeURIComponent(payload.record?.id || id)}`, {
        method: 'POST',
        body: reportForm
      });
      if (!reportRes.ok) {
        setSavingId('');
        await refreshRecords();
        setMessage('验货反馈已新增，但检验报告单保存失败。');
        return false;
      }
    }
    setSavingId('');
    await refreshRecords();
    setMessage('验货反馈已新增。');
    return true;
  }

  async function saveReworkRecord(record, draft = {}) {
    setSavingId(record.id);
    const baseRemark = normalize(record.feedback?.remark);
    const feedbackRemark = baseRemark.includes('返工后验货')
      ? baseRemark
      : (baseRemark ? `${baseRemark}；返工后验货` : '返工后验货');
    const rework = {
      ...(record.rework || {}),
      reworkCompleteTime: normalize(draft.reworkCompleteTime),
      reworkRemark: normalize(draft.reworkRemark),
      updatedAt: nowText(),
      updatedBy: user.name
    };
    const reworkSchedule = rework.reworkCompleteTime
      ? {
          ...(record.schedule || {}),
          scheduledDate: '',
          inspector: '',
          status: '未安排',
          remark: normalize(record.schedule?.remark) || '返工后验货',
          reworkRequestedAt: nowText(),
          updatedAt: nowText()
        }
      : null;
    if (rework.reworkCompleteTime) {
      rework.completedAt = nowText();
      rework.completedBy = user.name;
      rework.status = '待安排验货';
    } else {
      delete rework.completedAt;
      delete rework.completedBy;
      rework.status = '待复验';
    }
    if (STATIC_MODE) {
      const db = readStaticDb();
      if (rework.reworkCompleteTime) {
        db.qualityInspection.notices.rows = (db.qualityInspection.notices.rows || []).map((row) => (
          row.id === record.id ? { ...row, shipmentTime: rework.reworkCompleteTime } : row
        ));
        db.qualityInspection.schedules[record.id] = reworkSchedule;
      }
      db.qualityInspection.feedback[record.id] = {
        ...(db.qualityInspection.feedback[record.id] || record.feedback || {}),
        remark: feedbackRemark,
        rework
      };
      saveStaticDb(db);
      setSavingId('');
      setRecords(composedStaticRecords(db).filter((item) => canReadClientRecord(user, item)));
      setMessage('复验通知已保存。');
      return true;
    }
    const res = await authFetch(`${API}/api/quality-inspection/feedback/${encodeURIComponent(record.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(record.feedback || {}), remark: feedbackRemark, rework, reworkSchedule })
    });
    setSavingId('');
    if (!res.ok) {
      setMessage('复验通知保存失败。');
      return false;
    }
    await refreshRecords();
    setMessage('复验通知已保存。');
    return true;
  }

  async function deleteReworkRecord(record) {
    if (!isPrimaryAdminUser(user)) {
      setMessage('仅孙立柱管理员可以删除复验通知。');
      return false;
    }
    if (!record || !window.confirm('确认删除当前复验通知？')) return false;
    const deletedAt = nowText();
    const deletedRework = {
      ...(record.rework || {}),
      status: '已删除',
      deletedAt,
      deletedBy: user.name,
      updatedAt: deletedAt,
      updatedBy: user.name
    };
    [
      'completedAt',
      'completedBy',
      'reworkCompleteTime',
      'reworkRemark',
      'scheduledAt',
      'scheduledBy',
      'reinspectedAt',
      'reinspectedBy'
    ].forEach((key) => {
      delete deletedRework[key];
    });
    setSavingId(record.id);
    if (STATIC_MODE) {
      const db = readStaticDb();
      db.qualityInspection.feedback[record.id] = {
        ...(db.qualityInspection.feedback[record.id] || record.feedback || {}),
        rework: deletedRework
      };
      saveStaticDb(db);
      setSavingId('');
      setRecords(composedStaticRecords(db).filter((item) => canReadClientRecord(user, item)));
      setMessage('复验通知已删除。');
      return true;
    }
    const res = await authFetch(`${API}/api/quality-inspection/feedback/${encodeURIComponent(record.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(record.feedback || {}), rework: deletedRework })
    });
    setSavingId('');
    if (!res.ok) {
      setMessage('复验通知删除失败。');
      return false;
    }
    await refreshRecords();
    setMessage('复验通知已删除。');
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
      const normalizedRotation = ((Number(rotation) || 0) % 360 + 360) % 360;
      const canReuseOriginalImage = skipStamp && normalizedRotation === 0;
      const fileDataUrl = stampedDataUrl || (
        canReuseOriginalImage
          ? (record.report?.fileDataUrl || '')
          : skipStamp
            ? await createRotatedReportImageDataUrl(record, rotation)
            : await createStampedImageDataUrl(record, rotation)
      );
      if (record.isStampUpload) {
        const fileName = normalizeStampUploadFileName(record.report?.fileName || record.report?.originalName, record.report?.originalName || `stamped-${Date.now()}.png`);
        const uploadSource = fileDataUrl || reportHref(record);
        if (STATIC_MODE) {
          const nextFiles = [
            ...readReportFileLibrary(),
            {
              id: createId(),
              fileName,
              fileUrl: uploadSource,
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
          form.append('files', await dataUrlToFile(uploadSource, fileName));
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
          ...(fileDataUrl ? { fileDataUrl } : {}),
          ...(skipStamp
            ? { stampSkippedAt: nowText(), stampSkippedBy: user.name }
            : { stampedAt: nowText(), stampedBy: user.name }),
          stampRotation: normalizedRotation,
          updatedAt: nowText()
        };
        saveStaticDb(db);
        setRecords(composedStaticRecords(db).filter((item) => canReadClientRecord(user, item)));
        setMessage(skipStamp ? '图片已按当前方向保存，文件已覆盖保存。' : '检验章已加盖，文件已覆盖保存。');
        return true;
      }
      const stampFileName = record.report?.fileName || record.report?.originalName || 'stamped-report.png';
      const form = new FormData();
      if (fileDataUrl) form.append('file', await dataUrlToFile(fileDataUrl, stampFileName));
      form.append('rotation', String(normalizedRotation));
      form.append('skipStamp', skipStamp ? '1' : '0');
      const res = await authFetch(`${API}/api/quality-inspection/reports/${encodeURIComponent(record.id)}/stamp`, {
        method: 'POST',
        body: form
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setMessage(payload.error || '检验章加盖失败。');
        return false;
      }
      await refreshRecords();
      setMessage(skipStamp ? '图片已按当前方向保存到报告单文件库。' : '检验章已加盖，文件已覆盖保存到报告单文件库。');
      return true;
    } catch (error) {
      console.error('stampReport failed', error);
      setMessage(`检验章加盖失败：${error?.message || '请确认报告单图片可以正常打开。'}`);
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
  const queryableReportLibraryItems = useMemo(() => (
    reportLibraryItems.filter((file) => (
      file.stampedAt
      || file.stampSkippedAt
      || !normalize(file.recordId)
      || normalize(file.source).includes('历史')
    ))
  ), [reportLibraryItems]);
  const reportLibraryRecordIds = useMemo(() => (
    new Set(queryableReportLibraryItems.map((file) => normalize(file.recordId)).filter(Boolean))
  ), [queryableReportLibraryItems]);
  const reportLibraryQueryRecords = useMemo(() => {
    const keyword = normalize(query).toLowerCase();
    const normalizedFilters = Object.fromEntries(
      Object.entries(recordFilters).map(([key, value]) => [key, normalize(value).toLowerCase()])
    );
    if (statusFilter) return [];
    return queryableReportLibraryItems
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
  }, [queryableReportLibraryItems, query, statusFilter, recordFilters]);

  async function uploadReportLibraryFiles(files) {
    const selectedFiles = Array.from(files || []).filter(isReportLibraryFile);
    if (!selectedFiles.length) {
      setMessage('没有可上传的检验报告单文件。');
      return;
    }
    setSavingId('inspectionReportLibrary');
    if (STATIC_MODE) {
      try {
        const uploaded = await Promise.all(selectedFiles.map(async (file) => {
          const cleanName = String(file.name || '').replace(/^.*[\\/]/, '');
          return {
            id: createId(),
            fileName: cleanName,
            fileUrl: await readFileAsDataUrl(file),
            size: file.size,
            source: '历史上传',
            modifiedAt: nowText()
          };
        }));
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
    if (!isPrimaryAdminUser(user)) {
      setMessage('仅孙立柱管理员可以删除报告单文件。');
      return;
    }
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

  async function deleteReportLibraryFiles(files) {
    if (!isPrimaryAdminUser(user)) {
      setMessage('仅孙立柱管理员可以批量删除报告单文件。');
      return false;
    }
    const targetFiles = Array.from(files || []).filter((file) => file?.fileName);
    if (!targetFiles.length) {
      setMessage('请选择要删除的文件。');
      return false;
    }
    if (!window.confirm(`确认删除选中的 ${targetFiles.length} 个报告单文件？`)) return false;
    setSavingId('inspectionReportLibrary-batch-delete');
    if (STATIC_MODE) {
      const targetIds = new Set(targetFiles.map((file) => file.id).filter(Boolean));
      const targetNames = new Set(targetFiles.map((file) => file.fileName).filter(Boolean));
      const db = readStaticDb();
      targetFiles.forEach((file) => {
        if (!file.recordId) return;
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
      });
      const nextFiles = readReportFileLibrary().filter((item) => !targetIds.has(item.id) && !targetNames.has(item.fileName));
      saveReportFileLibrary(nextFiles);
      saveStaticDb(db);
      setReportFiles(nextFiles);
      setRecords(composedStaticRecords(db).filter((record) => canReadClientRecord(user, record)));
      setSavingId('');
      setMessage(`已删除 ${targetFiles.length} 个报告单文件。`);
      return true;
    }
    const res = await authFetch(`${API}/api/quality-inspection/report-files/batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileNames: targetFiles.map((file) => file.fileName) })
    });
    setSavingId('');
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setMessage(payload.error || '批量删除文件失败。');
      return false;
    }
    const payload = await res.json();
    setReportFiles(payload.files || []);
    await refreshRecords();
    setMessage(`已删除 ${payload.deleted || targetFiles.length} 个报告单文件。`);
    return true;
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
    const rows = reportQueryRecords.map((record, index) => recordToReportExportRow(record, index, reportHref));
    if (!rows.length) {
      setMessage('暂无可导出的检验单数据。');
      return;
    }
    await exportRowsToWorkbook(rows, '查询检验单', `查询检验单导出-${exportFileStamp()}.xlsx`);
    setMessage(`查询检验单已导出：${rows.length} 条。`);
  }

  async function exportSummaryData(title = '验货台账', sourceRecords = summaryRecords) {
    const rows = sourceRecords.map((record, index) => recordToMigrationLedgerRow(record, index, reportHref));
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

  if (pendingPasswordChange) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <h1>品质验货</h1>
          <h2>首次登录，请设置新密码</h2>
          <p className="auth-note">当前用户：{pendingPasswordChange.name}</p>
          <label>
            新密码
            <input
              type="password"
              placeholder="新密码（至少4位）"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <label>
            确认新密码
            <input
              type="password"
              placeholder="确认新密码"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          {passwordError && <p className="message error-message">{passwordError}</p>}
          <button type="button" onClick={handleChangePassword} disabled={changingPassword}>
            {changingPassword ? '处理中' : '设置密码并登录'}
          </button>
          <button type="button" className="ghost auth-switch-button" onClick={logout}>返回登录</button>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="login-shell">
        <form className="login-panel" onSubmit={submitAuth} autoComplete="off">
          <h1>品质验货</h1>
          <p className="auth-note">账号由管理员孙立柱创建并授权页面后才能进入系统。</p>
          {message && <p className="message">{message}</p>}
          {authMode === 'login' ? (
            <>
              <input className="auth-hidden-autofill" type="text" name="username" autoComplete="username" tabIndex="-1" aria-hidden="true" />
              <input className="auth-hidden-autofill" type="password" name="password" autoComplete="current-password" tabIndex="-1" aria-hidden="true" />
              <label>
                姓名
                <input
                  data-login-clear="true"
                  name="qi-login-name"
                  autoComplete="new-password"
                  value={loginName}
                  onChange={(event) => setLoginName(event.target.value)}
                />
              </label>
              <label>
                密码
                <input
                  data-login-clear="true"
                  name="qi-login-pass"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button type="submit">登录</button>
            </>
          ) : (
            <>
              <label>
                姓名
                <input name="qi-register-name" autoComplete="off" value={registerName} onChange={(event) => setRegisterName(event.target.value)} />
              </label>
              <label>
                密码
                <input name="qi-register-pass" type="password" autoComplete="new-password" value={registerPassword} onChange={(event) => setRegisterPassword(event.target.value)} />
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
        <span className="app-version-time">更新时间：{appVersionTime}</span>
        <nav className="sidebar-nav">
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
        </nav>
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
            onSubmitRow={submitNoticeRow}
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
            onAddFeedback={addDirectFeedback}
            canDelete={canDeleteInspectionInfo}
            onDelete={deleteInspectionRecord}
            onDeleteReport={deleteReport}
          />
        )}
        {canAccessPage(user, 'reworkRecords') && activeTab === 'reworkRecords' && (
          <ReworkRecordsPage
            records={reworkRecords}
            savingId={savingId}
            onSave={saveReworkRecord}
            onDelete={deleteReworkRecord}
            canDelete={isAdminUser(user)}
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
            onBatchDelete={deleteReportLibraryFiles}
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
            reportLibraryItems={queryableReportLibraryItems}
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
        {canAccessPage(user, 'inspectionLedger') && activeTab === 'inspectionLedger' && (
          <LedgerPage
            records={displayRecords}
            canImport={isAdminUser(user)}
            importPreview={ledgerImportPreview}
            onUpload={previewLedgerRows}
            onConfirmImport={confirmLedgerImport}
            onClearImportPreview={clearLedgerImportPreview}
            canDelete={canDeleteInspectionInfo}
            onDelete={deleteInspectionRecord}
            onExport={(sourceRecords) => exportSummaryData('验货台账', sourceRecords || displayRecords)}
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
            onCreateUser={createUserAccount}
            onResetPassword={resetUserPassword}
          />
        )}
      </section>
    </main>
  );
}

export default App;
