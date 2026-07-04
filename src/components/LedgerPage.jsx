import { useMemo, useState } from 'react';
import DataTable from './DataTable.jsx';
import ReportPreviewModal from './ReportPreviewModal.jsx';
import { normalize, formatDate, latestFeedback } from '../utils.js';
import { reportHref, reportFileExt } from '../file-utils.js';

function LedgerPage({ records, canImport, importPreview, onUpload, onConfirmImport, onClearImportPreview, canDelete, onDelete, onExport }) {
  const [filters, setFilters] = useState({
    supplierShortName: '',
    salesProductLine: '',
    series: '',
    businessDepartments: '',
    status: '',
    result: '',
    keyword: '',
    notifier: ''
  });
  const [previewRecord, setPreviewRecord] = useState(null);
  const previewUrl = previewRecord ? reportHref(previewRecord) : '';
  const previewExt = previewRecord ? reportFileExt(previewRecord) : '';

  function reworkInfo(record) {
    const feedback = latestFeedback(record.feedback);
    return record.rework || feedback.rework || {};
  }

  function isFeedbackSubmittedRework(record) {
    const feedback = latestFeedback(record.feedback);
    const rework = reworkInfo(record);
    if (normalize(feedback.result) !== '返工') return false;
    if (normalize(rework.status) === '已删除' || normalize(rework.deletedAt)) return false;
    if (normalize(rework.completedAt) || normalize(rework.reworkCompleteTime)) return false;
    if (normalize(rework.source) === 'inspectionFeedback') return true;
    if (normalize(record.importSource) === 'summaryImport') return false;
    return normalize(rework.requestedAt) && normalize(rework.status) === '待复验';
  }

  function reworkSubmitKey(record) {
    const feedback = latestFeedback(record.feedback);
    const rework = reworkInfo(record);
    return normalize(rework.feedbackSubmitId) || [
      rework.requestedAt,
      rework.requestedBy,
      record.supplierShortName,
      record.salesProductLine,
      record.series,
      feedback.actualInspectionTime,
      feedback.feedbackText
    ].map(normalize).join('|') || record.id;
  }

  const ledgerRecords = useMemo(() => {
    const seenReworkSubmits = new Set();
    return records.filter((record) => {
      if (normalize(latestFeedback(record.feedback).result) !== '返工') return true;
      if (!isFeedbackSubmittedRework(record)) return false;
      const key = reworkSubmitKey(record);
      if (seenReworkSubmits.has(key)) return false;
      seenReworkSubmits.add(key);
      return true;
    });
  }, [records]);

  function ledgerStatus(record) {
    const result = normalize(latestFeedback(record.feedback).result);
    if (isFeedbackSubmittedRework(record)) return '需返工';
    if (!normalize(record.schedule?.inspector)) return '未安排';
    if (['通过', '让步'].includes(result)) return '已完成';
    return '验货中';
  }

  const filteredRecords = useMemo(() => {
    const normalizedFilters = Object.fromEntries(
      Object.entries(filters).map(([key, value]) => [key, normalize(value).toLowerCase()])
    );
    return ledgerRecords.filter((record) => {
      const feedback = latestFeedback(record.feedback);
      return (
        (!normalizedFilters.supplierShortName || normalize(record.supplierShortName).toLowerCase().includes(normalizedFilters.supplierShortName))
        && (!normalizedFilters.salesProductLine || normalize(record.salesProductLine).toLowerCase().includes(normalizedFilters.salesProductLine))
        && (!normalizedFilters.series || normalize(record.series).toLowerCase().includes(normalizedFilters.series))
        && (!normalizedFilters.businessDepartments || normalize(record.businessDepartments).toLowerCase().includes(normalizedFilters.businessDepartments))
        && (!normalizedFilters.status || normalize(ledgerStatus(record)).toLowerCase() === normalizedFilters.status)
        && (!normalizedFilters.result || normalize(feedback.result).toLowerCase() === normalizedFilters.result)
        && (!normalizedFilters.keyword
          || normalize(`${record.supplierShortName}${record.salesProductLine}${record.series}${record.schedule?.inspector || ''}`).toLowerCase().includes(normalizedFilters.keyword))
        && (!normalizedFilters.notifier || normalize(record.inspectionNotifier || record.inspectionApplicant || '').toLowerCase().includes(normalizedFilters.notifier))
      );
    });
  }, [ledgerRecords, filters]);

  const stats = useMemo(() => ({
    total: ledgerRecords.length,
    passed: ledgerRecords.filter((record) => latestFeedback(record.feedback).result === '通过').length,
    failed: ledgerRecords.filter(isFeedbackSubmittedRework).length,
    pending: ledgerRecords.filter((record) => !latestFeedback(record.feedback).result).length
  }), [ledgerRecords]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters({ supplierShortName: '', salesProductLine: '', series: '', businessDepartments: '', status: '', result: '', keyword: '', notifier: '' });
  }

  function reportPreviewCell(record) {
    const href = reportHref(record);
    if (!href) return '';
    const title = record.report?.originalName || record.report?.reportNo || '报告文件预览';
    return (
      <button type="button" className="link-button" onClick={() => setPreviewRecord(record)} title={title}>
        查看检验单
      </button>
    );
  }

  const ledgerColumns = [
    '供应商',
    '产品线',
    '系列',
    '数量',
    { key: 'skuQuantity', label: 'SKU', className: 'ledger-wrap-cell' },
    '事业部',
    '验货通知人',
    '是否首批验货',
    '验货员',
    '状态',
    '实际验货时间',
    '实际验货数量',
    '检验数量',
    '验货合格数量',
    '验货合格率',
    '验货方式',
    '验货结果',
    '问题等级',
    '问题分类',
    { key: 'feedbackText', label: '问题反馈', className: 'ledger-wrap-cell ledger-long-cell' },
    '报告文件',
    '是否返工',
    { key: 'remarks', label: '备注', className: 'ledger-wrap-cell ledger-long-cell' },
    ...(canDelete ? ['操作'] : [])
  ];

  return (
    <>
      <div className="section-heading-row">
        <h2>验货台账</h2>
        <span className="section-count">全部 {ledgerRecords.length} 条 | 通过 {stats.passed} | 返工 {stats.failed} | 待反馈 {stats.pending}</span>
        <button type="button" className="ghost compact-button" disabled={!ledgerRecords.length} onClick={() => onExport(ledgerRecords)}>导出</button>
      </div>
      {canImport && (
        <label
          className="summary-upload-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); onUpload(event.dataTransfer.files); }}
        >
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => onUpload(event.target.files)} />
          <strong>导入历史验货台账：拖拽文件到这里或点击上传</strong>
          <span>支持 .xlsx / .xls / .csv，解析后先预览，确认后追加到台账，不影响已有数据</span>
        </label>
      )}
      {canImport && importPreview && (
        <section className="summary-import-preview">
          <div className="section-heading-row">
            <h3>台账导入预览</h3>
            <span className="section-count">
              {importPreview.fileName}，工作表 {importPreview.sheetName || '未识别'}，共 {importPreview.items.length} 条
            </span>
            <button type="button" className="compact-button" onClick={onConfirmImport}>确认导入</button>
            <button type="button" className="ghost compact-button" onClick={onClearImportPreview}>清空预览</button>
          </div>
          <DataTable
            className="summary-preview-table"
            rows={importPreview.items.slice(0, 10)}
            columns={['供应商', '产品线', '系列', '数量', '事业部', '验货员', '计划日期', '状态', '报告结论', '验货结果']}
            render={(item) => [
              item.notice.supplierShortName,
              item.notice.salesProductLine,
              item.notice.series,
              item.notice.totalQuantity,
              item.notice.businessDepartments,
              item.schedule.inspector,
              item.schedule.scheduledDate,
              item.schedule.status,
              item.report.conclusion,
              item.feedback.result
            ]}
          />
          {importPreview.items.length > 10 && <p className="preview-note">仅展示前 10 条，确认后会导入全部 {importPreview.items.length} 条。</p>}
        </section>
      )}
      <div className="toolbar">
        <input
          placeholder="搜索供应商/产品线/系列/验货员"
          value={filters.keyword}
          onChange={(event) => updateFilter('keyword', event.target.value)}
        />
        <input
          placeholder="供应商简称"
          value={filters.supplierShortName}
          onChange={(event) => updateFilter('supplierShortName', event.target.value)}
        />
        <input
          placeholder="产品线"
          value={filters.salesProductLine}
          onChange={(event) => updateFilter('salesProductLine', event.target.value)}
        />
        <input
          placeholder="系列"
          value={filters.series}
          onChange={(event) => updateFilter('series', event.target.value)}
        />
        <input
          placeholder="事业部"
          value={filters.businessDepartments}
          onChange={(event) => updateFilter('businessDepartments', event.target.value)}
        />
        <input
          placeholder="验货通知人"
          value={filters.notifier || ''}
          onChange={(event) => updateFilter('notifier', event.target.value)}
        />
        <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
          <option value="">全部状态</option>
          {['未安排', '验货中', '已完成', '需返工'].map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select value={filters.result} onChange={(event) => updateFilter('result', event.target.value)}>
          <option value="">全部结果</option>
          {['通过', '让步', '返工'].map((result) => <option key={result} value={result}>{result}</option>)}
        </select>
        <button type="button" className="ghost compact-button" onClick={clearFilters}>清除</button>
      </div>
      <DataTable
        className="inspection-ledger-table"
        rows={filteredRecords}
        columns={ledgerColumns}
        render={(record) => {
          const feedback = latestFeedback(record.feedback);
          const allRemarks = [
            record.remark,
            record.schedule?.remark,
            feedback.remark
          ].filter((remark) => remark && remark.trim()).join('；');
          const qualified = Number(feedback.qualifiedQuantity);
          const checked = Number(feedback.checkQuantity);
          const passRate = checked > 0 && !Number.isNaN(qualified) ? `${Math.round((qualified / checked) * 100)}%` : '';
          return [
            record.supplierShortName,
            record.salesProductLine,
            record.series,
            record.totalQuantity,
            record.skuQuantity || '',
            record.businessDepartments,
            record.inspectionNotifier || record.inspectionApplicant || '',
            record.firstInspection || '',
            record.schedule?.inspector || '',
            ledgerStatus(record),
            formatDate(feedback.actualInspectionTime),
            feedback.inspectionQuantity || '',
            feedback.checkQuantity || '',
            feedback.qualifiedQuantity || '',
            passRate,
            feedback.inspectionMethod || '',
            feedback.result || '',
            feedback.issueLevel || '',
            feedback.issueCategoryPrimary || '',
            feedback.feedbackText || '',
            reportPreviewCell(record),
            isFeedbackSubmittedRework(record) ? '是' : '否',
            allRemarks,
            ...(canDelete ? [
              <button
                type="button"
                className="danger-button compact-button"
                onClick={() => onDelete(record)}
              >
                删除
              </button>
            ] : [])
          ];
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

export default LedgerPage;
