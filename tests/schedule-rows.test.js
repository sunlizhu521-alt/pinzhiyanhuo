import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeScheduleRecords } from '../src/utils.js';

test('schedule table places the new-product column immediately after series', () => {
  const source = readFileSync(new URL('../src/components/InspectionSchedulePage.jsx', import.meta.url), 'utf8');
  const columnsSource = source.split('columns={[')[1].split(']}')[0];
  const renderSource = source.split('render={(record) => [')[1].split(']}')[0];

  assert.match(columnsSource, /key: 'series'[\s\S]*key: 'firstInspection', label: '是否新品'[\s\S]*'SKU及数量'/);
  assert.match(renderSource, /record\.series,[\s\S]*record\.firstInspection \|\| '',[\s\S]*record\.skuQuantity/);
});

test('schedule rows merge only when series and available inspection date both match', () => {
  const rows = mergeScheduleRecords([
    { id: 'notice-1', series: 'A系列', shipmentTime: '2026-10-12', totalQuantity: '2' },
    { id: 'notice-2', series: 'A系列', shipmentTime: '2026/10/12', totalQuantity: '3' },
    { id: 'notice-3', series: 'A系列', shipmentTime: '2026-10-13', totalQuantity: '4' }
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].sourceIds, ['notice-1', 'notice-2']);
  assert.equal(rows[0].totalQuantity, '5');
  assert.deepEqual(rows[1].sourceIds, ['notice-3']);
  assert.equal(rows[1].totalQuantity, '4');
});
