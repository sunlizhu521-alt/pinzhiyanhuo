function DataTable({ rows, columns, render, className = '' }) {
  return (
    <div className={`data-table-wrapper table-wrap ${className}`}>
      <table className="data-table">
        <thead>
          <tr>{columns.map((col) => <th key={col.key || col}>{col.label || col}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="empty-cell empty">暂无数据</td></tr>
          ) : rows.map((row, i) => {
            const rendered = render(row, i);
            if (!Array.isArray(rendered)) return rendered;
            return (
              <tr key={row.id || `${row.name || 'row'}-${row.rowNumber || i}`}>
                {rendered.map((cell, index) => <td key={index}>{cell}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
