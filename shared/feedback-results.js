const FOLLOW_UP_INSPECTION_RESULTS = new Set(['返工', '验货时间变更']);

function requiresFollowUpInspection(value) {
  return FOLLOW_UP_INSPECTION_RESULTS.has(String(value ?? '').trim());
}

export { requiresFollowUpInspection };
