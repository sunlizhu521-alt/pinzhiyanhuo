import { DIMENSION_LIBRARY_SLOTS } from '../constants.js';

const SLOT_DESCRIPTIONS = {
  'dimension-slot-1': '商品分类维度维护槽位，包含销售产品线、销售系列、商品分类等字段。',
  'dimension-slot-2': '采购分工明细维护槽位，包含供应商简称、产品线明细地址、省市等字段。',
  'dimension-slot-3': '预留维度表槽位，用于后续扩展验货业务维度。',
  'dimension-slot-4': '预留维度表槽位，用于后续扩展验货业务维度。'
};

function formatDimensionFileSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return '-';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDimensionDate(value) {
  const text = String(value || '').trim();
  if (!text) return '-';
  return text.replace(/-/g, '/').slice(0, 19);
}

function refreshMonthFromRecord(record) {
  const text = String(record?.updatedAt || record?.appliedAt || record?.savedAt || '').trim();
  const match = text.match(/^(\d{4})[-/](\d{1,2})/);
  return match ? `${match[1]}-${String(match[2]).padStart(2, '0')}` : '-';
}

function dimensionRecordStatus(record) {
  if (record?.applied) return { className: 'applied', label: '已应用' };
  if (record) return { className: 'pending', label: '待应用' };
  return { className: 'empty', label: '缺失' };
}

function firstSheetPreview(record) {
  const sheets = Array.isArray(record?.sheets) && record.sheets.length
    ? record.sheets
    : record
      ? [{
          sheetName: record.sheetName || '默认工作表',
          columns: record.columns || [],
          rows: record.rows || [],
          importedCount: record.importedCount || 0
        }]
      : [];
  return sheets[0] || null;
}

function DimensionFileInput({ slotId, disabled, onUpload }) {
  return (
    <input
      className="dimension-file-input"
      type="file"
      accept=".xlsx,.xlsm,.xls,.csv"
      disabled={disabled}
      onChange={(event) => {
        onUpload(slotId, event.target.files);
        event.target.value = '';
      }}
    />
  );
}

