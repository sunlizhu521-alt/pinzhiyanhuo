import { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar, Line, Pie } from 'react-chartjs-2';
import { formatDate, latestFeedback, normalize, normalizeHeader, splitMultiValue } from '../utils.js';

const chartValueLabelsPlugin = {
  id: 'chartValueLabels',
  afterDatasetsDraw(chart, args, pluginOptions = {}) {
    if (pluginOptions.display === false) return;
    const { ctx } = chart;
    const chartArea = chart.chartArea || {};
    ctx.save();
    ctx.font = pluginOptions.font || '600 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;
      const total = (dataset.data || []).reduce((sum, value) => sum + (Number(value) || 0), 0);
      meta.data.forEach((element, index) => {
        const rawValue = dataset.data[index];
        const value = Number(rawValue) || 0;
        if (!value && pluginOptions.hideZero !== false) return;
        const point = element.tooltipPosition();
        const label = chart.config.type === 'pie'
          ? `${value} (${total ? Math.round((value / total) * 100) : 0}%)`
          : `${value}${pluginOptions.suffix || ''}`;
        ctx.fillStyle = pluginOptions.color || (chart.config.type === 'pie' ? '#fff' : '#374151');
        let x = point.x;
        let y = point.y;
        if (chart.config.type === 'line') y -= 12;
        if (chart.config.type === 'bar') {
          const isHorizontal = chart.options.indexAxis === 'y';
          x = isHorizontal ? Math.min(point.x + 24, chartArea.right - 12) : point.x;
          y = isHorizontal ? point.y : Math.max(point.y - 12, chartArea.top + 10);
        }
        ctx.fillText(label, x, y);
      });
    });
    ctx.restore();
  }
};

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, chartValueLabelsPlugin);

const PASS_RESULTS = new Set(['通过', '合格']);
const REWORK_RESULTS = new Set(['返工', '不合格']);
const CONCESSION_RESULTS = new Set(['让步', '让步接收']);

