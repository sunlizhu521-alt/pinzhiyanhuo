import { useMemo, useState } from 'react';
import DataTable from './DataTable.jsx';
import ReportPreviewModal from './ReportPreviewModal.jsx';
import { normalize, formatDate, latestFeedback } from '../utils.js';
import { reportHref, reportFileExt, isImageReport } from '../file-utils.js';

function LedgerPage({ records, canImport, importPreview, onUpload, onConfirmImport, onClearImportPreview, onExport }) {
  const [filters, setFilters] = useState({
    supplierShortName: '',
    status: '',
    result: '',
    keyword: ''
  });
  const [previewRecord, setPreviewRecord] = useState(null);
  const previewUrl = previewRecord ? reportHref(previewRecord) : '';
  const previewExt = previewRecord ? reportFileExt(previewRecord) : '';

  const filteredRecords = useMemo(() => {
    const normalizedFilters = Object.fromEntries(
      Object.entries(filters).map(([key, value]) => [key, normalize(value).toLowerCase()])
    );
    return records.filter((record) => {
      const feedback = latestFeedback(record.feedback);
      return (
        (!normalizedFilters.supplierShortName || normalize(record.supplierShortName).toLowerCase().includes(normalizedFilters.supplierShortName))
        && (!normalizedFilters.status || normalize(record.schedule?.status).toLowerCase() === normalizedFilters.status)
        && (!normalizedFilters.result || normalize(feedback.result).toLowerCase() === normalizedFilters.result)
        && (!normalizedFilters.keyword
          || normalize(`${record.supplierShortName}${record.salesProductLine}${record.series}${record.schedule?.inspector || ''}`).toLowerCase().includes(normalizedFilters.keyword))
      );
    });
  }, [records, filters]);

  const stats = useMemo(() => ({
    total: records.length,
    passed: records.filter((record) => latestFeedback(record.feedback).result === '通过').length,
    failed: records.filter((record) => latestFeedback(record.feedback).result === '返工').length,
    pending: records.filter((record) => !latestFeedback(record.feedback).result).length
  }), [records]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters({ supplierShortName: '', status: '', result: '', keyword: '' });
  }

  function reportPreviewCell(record) {
    const href = reportHref(record);
    if (!href) return '';
    const ext = reportFileExt(record);
    const title = record.report?.originalName || record.report?.reportNo || '报告文件预览';
    if (isImageReport(record)) {
      return (
        <button type="button" className="link-button" onClick={() => setPreviewRecord(record)} title={title}>
          <img
            src={href}
            alt={title}
            style={{ width: 96, height: 72, objectFit: 'cover', border: '1px solid #d8e0ee', borderRadius: 4 }}
          />
        </button>
      );
    }
    if (ext === '.pdf') {
      return (
        <button type="button" className="link-button" onClick={() => setPreviewRecord(record)} title={title}>
          <iframe
            title={title}
            src={href}
            style={{ width: 120, height: 80, border: '1px solid #d8e0ee', borderRadius: 4, pointerEvents: 'none' }}
          />
        </button>
      );
    }
    return (
      <button type="button" className="link-button" onClick={() => setPreviewRecord(record)}>
        {title}
      </button>
    );
  }

  return (
    <>
      <div className="section-heading-row">
        <h2>验货台账</h2>
        <span className="section-count">全部 {records.length} 条 | 通过 {stats.passed} | 返工 {stats.failed} | 待反馈 {stats.pending}</span>
        <button type="button" className="ghost compact-button" disabled={!records.length} onClick={onExport}>导出</button>
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
        <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
          <option value="">全部状态</option>
          {['未安排', '已安排', '验货中', '已完成', '已取消'].map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select value={filters.result} onChange={(event) => updateFilter('result', event.target.value)}>
          <option value="">全部结果</option>
          {['通过', '让步', '返工'].map((result) => <option key={result} value={result}>{result}</option>)}
        </select>
        <button type="button" className="ghost compact-button" onClick={clearFilters}>清除</button>
      </div>
      <DataTable
        rows={filteredRecords}
        columns={['供应商', '产品线', '系列', '数量', 'SKU', '事业部', '验货通知人', '是否首批验货', '验货员', '计划日期', '状态', '实际验货时间', '实际验货数量', '检验数量', '验货合格数量', '验货方式', '报告结论', '验货结果', '问题等级', '问题分类', '问题反馈', '报告文件', '是否返工', '备注']}
        render={(record) => {
          const feedback = latestFeedback(record.feedback);
          const allRemarks = [
            record.remark,
            record.schedule?.remark,
            feedback.remark
          ].filter((remark) => remark && remark.trim()).join('；');
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
            formatDate(record.schedule?.scheduledDate),
            record.schedule?.status || '未安排',
            formatDate(feedback.actualInspectionTime),
            feedback.inspectionQuantity || '',
            feedback.checkQuantity || '',
            feedback.qualifiedQuantity || '',
            feedback.inspectionMethod || '',
            record.report?.conclusion || '',
            feedback.result || '',
            feedback.issueLevel || '',
            feedback.issueCategoryPrimary || '',
            feedback.feedbackText || '',
            reportPreviewCell(record),
            record.rework?.completedAt ? '是' : '否',
            allRemarks
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
