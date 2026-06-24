import { useEffect, useState } from 'react';
import { BUSINESS_DEPARTMENT_OPTIONS } from '../constants.js';
import { canReadClientRecord, formatDate } from '../utils.js';
import { reportHref, isImageReport, reportFileExt, formatFileSize } from '../file-utils.js';
import DataTable from './DataTable.jsx';
import EmptyState from './EmptyState.jsx';
import ReportPreviewModal from './ReportPreviewModal.jsx';
function ReportQueryPage({
  records,
  query,
  statusFilter,
  filters,
  supplierOptions,
  productLineOptions,
  seriesOptions,
  onQuery,
  onStatusFilter,
  onFilterChange,
  onClearFilters,
  savingId = '',
  canDelete = false,
  onDelete,
  onExport
}) {
  const [previewRecord, setPreviewRecord] = useState(null);
  const previewUrl = previewRecord ? reportHref(previewRecord) : '';
  const previewExt = previewRecord ? reportFileExt(previewRecord) : '';
  const columns = canDelete
    ? ['供应商', '实际验货时间', '实际验货员', '报告单号', '报告文件', '验货结果', '操作']
    : ['供应商', '实际验货时间', '实际验货员', '报告单号', '报告文件', '验货结果'];

  useEffect(() => {
    if (previewRecord && !records.some((record) => record.id === previewRecord.id)) {
      setPreviewRecord(null);
    }
  }, [records, previewRecord]);

  return (
    <>
      <div className="section-heading-row">
        <h2>查询检验单</h2>
        <span className="section-count">筛选结果 {records.length} 条</span>
        <button
          type="button"
          className="ghost compact-button"
          disabled={!records.length}
          onClick={onExport}
        >
          导出检验单
        </button>
      </div>
      <div className="toolbar">
        <input placeholder="搜索供应商、采购订单、产品线、报告单号" value={query} onChange={(event) => onQuery(event.target.value)} />
        <select value={filters.supplierShortName} onChange={(event) => onFilterChange('supplierShortName', event.target.value)}>
          <option value="">全部供应商简称</option>
          {supplierOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.businessDepartments} onChange={(event) => onFilterChange('businessDepartments', event.target.value)}>
          <option value="">全部事业部</option>
          {BUSINESS_DEPARTMENT_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.salesProductLine} onChange={(event) => onFilterChange('salesProductLine', event.target.value)}>
          <option value="">全部产品线</option>
          {productLineOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.series} onChange={(event) => onFilterChange('series', event.target.value)}>
          <option value="">全部系列</option>
          {seriesOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => onStatusFilter(event.target.value)}>
          <option value="">全部状态</option>
          {['未安排', '已安排', '验货中', '已完成', '已取消'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" className="ghost compact-button" onClick={onClearFilters}>清除筛选</button>
      </div>
      <DataTable
        className="report-query-table"
        rows={records}
        columns={columns}
        render={(record) => {
          const cells = [
            record.supplierShortName,
            formatDate(record.feedback?.actualInspectionTime),
            record.feedback?.actualInspector || record.schedule?.inspector || '',
            record.report?.reportNo || '',
            reportHref(record)
              ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setPreviewRecord(record)}
                >
                  {record.report.originalName || '查看文件'}
                </button>
              )
              : '',
            record.feedback?.result || ''
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

export default ReportQueryPage;
