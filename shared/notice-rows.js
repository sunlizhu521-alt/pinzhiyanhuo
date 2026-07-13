function rowId(row) {
  return String(row?.id || '').trim();
}

export function mergeNoticeRowsById(existingRows = [], incomingRows = []) {
  const incomingIds = new Set(incomingRows.map(rowId).filter(Boolean));
  return [
    ...existingRows.filter((row) => {
      const id = rowId(row);
      return !id || !incomingIds.has(id);
    }),
    ...incomingRows
  ];
}