function DimensionLibraryPage({ slots = DIMENSION_LIBRARY_SLOTS, library, loading, uploadProgress = {}, savingId, onRefresh, onSync, onUpload, onApply, onDelete }) {
  const filledCount = slots.filter((slot) => library[slot.id]).length;
  const appliedCount = slots.filter((slot) => library[slot.id]?.applied).length;
  const latestUpdate = slots
    .map((slot) => library[slot.id]?.updatedAt || library[slot.id]?.appliedAt || library[slot.id]?.savedAt || '')
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="dimension-library-page">
      <header className="dimension-library-top">
        <h2>维度表文件库</h2>
        <p>{loading ? '正在同步腾讯云服务器最新维度表...' : '上传商品分类维表、采购分工明细，应用刷新后全员读取腾讯云服务器当前应用文件。'}</p>
      </header>

      <section className="dimension-library-summary">
        <div className="dimension-summary-head">
          <div>
            <span className="dimension-summary-eyebrow">DIMENSION FILES</span>
            <h3>品质验货维度表文件库</h3>
          </div>
          <span className={`dimension-saved-badge ${appliedCount ? '' : 'pending'}`}>
            {appliedCount ? '维度文件已保存' : '等待上传维度文件'}
          </span>
        </div>
        <div className="dimension-summary-metrics">
          <div>
            <span>维度上限</span>
            <strong>{slots.length}</strong>
          </div>
          <div>
            <span>已上传维度</span>
            <strong>{filledCount}</strong>
          </div>
          <div>
            <span>已应用维度</span>
            <strong>{appliedCount}</strong>
          </div>
          <div>
            <span>最近更新</span>
            <strong>{formatDimensionDate(latestUpdate)}</strong>
          </div>
        </div>
        <div className="dimension-summary-toolbar">
          <button
            type="button"
            className="compact-button"
            disabled={savingId === 'dimensionLibraryUpdate' || savingId === 'dimensionLibrarySync'}
            onClick={onRefresh}
          >
            {savingId === 'dimensionLibraryUpdate' ? '更新中' : '更新'}
          </button>
          <button
            type="button"
            className="ghost compact-button"
            disabled={savingId === 'dimensionLibrarySync'}
            onClick={onSync}
          >
            {savingId === 'dimensionLibrarySync' ? '下载同步中' : '下载腾讯云数据'}
          </button>
          <span>维度文件以腾讯云服务器为准；上传后先预览，点击应用刷新后生效。</span>
        </div>
      </section>

      <section className="dimension-library-grid">
        {slots.map((slot, index) => {
          const record = library[slot.id];
          const progress = uploadProgress[slot.id];
          const isUploading = savingId === `dimensionUpload:${slot.id}`;
          const isApplying = savingId === slot.id;
          const isBusy = isUploading || isApplying;
          const sheetPreviews = record?.sheets?.length
            ? record.sheets
            : record
              ? [{
                  sheetName: record.sheetName || '默认工作表',
                  columns: record.columns || [],
                  rows: record.rows || [],
                  importedCount: record.importedCount || 0
                }]
              : [];
          const sheetNames = record?.sheetNames?.length
            ? record.sheetNames
            : sheetPreviews.map((sheet) => sheet.sheetName).filter(Boolean);
          const previewCount = sheetPreviews.reduce((sum, sheet) => sum + (sheet.rows?.length || 0), 0);
          const updatedAt = record?.updatedAt || record?.appliedAt || record?.savedAt || '';
          const displayFileName = record?.pendingName || record?.fileName || '点击选择维度表文件';
          const fileMeta = record
            ? `${record.fileType || 'Excel'} · ${formatDimensionFileSize(record.fileSize)}`
            : '支持 Excel / CSV，拖拽到此槽位上传';
          const status = dimensionRecordStatus(record);
          const firstSheet = firstSheetPreview(record);
          const diagnosticColumns = firstSheet?.columns || record?.columns || [];
          const firstHeaders = diagnosticColumns.slice(0, 12).filter(Boolean).join('、') || '-';
          const diagnosticText = firstSheet
            ? `${firstSheet.sheetName || record.sheetName || '-'} / 表头第 1 行 / ${record.importedCount || firstSheet.importedCount || 0} 行`
            : '等待上传文件后解析';
          const progressPercent = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
          const progressBlock = progress ? (
            <div className={`dimension-upload-progress ${progress.status || 'running'}`}>
              <div className="dimension-upload-progress-head">
                <strong>{progress.label || '正在处理'}</strong>
                <span>{progressPercent}%</span>
              </div>
              <div className="dimension-upload-progress-bar">
                <span style={{ width: `${progressPercent}%` }} />
              </div>
              <p>{progress.fileName ? `${progress.fileName}：` : ''}{progress.detail || '正在解析文件，请稍候。'}</p>
            </div>
          ) : null;
          return (
            <article key={slot.id} className="dimension-slot-card library-card file-slot">
              <div className="slot-head">
                <span className="slot-kicker">DIMENSION SLOT</span>
                <span className={`slot-state ${status.className}`}>{status.label}</span>
              </div>
              <h3>{slot.title}</h3>
              <p className="slot-description">{SLOT_DESCRIPTIONS[slot.id] || `维度表槽位 ${index + 1}`}</p>
              <label
                className={`dimension-drop-zone${isBusy ? ' disabled' : ''}`}
                tabIndex={isBusy ? -1 : 0}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!isBusy) event.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!isBusy) onUpload(slot.id, event.dataTransfer.files);
                }}
              >
                <DimensionFileInput slotId={slot.id} disabled={isBusy} onUpload={onUpload} />
                <strong>{isUploading ? '正在读取新文件' : displayFileName}</strong>
                <span>{isUploading ? '正在解析最新上传文件，请稍候' : fileMeta}</span>
              </label>
              {progressBlock}
              {record ? (
                <>
                  <div className="dimension-slot-meta-grid">
                    <div className="slot-info">
                      <span>刷新月份</span>
                      <strong>{refreshMonthFromRecord(record)}</strong>
                    </div>
                    <div className="slot-info">
                      <span>更新日期</span>
                      <strong>{formatDimensionDate(updatedAt)}</strong>
                    </div>
                    <div className="slot-info">
                      <span>工作表</span>
                      <strong>{sheetNames.join('、') || '未识别'}</strong>
                    </div>
                    <div className="slot-info">
                      <span>行数/预览</span>
                      <strong>{record.importedCount || 0} / {previewCount}</strong>
                    </div>
                  </div>
                  <div className="path-info">
                    <span>引用路径</span>
                    <strong>腾讯云服务器 / data/dimension-uploads / {record.storedFileName || record.fileName}</strong>
                    {record.fileUrl && <small>{record.fileUrl}</small>}
                  </div>
                  <div className="parse-info">
                    <span>解析诊断</span>
                    <strong>{diagnosticText}</strong>
                    <small>工作表数：{record.sheetCount || sheetPreviews.length || 0}</small>
                    <small>前 12 列：{firstHeaders}</small>
                    <small>G/H/AD：{diagnosticColumns[6] || '-'} / {diagnosticColumns[7] || '-'} / {diagnosticColumns[29] || '-'}</small>
                  </div>
                  <div className="card-actions">
                    <label className={`compact-button dimension-file-picker-button${isBusy ? ' disabled' : ''}`}>
                      <DimensionFileInput slotId={slot.id} disabled={isBusy} onUpload={onUpload} />
                      {isUploading ? '读取中' : record ? '替换文件' : '上传文件'}
                    </label>
                    <button type="button" className="compact-button" disabled={isBusy} onClick={() => onApply(slot.id)}>
                      {isApplying ? '应用中' : '应用刷新'}
                    </button>
                    <button type="button" className="ghost compact-button" disabled={isBusy} onClick={() => onDelete(slot.id)}>删除</button>
                  </div>
                </>
              ) : (
                <div className="card-actions">
                  <label className={`compact-button dimension-file-picker-button${isBusy ? ' disabled' : ''}`}>
                    <DimensionFileInput slotId={slot.id} disabled={isBusy} onUpload={onUpload} />
                    {isUploading ? '读取中' : '上传文件'}
                  </label>
                  <button type="button" className="compact-button" disabled>应用刷新</button>
                  <button type="button" className="ghost compact-button" disabled>删除</button>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}

export default DimensionLibraryPage;
