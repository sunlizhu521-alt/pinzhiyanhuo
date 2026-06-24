import DataTable from './DataTable.jsx';

function InitialDataPage({ data, result, onUpload }) {
  const columns = data.columns?.length ? data.columns : ['暂无字段'];
  return (
    <>
      <div className="section-heading-row">
        <h2>验货信息初始数据</h2>
        <span className="section-count">共 {data.rows?.length || 0} 行</span>
      </div>
      <section className="single-management-panel">
        <label
          className="mini-drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); onUpload(event.dataTransfer.files); }}
        >
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => onUpload(event.target.files)} />
          <span>点击或拖拽上传验货信息初始数据</span>
        </label>
        {(result || data.updatedAt) && (
          <div className="import-summary">
            <strong>读取结果</strong>
            <span>工作表：{data.sheetName || result?.sheetName || '未识别'}</span>
            <span>成功 {result?.importedCount ?? data.rows?.length ?? 0} 行</span>
            {data.updatedAt && <span>更新时间：{data.updatedAt}</span>}
          </div>
        )}
        <DataTable
          className="inspection-initial-table"
          rows={data.rows || []}
          columns={columns}
          render={(row) => columns.map((column) => row[column] || '')}
        />
      </section>
    </>
  );
}

export default InitialDataPage;
