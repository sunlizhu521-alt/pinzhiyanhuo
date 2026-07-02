import {
  API,
  REPORT_IMAGE_EXTENSIONS,
  REPORT_LIBRARY_EXTENSIONS,
  REPORT_FILE_REFRESH_PAGES,
  QUALITY_SEAL_IMAGE
} from './constants.js';
import {
  normalize,
  formatDate,
  hasObjectValue,
  isSubmittedScheduleRecord
} from './utils.js';
import { feedbackMatchKey } from './import-utils.js';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('无效文件'));
      return;
    }
    if (file.size === 0) {
      reject(new Error('文件大小为0：' + (file.name || '未知')));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`文件读取失败：${file.name || '未知'}`));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

async function dataUrlToFile(dataUrl, fileName) {
  const text = String(dataUrl || '');
  const match = text.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) {
    const response = await fetch(text);
    const blob = await response.blob();
    return new File([blob], fileName, { type: blob.type || 'image/png' });
  }
  const mimeType = match[1] || 'image/png';
  const body = match[3] || '';
  const binary = match[2] ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName, { type: mimeType });
}

function reportHref(record) {
  if (record.report?.fileDataUrl) return record.report.fileDataUrl;
  if (record.report?.fileUrl) {
    const url = record.report.fileUrl;
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    return `${API}${url}`;
  }
  if (record.report?.fileName) {
    const version = encodeURIComponent(record.report?.stampedAt || record.report?.uploadedAt || record.report?.updatedAt || '');
    return `${API}/uploads/${encodeURIComponent(record.report.fileName)}${version ? `?v=${version}` : ''}`;
  }
  return '';
}

function reportFileNameFromCode(reportNo, fileName) {
  const code = normalize(reportNo);
  if (!code) return fileName;
  const ext = String(fileName || '').match(/\.[^.]+$/)?.[0] || '';
  return `${code.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_')}${ext}`;
}

function reportFileExt(record) {
  return String(record?.report?.fileName || record?.report?.originalName || record?.report?.fileUrl || '')
    .split('?')[0]
    .match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
}

function isImageReport(record) {
  if (String(record?.report?.fileDataUrl || '').startsWith('data:image/')) return true;
  return REPORT_IMAGE_EXTENSIONS.has(reportFileExt(record));
}

function isReportLibraryFile(file) {
  const name = String(file?.name || '').toLowerCase();
  return REPORT_LIBRARY_EXTENSIONS.has(name.match(/\.[^.]+$/)?.[0] || '');
}

function isReportImageFile(file) {
  const name = String(file?.name || '').toLowerCase();
  return REPORT_IMAGE_EXTENSIONS.has(name.match(/\.[^.]+$/)?.[0] || '');
}

function imageMimeForReport(record) {
  const ext = reportFileExt(record);
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function normalizeStampUploadFileName(nextName, currentName) {
  const current = normalize(currentName);
  const fallbackExt = current.match(/\.[^.]+$/)?.[0] || '.png';
  const raw = normalize(nextName) || current || `stamp-${Date.now()}${fallbackExt}`;
  const ext = raw.match(/\.[^.]+$/)?.[0] || fallbackExt;
  const base = raw.replace(/\.[^.]+$/, '').trim() || `stamp-${Date.now()}`;
  return `${base.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_')}${ext}`;
}

function formatFileSize(size) {
  const value = Number(size || 0);
  if (!value) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image load failed'));
    image.src = src;
  });
}

function readEntryFiles(entry) {
  if (!entry) return Promise.resolve([]);
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file((file) => resolve([file]), () => resolve([]));
    });
  }
  if (!entry.isDirectory) return Promise.resolve([]);
  const reader = entry.createReader();
  const entries = [];
  return new Promise((resolve) => {
    const readBatch = () => {
      reader.readEntries(async (batch) => {
        if (!batch.length) {
          const nested = await Promise.all(entries.map(readEntryFiles));
          resolve(nested.flat());
          return;
        }
        entries.push(...batch);
        readBatch();
      }, () => resolve([]));
    };
    readBatch();
  });
}

async function reportLibraryFilesFromDrop(dataTransfer) {
  const items = Array.from(dataTransfer?.items || []);
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter(Boolean);
  const files = entries.length
    ? (await Promise.all(entries.map(readEntryFiles))).flat()
    : Array.from(dataTransfer?.files || []);
  return files.filter(isReportLibraryFile).map((file) => {
    const cleanName = String(file.name || '').replace(/^.*[\\/]/, '');
    if (cleanName && cleanName !== file.name) {
      return new File([file], cleanName, { type: file.type, lastModified: file.lastModified });
    }
    return file;
  });
}

