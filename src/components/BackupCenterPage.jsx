import DataTable from './DataTable.jsx';
import EmptyState from './EmptyState.jsx';
import MetricCard from './MetricCard.jsx';

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function BackupCenterPage({ status, loading, savingId, onRefresh, onRunBackup }) {
  const files = Array.isArray(status?.files) ? status.files : [];
  const hasBackup = !!status?.exists;
  return (
    <>
      <div className="section-heading-row">
        <h2>备份中心</h2>
        <span className="section-count">每天 0 点自动覆盖最新备份</span>
        <button type="button" className="ghost compact-button" onClick={onRefresh} disabled={loading}>刷新状态</button>
        <button type="button" className="compact-button" onClick={onRunBackup} disabled={savingId === 'backupCenter'}>
          {savingId === 'backupCenter' ? '备份中' : '立即备份'}
        </button>
      </div>

      <div className="metric-grid">
        <MetricCard label="备份状态" value={hasBackup ? '已备份' : '暂无备份'} />
        <MetricCard label="最近备份时间" value={status?.backedUpAt || '-'} />
        <MetricCard label="下次自动备份" value={status?.nextBackupAt || '-'} />
        <MetricCard label="备份大小" value={formatBytes(status?.totalBytes)} />
      </div>

      <section className="plain-section">
        <div className="section-heading-row">
          <h3>备份位置</h3>
          <span className="section-count">{status?.backupDir || '-'}</span>
        </div>
        {!hasBackup && <EmptyState text="暂无最新备份，可等待每天 0 点自动备份，或点击立即备份。" />}
        {hasBackup && (
          <DataTable
            rows={files}
            columns={['名称', '类型', '大小']}
            render={(file) => [
              file.name,
              file.type === 'directory' ? '目录' : '文件',
              formatBytes(file.bytes)
            ]}
          />
        )}
      </section>
    </>
  );
}

export default BackupCenterPage;
