const FOLLOW_UP_INSPECTION_RESULTS = new Set(['返工', '验货时间变更']);

function requiresFollowUpInspection(value) {
  return FOLLOW_UP_INSPECTION_RESULTS.has(String(value ?? '').trim());
}

function inspectionVerificationStatus(plannedDate, todayDate) {
  const planned = String(plannedDate ?? '').trim().slice(0, 10);
  const today = String(todayDate ?? '').trim().slice(0, 10);
  const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  return isIsoDate(planned) && isIsoDate(today) && planned < today
    ? '需要核实是否验货'
    : '正常';
}

export { requiresFollowUpInspection, inspectionVerificationStatus };
