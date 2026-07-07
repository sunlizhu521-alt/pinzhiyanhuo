import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { NOTICE_FIELDS } from '../constants.js';
import {
  normalize,
  formatDate,
  splitMultiValue,
  normalizeBusinessDepartment,
  joinBusinessDepartments
} from '../utils.js';
import {
  seriesOptionsForProductLine,
  findDimensionOption,
  findSupplierShortNameOption,
  supplierMatchesQuery,
  optionMatchesQuery
} from '../dimension-utils.js';
import DataTable from './DataTable.jsx';
function InspectionNoticePage({
  rows,
  submission,
  user,
  supplierOptions = [],
  productLineOptions = [],
  seriesOptions = [],
  seriesByProductLine = {},
  importPreview,
  onAdd,
  onDelete,
  onClearRows,
  onChange,
  onUpload,
  onConfirmImport,
  onClearImportPreview,
  onSubmit,
  onSubmitRow,
  savingId
}) {
  const productLineBySeries = Object.fromEntries(
    Object.entries(seriesByProductLine).flatMap(([productLine, seriesList]) =>
      (seriesList || []).map((series) => [
        series,
        findDimensionOption(productLine, productLineOptions) || productLine
      ])
    )
  );
  const [focusedSupplierRowId, setFocusedSupplierRowId] = useState('');
  const [supplierSuggestionPosition, setSupplierSuggestionPosition] = useState(null);
  const [focusedSeriesRowId, setFocusedSeriesRowId] = useState('');
  const [seriesSuggestionPosition, setSeriesSuggestionPosition] = useState(null);
  const previewRows = importPreview?.rows || [];
  const previewColumns = ['行号', ...NOTICE_FIELDS.map((field) => field.label)];
  const previewLimitedRows = previewRows;

  useEffect(() => {
    if (!focusedSupplierRowId && !focusedSeriesRowId) return undefined;
    const closeSuggestions = () => {
      setFocusedSupplierRowId('');
      setSupplierSuggestionPosition(null);
      setFocusedSeriesRowId('');
      setSeriesSuggestionPosition(null);
    };
    window.addEventListener('scroll', closeSuggestions, true);
    window.addEventListener('resize', closeSuggestions);
    return () => {
      window.removeEventListener('scroll', closeSuggestions, true);
      window.removeEventListener('resize', closeSuggestions);
    };
  }, [focusedSupplierRowId, focusedSeriesRowId]);

  function updateSupplierSuggestionPosition(target) {
    const rect = target?.getBoundingClientRect?.();
    if (!rect) return;
    setSupplierSuggestionPosition({
      top: Math.round(rect.bottom + 4),
      left: Math.round(rect.left),
      width: Math.max(260, Math.round(rect.width))
    });
  }

  function updateSeriesSuggestionPosition(target) {
    const rect = target?.getBoundingClientRect?.();
    if (!rect) return;
    setSeriesSuggestionPosition({
      top: Math.round(rect.bottom + 4),
      left: Math.round(rect.left),
      width: Math.max(260, Math.round(rect.width))
    });
  }

  function toggleBusinessDepartment(row, option, checked) {
    const current = new Set(splitMultiValue(row.businessDepartments).map(normalizeBusinessDepartment));
    if (checked) current.add(option);
    else current.delete(option);
    onChange(row.id, 'businessDepartments', joinBusinessDepartments(Array.from(current)));
  }

  function provinceCityText(value) {
    const text = normalize(value);
    if (!text) return '';
    const province = text.match(/([\u4e00-\u9fa5]{2,}(?:省|自治区|特别行政区)|北京|天津|上海|重庆)/)?.[1] || '';
    const afterProvince = province ? text.slice(text.indexOf(province) + province.length) : text;
    const city = afterProvince.match(/([\u4e00-\u9fa5]{2,}(?:市|州|盟|地区))/)?.[1] || '';
    if (province && city) return `${province}${city}`;
    if (province) return province;
    const compactParts = text.split(/[,\s，、/]+/).filter(Boolean);
    if (compactParts.length >= 2) return compactParts.slice(0, 2).join('');
    return text;
  }

  return (
    <>
      <div className="section-heading-row">
        <h2>验货通知</h2>
        <span className="section-count">共 {rows.length} 条</span>
        {submission.submittedAt && <span className="section-count">已提交：{submission.submittedAt}</span>}
        <button type="button" className="ghost compact-button" onClick={onAdd}>新增一行</button>
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
        <button type="button" className="ghost compact-button" onClick={onClearRows}>清除填写内容</button>
        <button type="button" onClick={onSubmit} disabled={!!savingId}>
          {savingId === 'notice-submit' ? '提交中...' : '确认提交'}
        </button>
      </div>
      {savingId && (
        <div style={{ height: 3, background: '#e2e8f0', marginBottom: 16, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '30%', background: '#3b82f6', borderRadius: 2, animation: 'submitProgress 1.5s ease-in-out infinite' }} />
        </div>
      )}
      <label
        className="notice-upload-zone"
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
        <strong>拖拽验货通知文件到这里，或点击选择文件</strong>
        <span>支持 .xlsx / .xls / .csv，解析后先预览，确认后再导入表格</span>
      </label>
      {importPreview && (
        <section className="notice-import-preview">
          <div className="section-heading-row">
            <h3>导入预览</h3>
            <span className="section-count">
              文件：{importPreview.fileName}；工作表：{importPreview.sheetName || '默认'}；共 {previewRows.length} 条
            </span>
            <button type="button" onClick={onConfirmImport}>确认导入</button>
            <button type="button" className="ghost compact-button" onClick={onClearImportPreview}>清空预览</button>
          </div>
          <DataTable
            className="inspection-notice-preview-table"
            rows={previewLimitedRows}
            columns={previewColumns}
            render={(row, index) => [
              index + 1,
              ...NOTICE_FIELDS.map((field) => {
                if (field.readonly) return user.name;
                if (field.key === 'supplierAddress') return provinceCityText(row[field.key]);
                return row[field.key] || '';
              })
            ]}
          />
        </section>
      )}
      <DataTable
        className="inspection-notice-table"
        rows={rows}
        columns={[...NOTICE_FIELDS.map((field) => field.required ? `${field.label} *` : field.label), '操作']}
        render={(row) => [
          ...NOTICE_FIELDS.map((field) => {
            if (field.readonly) return <span className="readonly-cell">{user.name}</span>;
            if (field.key === 'supplierAddress') {
              return <span className="readonly-cell">{provinceCityText(row[field.key]) || '自动带出'}</span>;
            }
            if (field.key === 'supplierShortName') {
              const value = row[field.key] || '';
              const matchedSupplier = findSupplierShortNameOption(value, supplierOptions);
              const suggestions = supplierOptions
                .filter((supplier) => supplierMatchesQuery(supplier, value))
                .slice(0, 12);
              const showSuggestions = focusedSupplierRowId === row.id && Boolean(value) && suggestions.length > 0;
              const showInvalid = Boolean(value) && !matchedSupplier;
              return (
                <div className="supplier-combobox">
                  <input
                    type="text"
                    className={`table-input inspection-notice-input supplier-combobox-input${showInvalid ? ' invalid-input' : ''}`}
                    value={value}
                    onFocus={(event) => {
                      setFocusedSupplierRowId(row.id);
                      updateSupplierSuggestionPosition(event.currentTarget);
                    }}
                    onBlur={() => window.setTimeout(() => {
                      setFocusedSupplierRowId('');
                      setSupplierSuggestionPosition(null);
                    }, 120)}
                    onChange={(event) => {
                      updateSupplierSuggestionPosition(event.currentTarget);
                      onChange(row.id, field.key, event.target.value);
                    }}
                    onKeyUp={(event) => updateSupplierSuggestionPosition(event.currentTarget)}
                    placeholder="输入简称搜索"
                  />
                  {showSuggestions && supplierSuggestionPosition && createPortal(
                    <div
                      className="supplier-suggestion-list"
                      style={{
                        top: supplierSuggestionPosition.top,
                        left: supplierSuggestionPosition.left,
                        width: supplierSuggestionPosition.width
                      }}
                    >
                      <div className="supplier-suggestion-title">请选择正确供应商</div>
                      {suggestions.map((supplier) => (
                        <button
                          key={supplier}
                          type="button"
                          className="supplier-suggestion"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            onChange(row.id, field.key, supplier);
                            setFocusedSupplierRowId('');
                            setSupplierSuggestionPosition(null);
                          }}
                        >
                          {supplier}
                        </button>
                      ))}
                    </div>,
                    document.body
                  )}
                </div>
              );
            }
            if (field.key === 'series') {
              const value = row[field.key] || '';
              const scopedSeriesOptions = seriesOptionsForProductLine(row.salesProductLine, seriesOptions, seriesByProductLine);
              const matchedSeries = findDimensionOption(value, scopedSeriesOptions);
              const suggestions = scopedSeriesOptions
                .filter((option) => optionMatchesQuery(option, value))
                .slice(0, 12);
              const showSuggestions = focusedSeriesRowId === row.id && Boolean(value) && suggestions.length > 0;
              const showInvalid = Boolean(value) && !matchedSeries;
              return (
                <div className="supplier-combobox">
                  <input
                    type="text"
                    className={`table-input inspection-notice-input supplier-combobox-input${showInvalid ? ' invalid-input' : ''}`}
                    value={value}
                    onFocus={(event) => {
                      setFocusedSeriesRowId(row.id);
                      updateSeriesSuggestionPosition(event.currentTarget);
                    }}
                    onBlur={() => window.setTimeout(() => {
                      setFocusedSeriesRowId('');
                      setSeriesSuggestionPosition(null);
                    }, 120)}
                    onChange={(event) => {
                      updateSeriesSuggestionPosition(event.currentTarget);
                      onChange(row.id, field.key, event.target.value);
                    }}
                    onKeyUp={(event) => updateSeriesSuggestionPosition(event.currentTarget)}
                    placeholder="先填有惊喜"
                  />
                  {showSuggestions && seriesSuggestionPosition && createPortal(
                    <div
                      className="supplier-suggestion-list"
                      style={{
                        top: seriesSuggestionPosition.top,
                        left: seriesSuggestionPosition.left,
                        width: seriesSuggestionPosition.width
                      }}
                    >
                      <div className="supplier-suggestion-title">请选择正确系列</div>
                      {suggestions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className="supplier-suggestion"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            onChange(row.id, 'series', option);
                            const matchedProductLine = productLineBySeries[option];
                            if (matchedProductLine) {
                              onChange(row.id, 'salesProductLine', matchedProductLine);
                            }
                            setFocusedSeriesRowId('');
                            setSeriesSuggestionPosition(null);
                          }}
                        >
                          {option}
                        </button>
                      ))}
                    </div>,
                    document.body
                  )}
                </div>
              );
            }
            const dimensionOptions = field.key === 'salesProductLine'
              ? productLineOptions
              : field.key === 'series'
                ? seriesOptionsForProductLine(row.salesProductLine, seriesOptions, seriesByProductLine)
                : null;
            if (dimensionOptions) {
              return (
                <select
                  className="table-input inspection-notice-input"
                  value={row[field.key] || ''}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    onChange(row.id, field.key, nextValue);
                    if (field.key === 'salesProductLine') {
                      const nextSeriesOptions = seriesOptionsForProductLine(nextValue, seriesOptions, seriesByProductLine);
                      if (row.series && !findDimensionOption(row.series, nextSeriesOptions)) {
                        onChange(row.id, 'series', '');
                      }
                    }
                  }}
                >
                  <option value="">选择</option>
                  {dimensionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              );
            }
            if (field.options) {
              if (field.key === 'businessDepartments') {
                const selected = new Set(splitMultiValue(row[field.key]).map(normalizeBusinessDepartment));
                return (
                  <div className="business-department-checks">
                    {field.options.map((option) => (
                      <label key={option} className="business-department-option">
                        <input
                          type="checkbox"
                          checked={selected.has(option)}
                          onChange={(event) => toggleBusinessDepartment(row, option, event.target.checked)}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                );
              }
              const selectValue = field.key === 'businessDepartments'
                ? (splitMultiValue(row[field.key])[0] || row[field.key] || '')
                : (row[field.key] || '');
              return (
                <select
                  className="table-input inspection-notice-input"
                  value={selectValue}
                  onChange={(event) => onChange(row.id, field.key, event.target.value)}
                >
                  <option value="">选择</option>
                  {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              );
            }
            if (field.multiline) {
              return (
                <textarea
                  className="table-textarea inspection-notice-input"
                  value={row[field.key] || ''}
                  onChange={(event) => onChange(row.id, field.key, event.target.value)}
                />
              );
            }
            return (
              <input
                type={field.type || 'text'}
                className="table-input inspection-notice-input"
                value={field.type === 'date' ? formatDate(row[field.key]) : (row[field.key] || '')}
                onChange={(event) => onChange(row.id, field.key, event.target.value)}
              />
            );
          }),
          <div className="table-action-row">
            <button type="button" className="compact-button" onClick={() => onSubmitRow(row)} disabled={!!savingId}>
              {savingId === 'notice-' + row.id ? '提交中...' : '提交'}
            </button>
            <button type="button" className="danger-button compact-button" onClick={() => onDelete(row.id)}>删除</button>
          </div>
        ]}
      />
    </>
  );
}

export default InspectionNoticePage;
