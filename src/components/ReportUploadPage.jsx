import EmptyState from './EmptyState.jsx';
import { reportHref, isImageReport, reportFileExt, formatFileSize } from '../file-utils.js';

function ReportUploadPage({ records, savingId, onSave }) {
  return (
    <>
      <div className="section-heading-row">
        <h2>检验报告单回传</h2>
        <span className="section-count">支持 PDF、图片、Excel 文件</span>
      </div>
      <div className="report-list">
        {records.length === 0 && <EmptyState text="暂无验货通知，请先在验货通知页面提交数据。" />}
        {records.map((record) => (
          <form key={record.id} className="report-card" onSubmit={(event) => { event.preventDefault(); onSave(record, event.currentTarget); }}>
            <div>
              <h3>{record.supplierShortName || '未填写供应商'}</h3>
              <p>{record.kingdeeOrderNo || '未填写采购订单'} · {record.salesProductLine || '未填写产品线'}</p>
              {record.report?.originalName && reportHref(record) && (
                <a href={reportHref(record)} target="_blank" rel="noreferrer">{record.report.originalName}</a>
              )}
            </div>
            <input name="reportNo" placeholder="报告单号" defaultValue={record.report?.reportNo || ''} />
            <select name="conclusion" defaultValue={record.report?.conclusion || ''}>
              <option value="">检验结论</option>
              <option value="合格">合格</option>
              <option value="不合格">不合格</option>
              <option value="让步接收">让步接收</option>
              <option value="待复检">待复检</option>
            </select>
            <input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx" />
            <button type="submit" disabled={savingId === record.id}>回传</button>
          </form>
        ))}
      </div>
    </>
  );
}

export default ReportUploadPage;
