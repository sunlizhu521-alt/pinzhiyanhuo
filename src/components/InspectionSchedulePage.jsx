import { useEffect, useMemo, useState } from 'react';
import { formatDate, mergeScheduleRecords } from '../utils.js';
import DataTable from './DataTable.jsx';

function InspectionSchedulePage({ records, savingId, onSubmit, onClear, onDelete }) {
  const [drafts, setDrafts] = useState({});
  const [filterProvince, setFilterProvince] = useState('');
  const scheduleRows = useMemo(() => mergeScheduleRecords(records), [records]);
  const filteredRows = useMemo(() => {
    if (!filterProvince) return scheduleRows;
    return scheduleRows.filter((row) => {
      const addr = row.supplierAddress || '';
      return addr.includes(filterProvince);
    });
  }, [scheduleRows, filterProvince]);

  useEffect(() => {
    setDrafts((current) => {
      const next = {};
      scheduleRows.forEach((record) => {
        if (current[record.id]) {
          next[record.id] = current[record.id];
        } else {
          next[record.id] = {
            scheduledDate: formatDate(record.schedule?.scheduledDate),
            inspector: record.schedule?.inspector || '',
            remark: record.schedule?.remark || '',
            sourceIds: record.sourceIds || [record.id]
          };
        }
      });
      return next;
    });
  }, [scheduleRows]);

  function updateDraft(recordId, key, value) {
    setDrafts((current) => ({
      ...current,
      [recordId]: {
        ...(current[recordId] || {}),
        [key]: value
      }
    }));
  }

  function provinceCityText(address) {
    const addr = address || '';
    const match = addr.match(/^([^省]+省)?([^市]+市)?/);
    return match ? ((match[1] || '') + (match[2] || '') || addr) : addr;
  }

  return (
    <>
      <div className="section-heading-row">
        <h2>验货安排</h2>
        <span className="section-count">来自验货通知 {records.length} 条，按系列合并 {filteredRows.length} 条</span>
        <button
          type="button"
          disabled={savingId === 'inspectionSchedule' || scheduleRows.length === 0}
          onClick={() => onSubmit(drafts)}
        >
          一键提交
        </button>
        <button
          type="button"
          className="ghost compact-button"
          disabled={savingId === 'inspectionScheduleClear' || scheduleRows.length === 0}
          onClick={onClear}
        >
          清除内容
        </button>
      </div>
      <div className="toolbar" style={{ marginBottom: '12px' }}>
        <input
          placeholder="筛选省份"
          value={filterProvince}
          onChange={(event) => setFilterProvince(event.target.value)}
          style={{ maxWidth: '180px' }}
        />
        {filterProvince && (
          <button type="button" className="ghost compact-button" onClick={() => setFilterProvince('')}>清除</button>
        )}
      </div>
      <DataTable
        className="inspection-schedule-table"
        rows={filteredRows}
        columns={[
          { key: 'supplierShortName', label: '供应商简称', className: 'schedule-nowrap-cell' },
          { key: 'supplierAddress', label: '地址', className: 'schedule-nowrap-cell' },
          { key: 'salesProductLine', label: '产品线', className: 'schedule-nowrap-cell' },
          { key: 'series', label: '系列', className: 'schedule-nowrap-cell' },
          'SKU及数量',
          '数量',
          '事业部',
          '运营',
          { key: 'inspectionNotifier', label: '验货通知人', className: 'schedule-nowrap-cell' },
          '备注',
          { key: 'shipmentTime', label: '可验货时间', className: 'schedule-nowrap-cell' },
          '验货员 *',
          '计划验货时间 *',
          '安排备注',
          '操作'
        ]}
        render={(record) => [
          record.supplierShortName,
          provinceCityText(record.supplierAddress),
          record.salesProductLine,
          record.series,
          record.skuQuantity || '',
          record.totalQuantity || '',
          record.businessDepartments,
          record.operation,
          record.inspectionNotifier || record.inspectionApplicant,
          <span className="readonly-cell wide-readonly-cell">{record.remark || ''}</span>,
          formatDate(record.shipmentTime),
          <input
            className="table-input"
            required
            value={drafts[record.id]?.inspector || ''}
            onChange={(event) => updateDraft(record.id, 'inspector', event.target.value)}
          />,
          <input
            className="table-input"
            type="date"
            required
            value={drafts[record.id]?.scheduledDate || ''}
            onChange={(event) => updateDraft(record.id, 'scheduledDate', event.target.value)}
          />,
          <input
            className="table-input wide-input"
            value={drafts[record.id]?.remark || ''}
            onChange={(event) => updateDraft(record.id, 'remark', event.target.value)}
          />,
          <div className="table-action-row">
            <button
              type="button"
              className="compact-button"
              disabled={savingId === record.id}
              onClick={() => onSubmit({ [record.id]: drafts[record.id] || {} }, { single: true, savingId: record.id })}
            >
              提交
            </button>
            <button
              type="button"
              className="danger-button compact-button"
              disabled={(record.sourceIds || [record.id]).includes(savingId)}
              onClick={() => onDelete(record.sourceIds || [record.id])}
            >
              删除
            </button>
          </div>
        ]}
      />
    </>
  );
}

export default InspectionSchedulePage;
