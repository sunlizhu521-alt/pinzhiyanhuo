import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('schedule table places the new-product column immediately after series', () => {
  const source = readFileSync(new URL('../src/components/InspectionSchedulePage.jsx', import.meta.url), 'utf8');
  const columnsSource = source.split('columns={[')[1].split(']}')[0];
  const renderSource = source.split('render={(record) => [')[1].split(']}')[0];

  assert.match(columnsSource, /key: 'series'[\s\S]*key: 'firstInspection', label: '是否新品'[\s\S]*'SKU及数量'/);
  assert.match(renderSource, /record\.series,[\s\S]*record\.firstInspection \|\| '',[\s\S]*record\.skuQuantity/);
});
