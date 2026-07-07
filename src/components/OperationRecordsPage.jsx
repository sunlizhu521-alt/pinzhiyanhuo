import DataTable from './DataTable.jsx';

function OperationRecordsPage({ rows, loading, onRefresh }) {
  const records = Array.isArray(rows) ? rows : [];

  return (
    <>
      <div className="section-heading-row">
        <h2>操作记录</h2>
        <span className="section-count">共 {records.length} 条</span>
        <button type="button" className="ghost compact-button" onClick={onRefresh} disabled={loading}>
          {loading ? '刷新中' : '刷新'}
        </button>
      </div>

      <DataTable
        className="operation-records-table"
        rows={records}
        columns={[
          { key: 'createdAt', label: '操作时间' },
          { key: 'userName', label: '操作人' },
          { key: 'userRole', label: '角色' },
          { key: 'action', label: '操作内容' },
          { key: 'detail', label: '详情' },
          { key: 'inspectionInfo', label: '验货信息' },
          { key: 'method', label: '请求方式' },
          { key: 'path', label: '接口' }
        ]}
        render={(record) => [
          record.createdAt || '-',
          record.userName || '-',
          record.userRole || '-',
          record.action || '-',
          record.detail || '-',
          record.inspectionInfo || '-',
          record.method || '-',
          record.path || '-'
        ]}
      />
    </>
  );
}

export default OperationRecordsPage;
