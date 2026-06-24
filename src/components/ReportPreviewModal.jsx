import { createPortal } from 'react-dom';
import { REPORT_IMAGE_EXTENSIONS } from '../constants.js';

function ReportPreviewModal({ title, url, ext, onClose }) {
  return createPortal(
    <div className="report-preview-modal" role="dialog" aria-modal="true">
      <div className="report-preview-backdrop" onClick={onClose} />
      <section className="report-preview-dialog">
        <div className="report-preview-header">
          <h3>{title || '报告文件预览'}</h3>
          <div className="table-action-row">
            {url && <a className="ghost compact-button" href={url} download>下载文件</a>}
            <button type="button" className="ghost compact-button" onClick={onClose}>关闭预览</button>
          </div>
        </div>
        <div className="report-preview-body">
          {REPORT_IMAGE_EXTENSIONS.has(ext) ? (
            <img src={url} alt="报告文件预览" />
          ) : ext === '.pdf' ? (
            <iframe title="报告文件预览" src={url} />
          ) : (
            <div className="empty-state">当前文件格式暂不支持本页直接预览，请下载文件查看。</div>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}

export default ReportPreviewModal;
