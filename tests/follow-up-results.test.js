import test from 'node:test';
import assert from 'node:assert/strict';
import { requiresFollowUpInspection } from '../shared/feedback-results.js';

test('follow-up inspection results include rework and inspection time change', () => {
  assert.equal(requiresFollowUpInspection('返工'), true);
  assert.equal(requiresFollowUpInspection('验货时间变更'), true);
  assert.equal(requiresFollowUpInspection('通过'), false);
  assert.equal(requiresFollowUpInspection('让步'), false);
});
