import { useMemo, useState } from 'react';
import DataTable from './DataTable.jsx';
import { canReadClientRecord, hasObjectValue, normalize, formatDate, feedbackReportNo, mergeFeedbackRecords } from '../utils.js';
import { reportHref, isImageReport, shouldShowFeedbackRecord, feedbackMatchKey } from '../file-utils.js';
import { NOTICE_FIELDS } from '../constants.js';

function FeedbackPage({
  records,
  supplierOptions = [],
  productLineOptions = [],
  seriesOptions = [],
  savingId,
  canImport,
  importPreview,
  onUpload,
  onConfirmImport,
  onClearImportPreview,
  onSave,
  canDelete = false,
  onDelete
}) {
  const [filters, setFilters] = useState({
    supplierShortName: '',
    salesProductLine: '',
    series: '',
    inspector: '',
    status: ''
  });
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const previewRows = importPreview?.items || [];
  const previewLimitedRows = previewRows.slice(0, 10);
  const matchedCount = previewRows.filter((item) => item.recordId).length;
  const mergedRecords = useMemo(() => mergeFeedbackRecords(records, reportHref), [records]);
  const filteredRecords = useMemo(() => {
    const normalizedFilters = Object.fromEntries(
      Object.entries(filters).map(([key, value]) => [key, normalize(value).toLowerCase()])
    );
    return mergedRecords.filter((record) => {
      const values = {
        supplierShortName: record.supplierShortName,
        salesProductLine: record.salesProductLine,
        series: record.series,
        inspector: record.schedule?.inspector,
        result: record.feedback?.result,
        status: ''
      };
      return Object.entries(normalizedFilters).every(([key, value]) => {
        if (!value) return true;
        if (key === 'status') {
          const hasInspector = !!normalize(values.inspector);
          const hasFeedbackResult = !!normalize(values.result);
          if (value === '待安排验货员') return !hasInspector;
          if (value === '待验货') return hasInspector && !hasFeedbackResult;
          if (value === '需返工') return normalize(values.result) === '返工';
          if (value === '已验货') return hasFeedbackResult && normalize(values.result) !== '返工';
          return true;
        }
        if (key === 'result') return normalize(values[key]).toLowerCase() === value;
        return normalize(values[key]).toLowerCase().includes(value);
      });
    });
  }, [mergedRecords, filters]);
  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  function clearFilters() {
    setFilters({
      supplierShortName: '',
      salesProductLine: '',
      series: '',
      inspector: '',
      status: ''
    });
  }
  function feedbackDraft(record) {
    return {
      actualInspectionTime: record.feedback?.actualInspectionTime || '',
      inspectionQuantity: record.feedback?.inspectionQuantity || '',
      ...(feedbackDrafts[record.id] || {})
    };
  }
  function updateFeedbackDraft(recordId, key, value) {
    setFeedbackDrafts((current) => ({
      ...current,
      [recordId]: {
        ...(current[recordId] || {}),
        [key]: value
      }
    }));
  }
  return (
    <>
      <div className="section-heading-row">
        <h2>验货状态</h2>
        <span className="section-count">筛选 {filteredRecords.length} 条 / 合并后 {mergedRecords.length} 条 / 待反馈 {records.length} 条</span>
        {canImport && (
          <label className="upload-button">
            批量上传
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => {
                onUpload(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
        )}
      </div>
      {canImport && (
        <label
          className="feedback-upload-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            onUpload(event.dataTransfer.files);
          }}
        >
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(event) => {
              onUpload(event.target.files);
              event.target.value = '';
            }}
          />
          <strong>拖拽历史验货反馈文件到这里，或点击选择文件</strong>
          <span>支持 .xlsx / .xls / .csv，解析后先预览，确认后写入已匹配的验货反馈</span>
        </label>
      )}
      <div className="toolbar feedback-filter-toolbar">
        <select value={filters.supplierShortName} onChange={(event) => updateFilter('supplierShortName', event.target.value)}>
          <option value="">全部供应商简称</option>
          {supplierOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select value={filters.salesProductLine} onChange={(event) => updateFilter('salesProductLine', event.target.value)}>
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
        <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
          <option value="">全部状态</option>
          <option value="待安排验货员">待安排验货员</option>
          <option value="待验货">待验货</option>
          <option value="需返工">需返工</option>
          <option value="已验货">已验货</option>
        </select>
        <button type="button" className="ghost compact-button" onClick={clearFilters}>清除筛选</button>
      </div>
      {canImport && importPreview && (
        <section className="feedback-import-preview">
          <div className="section-heading-row">
            <h3>批量上传预览</h3>
            <span className="section-count">
              {importPreview.fileName}，工作表 {importPreview.sheetName || '未识别'}，共 {previewRows.length} 条，已匹配 {matchedCount} 条
            </span>
            <button type="button" className="compact-button" onClick={onConfirmImport}>确认导入</button>
            <button type="button" className="ghost compact-button" onClick={onClearImportPreview}>清空预览</button>
          </div>
          <DataTable
            className="feedback-preview-table"
            rows={previewLimitedRows}
            columns={['匹配状态', '供应商简称', '产品线', '系列', '数量', '实际验货时间', '验货方式', '实际验货数量', '检验数量', '合格数量', '验货结果', '问题等级', '问题分类', '问题反馈', '实际验货人']}
            render={(item) => [
              item.matchStatus,
              item.notice.supplierShortName,
              item.notice.salesProductLine,
              item.notice.series,
              item.notice.totalQuantity,
              item.feedback.actualInspectionTime,
              item.feedback.inspectionMethod,
              item.feedback.inspectionQuantity,
              item.feedback.checkQuantity,
              item.feedback.qualifiedQuantity,
              item.feedback.result,
              item.feedback.issueLevel,
              item.feedback.issueCategoryPrimary,
              item.feedback.feedbackText,
              item.feedback.actualInspector
            ]}
          />
          {previewRows.length > previewLimitedRows.length && (
            <p className="preview-note">仅展示前 {previewLimitedRows.length} 条，确认后会导入全部已匹配数据。</p>
          )}
        </section>
      )}
      <DataTable
        className="inspection-feedback-table"
        rows={filteredRecords}
        columns={[
          '供应商简称',
          '产品线',
          '系列',
          '状态',
          'SKU及数量',
          '数量',
          '是否首批验货',
          '事业部',
          '运营',
          '验货通知人',
          '备注',
          '计划日期',
          '验货员',
          '实际验货人',
          '实际验货时间',
          '验货方式',
          '实际验货数量',
          '检验数量',
          '验货合格数量',
          '验货结果',
          '检验报告单编码',
          '问题等级',
          '问题分类',
          '问题反馈',
          '检验单文件',
          '检验报告单上传功能',
          '提交按钮'
        ]}
        render={(record) => {
          const draft = feedbackDraft(record);
          const reportNo = feedbackReportNo(record, draft.actualInspectionTime, draft.inspectionQuantity);
          return [
            record.supplierShortName,
            record.salesProductLine,
            record.series,
            (() => {
              const hasInspector = !!normalize(record.schedule?.inspector);
              const hasResult = !!normalize(record.feedback?.result);
              const resultText = normalize(record.feedback?.result);
              let statusText = '待安排验货员';
              let color = '#c2410c';
              if (hasInspector && !hasResult) { statusText = '待验货'; color = '#1d4ed8'; }
              else if (resultText === '返工') { statusText = '需返工'; color = '#dc2626'; }
              else if (hasResult && resultText !== '返工') { statusText = '已验货'; color = '#047857'; }
              return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', background: color, color: '#fff', fontSize: '12px', fontWeight: 600 }}>{statusText}</span>;
            })(),
            <span className="readonly-cell">{record.skuQuantity || ''}</span>,
            record.totalQuantity,
            record.firstInspection,
            record.businessDepartments,
            record.operation,
            record.inspectionNotifier || record.inspectionApplicant,
            <span className="readonly-cell wide-readonly-cell">{record.remark}</span>,
            formatDate(record.schedule?.scheduledDate),
            <span className="readonly-cell">{normalize(record.schedule?.inspector)}</span>,
            <input name="actualInspector" form={`feedback-form-${record.id}`} className="table-input" defaultValue={record.feedback?.actualInspector || ''} />,
            <input
              name="actualInspectionTime"
              form={`feedback-form-${record.id}`}
              className="table-input"
              type="date"
              defaultValue={formatDate(record.feedback?.actualInspectionTime)}
              onChange={(event) => updateFeedbackDraft(record.id, 'actualInspectionTime', event.target.value)}
            />,
            <select name="inspectionMethod" form={`feedback-form-${record.id}`} className="table-input" defaultValue={record.feedback?.inspectionMethod || ''}>
              <option value="">选择</option>
              <option value="抽检">抽检</option>
              <option value="全检">全检</option>
              <option value="视频检验">视频检验</option>
              <option value="随线检验">随线检验</option>
            </select>,
            <input
              name="inspectionQuantity"
              form={`feedback-form-${record.id}`}
              className="table-input narrow-input"
              defaultValue={record.feedback?.inspectionQuantity || ''}
              onChange={(event) => updateFeedbackDraft(record.id, 'inspectionQuantity', event.target.value)}
            />,
            <input name="checkQuantity" form={`feedback-form-${record.id}`} className="table-input narrow-input" defaultValue={record.feedback?.checkQuantity || ''} />,
            <input name="qualifiedQuantity" form={`feedback-form-${record.id}`} className="table-input narrow-input" defaultValue={record.feedback?.qualifiedQuantity || ''} />,
            <select name="result" form={`feedback-form-${record.id}`} className="table-input" defaultValue={record.feedback?.result || ''}>
              <option value="">选择</option>
              <option value="通过">通过</option>
              <option value="让步">让步</option>
              <option value="返工">返工</option>
            </select>,
            <span className="readonly-cell wide-readonly-cell">{reportNo}</span>,
            <select name="issueLevel" form={`feedback-form-${record.id}`} className="table-input" defaultValue={record.feedback?.issueLevel || ''}>
              <option value="">选择</option>
              <option value="严重">严重</option>
              <option value="中等">中等</option>
              <option value="不严重">不严重</option>
            </select>,
            (() => {
              const categories = ['包装', '性能', '外观'];
              const defaultValues = (record.feedback?.issueCategoryPrimary || '').split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
              const hiddenId = `issueCategoryPrimary-hidden-${record.id}`;
              const recordKey = String(record.id);
              return (
                <div className="business-department-checks" style={{ minWidth: '180px' }}>
                  {categories.map((category) => (
                    <label key={category} className="business-department-option" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        defaultChecked={defaultValues.includes(category)}
                        data-record-id={recordKey}
                        data-category={category}
                        onChange={() => {
                          const checked = categories.filter((item) => {
                            const checkbox = document.querySelector(`input[data-record-id="${recordKey}"][data-category="${item}"]`);
                            return checkbox && checkbox.checked;
                          });
                          const hidden = document.getElementById(hiddenId);
                          if (hidden) hidden.value = checked.join('、');
                        }}
                      />
                      {category}
                    </label>
                  ))}
                  <input
                    type="hidden"
                    name="issueCategoryPrimary"
                    id={hiddenId}
                    form={`feedback-form-${record.id}`}
                    defaultValue={defaultValues.join('、')}
                  />
                </div>
              );
            })(),
            <textarea name="feedbackText" form={`feedback-form-${record.id}`} className="table-textarea wide-textarea" defaultValue={record.feedback?.feedbackText || ''} />,
            (() => {
              const href = reportHref(record);
              if (!href) return '';
              return (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => window.open(href, '_blank')}
                >
                  {record.report?.originalName || '查看报告'}
                </button>
              );
            })(),
            <div className="feedback-report-cell">
              {reportHref(record) && <a href={reportHref(record)} target="_blank" rel="noreferrer">{record.report?.originalName || '查看报告'}</a>}
              <input name="reportFile" form={`feedback-form-${record.id}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx" />
            </div>,
            <div className="table-action-row">
              <form
                id={`feedback-form-${record.id}`}
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!window.confirm('确认提交当前验货反馈？')) return;
                  const form = event.currentTarget;
                  const saved = await onSave(record, form);
                  if (saved) {
                    form.reset();
                    setFeedbackDrafts((current) => {
                      const next = { ...current };
                      delete next[record.id];
                      return next;
                    });
                  }
                }}
              >
                <button type="submit" className="compact-button" disabled={savingId === record.id}>提交</button>
              </form>
              {canDelete && (
                <button
                  type="button"
                  className="danger-button compact-button"
                  disabled={savingId === record.id}
                  onClick={() => onDelete(record)}
                >
                  删除
                </button>
              )}
            </div>
          ];
        }}
      />
    </>
  );
}

export default FeedbackPage;
