import { useMemo, useState } from 'react';
import DataTable from './DataTable.jsx';
import { normalize, formatDate } from '../utils.js';

function ReworkRecordsPage({
  records,
  savingId,
  onSave,
  canDelete = false,
  onDelete
}) {
  const [filters, setFilters] = useState({
    supplierShortName: '',
    inspector: ''
  });
  const [reworkDrafts, setReworkDrafts] = useState({});

  const filteredRecords = useMemo(() => {
    const normalizedFilters = Object.fromEntries(
      Object.entries(filters).map(([key, value]) => [key, normalize(value).toLowerCase()])
    );
    return records.filter((record) => (
      (!normalizedFilters.supplierShortName || normalize(record.supplierShortName).toLowerCase().includes(normalizedFilters.supplierShortName))
      && (!normalizedFilters.inspector || normalize(record.schedule?.inspector).toLowerCase().includes(normalizedFilters.inspector))
    ));
  }, [records, filters]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters({ supplierShortName: '', inspector: '' });
  }

  function reworkDraft(record) {
    return {
      reworkCompleteTime: formatDate(record.rework?.reworkCompleteTime),
      reworkRemark: record.rework?.reworkRemark || '',
      ...(reworkDrafts[record.id] || {})
    };
  }

  function updateReworkDraft(recordId, key, value) {
    setReworkDrafts((current) => ({
      ...current,
      [recordId]: {
        ...(current[recordId] || {}),
        [key]: value
      }
    }));
  }

  return (
    <>
      <div className="section-heading-row">
        <h2>复验通知</h2>
        <span className="section-count">共 {filteredRecords.length} 条待复验</span>
      </div>
      <div className="toolbar">
        <input
          placeholder="筛选供应商"
          value={filters.supplierShortName}
          onChange={(event) => updateFilter('supplierShortName', event.target.value)}
        />
        <input
          placeholder="筛选验货员"
          value={filters.inspector}
          onChange={(event) => updateFilter('inspector', event.target.value)}
        />
        <button type="button" className="ghost compact-button" onClick={clearFilters}>清除</button>
      </div>
      <DataTable
        rows={filteredRecords}
        columns={[
          '供应商简称', '产品线', '系列', '数量', '事业部', '验货通知人', '验货员', '实际验货时间',
          '验货结果', '问题等级', '问题分类', '问题反馈', '返工完成时间', '复验备注', '操作'
        ]}
        render={(record) => {
          const draft = reworkDraft(record);
          return [
            record.supplierShortName,
            record.salesProductLine,
            record.series,
            record.totalQuantity,
            record.businessDepartments,
            record.inspectionNotifier || record.inspectionApplicant || '',
            record.schedule?.inspector || '',
            formatDate(record.feedback?.actualInspectionTime),
            record.feedback?.result || '',
            record.feedback?.issueLevel || '',
            record.feedback?.issueCategoryPrimary || '',
            record.feedback?.feedbackText || '',
            <input
              className="table-input"
              type="date"
              value={draft.reworkCompleteTime || ''}
              onChange={(event) => updateReworkDraft(record.id, 'reworkCompleteTime', event.target.value)}
            />,
            <textarea
              className="table-textarea"
              value={draft.reworkRemark || ''}
              onChange={(event) => updateReworkDraft(record.id, 'reworkRemark', event.target.value)}
            />,
            <div className="table-action-row">
              <button
                type="button"
                className="compact-button"
                disabled={savingId === record.id}
                onClick={async () => {
                  if (!window.confirm('确认提交复验通知？')) return;
                  const saved = await onSave(record, draft);
                  if (saved) {
                    setReworkDrafts((current) => {
                      const next = { ...current };
                      delete next[record.id];
                      return next;
                    });
                  }
                }}
              >
                提交
              </button>
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
    </>
  );
}

export default ReworkRecordsPage;
