import { NOTICE_FIELDS } from '../constants.js';
import { formatDate } from '../utils.js';
import DataTable from './DataTable.jsx';

function InspectionDraftPage({ rows, savingId, onChange, onSubmit, onDelete }) {
  return (
    <>
      <div className="section-heading-row">
        <h2>验货暂存</h2>
        <span className="section-count">共 {rows.length} 条</span>
        <span className="section-count">补齐供应商完工时间和可验货时间后，提交进入验货安排</span>
      </div>
      <DataTable
        className="inspection-notice-table"
        rows={rows}
        columns={[
          ...NOTICE_FIELDS.map((field) => (
            ['supplierFinishTime', 'shipmentTime'].includes(field.key) ? `${field.label} *` : field.label
          )),
          '暂存时间',
          '操作'
        ]}
        render={(row) => [
          ...NOTICE_FIELDS.map((field) => {
            if (['supplierFinishTime', 'shipmentTime'].includes(field.key)) {
              return (
                <input
                  className="table-input inspection-notice-input"
                  type="date"
                  value={formatDate(row[field.key])}
                  onChange={(event) => onChange(row.id, field.key, event.target.value)}
                />
              );
            }
            if (field.type === 'date') return formatDate(row[field.key]);
            return row[field.key] || '';
          }),
          row.draftedAt || '',
          <div className="table-action-row">
            <button
              type="button"
              className="compact-button"
              disabled={!!savingId}
              onClick={() => onSubmit(row)}
            >
              {savingId === `draft-submit-${row.id}` ? '提交中...' : '提交'}
            </button>
            <button
              type="button"
              className="danger-button compact-button"
              disabled={!!savingId}
              onClick={() => onDelete(row)}
            >
              {savingId === `draft-delete-${row.id}` ? '删除中...' : '删除'}
            </button>
          </div>
        ]}
      />
    </>
  );
}

export default InspectionDraftPage;
