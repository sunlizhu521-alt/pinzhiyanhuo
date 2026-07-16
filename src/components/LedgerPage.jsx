import { useMemo, useState } from 'react';
import DataTable from './DataTable.jsx';
import ReportPreviewModal from './ReportPreviewModal.jsx';
import { normalize, formatDate, latestFeedback, splitMultiValue, uniqueValues } from '../utils.js';
import { extractProvinceCityFromAddress } from '../dimension-utils.js';
import { reportHref, reportFileExt } from '../file-utils.js';

function LedgerPage({ records, canImport, importPreview, onUpload, onConfirmImport, onClearImportPreview, canDelete, onDelete, onUndoLatestImport, onDeleteAllImports, onExport, savingId }) {
  const [filters, setFilters] = useState({
    supplierShortName: '',
    salesProductLine: '',
    series: '',
    businessDepartments: '',
    issueLevel: '',
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
  const filterOptions = useMemo(() => {
    const recordsForOption = (key) => ledgerRecords.filter((record) => ledgerRecordMatchesFilters(record, filters, key));
    return {
      supplierShortName: uniqueValues(recordsForOption('supplierShortName').map((record) => record.supplierShortName)),
      salesProductLine: uniqueValues(recordsForOption('salesProductLine').map((record) => record.salesProductLine)),
      series: uniqueValues(recordsForOption('series').map((record) => record.series)),
      businessDepartments: uniqueValues(recordsForOption('businessDepartments').flatMap((record) => splitMultiValue(record.businessDepartments))),
      notifier: uniqueValues(recordsForOption('notifier').map((record) => record.inspectionNotifier || record.inspectionApplicant)),
      status: uniqueValues(recordsForOption('status').map((record) => ledgerStatus(record))),
      result: uniqueValues(recordsForOption('result').map((record) => latestFeedback(record.feedback).result)),
      issueLevel: uniqueValues(recordsForOption('issueLevel').map((record) => latestFeedback(record.feedback).issueLevel))
    };
  }, [ledgerRecords, filters]);

  function ledgerStatus(record) {
    const result = normalize(latestFeedback(record.feedback).result);
    if (isFeedbackSubmittedRework(record)) return '需返工';
    if (!normalize(record.schedule?.inspector)) return '未安排';
    if (['通过', '让步'].includes(result)) return '已完成';
    return '验货中';
  }

  function ledgerRecordMatchesFilters(record, sourceFilters, ignoreKey = '') {
    const normalizedFilters = Object.fromEntries(
      Object.entries(sourceFilters).map(([key, value]) => [key, normalize(value).toLowerCase()])
    );
    const feedback = latestFeedback(record.feedback);
    return (
      (ignoreKey === 'supplierShortName' || !normalizedFilters.supplierShortName || normalize(record.supplierShortName).toLowerCase() === normalizedFilters.supplierShortName)
      && (ignoreKey === 'salesProductLine' || !normalizedFilters.salesProductLine || normalize(record.salesProductLine).toLowerCase() === normalizedFilters.salesProductLine)
      && (ignoreKey === 'series' || !normalizedFilters.series || normalize(record.series).toLowerCase() === normalizedFilters.series)
      && (ignoreKey === 'businessDepartments' || !normalizedFilters.businessDepartments
        || splitMultiValue(record.businessDepartments).some((item) => normalize(item).toLowerCase() === normalizedFilters.businessDepartments))
      && (ignoreKey === 'issueLevel' || !normalizedFilters.issueLevel || normalize(feedback.issueLevel).toLowerCase() === normalizedFilters.issueLevel)
      && (ignoreKey === 'status' || !normalizedFilters.status || normalize(ledgerStatus(record)).toLowerCase() === normalizedFilters.status)
      && (ignoreKey === 'result' || !normalizedFilters.result || normalize(feedback.result).toLowerCase() === normalizedFilters.result)
      && (ignoreKey === 'keyword' || !normalizedFilters.keyword
        || normalize(`${record.supplierShortName}${record.salesProductLine}${record.series}${record.schedule?.inspector || ''}`).toLowerCase().includes(normalizedFilters.keyword))
      && (ignoreKey === 'notifier' || !normalizedFilters.notifier || normalize(record.inspectionNotifier || record.inspectionApplicant || '').toLowerCase() === normalizedFilters.notifier)
    );
  }

  const filteredRecords = useMemo(() => {
    return ledgerRecords.filter((record) => ledgerRecordMatchesFilters(record, filters));
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
    setFilters({ supplierShortName: '', salesProductLine: '', series: '', businessDepartments: '', issueLevel: '', status: '', result: '', keyword: '', notifier: '' });
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
    '地址',
    '产品线',
    '系列',
    '数量',
    { key: 'skuQuantity', label: 'SKU', className: 'ledger-wrap-cell' },
    '事业部',
    '运营',
    '备货流程号',
    '验货通知人',
    '是否首批验货',
    '验货员',
    '状态',
    '填写时间',
    '计划验货时间',
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
        {canImport && (
          <>
            <button type="button" className="ghost compact-button" onClick={onUndoLatestImport} disabled={!!savingId && savingId.startsWith('ledger-import-delete')}>
              {savingId === 'ledger-import-delete-latest' ? '撤销中...' : '撤销最近导入'}
            </button>
            <button type="button" className="danger-button compact-button" onClick={onDeleteAllImports} disabled={!!savingId && savingId.startsWith('ledger-import-delete')}>
              {savingId === 'ledger-import-delete-all' ? '删除中...' : '删除全部导入'}
            </button>
          </>
        )}
      </div>
      {savingId && (
        <div style={{ height: 3, background: '#e2e8f0', marginBottom: 16, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '30%', background: '#3b82f6', borderRadius: 2, animation: 'submitProgress 1.5s ease-in-out infinite' }} />
        </div>
      )}
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
            <button type="button" className="compact-button" onClick={onConfirmImport} disabled={savingId === 'ledger-import'}>
              {savingId === 'ledger-import' ? '导入中...' : '确认导入'}
            </button>
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
          list="ledger-supplier-options"
          value={filters.supplierShortName}
          onChange={(event) => updateFilter('supplierShortName', event.target.value)}
        />
        <input
          placeholder="产品线"
          list="ledger-product-line-options"
          value={filters.salesProductLine}
          onChange={(event) => updateFilter('salesProductLine', event.target.value)}
        />
        <input
          placeholder="系列"
          list="ledger-series-options"
          value={filters.series}
          onChange={(event) => updateFilter('series', event.target.value)}
        />
        <input
          placeholder="事业部"
          list="ledger-business-department-options"
          value={filters.businessDepartments}
          onChange={(event) => updateFilter('businessDepartments', event.target.value)}
        />
        <input
          placeholder="验货通知人"
          list="ledger-notifier-options"
          value={filters.notifier || ''}
          onChange={(event) => updateFilter('notifier', event.target.value)}
        />
        <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
          <option value="">全部状态</option>
          {filterOptions.status.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select value={filters.result} onChange={(event) => updateFilter('result', event.target.value)}>
          <option value="">全部结果</option>
          {filterOptions.result.map((result) => <option key={result} value={result}>{result}</option>)}
        </select>
        <select value={filters.issueLevel} onChange={(event) => updateFilter('issueLevel', event.target.value)}>
          <option value="">全部问题等级</option>
          {filterOptions.issueLevel.map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
        <button type="button" className="ghost compact-button" onClick={clearFilters}>清除</button>
      </div>
      <datalist id="ledger-supplier-options">
        {filterOptions.supplierShortName.map((item) => <option key={item} value={item} />)}
      </datalist>
      <datalist id="ledger-product-line-options">
        {filterOptions.salesProductLine.map((item) => <option key={item} value={item} />)}
      </datalist>
      <datalist id="ledger-series-options">
        {filterOptions.series.map((item) => <option key={item} value={item} />)}
      </datalist>
      <datalist id="ledger-business-department-options">
        {filterOptions.businessDepartments.map((item) => <option key={item} value={item} />)}
      </datalist>
      <datalist id="ledger-notifier-options">
        {filterOptions.notifier.map((item) => <option key={item} value={item} />)}
      </datalist>
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
            extractProvinceCityFromAddress(record.supplierAddress),
            record.salesProductLine,
            record.series,
            record.totalQuantity,
            record.skuQuantity || '',
            record.businessDepartments,
            record.operation || '',
            record.stockOaNo || '',
            record.inspectionNotifier || record.inspectionApplicant || '',
            record.firstInspection || '',
            record.schedule?.inspector || '',
            ledgerStatus(record),
            formatDate(record.inspectionFillTime),
            formatDate(record.schedule?.scheduledDate),
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
                disabled={savingId === record.id}
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
