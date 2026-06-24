function EmptyState({ text }) {
  return <div className="empty-state">{text || '暂无数据'}</div>;
}

export default EmptyState;
