import { useRef } from 'react';
import { DIMENSION_LIBRARY_SLOTS, PURCHASE_WORK_DIVISION_SLOT_ID } from '../constants.js';
import DataTable from './DataTable.jsx';
import EmptyState from './EmptyState.jsx';

function DimensionLibraryPage({ slots = DIMENSION_LIBRARY_SLOTS, library, loading, uploadProgress = {}, savingId, onRefresh, onSync, onUpload, onApply, onDelete }) {
  const replaceInputRefs = useRef({});
  const filledCount = slots.filter((slot) => library[slot.id]).length;
  const appliedCount = slots.filter((slot) => library[slot.id]?.applied).length;
  return (
    <>
      <div className="section-heading-row">
        <h2>维度表文件库</h2>
        <span className="section-count">{loading ? '正在同步腾讯云服务器最新维度表...' : `4 个槽位，已上传 ${filledCount} 个，已应用 ${appliedCount} 个`}</span>
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
      </div>
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
            <article key={slot.id} className="dimension-slot-card">
              <div className="slot-head">
                <div>
                  <span className="slot-kicker">槽位 {index + 1}</span>
                  <h3>{slot.title}</h3>
                </div>
                <span className={`slot-state ${record?.applied ? 'applied' : record ? 'pending' : ''}`}>
                  {record?.applied ? '已应用' : record ? '待应用' : '缺失'}
                </span>
              </div>
              <input
                ref={(input) => { replaceInputRefs.current[slot.id] = input; }}
                type="file"
                accept=".xlsx,.xlsm,.xls,.csv"
                style={{ display: 'none' }}
                disabled={isBusy}
                onChange={(event) => {
                  onUpload(slot.id, event.target.files);
                  event.target.value = '';
                }}
              />
              <div
                className={`dimension-drop-zone${isBusy ? ' disabled' : ''}`}
                role="button"
                tabIndex={isBusy ? -1 : 0}
                onClick={() => {
                  if (!isBusy) replaceInputRefs.current[slot.id]?.click();
                }}
                onKeyDown={(event) => {
                  if (isBusy) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    replaceInputRefs.current[slot.id]?.click();
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!isBusy) event.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!isBusy) onUpload(slot.id, event.dataTransfer.files);
                }}
              >
                <strong>{isUploading ? '正在读取新文件' : record ? '替换维度表文件' : '上传维度表文件'}</strong>
                <span>{isUploading ? '正在解析最新上传文件，请稍候' : '点击或拖拽 Excel / CSV 到此槽位'}</span>
              </div>
              {progressBlock}
              {record ? (
                <>
                  <div className="slot-info">
                    <span>文件：{record.fileName}</span>
                    <span>工作表数：{record.sheetCount || sheetPreviews.length || 0}</span>
                    <span>工作表：{sheetNames.join('、') || '未识别'}</span>
                    <span>总行数：{record.importedCount || 0}</span>
                    <span>预览：{previewCount} 行</span>
                    <span>更新日期：{updatedAt || '未更新'}</span>
                    <span>保存：{record.savedAt}</span>
                    {record.appliedAt && <span>应用：{record.appliedAt}</span>}
                  </div>
                  <div className="dimension-sheet-list">
                    {sheetPreviews.map((sheet, sheetIndex) => {
                      const columns = sheet.columns?.length ? sheet.columns.slice(0, 8) : ['暂无字段'];
                      const previewRows = sheet.rows?.slice(0, 5) || [];
                      return (
                        <div key={`${sheet.sheetName || 'sheet'}-${sheetIndex}`} className="dimension-sheet-preview">
                          <div className="dimension-sheet-head">
                            <strong>{sheet.sheetName || `工作表 ${sheetIndex + 1}`}</strong>
                            <span>{sheet.importedCount || 0} 行，预览 {previewRows.length} 行</span>
                          </div>
                          <DataTable
                            className="dimension-preview-table"
                            rows={previewRows}
                            columns={columns}
                            render={(row) => columns.map((column) => row[column] || '')}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="card-actions">
                    <button type="button" className="compact-button" disabled={isBusy} onClick={() => onApply(slot.id)}>
                      {isApplying ? '应用中' : '应用刷新'}
                    </button>
                    {slot.id === PURCHASE_WORK_DIVISION_SLOT_ID && (
                      <button
                        type="button"
                        className="compact-button"
                        disabled={isBusy}
                        onClick={() => replaceInputRefs.current[slot.id]?.click()}
                      >
                        {isUploading ? '读取中' : '替换文件'}
                      </button>
                    )}
                    <button type="button" className="ghost compact-button" disabled={isBusy} onClick={() => onDelete(slot.id)}>删除</button>
                  </div>
                </>
              ) : (
                <EmptyState text="暂无维度表文件" />
              )}
            </article>
          );
        })}
      </section>
    </>
  );
}

export default DimensionLibraryPage;
