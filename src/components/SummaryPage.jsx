import DataTable from './DataTable.jsx';
import MetricCard from './MetricCard.jsx';
import { formatDate, latestFeedback } from '../utils.js';
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
    ? ['供应商', '事业部', '产品线', '系列', '数量', '验货通知人', '计划日期', '状态', '实际验货时间', '实际验货数量', '检验数量', '合格数量', '合格率', '是否返工过', '报告结论', '反馈结果', '操作']
    : ['供应商', '事业部', '产品线', '系列', '数量', '验货通知人', '计划日期', '状态', '实际验货时间', '实际验货数量', '检验数量', '合格数量', '合格率', '是否返工过', '报告结论', '反馈结果'];
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
          const feedback = latestFeedback(record.feedback);
          const cells = [
            record.supplierShortName,
            record.businessDepartments,
            record.salesProductLine,
            record.series,
            record.totalQuantity,
            record.inspectionNotifier || record.inspectionApplicant,
            record.schedule?.scheduledDate || '',
            record.schedule?.status || '未安排',
            formatDate(feedback.actualInspectionTime),
            feedback.inspectionQuantity || '',
            feedback.checkQuantity || '',
            feedback.qualifiedQuantity || '',
            (() => {
              const qualified = Number(feedback.qualifiedQuantity);
              const checked = Number(feedback.checkQuantity);
              if (!checked || Number.isNaN(qualified)) return '';
              return `${Math.round((qualified / checked) * 100)}%`;
            })(),
            record.rework?.completedAt ? '是' : '否',
            record.report?.conclusion || '',
            feedback.result || ''
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

export default SummaryPage;