function uniqueValues(values) {
  const seen = new Set();
  return values.map(normalize).filter(Boolean).filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function monthKey(value) {
  const date = formatDate(value);
  return /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : '';
}

function recordResult(record) {
  return normalize(latestFeedback(record.feedback).result);
}

function recordMonth(record) {
  return monthKey(latestFeedback(record.feedback).actualInspectionTime || record.schedule?.scheduledDate || record.inspectionFillTime);
}

function passRate(rows) {
  if (!rows.length) return 0;
  const passed = rows.filter((record) => PASS_RESULTS.has(recordResult(record))).length;
  return Math.round((passed / rows.length) * 100);
}

function topGroups(rows, keyFn, limit = 8) {
  const map = new Map();
  for (const record of rows) {
    const key = normalize(keyFn(record)) || '未填写';
    const current = map.get(key) || [];
    current.push(record);
    map.set(key, current);
  }
  return [...map.entries()]
    .map(([name, items]) => ({ name, count: items.length, rate: passRate(items) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function buildProductLineBySeries(productLineOptions = [], seriesByProductLine = {}) {
  const productLineByKey = new Map(productLineOptions.map((item) => [normalizeHeader(item), item]));
  const result = new Map();
  Object.entries(seriesByProductLine || {}).forEach(([productLineKey, seriesList]) => {
    const productLine = productLineByKey.get(productLineKey) || productLineKey;
    if (!productLine || !Array.isArray(seriesList)) return;
    seriesList.forEach((series) => {
      const seriesKey = normalizeHeader(series);
      if (seriesKey && !result.has(seriesKey)) result.set(seriesKey, productLine);
    });
  });
  return result;
}

function recordMatchesFilters(record, filters, productLineForRecord, ignoreKey = '') {
  const month = recordMonth(record);
  const dimensionProductLine = productLineForRecord(record);
  const matchesSupplier = ignoreKey === 'supplierShortName'
    || !filters.supplierShortName
    || normalize(record.supplierShortName) === filters.supplierShortName;
  const matchesLine = ignoreKey === 'salesProductLine'
    || !filters.salesProductLine
    || normalize(dimensionProductLine) === filters.salesProductLine;
  const matchesSeries = ignoreKey === 'series'
    || !filters.series
    || normalize(record.series) === filters.series;
  const matchesDepartment = ignoreKey === 'businessDepartment'
    || !filters.businessDepartment
    || splitMultiValue(record.businessDepartments).some((item) => item === filters.businessDepartment);
  const matchesStart = ignoreKey === 'startMonth' || !filters.startMonth || (month && month >= filters.startMonth);
  const matchesEnd = ignoreKey === 'endMonth' || !filters.endMonth || (month && month <= filters.endMonth);
  return matchesSupplier && matchesLine && matchesSeries && matchesDepartment && matchesStart && matchesEnd;
}

function DashboardPage({ records = [], supplierOptions = [], productLineOptions = [], seriesOptions = [], seriesByProductLine = {} }) {
  const [filters, setFilters] = useState({
    supplierShortName: '',
    salesProductLine: '',
    series: '',
    businessDepartment: '',
    startMonth: '',
    endMonth: ''
  });

  const productLineBySeries = useMemo(
    () => buildProductLineBySeries(productLineOptions, seriesByProductLine),
    [productLineOptions, seriesByProductLine]
  );
  const productLineForRecord = (record) => productLineBySeries.get(normalizeHeader(record.series)) || '';

  const filterOptions = useMemo(() => {
    const productLineKey = normalizeHeader(filters.salesProductLine);
    const recordsForOption = (key) => records.filter((record) => recordMatchesFilters(record, filters, productLineForRecord, key));
    const productLineSet = new Set(productLineOptions.map((item) => normalizeHeader(item)));
    return {
      suppliers: uniqueValues(recordsForOption('supplierShortName').map((record) => record.supplierShortName)),
      productLines: uniqueValues(
        recordsForOption('salesProductLine')
          .map(productLineForRecord)
          .filter((item) => productLineSet.has(normalizeHeader(item)))
      ),
      series: uniqueValues(
        recordsForOption('series')
          .map((record) => record.series)
          .filter((series) => {
            if (!productLineKey) return true;
            const mappedProductLine = productLineForRecord({ series });
            return normalizeHeader(mappedProductLine) === productLineKey;
          })
      ),
      departments: uniqueValues(recordsForOption('businessDepartment').flatMap((record) => splitMultiValue(record.businessDepartments))),
      startMonths: uniqueValues(recordsForOption('startMonth').map(recordMonth)).sort(),
      endMonths: uniqueValues(recordsForOption('endMonth').map(recordMonth)).sort()
    };
  }, [records, productLineOptions, filters, productLineBySeries]);

  const filteredRecords = useMemo(
    () => records.filter((record) => recordMatchesFilters(record, filters, productLineForRecord)),
    [records, filters, productLineBySeries]
  );

  const stats = useMemo(() => {
    const total = filteredRecords.length;
    const passed = filteredRecords.filter((record) => PASS_RESULTS.has(recordResult(record))).length;
    const rework = filteredRecords.filter((record) => REWORK_RESULTS.has(recordResult(record))).length;
    const concession = filteredRecords.filter((record) => CONCESSION_RESULTS.has(recordResult(record))).length;
    return { total, passed, rework, concession };
  }, [filteredRecords]);

  const monthlyRows = useMemo(() => {
    const groups = new Map();
    for (const record of filteredRecords) {
      const month = recordMonth(record) || '未填写';
      const current = groups.get(month) || [];
      current.push(record);
      groups.set(month, current);
    }
    return [...groups.entries()]
      .map(([month, items]) => ({
        month,
        total: items.length,
        passed: items.filter((record) => PASS_RESULTS.has(recordResult(record))).length,
        rework: items.filter((record) => REWORK_RESULTS.has(recordResult(record))).length
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredRecords]);

  const resultData = useMemo(() => ({
    labels: ['通过', '返工', '让步接收', '其他'],
    datasets: [{
      data: [
        stats.passed,
        stats.rework,
        stats.concession,
        Math.max(stats.total - stats.passed - stats.rework - stats.concession, 0)
      ],
      backgroundColor: ['#22c55e', '#f59e0b', '#3b82f6', '#9ca3af']
    }]
  }), [stats]);

  const trendData = useMemo(() => ({
    labels: monthlyRows.map((row) => row.month),
    datasets: [
      { label: '验货次数', data: monthlyRows.map((row) => row.total), borderColor: '#3b82f6', backgroundColor: '#3b82f6', tension: 0.25 },
      { label: '通过数', data: monthlyRows.map((row) => row.passed), borderColor: '#22c55e', backgroundColor: '#22c55e', tension: 0.25 },
      { label: '返工数', data: monthlyRows.map((row) => row.rework), borderColor: '#f59e0b', backgroundColor: '#f59e0b', tension: 0.25 }
    ]
  }), [monthlyRows]);

  const hasActiveFilters = Object.values(filters).some((value) => normalize(value));
  const rankingLimit = hasActiveFilters ? filteredRecords.length : 8;

  const supplierRows = useMemo(
    () => topGroups(filteredRecords, (record) => record.supplierShortName, rankingLimit),
    [filteredRecords, rankingLimit]
  );
  const productRows = useMemo(
    () => topGroups(filteredRecords, productLineForRecord, rankingLimit),
    [filteredRecords, rankingLimit, productLineBySeries]
  );
  const issueRows = useMemo(
    () => topGroups(filteredRecords, (record) => latestFeedback(record.feedback).issueCategoryPrimary),
    [filteredRecords]
  );

  const supplierData = {
    labels: supplierRows.map((row) => row.name),
    datasets: [{ label: '通过率', data: supplierRows.map((row) => row.rate), backgroundColor: '#22c55e' }]
  };
  const productData = {
    labels: productRows.map((row) => row.name),
    datasets: [{ label: '通过率', data: productRows.map((row) => row.rate), backgroundColor: '#3b82f6' }]
  };
  const issueData = {
    labels: issueRows.map((row) => row.name),
    datasets: [{ label: '问题次数', data: issueRows.map((row) => row.count), backgroundColor: '#f59e0b' }]
  };

  function updateFilter(key, value) {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === 'salesProductLine' ? { series: '' } : {})
    }));
  }

  function resetFilters() {
    setFilters({ supplierShortName: '', salesProductLine: '', series: '', businessDepartment: '', startMonth: '', endMonth: '' });
  }

  function resultClass(result) {
    if (PASS_RESULTS.has(result)) return 'result-pass';
    if (REWORK_RESULTS.has(result)) return 'result-rework';
    return 'result-other';
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 18, right: 28 } },
    plugins: {
      legend: { position: 'bottom' },
      chartValueLabels: { display: true }
    }
  };
  const pieChartOptions = {
    ...chartOptions,
    layout: { padding: 18 },
    plugins: {
      ...chartOptions.plugins,
      chartValueLabels: { display: true, color: '#fff' }
    }
  };
  const horizontalRateChartOptions = {
    ...chartOptions,
    indexAxis: 'y',
    layout: { padding: { top: 8, right: 36 } },
    plugins: {
      ...chartOptions.plugins,
      chartValueLabels: { display: true, suffix: '%' }
    },
    scales: {
      x: {
        beginAtZero: true,
        max: 100
      }
    }
  };
  const supplierChartHeight = Math.max(280, supplierRows.length * 34);
  const productChartHeight = Math.max(280, productRows.length * 34);

  return (
    <section className="dashboard-page">
      <div className="section-heading-row">
        <h2>品质看板</h2>
        <span className="section-count">筛选结果 {filteredRecords.length} 条 / 共 {records.length} 条</span>
      </div>

      <div className="dashboard-filters">
        <select value={filters.supplierShortName} onChange={(event) => updateFilter('supplierShortName', event.target.value)}>
          <option value="">全部供应商简称</option>
          {filterOptions.suppliers.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.salesProductLine} onChange={(event) => updateFilter('salesProductLine', event.target.value)}>
          <option value="">全部产品线</option>
          {filterOptions.productLines.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.series} onChange={(event) => updateFilter('series', event.target.value)}>
          <option value="">全部系列</option>
          {filterOptions.series.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.businessDepartment} onChange={(event) => updateFilter('businessDepartment', event.target.value)}>
          <option value="">全部事业部</option>
          {filterOptions.departments.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.startMonth} onChange={(event) => updateFilter('startMonth', event.target.value)}>
          <option value="">起始月份</option>
          {filterOptions.startMonths.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.endMonth} onChange={(event) => updateFilter('endMonth', event.target.value)}>
          <option value="">截止月份</option>
          {filterOptions.endMonths.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" className="btn-reset" onClick={resetFilters}>重置筛选</button>
      </div>

      <div className="stats-cards">
        <div className="stat-card"><div className="stat-num">{stats.total}</div><div className="stat-label">总验货次数</div></div>
        <div className="stat-card pass"><div className="stat-num green">{stats.passed}</div><div className="stat-label">通过</div></div>
        <div className="stat-card rework"><div className="stat-num yellow">{stats.rework}</div><div className="stat-label">返工</div></div>
        <div className="stat-card concession"><div className="stat-num blue">{stats.concession}</div><div className="stat-label">让步接收</div></div>
      </div>

      <section className="chart-section">
        <h3>月度验货趋势</h3>
        <div className="chart-box" style={{ height: 280 }}>
          {monthlyRows.length ? <Line data={trendData} options={chartOptions} /> : <div className="no-data">暂无数据</div>}
        </div>
      </section>

      <div className="chart-row">
        <section className="chart-section half">
          <h3>验货结果分布</h3>
          <div className="chart-box" style={{ height: 260 }}>
            {filteredRecords.length ? <Pie data={resultData} options={pieChartOptions} /> : <div className="no-data">暂无数据</div>}
          </div>
        </section>
        <section className="chart-section half">
          <h3>问题分类排行</h3>
          <div className="chart-box" style={{ height: 260 }}>
            {issueRows.length ? <Bar data={issueData} options={chartOptions} /> : <div className="no-data">暂无数据</div>}
          </div>
        </section>
      </div>

      <div className="chart-row">
        <section className="chart-section half">
          <h3>供应商通过率排行</h3>
          <div className="chart-box" style={{ height: supplierChartHeight }}>
            {supplierRows.length ? <Bar data={supplierData} options={horizontalRateChartOptions} /> : <div className="no-data">暂无数据</div>}
          </div>
          <p className="table-hint">{hasActiveFilters ? '筛选后展示全部匹配供应商' : '按验货次数排序展示前 8 个供应商'}</p>
        </section>
        <section className="chart-section half">
          <h3>产品线通过率排行</h3>
          <div className="chart-box" style={{ height: productChartHeight }}>
            {productRows.length ? <Bar data={productData} options={horizontalRateChartOptions} /> : <div className="no-data">暂无数据</div>}
          </div>
          <p className="table-hint">{hasActiveFilters ? '筛选后展示全部匹配产品线' : '按验货次数排序展示前 8 个产品线'}</p>
        </section>
      </div>

      <section className="chart-section">
        <h3>最近验货记录</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>供应商简称</th>
                <th>产品线</th>
                <th>系列</th>
                <th>事业部</th>
                <th>验货时间</th>
                <th>验货结果</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.slice(0, 20).map((record) => {
                const feedback = latestFeedback(record.feedback);
                const result = recordResult(record) || '未反馈';
                return (
                  <tr key={record.id}>
                    <td>{record.supplierShortName || ''}</td>
                    <td>{productLineForRecord(record)}</td>
                    <td>{record.series || ''}</td>
                    <td>{record.businessDepartments || ''}</td>
                    <td>{formatDate(feedback.actualInspectionTime || record.schedule?.scheduledDate)}</td>
                    <td><span className={resultClass(result)}>{result}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

export default DashboardPage;
