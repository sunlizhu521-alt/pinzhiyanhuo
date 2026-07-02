import { useEffect, useMemo, useState } from 'react';
import { createId, normalize, nowText } from '../utils.js';
import {
  reportHref,
  isImageReport,
  isReportImageFile,
  normalizeStampUploadFileName,
  readFileAsDataUrl,
  createRotatedReportImageDataUrl,
  createStampedImageDataUrl
} from '../file-utils.js';
import EmptyState from './EmptyState.jsx';
function InspectionStampPage({ records, savingId, onStamp, onReject }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [uploadedRecords, setUploadedRecords] = useState([]);
  const [stampPreview, setStampPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const stampRecords = useMemo(() => [...uploadedRecords, ...records], [uploadedRecords, records]);
  const safeIndex = stampRecords.length ? Math.min(currentIndex, stampRecords.length - 1) : 0;
  const current = stampRecords[safeIndex];
  const canStamp = current && isImageReport(current);
  const activePreview = stampPreview?.recordId === current?.id && stampPreview?.rotation === rotation ? stampPreview : null;

  useEffect(() => {
    if (currentIndex > Math.max(stampRecords.length - 1, 0)) setCurrentIndex(0);
  }, [stampRecords.length, currentIndex]);

  useEffect(() => {
    setRotation(0);
  }, [current?.id]);

  useEffect(() => {
    setStampPreview(null);
    setPreviewError('');
  }, [current?.id, rotation]);

  function go(delta) {
    if (!stampRecords.length) return;
    setCurrentIndex((index) => (index + delta + stampRecords.length) % stampRecords.length);
  }

  async function previewStamp() {
    if (!canStamp) return;
    setPreviewing(true);
    setPreviewError('');
    try {
      const dataUrl = await createStampedImageDataUrl(current, rotation);
      setStampPreview({ recordId: current.id, rotation, dataUrl });
    } catch {
      setPreviewError('预览生成失败，请确认报告单图片可以正常打开。');
    } finally {
      setPreviewing(false);
    }
  }

  async function saveStampResult(dataUrl, skipStamp) {
    if (!canStamp) return;
    setPreviewing(true);
    setPreviewError('');
    try {
      const saved = await onStamp(current, rotation, dataUrl, skipStamp);
      if (saved) {
        setStampPreview(null);
        if (current?.isStampUpload) {
          setUploadedRecords((items) => items.filter((item) => item.id !== current.id));
        }
      }
    } catch (error) {
      console.error('stamp save failed', error);
      setPreviewError(`保存失败：${error?.message || '请确认报告单图片可以正常打开。'}`);
    } finally {
      setPreviewing(false);
    }
  }

  async function confirmStamp() {
    if (!activePreview) return;
    await saveStampResult(activePreview.dataUrl, false);
  }

  async function saveWithoutStamp() {
    if (!canStamp) return;
    setPreviewing(true);
    setPreviewError('');
    try {
      const normalizedRotation = ((rotation % 360) + 360) % 360;
      const dataUrl = normalizedRotation === 0
        ? (current.report?.fileDataUrl || '')
        : await createRotatedReportImageDataUrl(current, rotation);
      await saveStampResult(dataUrl, true);
    } catch (error) {
      console.error('stamp save without stamp failed', error);
      setPreviewError(`保存失败：${error?.message || '请确认报告单图片可以正常打开。'}`);
    } finally {
      setPreviewing(false);
    }
  }

  async function rejectCurrentReport() {
    if (!current || current.isStampUpload || !onReject) return;
    if (!window.confirm('确认驳回当前检验报告单？驳回后会重新进入验货反馈页面。')) return;
    setPreviewError('');
    const rejected = await onReject(current);
    if (rejected) {
      setStampPreview(null);
      setCurrentIndex((index) => Math.max(index - 1, 0));
    }
  }

  function updateUploadedImageFileName(recordId, nextName, commit = false) {
    setUploadedRecords((items) => items.map((item) => {
      if (item.id !== recordId) return item;
      const fileName = commit
        ? normalizeStampUploadFileName(nextName, item.report?.originalName || item.report?.fileName)
        : nextName;
      return {
        ...item,
        report: {
          ...(item.report || {}),
          fileName,
          originalName: fileName
        }
      };
    }));
  }

  async function uploadStampImages(files) {
    const selectedFiles = Array.from(files || []).filter(isReportImageFile);
    if (!selectedFiles.length) {
      setUploadMessage('未识别到可上传的图片，请选择 JPG、PNG 或 WebP。');
      return;
    }
    const uploaded = await Promise.all(selectedFiles.map(async (file) => ({
      id: `stamp-upload-${createId()}`,
      isStampUpload: true,
      supplierShortName: '页面上传',
      salesProductLine: '',
      series: '',
      report: {
        fileName: file.name,
        originalName: file.name,
        fileDataUrl: await readFileAsDataUrl(file),
        size: file.size,
        uploadedAt: nowText()
      }
    })));
    setUploadedRecords((current) => [...uploaded, ...current]);
    setCurrentIndex(0);
    setStampPreview(null);
    setPreviewError('');
    setUploadMessage(`已批量上传 ${uploaded.length} 张图片，请在左侧列表逐张处理。`);
  }

  return (
    <section className="stamp-page">
      <div className="section-heading-row">
        <h2>盖检验章</h2>
        <span className="section-count">待盖章 {stampRecords.length} 份</span>
        <label className="upload-button">
          批量上传图片
          <input
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.webp"
            onChange={(event) => {
              uploadStampImages(event.target.files);
              event.target.value = '';
            }}
          />
        </label>
        <button type="button" className="ghost compact-button" onClick={() => go(-1)} disabled={stampRecords.length < 2}>上一张</button>
        <button type="button" className="ghost compact-button" onClick={() => go(1)} disabled={stampRecords.length < 2}>下一张</button>
        <button type="button" className="ghost compact-button" onClick={() => setRotation((value) => (value + 90) % 360)} disabled={!current}>旋转</button>
        <button
          type="button"
          className="compact-button"
          disabled={!canStamp || previewing || savingId === current?.id}
          onClick={previewStamp}
        >
          {previewing ? '生成预览中' : '加盖印章'}
        </button>
        <button
          type="button"
          className="compact-button"
          disabled={!canStamp || previewing || savingId === current?.id}
          onClick={saveWithoutStamp}
        >
          {savingId === current?.id ? '保存中' : '直接保存'}
        </button>
        <button
          type="button"
          className="compact-button"
          disabled={!activePreview || previewing || savingId === current?.id}
          onClick={confirmStamp}
        >
          {savingId === current?.id ? '保存中' : '已盖章保存'}
        </button>
        {activePreview && (
          <button type="button" className="ghost compact-button" onClick={() => setStampPreview(null)} disabled={savingId === current?.id}>取消预览</button>
        )}
        <button
          type="button"
          className="danger-button compact-button"
          disabled={!current || current.isStampUpload || previewing || savingId === current?.id}
          onClick={rejectCurrentReport}
        >
          驳回
        </button>
      </div>

      <label
        className="stamp-upload-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          uploadStampImages(event.dataTransfer.files);
        }}
      >
        <input
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp"
          onChange={(event) => {
            uploadStampImages(event.target.files);
            event.target.value = '';
          }}
        />
        <strong>批量上传待加盖图片</strong>
        <span>可一次选择或拖拽多张 JPG / PNG / WebP，上传后在左侧列表逐张改名、加盖或保存</span>
        {uploadMessage && <em>{uploadMessage}</em>}
      </label>

      {!current ? (
        <EmptyState text="暂无待加盖检验章的报告单" />
      ) : (
        <div className="stamp-workspace">
          <aside className="stamp-list">
            {stampRecords.map((record, index) => (
              <button
                type="button"
                key={record.id}
                className={index === safeIndex ? 'active' : ''}
                onClick={() => setCurrentIndex(index)}
              >
                <strong>{record.isStampUpload ? '页面上传图片' : (record.report?.reportNo || '未填写报告编码')}</strong>
                <span>{record.isStampUpload ? '页面上传图片' : (record.supplierShortName || '未填写供应商')}</span>
                <span>{record.report?.originalName || record.report?.fileName}</span>
              </button>
            ))}
          </aside>
          <section className="stamp-viewer">
            <div className="stamp-meta">
              <strong>{current.isStampUpload ? '页面上传图片' : (current.report?.reportNo || '未填写报告编码')}</strong>
              {current.isStampUpload && (
                <label className="stamp-file-name-editor">
                  <span>文件名</span>
                  <input
                    className="table-input wide-input"
                    value={current.report?.fileName || ''}
                    onChange={(event) => updateUploadedImageFileName(current.id, event.target.value)}
                    onBlur={(event) => updateUploadedImageFileName(current.id, event.target.value, true)}
                  />
                </label>
              )}
              <span>{current.supplierShortName || ''}</span>
              <span>{current.salesProductLine || ''} {current.series || ''}</span>
              {activePreview && <span className="stamp-preview-note">当前为盖章预览，确认保存后才会覆盖原文件。</span>}
              {previewError && <span className="stamp-warning">{previewError}</span>}
              {!canStamp && <span className="stamp-warning">当前文件不是图片格式，只能查看，不能直接加盖图片印章。</span>}
            </div>
            <div className="stamp-canvas">
              {isImageReport(current) ? (
                <img
                  src={activePreview?.dataUrl || reportHref(current)}
                  alt="检验报告单"
                  style={activePreview ? undefined : { transform: `rotate(${rotation}deg)` }}
                />
              ) : (
                <iframe title="检验报告单预览" src={reportHref(current)} />
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export default InspectionStampPage;