async function renderRotatedReportCanvas(record, rotation, maxSide = 0) {
  const image = await loadImageElement(reportHref(record));
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const swapSize = normalizedRotation === 90 || normalizedRotation === 270;
  const rotatedWidth = swapSize ? image.naturalHeight : image.naturalWidth;
  const rotatedHeight = swapSize ? image.naturalWidth : image.naturalHeight;
  const scale = maxSide && Math.max(rotatedWidth, rotatedHeight) > maxSide
    ? maxSide / Math.max(rotatedWidth, rotatedHeight)
    : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rotatedWidth * scale);
  canvas.height = Math.round(rotatedHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(scale, scale);
  ctx.rotate((normalizedRotation * Math.PI) / 180);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  ctx.restore();
  return canvas;
}

async function createRotatedReportImageDataUrl(record, rotation, options = {}) {
  const canvas = await renderRotatedReportCanvas(record, rotation, options.maxSide || 0);
  return canvas.toDataURL(options.mime || imageMimeForReport(record), options.quality ?? 0.92);
}

async function createStampedImageDataUrl(record, rotation) {
  const canvas = await renderRotatedReportCanvas(record, rotation);
  const ctx = canvas.getContext('2d');
  const stampImage = await loadImageElement(QUALITY_SEAL_IMAGE);
  const sealWidth = Math.round(canvas.width * 0.18);
  const sealHeight = Math.round((stampImage.naturalHeight * sealWidth) / stampImage.naturalWidth);
  const sealCanvas = document.createElement('canvas');
  const angle = (-5 * Math.PI) / 180;
  const extra = Math.ceil(Math.max(sealWidth, sealHeight) * 0.18);
  sealCanvas.width = sealWidth + extra * 2;
  sealCanvas.height = sealHeight + extra * 2;
  const sealCtx = sealCanvas.getContext('2d');
  sealCtx.translate(sealCanvas.width / 2, sealCanvas.height / 2);
  sealCtx.rotate(angle);
  sealCtx.drawImage(stampImage, -sealWidth / 2, -sealHeight / 2, sealWidth, sealHeight);

  const x = canvas.width - sealCanvas.width - Math.round(canvas.width * 0.055);
  const y = canvas.height - sealCanvas.height - Math.round(canvas.height * 0.045);
  ctx.drawImage(sealCanvas, x, y);

  return canvas.toDataURL(imageMimeForReport(record), 0.92);
}

function scoreOcrResult(data = {}) {
  const text = normalize(data.text);
  const meaningfulChars = (text.match(/[\u4e00-\u9fffA-Za-z0-9]/g) || []).length;
  const lineCount = Array.isArray(data.lines) ? data.lines.length : 0;
  return Number(data.confidence || 0) + meaningfulChars * 1.2 + lineCount * 4;
}

function shouldShowFeedbackRecord(record) {
  const result = normalize(record.feedback?.result);
  if (normalize(record.importSource) === 'directFeedback' && !result) return true;
  if (normalize(record.report?.reportRejectedAt)) return true;
  if (normalize(record.schedule?.status) !== '已安排') return false;
  if (result === '返工' && normalize(record.rework?.completedAt)) return true;
  if (['通过', '让步', '合格', '让步接收'].includes(result)) return false;
  if (result === '返工') return false;
  return !normalize(record.feedback?.actualInspectionTime);
}

function shouldShowScheduleRecord(record) {
  return !hasObjectValue(record.schedule) || normalize(record.schedule?.status) === '未安排';
}

function shouldShowSummaryRecord(record) {
  return ['通过', '让步', '合格', '让步接收'].includes(normalize(record.feedback?.result));
}

function recordIdSignature(rows = []) {
  return rows.map((row) => row.id).filter(Boolean).join('|');
}

export {
  readFileAsDataUrl,
  dataUrlToFile,
  reportHref,
  reportFileNameFromCode,
  reportFileExt,
  isImageReport,
  isReportLibraryFile,
  isReportImageFile,
  imageMimeForReport,
  normalizeStampUploadFileName,
  formatFileSize,
  loadImageElement,
  reportLibraryFilesFromDrop,
  renderRotatedReportCanvas,
  createRotatedReportImageDataUrl,
  createStampedImageDataUrl,
  scoreOcrResult,
  shouldShowFeedbackRecord,
  shouldShowScheduleRecord,
  shouldShowSummaryRecord,
  recordIdSignature,
  feedbackMatchKey
};
