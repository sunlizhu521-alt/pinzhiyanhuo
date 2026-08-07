import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('feedback table places available inspection time after registration date', () => {
  const source = readFileSync(new URL('../src/components/FeedbackPage.jsx', import.meta.url), 'utf8');
  const tableSource = source.split('className="inspection-feedback-table"')[1];
  const columnsSource = tableSource.split('columns={[')[1].split(']}')[0];

  assert.match(columnsSource, /'登记日期',\s*'可验货时间',\s*'计划日期'/);
  assert.match(tableSource, /formatDate\(record\.inspectionFillTime\),\s*formatDate\(record\.shipmentTime\),\s*formatDate\(record\.schedule\?\.scheduledDate\)/);
});

test('feedback inspector is editable only when explicitly allowed', () => {
  const source = readFileSync(new URL('../src/components/FeedbackPage.jsx', import.meta.url), 'utf8');

  assert.match(source, /canEditInspector = false/);
  assert.match(source, /canEditInspector \? \(\s*<input[\s\S]*name="assignedInspector"[\s\S]*<span className="readonly-cell">/);
});

test('feedback page offers inspection time change as a follow-up result', () => {
  const source = readFileSync(new URL('../src/components/FeedbackPage.jsx', import.meta.url), 'utf8');
  const options = source.match(/<option value="验货时间变更">验货时间变更<\/option>/g) || [];

  assert.equal(options.length, 2);
  assert.match(source, /requiresFollowUpInspection\(event\.target\.value\)/);
  assert.match(source, /该场景无需上传报告/);
});

test('feedback page filters records that need inspection verification', () => {
  const source = readFileSync(new URL('../src/components/FeedbackPage.jsx', import.meta.url), 'utf8');

  assert.match(source, /verificationStatus: inspectionVerificationStatus\(formatDate\(record\.schedule\?\.scheduledDate\), today\)/);
  assert.match(source, /updateFilter\('verificationStatus', event\.target\.value\)/);
  assert.match(source, /全部核实状态/);
});

test('ledger filters by created date and inspection month before pagination', () => {
  const source = readFileSync(new URL('../src/components/LedgerPage.jsx', import.meta.url), 'utf8');

  assert.match(source, /formatDate\(record\.inspectionFillTime\) === normalizedFilters\.createdDate/);
  assert.match(source, /formatDate\(record\.schedule\?\.scheduledDate\)\.slice\(0, 7\) === normalizedFilters\.inspectionMonth/);
  assert.match(source, /type="date"[\s\S]*aria-label="添加时间"/);
  assert.match(source, /type="month"[\s\S]*aria-label="验货月份"/);
  assert.match(source, /const paginatedRecords = useMemo/);
  assert.match(source, /rows=\{paginatedRecords\}/);
  assert.match(source, /筛选后 \{filteredRecords\.length\} 条/);
});
