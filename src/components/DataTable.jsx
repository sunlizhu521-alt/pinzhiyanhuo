function DataTable({ rows, columns, render, className = '', stickyColumns = 0 }) {
  function columnClassName(col, index) {
    const classes = [];
    if (col.className) classes.push(col.className);
    if (index < stickyColumns) classes.push(`sticky-column sticky-column-${index + 1}`);
    return classes.join(' ');
  }

  function renderHeader(col) {
    const label = col.label || col;
    if (typeof label === 'string' && label.endsWith(' *')) {
      return (
        <>
          {label.slice(0, -2)}
          <span className="required-star"> *</span>
        </>
      );
    }
    return label;
  }

  return (
    <div className={`data-table-wrapper table-wrap ${className}`}>
      <table className="data-table">
        <thead>
          <tr>{columns.map((col, index) => <th key={col.key || col} className={columnClassName(col, index)}>{renderHeader(col)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="empty-cell empty">暂无数据</td></tr>
          ) : rows.map((row, i) => {
            const rendered = render(row, i);
            if (!Array.isArray(rendered)) return rendered;
            return (
              <tr key={row.id || `${row.name || 'row'}-${row.rowNumber || i}`}>
                {rendered.map((cell, index) => <td key={index} className={columnClassName(columns[index] || {}, index)}>{cell}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
