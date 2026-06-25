import DataTable from './DataTable.jsx';
import MetricCard from './MetricCard.jsx';
import { normalize, formatDate, latestFeedback } from '../utils.js';
function SummaryPage({
  title = '验货状态',
  summary,
  records,
  savingId = '',
  canDelete = false,
  onDelete,
  onExport
}) {
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
            (() => {
              const hasInspector = !!normalize(record.schedule?.inspector);
              const hasResult = !!normalize(feedback.result);
              const resultText = normalize(feedback.result);
              let text = '待安排验货员';
              let color = '#c2410c';
              if (hasInspector && !hasResult) { text = '待验货'; color = '#1d4ed8'; }
              else if (resultText === '返工') { text = '需返工'; color = '#dc2626'; }
              else if (hasInspector && hasResult && resultText !== '返工') { text = '已验货'; color = '#047857'; }
              return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', background: color, color: '#fff', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{text}</span>;
            })(),
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
