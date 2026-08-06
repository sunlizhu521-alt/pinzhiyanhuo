import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectionVerificationStatus, requiresFollowUpInspection } from '../shared/feedback-results.js';

test('follow-up inspection results include rework and inspection time change', () => {
  assert.equal(requiresFollowUpInspection('返工'), true);
  assert.equal(requiresFollowUpInspection('验货时间变更'), true);
  assert.equal(requiresFollowUpInspection('通过'), false);
  assert.equal(requiresFollowUpInspection('让步'), false);
});

test('inspection verification status compares planned date with today', () => {
  assert.equal(inspectionVerificationStatus('2026-08-05', '2026-08-06'), '需要核实是否验货');
  assert.equal(inspectionVerificationStatus('2026-08-06', '2026-08-06'), '正常');
  assert.equal(inspectionVerificationStatus('2026-08-07', '2026-08-06'), '正常');
  assert.equal(inspectionVerificationStatus('', '2026-08-06'), '正常');
});
