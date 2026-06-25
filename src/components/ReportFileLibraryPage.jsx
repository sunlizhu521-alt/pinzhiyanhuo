import { useEffect, useMemo, useState } from 'react';
import { normalize, formatDate } from '../utils.js';
import { REPORT_LIBRARY_EXTENSIONS } from '../constants.js';
import {
  reportHref,
  reportFileExt,
  isReportLibraryFile,
  isReportImageFile,
  formatFileSize,
  loadImageElement,
  reportLibraryFilesFromDrop
} from '../file-utils.js';
import DataTable from './DataTable.jsx';
import EmptyState from './EmptyState.jsx';
import ReportPreviewModal from './ReportPreviewModal.jsx';
function ReportFileLibraryPage({ files, supplierOptions = [], productLineOptions = [], seriesOptions = [], savingId, onUpload, onRename, onDelete, onBatchDelete }) {
  const [drafts, setDrafts] = useState({});
  const [previewFile, setPreviewFile] = useState(null);
  const [selectedFileKeys, setSelectedFileKeys] = useState(new Set());
  const [filters, setFilters] = useState({
    supplierShortName: '',
    productLine: '',
    series: '',
    inspector: ''
  });
  const filteredFiles = useMemo(() => {
    const normalizedFilters = Object.fromEntries(
      Object.entries(filters).map(([key, value]) => [key, normalize(value).toLowerCase()])
    );
    return files.filter((file) => (
      (!normalizedFilters.supplierShortName || normalize(file.supplierShortName).toLowerCase() === normalizedFilters.supplierShortName)
      && (!normalizedFilters.productLine || normalize(file.productLine).toLowerCase() === normalizedFilters.productLine)
      && (!normalizedFilters.series || normalize(file.series).toLowerCase() === normalizedFilters.series)
      && (!normalizedFilters.inspector || normalize(file.inspector).toLowerCase().includes(normalizedFilters.inspector))
    ));
  }, [files, filters]);
  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  function clearFilters() {
    setFilters({ supplierShortName: '', productLine: '', series: '', inspector: '' });
  }
  function fileKey(file) {
    return file.id || file.fileName;
  }
  function toggleFileSelection(key, checked) {
    setSelectedFileKeys((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }
  function toggleFilteredSelection(checked) {
    setSelectedFileKeys((current) => {
      const next = new Set(current);
      filteredFiles.forEach((file) => {
        const key = fileKey(file);
        if (checked) next.add(key);
        else next.delete(key);
      });
      return next;
    });
  }
  async function batchDeleteSelected() {
    const selectedFiles = files.filter((file) => selectedFileKeys.has(fileKey(file)));
    const deleted = await onBatchDelete(selectedFiles);
    if (deleted) setSelectedFileKeys(new Set());
  }

  useEffect(() => {
    setDrafts(Object.fromEntries(files.map((file) => [file.id || file.fileName, file.fileName || ''])));
  }, [files]);

  useEffect(() => {
    setSelectedFileKeys((current) => {
      const validKeys = new Set(files.map((file) => fileKey(file)));
      const next = new Set([...current].filter((key) => validKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [files]);

  useEffect(() => {
    if (previewFile && !files.some((file) => (file.id || file.fileName) === (previewFile.id || previewFile.fileName))) {
      setPreviewFile(null);
    }
  }, [files, previewFile]);

  const previewExt = (() => {
    const name = String(previewFile?.fileName || '');
    const nameExt = name.split('?')[0].match(/\.[^.]+$/)?.[0]?.toLowerCase();
    if (nameExt) return nameExt;
    const url = String(previewFile?.fileUrl || '');
    const mimeMatch = url.match(/^data:(image\/[^;,]+)/i);
    if (mimeMatch) {
      const mime = mimeMatch[1].split('/')[1];
      const mimeMap = { jpeg: '.jpg', png: '.png', webp: '.webp', gif: '.gif', bmp: '.bmp' };
      return mimeMap[mime.toLowerCase()] || (`.${mime.toLowerCase()}`);
    }
    const urlExt = url.split('?')[0].match(/\.[^.]+$/)?.[0]?.toLowerCase();
    return urlExt || '';
  })();
  const selectedFiles = files.filter((file) => selectedFileKeys.has(fileKey(file)));
  const allFilteredSelected = filteredFiles.length > 0 && filteredFiles.every((file) => selectedFileKeys.has(fileKey(file)));

  return (
    <section className="report-library-page">
      <div className="section-heading-row">
        <h2>报告单文件库</h2>
        <span className="section-count">筛选 {filteredFiles.length} 个 / 共 {files.length} 个文件</span>
        <span className="section-count">已选择 {selectedFiles.length} 个</span>
        <button
          type="button"
          className="danger-button compact-button"
          disabled={!selectedFiles.length || savingId === 'inspectionReportLibrary-batch-delete'}
          onClick={batchDeleteSelected}
        >
          批量删除
        </button>
      </div>
      <div
        className="report-library-upload-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={async (event) => {
          event.preventDefault();
          onUpload(await reportLibraryFilesFromDrop(event.dataTransfer));
        }}
      >
        <strong>拖拽历史检验报告单文件或文件夹到这里</strong>
        <span>上传时读取文件名；支持图片、PDF、Excel、Word；加盖章后的报告单也会在这里展示</span>
        <div className="report-library-upload-actions">
          <label className="upload-button">
            上传文件
            <input
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.doc,.docx"
              onChange={(event) => {
                onUpload(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
          <label className="upload-button">
            上传文件夹
            <input
              type="file"
              multiple
              webkitdirectory=""
              directory=""
              onChange={(event) => {
                onUpload(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
        </div>
      </div>
      <div className="toolbar feedback-filter-toolbar">
        <select value={filters.supplierShortName} onChange={(event) => updateFilter('supplierShortName', event.target.value)}>
          <option value="">全部供应商简称</option>
          {supplierOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select value={filters.productLine} onChange={(event) => updateFilter('productLine', event.target.value)}>
          <option value="">全部产品线</option>
          {productLineOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select value={filters.series} onChange={(event) => updateFilter('series', event.target.value)}>
          <option value="">全部系列</option>
          {seriesOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <input
          placeholder="筛选验货员"
          value={filters.inspector}
          onChange={(event) => updateFilter('inspector', event.target.value)}
        />
        <button type="button" className="ghost compact-button" onClick={clearFilters}>清除筛选</button>
      </div>
      <DataTable
        className="report-library-table"
        rows={filteredFiles}
        columns={[
          <input
            type="checkbox"
            aria-label="全选当前筛选文件"
            checked={allFilteredSelected}
            disabled={!filteredFiles.length}
            onChange={(event) => toggleFilteredSelection(event.target.checked)}
          />,
          '文件名',
          '来源',
          '报告编码',
          '供应商',
          '产品线/系列',
          '验货员',
          '盖章状态',
          '大小',
          '更新时间',
          '查看',
          '操作'
        ]}
        render={(file) => {
          const key = file.id || file.fileName;
          const draftName = drafts[key] ?? file.fileName ?? '';
          return [
            <input
              type="checkbox"
              aria-label={`选择 ${file.fileName || '报告单文件'}`}
              checked={selectedFileKeys.has(key)}
              onChange={(event) => toggleFileSelection(key, event.target.checked)}
            />,
            <input
              className="table-input wide-input"
              value={draftName}
              onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
            />,
            file.source || '',
            file.reportNo || '',
            file.supplierShortName || '',
            [file.productLine, file.series].filter(Boolean).join(' / '),
            file.inspector || '',
            file.stampedAt ? `已盖章 ${file.stampedAt}` : '未盖章',
            formatFileSize(file.size),
            file.modifiedAt || file.updatedAt || file.uploadedAt || '',
            file.fileUrl ? (
              <button type="button" className="link-button" onClick={() => setPreviewFile(file)}>
                查看文件
              </button>
            ) : '',
            <div className="table-action-row">
              <button
                type="button"
                className="compact-button"
                disabled={savingId === key || draftName === file.fileName}
                onClick={() => onRename(file, draftName)}
              >
                保存
              </button>
              <button
                type="button"
                className="danger-button compact-button"
                disabled={savingId === key}
                onClick={() => onDelete(file)}
              >
                删除
              </button>
            </div>
          ];
        }}
      />
      {previewFile && (
        <ReportPreviewModal
          title={previewFile.fileName || '报告文件预览'}
          url={previewFile.fileUrl}
          ext={previewExt}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </section>
  );
}

export default ReportFileLibraryPage;
