import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MENU_PAGES, PAGE_OPTIONS } from '../src/constants.js';
import { validateNoticeRows } from '../src/dimension-utils.js';

test('inspection draft page reuses inspection notice permission', () => {
  const draftPage = MENU_PAGES.find((page) => page.tab === 'inspectionDraft');
  assert.equal(draftPage?.permissionTab, 'inspectionNotice');
  assert.ok(!PAGE_OPTIONS.some((page) => page.tab === 'inspectionDraft'));
});

test('draft validation permits only the two pending times to remain empty', () => {
  const row = {
    inspectionNotifier: '测试用户',
    inspectionFillTime: '2026-10-12',
    supplierFinishTime: '',
    shipmentTime: '',
    shippingOaNo: 'FH-OA-1',
    supplierShortName: '测试供应商',
    businessDepartments: '国内事业部',
    operation: '测试运营',
    firstInspection: '是',
    salesProductLine: '测试产品线',
    series: '测试系列',
    totalQuantity: '10'
  };
  const args = [
    [row],
    ['测试供应商'],
    ['测试产品线'],
    ['测试系列'],
    { 测试产品线: ['测试系列'] }
  ];

  assert.match(validateNoticeRows(...args), /供应商完工时间/);
  assert.equal(validateNoticeRows(...args, { allowPendingTimes: true }), '');
});

test('inspection notice row exposes draft action after submit and delete', () => {
  const source = readFileSync(new URL('../src/components/InspectionNoticePage.jsx', import.meta.url), 'utf8');
  const actions = source.split('<div className="table-action-row">').at(-1);
  assert.match(actions, /onSubmitRow[\s\S]*onDelete[\s\S]*onDraftRow/);
});
