import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';
import './styles.css';

const API = import.meta.env.DEV ? 'http://localhost:4002' : '';
const STATIC_MODE = import.meta.env.PROD;
const STATIC_DB_KEY = 'qualityInspectionStaticDb';

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

const MENU_PAGES = [
  { tab: 'inspectionNotice', label: '验货通知' },
  { tab: 'inspectionSchedule', label: '验货安排' },
  { tab: 'inspectionReportUpload', label: '检验报告单回传' },
  { tab: 'inspectionFeedback', label: '验货反馈' },
  { tab: 'inspectionReportQuery', label: '检验报告单查询' },
  { tab: 'inspectionSummary', label: '验货信息汇总表' },
  { tab: 'inspectionInitialData', label: '验货信息初始数据' }
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
    users: [
      { id: 'u-admin', name: '管理员', password: '123456', role: '管理员' },
      { id: 'u-user', name: '验货员', password: '123456', role: '普通用户' }
    ],
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
  return {
    users: Array.isArray(db.users) && db.users.length ? db.users : fallback.users,
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
  if (record.report?.fileName) return `${API}/uploads/${record.report.fileName}`;
  return '';
}

function App() {
  const [activeTab, setActiveTab] = useState('inspectionNotice');
  const [authMode, setAuthMode] = useState('login');
  const [loginName, setLoginName] = useState('管理员');
  const [password, setPassword] = useState('123456');
  const [registerName, setRegisterName] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('qualityInspectionUser') || 'null'));
  const [message, setMessage] = useState('');
  const [appVersionTime, setAppVersionTime] = useState('读取中...');
  const [noticeRows, setNoticeRows] = useState(() => [createNoticeRow()]);
  const [noticeSubmission, setNoticeSubmission] = useState({ rows: [], submittedAt: '', submittedBy: '' });
  const [initialData, setInitialData] = useState({ sheetName: '', columns: [], rows: [], updatedAt: '' });
  const [initialImportResult, setInitialImportResult] = useState(null);
  const [records, setRecords] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [savingId, setSavingId] = useState('');

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

  async function loadData() {
    if (STATIC_MODE) {
      const db = readStaticDb();
      const inspection = db.qualityInspection;
      setInitialData(inspection.initialData);
      setNoticeSubmission(inspection.notices);
      setNoticeRows(inspection.notices.rows?.length
        ? inspection.notices.rows.map((row) => createNoticeRow(row))
        : [createNoticeRow({ inspectionApplicant: user.name })]);
      setRecords(composedStaticRecords(db));
      return;
    }
    const [initialRes, noticeRes, recordsRes] = await Promise.all([
      fetch(`${API}/api/quality-inspection/initial-data`, { cache: 'no-store' }),
      fetch(`${API}/api/quality-inspection/notices`, { cache: 'no-store' }),
      fetch(`${API}/api/quality-inspection/records`, { cache: 'no-store' })
    ]);
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
        const payload = { id: matchedUser.id, name: matchedUser.name, role: matchedUser.role };
        localStorage.setItem('qualityInspectionUser', JSON.stringify(payload));
        setUser(payload);
        return;
      }
      if (db.users.some((item) => item.name === name)) {
        setMessage('该姓名已存在。');
        return;
      }
      const newUser = { id: createId(), name, password: inputPassword, role: '普通用户' };
      db.users.push(newUser);
      saveStaticDb(db);
      const payload = { id: newUser.id, name: newUser.name, role: newUser.role };
      localStorage.setItem('qualityInspectionUser', JSON.stringify(payload));
      setUser(payload);
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
      const payload = {
        rows: rows.map((row, index) => ({ ...row, id: row.id || createId(), rowNumber: index + 1 })),
        submittedAt: nowText(),
        submittedBy: user.name
      };
      db.qualityInspection.notices = payload;
      saveStaticDb(db);
      setNoticeSubmission(payload);
      setNoticeRows(payload.rows.map((row) => createNoticeRow(row)));
      setRecords(composedStaticRecords(db));
      setMessage(`验货通知已提交：共 ${payload.rows.length} 条。`);
      return;
    }
    const res = await fetch(`${API}/api/quality-inspection/notices?user=${encodeURIComponent(user.name)}`, {
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
      setRecords(composedStaticRecords(readStaticDb()));
      return;
    }
    const res = await fetch(`${API}/api/quality-inspection/records`, { cache: 'no-store' });
    if (res.ok) setRecords((await res.json()).rows || []);
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
    const res = await fetch(`${API}/api/quality-inspection/initial-data/import`, { method: 'POST', body: form });
    if (!res.ok) {
      setMessage('验货信息初始数据导入失败，请检查文件格式。');
      return;
    }
    const payload = await res.json();
    setInitialData(payload);
    setInitialImportResult(payload);
    setMessage(`验货信息初始数据已读取：成功 ${payload.importedCount || 0} 行。`);
  }

  async function saveSchedule(record, patch) {
    setSavingId(record.id);
    if (STATIC_MODE) {
      const db = readStaticDb();
      db.qualityInspection.schedules[record.id] = {
        ...(db.qualityInspection.schedules[record.id] || {}),
        ...patch,
        updatedAt: nowText()
      };
      saveStaticDb(db);
      setSavingId('');
      setRecords(composedStaticRecords(db));
      setMessage('验货安排已保存。');
      return;
    }
    const res = await fetch(`${API}/api/quality-inspection/schedules/${encodeURIComponent(record.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(record.schedule || {}), ...patch })
    });
    setSavingId('');
    if (!res.ok) {
      setMessage('验货安排保存失败。');
      return;
    }
    await refreshRecords();
    setMessage('验货安排已保存。');
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
      db.qualityInspection.reports[record.id] = {
        ...(db.qualityInspection.reports[record.id] || {}),
        reportNo: normalize(form.get('reportNo')),
        conclusion: normalize(form.get('conclusion')),
        originalName: file instanceof File && file.size > 0 ? file.name : record.report?.originalName || '',
        fileDataUrl,
        uploadedAt: file instanceof File && file.size > 0 ? nowText() : record.report?.uploadedAt || '',
        updatedAt: nowText()
      };
      saveStaticDb(db);
      formElement.reset();
      setSavingId('');
      setRecords(composedStaticRecords(db));
      setMessage('检验报告单已回传。');
      return;
    }
    const form = new FormData(formElement);
    const res = await fetch(`${API}/api/quality-inspection/reports/${encodeURIComponent(record.id)}`, {
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

  async function saveFeedback(record, patch) {
    setSavingId(record.id);
    if (STATIC_MODE) {
      const db = readStaticDb();
      db.qualityInspection.feedback[record.id] = {
        ...(db.qualityInspection.feedback[record.id] || {}),
        ...patch,
        updatedAt: nowText()
      };
      saveStaticDb(db);
      setSavingId('');
      setRecords(composedStaticRecords(db));
      setMessage('验货反馈已保存。');
      return;
    }
    const res = await fetch(`${API}/api/quality-inspection/feedback/${encodeURIComponent(record.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(record.feedback || {}), ...patch })
    });
    setSavingId('');
    if (!res.ok) {
      setMessage('验货反馈保存失败。');
      return;
    }
    await refreshRecords();
    setMessage('验货反馈已保存。');
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

  return (
    <main className="app-shell" onClick={() => setMessage('')}>
      <aside className="sidebar" onClick={(event) => event.stopPropagation()}>
        <h1>品质验货</h1>
        <span className="app-version-time">更新时间：{appVersionTime}</span>
        <div className="menu-group">
          <button type="button" className="menu-group-title">品质验货 <span>▼</span></button>
          <div className="submenu-list">
            {MENU_PAGES.map((page) => (
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
        {activeTab === 'inspectionNotice' && (
          <InspectionNoticePage
            rows={noticeRows}
            submission={noticeSubmission}
            user={user}
            onAdd={addNoticeRow}
            onDelete={deleteNoticeRow}
            onChange={updateNoticeRow}
            onSubmit={submitNotices}
          />
        )}
        {activeTab === 'inspectionSchedule' && (
          <InspectionSchedulePage records={records} savingId={savingId} onSave={saveSchedule} />
        )}
        {activeTab === 'inspectionReportUpload' && (
          <ReportUploadPage records={records} savingId={savingId} onSave={saveReport} />
        )}
        {activeTab === 'inspectionFeedback' && (
          <FeedbackPage records={records} savingId={savingId} onSave={saveFeedback} />
        )}
        {activeTab === 'inspectionReportQuery' && (
          <ReportQueryPage
            records={filteredRecords}
            query={query}
            statusFilter={statusFilter}
            onQuery={setQuery}
            onStatusFilter={setStatusFilter}
          />
        )}
        {activeTab === 'inspectionSummary' && (
          <SummaryPage summary={summary} records={filteredRecords} />
        )}
        {activeTab === 'inspectionInitialData' && (
          <InitialDataPage data={initialData} result={initialImportResult} onUpload={uploadInitialData} />
        )}
      </section>
    </main>
  );
}

function InspectionNoticePage({ rows, submission, user, onAdd, onDelete, onChange, onSubmit }) {
  return (
    <>
      <div className="section-heading-row">
        <h2>验货通知</h2>
        <span className="section-count">共 {rows.length} 条</span>
        {submission.submittedAt && <span className="section-count">已提交：{submission.submittedAt}</span>}
        <button type="button" className="ghost compact-button" onClick={onAdd}>新增一行</button>
        <button type="button" onClick={onSubmit}>确认提交</button>
      </div>
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

function InspectionSchedulePage({ records, savingId, onSave }) {
  return (
    <>
      <div className="section-heading-row">
        <h2>验货安排</h2>
        <span className="section-count">来自验货通知 {records.length} 条</span>
      </div>
      <DataTable
        rows={records}
        columns={['供应商', '采购订单', '产品线', '计划验货日期', '验货员', '状态', '安排备注', '操作']}
        render={(record) => [
          record.supplierShortName,
          record.kingdeeOrderNo,
          record.salesProductLine,
          <input id={`schedule-date-${record.id}`} className="table-input" type="date" defaultValue={formatDate(record.schedule?.scheduledDate)} />,
          <input id={`schedule-inspector-${record.id}`} className="table-input" defaultValue={record.schedule?.inspector || ''} />,
          <select id={`schedule-status-${record.id}`} className="table-input" defaultValue={record.schedule?.status || '未安排'}>
            {['未安排', '已安排', '验货中', '已完成', '已取消'].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>,
          <input id={`schedule-remark-${record.id}`} className="table-input wide-input" defaultValue={record.schedule?.remark || ''} />,
          <button
            type="button"
            className="compact-button"
            disabled={savingId === record.id}
            onClick={() => onSave(record, {
              scheduledDate: document.getElementById(`schedule-date-${record.id}`).value,
              inspector: document.getElementById(`schedule-inspector-${record.id}`).value,
              status: document.getElementById(`schedule-status-${record.id}`).value,
              remark: document.getElementById(`schedule-remark-${record.id}`).value
            })}
          >
            保存
          </button>
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

function FeedbackPage({ records, savingId, onSave }) {
  return (
    <>
      <div className="section-heading-row">
        <h2>验货反馈</h2>
        <span className="section-count">共 {records.length} 条</span>
      </div>
      <DataTable
        rows={records}
        columns={['供应商', '采购订单', '验货结果', '问题等级', '反馈内容', '操作']}
        render={(record) => [
          record.supplierShortName,
          record.kingdeeOrderNo,
          <select id={`feedback-result-${record.id}`} className="table-input" defaultValue={record.feedback?.result || ''}>
            <option value="">选择</option>
            <option value="合格">合格</option>
            <option value="不合格">不合格</option>
            <option value="待整改">待整改</option>
            <option value="待复检">待复检</option>
          </select>,
          <select id={`feedback-level-${record.id}`} className="table-input" defaultValue={record.feedback?.issueLevel || ''}>
            <option value="">选择</option>
            <option value="一般">一般</option>
            <option value="重要">重要</option>
            <option value="严重">严重</option>
          </select>,
          <textarea id={`feedback-text-${record.id}`} className="table-textarea wide-textarea" defaultValue={record.feedback?.feedbackText || ''} />,
          <button
            type="button"
            className="compact-button"
            disabled={savingId === record.id}
            onClick={() => onSave(record, {
              result: document.getElementById(`feedback-result-${record.id}`).value,
              issueLevel: document.getElementById(`feedback-level-${record.id}`).value,
              feedbackText: document.getElementById(`feedback-text-${record.id}`).value
            })}
          >
            保存
          </button>
        ]}
      />
    </>
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

function SummaryPage({ summary, records }) {
  return (
    <>
      <div className="section-heading-row">
        <h2>验货信息汇总表</h2>
        <span className="section-count">按当前数据实时汇总</span>
      </div>
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
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
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
