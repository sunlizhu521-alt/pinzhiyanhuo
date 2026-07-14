import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import DataTable from './DataTable.jsx';
import { canReadClientRecord, hasObjectValue, normalize, formatDate, feedbackReportNo, supplierInitials, formatCompactDate, mergeFeedbackRecords, uniqueValues } from '../utils.js';
import { reportHref, reportFileExt, isImageReport, shouldShowFeedbackRecord, feedbackMatchKey } from '../file-utils.js';
import { NOTICE_FIELDS } from '../constants.js';
import ReportPreviewModal from './ReportPreviewModal.jsx';

const FEEDBACK_STATUS_OPTIONS = ['待安排验货员', '待验货', '需返工', '已验货'];

function feedbackStatus(record, feedback = {}) {
  const hasInspector = !!normalize(record.schedule?.inspector);
  const result = normalize(feedback.result);
  if (!hasInspector) return '待安排验货员';
  if (!result) return '待验货';
  if (result === '返工') return '需返工';
  return '已验货';
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
  onAddFeedback,
  canDelete = false,
  onDelete,
  onDeleteReport
}) {
  const [filters, setFilters] = useState({
    supplierShortName: '',
    salesProductLine: '',
    series: '',
    inspector: '',
    status: ''
  });
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const [freshlySubmitted, setFreshlySubmitted] = useState(new Set());
  const [reworkRowIds, setReworkRowIds] = useState(new Set());
  const [reportFileDrafts, setReportFileDrafts] = useState({});
  const [previewFile, setPreviewFile] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addReportNo, setAddReportNo] = useState('');
  const previewRows = importPreview?.items || [];
  const previewLimitedRows = previewRows.slice(0, 10);
  const matchedCount = previewRows.filter((item) => item.recordId).length;
  function isReinspectionFeedback(record) {
    return normalize(record.feedback?.result) === '返工'
      && !!normalize(record.rework?.completedAt)
      && normalize(record.schedule?.status) === '已安排';
  }
  function activeFeedback(record) {
    return isReinspectionFeedback(record) ? {} : (record.feedback || {});
  }
  const mergedRecords = useMemo(() => mergeFeedbackRecords(records, reportHref), [records]);
  const detailRecords = records;
  const filterOptions = useMemo(() => ({
    supplierShortName: uniqueValues(detailRecords.map((record) => record.supplierShortName)),
    salesProductLine: uniqueValues(detailRecords.map((record) => record.salesProductLine)),
    series: uniqueValues(detailRecords.map((record) => record.series)),
    inspector: uniqueValues(detailRecords.map((record) => record.schedule?.inspector)),
    status: uniqueValues(detailRecords.map((record) => feedbackStatus(record, activeFeedback(record))))
      .sort((left, right) => FEEDBACK_STATUS_OPTIONS.indexOf(left) - FEEDBACK_STATUS_OPTIONS.indexOf(right))
  }), [detailRecords]);
  const hasFilterOptions = Object.values(filterOptions).some((options) => options.length > 0);
  const filteredRecords = useMemo(() => {
    const normalizedFilters = Object.fromEntries(
      Object.entries(filters).map(([key, value]) => [key, normalize(value).toLowerCase()])
    );
    return detailRecords.filter((record) => {
      const feedback = activeFeedback(record);
      const values = {
        supplierShortName: record.supplierShortName,
        salesProductLine: record.salesProductLine,
        series: record.series,
        inspector: record.schedule?.inspector,
        result: feedback.result,
        status: feedbackStatus(record, feedback)
      };
      return Object.entries(normalizedFilters).every(([key, value]) => {
        if (!value) return true;
        if (key === 'status') return normalize(values.status).toLowerCase() === value;
        if (key === 'result') return normalize(values[key]).toLowerCase() === value;
        return normalize(values[key]).toLowerCase().includes(value);
      });
    });
  }, [detailRecords, filters]);
  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  function clearFilters() {
    setFilters({
      supplierShortName: '',
      salesProductLine: '',
      series: '',
      inspector: '',
      status: ''
    });
  }
  useEffect(() => {
    if (freshlySubmitted.size > 0) setFreshlySubmitted(new Set());
  }, [records]);
  useEffect(() => {
    setFilters((current) => {
      let changed = false;
      const next = { ...current };
      Object.entries(filterOptions).forEach(([key, options]) => {
        if (!current[key]) return;
        const selected = normalize(current[key]).toLowerCase();
        const remainsAvailable = options.some((option) => normalize(option).toLowerCase() === selected);
        if (!remainsAvailable) {
          next[key] = '';
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [filterOptions]);

  function feedbackDraft(record) {
    const feedback = activeFeedback(record);
    return {
      actualInspectionTime: feedback.actualInspectionTime || '',
      inspectionQuantity: feedback.inspectionQuantity || '',
      result: feedback.result || '',
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
  function previewDraftReportFile(file) {
    if (!(file instanceof File) || file.size <= 0) return;
    const url = URL.createObjectURL(file);
    const ext = String(file.name || '').match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
    setPreviewFile({ title: file.name, url, ext, revoke: true });
  }
  function previewSavedReport(record) {
    const url = reportHref(record);
    if (!url) return;
    setPreviewFile({
      title: record.report?.originalName || record.report?.fileName || record.report?.reportNo || '检验单文件',
      url,
      ext: reportFileExt(record),
      revoke: false
    });
  }
  function closeReportPreview() {
    if (previewFile?.revoke && previewFile.url) URL.revokeObjectURL(previewFile.url);
    setPreviewFile(null);
  }
  useEffect(() => () => {
    if (previewFile?.revoke && previewFile.url) URL.revokeObjectURL(previewFile.url);
  }, [previewFile]);
  return (
    <>
      <div className="section-heading-row">
        <h2>验货反馈</h2>
        <span className="section-count">筛选 {filteredRecords.length} 条 / 待反馈 {records.length} 条</span>
        <button type="button" className="compact-button" onClick={() => setShowAddForm(true)}>新增反馈</button>
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
      {hasFilterOptions && (
        <div className="toolbar feedback-filter-toolbar">
          {filterOptions.supplierShortName.length > 0 && (
            <select value={filters.supplierShortName} onChange={(event) => updateFilter('supplierShortName', event.target.value)}>
              <option value="">全部供应商简称</option>
              {filterOptions.supplierShortName.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          )}
          {filterOptions.salesProductLine.length > 0 && (
            <select value={filters.salesProductLine} onChange={(event) => updateFilter('salesProductLine', event.target.value)}>
              <option value="">全部产品线</option>
              {filterOptions.salesProductLine.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          )}
          {filterOptions.series.length > 0 && (
            <select value={filters.series} onChange={(event) => updateFilter('series', event.target.value)}>
              <option value="">全部系列</option>
              {filterOptions.series.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          )}
          {filterOptions.inspector.length > 0 && (
            <select value={filters.inspector} onChange={(event) => updateFilter('inspector', event.target.value)}>
              <option value="">全部验货员</option>
              {filterOptions.inspector.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          )}
          {filterOptions.status.length > 0 && (
            <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
              <option value="">全部状态</option>
              {filterOptions.status.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          )}
          <button type="button" className="ghost compact-button" onClick={clearFilters}>清除筛选</button>
        </div>
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
            columns={['匹配状态', '供应商简称', '产品线', '系列', '数量', '实际验货时间', '验货方式', '实际验货数量', '检验数量', '合格数量', '验货结果', '问题等级', '问题分类', '问题反馈', '实际验货人']}
            render={(item) => [
              item.matchStatus,
              item.notice.supplierShortName,
              item.notice.salesProductLine,
              item.notice.series,
              item.notice.totalQuantity,
              item.feedback.actualInspectionTime,
              item.feedback.inspectionMethod,
              item.feedback.inspectionQuantity,
              item.feedback.checkQuantity,
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
      {showAddForm && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.5)' }} onClick={() => { setShowAddForm(false); setAddReportNo(''); }} />
          <form
            data-add-feedback-form
            style={{ position: 'relative', zIndex: 1, width: 'min(600px,96vw)', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: 8, padding: 24, boxShadow: '0 20px 60px rgba(15,23,42,.3)' }}
            onSubmit={async (event) => {
              event.preventDefault();
              const saved = await onAddFeedback(event.currentTarget);
              if (saved) {
                event.currentTarget.reset();
                setAddReportNo('');
                setShowAddForm(false);
              }
            }}
          >
            <h3 style={{ margin: '0 0 16px' }}>新增验货反馈</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                供应商简称 *
                <select name="supplierShortName" required onChange={(event) => {
                  const form = event.target.form;
                  if (!form) return;
                  const temp = { supplierShortName: event.target.value, series: form.series?.value || '' };
                  setAddReportNo(feedbackReportNo(temp, form.actualInspectionTime?.value || '', form.inspectionQuantity?.value || ''));
                }}>
                  <option value="">选择</option>
                  {supplierOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                产品线 *
                <select name="salesProductLine" required>
                  <option value="">选择</option>
                  {productLineOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                系列 *
                <select name="series" required onChange={() => {
                  const form = document.querySelector('[data-add-feedback-form]');
                  if (!form) return;
                  const temp = { supplierShortName: form.supplierShortName?.value || '', series: form.series?.value || '' };
                  setAddReportNo(feedbackReportNo(temp, form.actualInspectionTime?.value || '', form.inspectionQuantity?.value || ''));
                }}>
                  <option value="">选择</option>
                  {seriesOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                数量 *
                <input name="totalQuantity" required />
              </label>
              <label style={{ display: 'grid', gap: 6, marginBottom: 12, gridColumn: '1/-1' }}>
                SKU及数量
                <textarea name="skuQuantity" rows={2} />
              </label>
              <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                实际验货时间 *
                <input name="actualInspectionTime" type="date" required onChange={(event) => {
                  const form = event.target.form;
                  if (!form) return;
                  const temp = { supplierShortName: form.supplierShortName?.value || '', series: form.series?.value || '' };
                  setAddReportNo(feedbackReportNo(temp, event.target.value, form.inspectionQuantity?.value || ''));
                }} />
              </label>
              <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                验货方式
                <select name="inspectionMethod">
                  <option value="">选择</option>
                  <option value="抽检">抽检</option>
                  <option value="全检">全检</option>
                  <option value="视频检验">视频检验</option>
                  <option value="随线检验">随线检验</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                实际验货数量
                <input name="inspectionQuantity" onChange={(event) => {
                  const form = event.target.form;
                  if (!form) return;
                  const temp = { supplierShortName: form.supplierShortName?.value || '', series: form.series?.value || '' };
                  setAddReportNo(feedbackReportNo(temp, form.actualInspectionTime?.value || '', event.target.value));
                }} />
              </label>
              <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                检验数量
                <input name="checkQuantity" />
              </label>
              <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                合格数量
                <input name="qualifiedQuantity" />
              </label>
              <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                验货结果
                <select name="result">
                  <option value="">选择</option>
                  <option value="通过">通过</option>
                  <option value="让步">让步</option>
                  <option value="返工">返工</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                问题等级
                <select name="issueLevel">
                  <option value="">选择</option>
                  <option value="严重">严重</option>
                  <option value="中等">中等</option>
                  <option value="不严重">不严重</option>
                </select>
              </label>
            </div>
            <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
              问题分类（可多选）
              <div style={{ display: 'flex', gap: 12 }}>
                {['包装', '性能', '外观'].map((category) => (
                  <label key={category} style={{ display: 'flex', alignItems: 'center', gap: 4, margin: 0, color: '#334155' }}>
                    <input type="checkbox" name="issueCategoryPrimary" value={category} style={{ width: 'auto' }} />
                    {category}
                  </label>
                ))}
              </div>
            </label>
            <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
              问题反馈
              <textarea name="feedbackText" rows={3} />
            </label>
            <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
              检验报告单编码
              <span style={{ padding: '9px 11px', border: '1px solid #d6dde8', borderRadius: 6, background: '#f8fafc', color: addReportNo ? '#1d4ed8' : '#94a3b8' }}>
                {addReportNo || '填写实际验货时间和实际验货数量后自动生成'}
              </span>
            </label>
            <label style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
              检验报告单上传
              <input type="file" name="reportFile" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx" />
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="ghost compact-button" onClick={() => { setShowAddForm(false); setAddReportNo(''); }}>取消</button>
              <button type="submit" className="compact-button">提交</button>
            </div>
          </form>
        </div>,
        document.body
      )}
      <DataTable
        className="inspection-feedback-table"
        rows={filteredRecords}
        stickyColumns={3}
        columns={[
          '供应商简称',
          '产品线',
          '系列',
          '状态',
          'SKU及数量',
          '数量',
          '是否首批验货',
          '事业部',
          '运营',
          '验货通知人',
          '备注',
          '登记日期',
          '计划日期',
          '验货员',
          '实际验货人',
          '实际验货时间',
          '验货方式',
          '实际验货数量',
          '检验数量',
          '验货合格数量',
          '验货结果',
          '检验报告单编码',
          '问题等级',
          '问题分类',
          '问题反馈',
          '检验单文件',
          '检验报告单上传功能',
          '提交按钮'
        ]}
        render={(record) => {
          const justSubmitted = freshlySubmitted.has(record.id);
          const feedback = justSubmitted ? {} : activeFeedback(record);
          const draft = feedbackDraft(record);
          const reportNo = feedbackReportNo(record, draft.actualInspectionTime, draft.inspectionQuantity);
          const isReworkRow = !justSubmitted && normalize(draft.result) === '返工';
          const cachedReportFile = reportFileDrafts[record.id]?.file;
          const isReportRejected = !!normalize(record.report?.reportRejectedAt);
          return [
            record.supplierShortName,
            record.salesProductLine,
            record.series,
            (() => {
              const statusText = feedbackStatus(record, feedback);
              const color = {
                待安排验货员: '#c2410c',
                待验货: '#1d4ed8',
                需返工: '#dc2626',
                已验货: '#047857'
              }[statusText];
              return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', background: color, color: '#fff', fontSize: '12px', fontWeight: 600 }}>{statusText}</span>;
            })(),
            <span className="readonly-cell sku-readonly-cell">{record.skuQuantity || ''}</span>,
            record.totalQuantity,
            record.firstInspection,
            record.businessDepartments,
            record.operation,
            record.inspectionNotifier || record.inspectionApplicant,
            <span className="readonly-cell wide-readonly-cell">{record.remark}</span>,
            formatDate(record.inspectionFillTime),
            formatDate(record.schedule?.scheduledDate),
            <span className="readonly-cell">{normalize(record.schedule?.inspector)}</span>,
            <input name="actualInspector" form={`feedback-form-${record.id}`} className="table-input" defaultValue={feedback.actualInspector || ''} />,
            <input
              name="actualInspectionTime"
              form={`feedback-form-${record.id}`}
              className="table-input"
              type="date"
              defaultValue={formatDate(feedback.actualInspectionTime)}
              onChange={(event) => updateFeedbackDraft(record.id, 'actualInspectionTime', event.target.value)}
            />,
            <select name="inspectionMethod" form={`feedback-form-${record.id}`} className="table-input" defaultValue={feedback.inspectionMethod || ''}>
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
              defaultValue={feedback.inspectionQuantity || ''}
              onChange={(event) => updateFeedbackDraft(record.id, 'inspectionQuantity', event.target.value)}
            />,
            <input name="checkQuantity" form={`feedback-form-${record.id}`} className="table-input narrow-input" defaultValue={feedback.checkQuantity || ''} />,
            <input name="qualifiedQuantity" form={`feedback-form-${record.id}`} className="table-input narrow-input" defaultValue={feedback.qualifiedQuantity || ''} />,
            <select
              name="result"
              form={`feedback-form-${record.id}`}
              className="table-input"
              defaultValue={feedback.result || ''}
              onChange={(event) => {
                updateFeedbackDraft(record.id, 'result', event.target.value);
                setReworkRowIds((current) => {
                  const next = new Set(current);
                  if (event.target.value === '返工') next.add(record.id);
                  else next.delete(record.id);
                  return next;
                });
              }}
            >
              <option value="">选择</option>
              <option value="通过">通过</option>
              <option value="让步">让步</option>
              <option value="返工">返工</option>
            </select>,
            <span className="readonly-cell wide-readonly-cell">{reportNo}</span>,
            <select name="issueLevel" form={`feedback-form-${record.id}`} className="table-input" defaultValue={feedback.issueLevel || ''}>
              <option value="">选择</option>
              <option value="严重">严重</option>
              <option value="中等">中等</option>
              <option value="不严重">不严重</option>
            </select>,
            (() => {
              const categories = ['包装', '性能', '外观'];
              const defaultValues = (feedback.issueCategoryPrimary || '').split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
              const hiddenId = `issueCategoryPrimary-hidden-${record.id}`;
              const recordKey = String(record.id);
              return (
                <div className="business-department-checks" style={{ minWidth: '180px' }}>
                  {categories.map((category) => (
                    <label key={category} className="business-department-option" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        defaultChecked={defaultValues.includes(category)}
                        data-record-id={recordKey}
                        data-category={category}
                        onChange={() => {
                          const checked = categories.filter((item) => {
                            const checkbox = document.querySelector(`input[data-record-id="${recordKey}"][data-category="${item}"]`);
                            return checkbox && checkbox.checked;
                          });
                          const hidden = document.getElementById(hiddenId);
                          if (hidden) hidden.value = checked.join('、');
                        }}
                      />
                      {category}
                    </label>
                  ))}
                  <input
                    type="hidden"
                    name="issueCategoryPrimary"
                    id={hiddenId}
                    form={`feedback-form-${record.id}`}
                    defaultValue={defaultValues.join('、')}
                  />
                </div>
              );
            })(),
            <textarea name="feedbackText" form={`feedback-form-${record.id}`} className="table-textarea wide-textarea" defaultValue={feedback.feedbackText || ''} />,
            (() => {
              const href = reportHref(record);
              if (cachedReportFile) {
                return (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => previewDraftReportFile(cachedReportFile)}
                  >
                    {cachedReportFile.name || '查看文件'}
                  </button>
                );
              }
              if (!href) return '';
              return (
                <div className="feedback-report-cell">
                  {isReportRejected && <span style={{ color: '#dc2626', fontSize: '13px' }}>已驳回，请重新上传</span>}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => previewSavedReport(record)}
                  >
                    {record.report?.originalName || '查看报告'}
                  </button>
                </div>
              );
            })(),
            <div className="feedback-report-cell">
              {(reworkRowIds.has(record.id) || isReworkRow) ? (
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>返工无需上传报告</span>
              ) : reportHref(record) && !isReportRejected ? (
                <>
                  <button type="button" className="link-button" onClick={() => previewSavedReport(record)}>
                    {record.report?.originalName || '查看报告'}
                  </button>
                  <button
                    type="button"
                    className="danger-button compact-button"
                    disabled={savingId === record.id}
                    onClick={(event) => {
                      event.preventDefault();
                      if (onDeleteReport) onDeleteReport(record);
                    }}
                  >
                    删除报告
                  </button>
                </>
              ) : (
                <>
                  <input
                    name="reportFile"
                    form={`feedback-form-${record.id}`}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      setReportFileDrafts((current) => {
                        const next = { ...current };
                        if (file instanceof File && file.size > 0) next[record.id] = { file, name: file.name };
                        else delete next[record.id];
                        return next;
                      });
                    }}
                  />
                  {cachedReportFile && (
                    <div className="cached-report-file">
                      <span>{cachedReportFile.name}</span>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => previewDraftReportFile(cachedReportFile)}
                      >
                        查看文件
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>,
            <div className="table-action-row">
              <form
                id={`feedback-form-${record.id}`}
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!window.confirm('确认提交当前验货反馈？')) return;
                  const form = event.currentTarget;
                  const saved = await onSave(record, form, cachedReportFile);
                  if (saved) {
                    setFreshlySubmitted((prev) => new Set([...prev, record.id]));
                    setReworkRowIds((prev) => {
                      const next = new Set(prev);
                      next.delete(record.id);
                      return next;
                    });
                    Array.from(form.elements).forEach((element) => {
                      if (element.type === 'hidden' || element.type === 'submit') return;
                      if (element.tagName === 'SELECT') element.selectedIndex = 0;
                      else if (element.type === 'checkbox') element.checked = false;
                      else element.value = '';
                    });
                    setFeedbackDrafts((current) => {
                      const next = { ...current };
                      delete next[record.id];
                      return next;
                    });
                    setReportFileDrafts((current) => {
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
      {previewFile && (
        <ReportPreviewModal
          title={previewFile.title}
          url={previewFile.url}
          ext={previewFile.ext}
          onClose={closeReportPreview}
        />
      )}
    </>
  );
}

export default FeedbackPage;
