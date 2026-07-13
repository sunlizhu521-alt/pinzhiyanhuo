import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeNoticeRowsById } from '../shared/notice-rows.js';

test('separate submissions only add records', () => {
  let rows = [];
  rows = mergeNoticeRowsById(rows, [{ id: 'notice-1', supplierShortName: '粤沣' }]);
  rows = mergeNoticeRowsById(rows, [{ id: 'notice-2', supplierShortName: '康麦隆' }]);
  rows = mergeNoticeRowsById(rows, [{ id: 'notice-3', supplierShortName: '瑞通' }]);

  assert.deepEqual(rows.map((row) => row.id), ['notice-1', 'notice-2', 'notice-3']);
});

test('submitting an existing id updates only that record', () => {
  const rows = mergeNoticeRowsById(
    [
      { id: 'notice-1', totalQuantity: '50' },
      { id: 'notice-2', totalQuantity: '100' }
    ],
    [{ id: 'notice-1', totalQuantity: '60' }]
  );

  assert.deepEqual(rows, [
    { id: 'notice-2', totalQuantity: '100' },
    { id: 'notice-1', totalQuantity: '60' }
  ]);
});

test('rows without ids are appended without removing existing records', () => {
  const existing = [{ id: 'notice-1' }];
  const incoming = [{ supplierShortName: '粤沣' }];

  assert.deepEqual(mergeNoticeRowsById(existing, incoming), [...existing, ...incoming]);
});
