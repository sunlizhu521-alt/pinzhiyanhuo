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
