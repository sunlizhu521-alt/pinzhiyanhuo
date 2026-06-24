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
      reworkReason: record.rework?.reworkReason || '',
      reworkPlan: record.rework?.reworkPlan || '',
      reworkCompleteTime: formatDate(record.rework?.reworkCompleteTime),
      reworkResult: record.rework?.reworkResult || '',
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
        <h2>返工记录</h2>
        <span className="section-count">共 {filteredRecords.length} 条待返工</span>
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
          '供应商简称', '产品线', '系列', '数量', '事业部', '验货员', '实际验货时间',
          '验货结果', '返工原因', '返工处理方案', '返工完成时间', '返工结果', '备注', '操作'
        ]}
        render={(record) => {
          const draft = reworkDraft(record);
          return [
            record.supplierShortName,
            record.salesProductLine,
            record.series,
            record.totalQuantity,
            record.businessDepartments,
            record.schedule?.inspector || '',
            formatDate(record.feedback?.actualInspectionTime),
            record.feedback?.result || '',
            <input
              className="table-input wide-input"
              value={draft.reworkReason || ''}
              onChange={(event) => updateReworkDraft(record.id, 'reworkReason', event.target.value)}
            />,
            <input
              className="table-input wide-input"
              value={draft.reworkPlan || ''}
              onChange={(event) => updateReworkDraft(record.id, 'reworkPlan', event.target.value)}
            />,
            <input
              className="table-input"
              type="date"
              value={draft.reworkCompleteTime || ''}
              onChange={(event) => updateReworkDraft(record.id, 'reworkCompleteTime', event.target.value)}
            />,
            <select
              className="table-input"
              value={draft.reworkResult || ''}
              onChange={(event) => updateReworkDraft(record.id, 'reworkResult', event.target.value)}
            >
              <option value="">选择</option>
              <option value="通过">通过</option>
              <option value="让步">让步</option>
              <option value="再次返工">再次返工</option>
            </select>,
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
                  if (!window.confirm('确认提交返工记录？')) return;
                  const saved = await onSave(record, reworkDrafts[record.id] || {});
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
