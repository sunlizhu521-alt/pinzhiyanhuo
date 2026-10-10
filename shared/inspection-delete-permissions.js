const INSPECTION_DELETE_USER_NAMES = new Set(['孙立柱', '梅孜琨', '邓颜威']);

function canDeleteInspectionPageData(user) {
  return INSPECTION_DELETE_USER_NAMES.has(String(user?.name || '').trim());
}

export { INSPECTION_DELETE_USER_NAMES, canDeleteInspectionPageData };
