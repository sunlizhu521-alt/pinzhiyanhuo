import {
  STATIC_DB_KEY,
  REPORT_FILE_LIBRARY_KEY,
  AUTH_USER_KEY,
  DEFAULT_ADMIN_USER,
  DEFAULT_USERS,
  LEGACY_DEFAULT_USER_IDS,
  LEGACY_ROLE_NAMES,
  ROLE_ADMIN,
  ROLE_USER,
  PAGE_OPTIONS,
  DIMENSION_LIBRARY_SLOTS,
  STATIC_MODE
} from './constants.js';
import { createId, fixMojibakeText, normalizePageAccessList, isPrimaryAdminUser } from './utils.js';
import { getCachedDimensionLibrary, setCachedDimensionLibrary, clearCachedDimensionLibrary } from './dimension-cache.js';

function defaultStaticDb() {
  return {
    users: DEFAULT_USERS,
    qualityInspection: {
      initialData: { sheetName: '', columns: [], rows: [], updatedAt: '' },
      notices: { rows: [], submittedAt: '', submittedBy: '' },
      schedules: {},
      reports: {},
      feedback: {},
      dimensionLibrary: {}
    }
  };
}

const ROLE_PAGE_ACCESS = { [ROLE_ADMIN]: PAGE_OPTIONS.map((page) => page.tab), [ROLE_USER]: [] };

function normalizeStaticDb(db = {}) {
  const fallback = defaultStaticDb();
  const inspection = db.qualityInspection || {};
  const sourceUsers = Array.isArray(db.users) && db.users.length ? db.users : fallback.users;
  const activeUsers = sourceUsers.filter((item) => (
    isPrimaryAdminUser(item)
    || (!LEGACY_DEFAULT_USER_IDS.has(item.id) && !LEGACY_ROLE_NAMES.has(item.name))
  ));
  const usersByName = new Map(activeUsers.map((item) => [item.name, item]));
  DEFAULT_USERS.forEach((item) => {
    if (!usersByName.has(item.name)) usersByName.set(item.name, item);
  });
  const users = Array.from(usersByName.values());
  return {
    users: users.map((user) => {
      if (user.id === DEFAULT_ADMIN_USER.id || user.name === DEFAULT_ADMIN_USER.name || user.role === ROLE_ADMIN) {
        return {
          ...DEFAULT_ADMIN_USER,
          ...user,
          password: user.password || DEFAULT_ADMIN_USER.password,
          role: ROLE_ADMIN,
          pageAccess: ROLE_PAGE_ACCESS[ROLE_ADMIN]
        };
      }
      const role = user.role === ROLE_ADMIN ? ROLE_ADMIN : ROLE_USER;
      const pageAccess = normalizePageAccessList(Array.isArray(user.pageAccess) ? user.pageAccess : (ROLE_PAGE_ACCESS[role] || []));
      return { ...user, id: user.id || createId(), role, pageAccess };
    }),
    qualityInspection: {
      initialData: { ...fallback.qualityInspection.initialData, ...(inspection.initialData || {}) },
      notices: { ...fallback.qualityInspection.notices, ...(inspection.notices || {}) },
      schedules: inspection.schedules || {},
      reports: inspection.reports || {},
      feedback: inspection.feedback || {},
      dimensionLibrary: inspection.dimensionLibrary || {}
    }
  };
}

function normalizeDimensionLibrary(library = {}) {
  return DIMENSION_LIBRARY_SLOTS.reduce((normalized, slot) => ({
    ...normalized,
    [slot.id]: library[slot.id] ? { ...library[slot.id], fileName: fixMojibakeText(library[slot.id].fileName) } : null
  }), {});
}

function readStaticDb() {
  try {
    return normalizeStaticDb(JSON.parse(localStorage.getItem(STATIC_DB_KEY) || ''));
  } catch {
    return defaultStaticDb();
  }
}

function saveStaticDb(db) {
  localStorage.setItem(STATIC_DB_KEY, JSON.stringify(normalizeStaticDb(db)));
}

async function readDimensionLibrary() {
  try {
    const cached = await getCachedDimensionLibrary();
    return normalizeDimensionLibrary(cached?.library || {});
  } catch {
    return normalizeDimensionLibrary();
  }
}

async function saveDimensionLibrary(library) {
  try {
    return Boolean(await setCachedDimensionLibrary(normalizeDimensionLibrary(library)));
  } catch {
    return false;
  }
}

async function clearDimensionLibraryCache() {
  try {
    await clearCachedDimensionLibrary();
  } catch {
    // Ignore unavailable browser storage.
  }
}

function readReportFileLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(REPORT_FILE_LIBRARY_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveReportFileLibrary(files) {
  try {
    localStorage.setItem(REPORT_FILE_LIBRARY_KEY, JSON.stringify(files));
    return true;
  } catch {
    return false;
  }
}

function readStoredUser() {
  const storage = STATIC_MODE ? localStorage : sessionStorage;
  if (!STATIC_MODE) localStorage.removeItem(AUTH_USER_KEY);
  try {
    return JSON.parse(storage.getItem(AUTH_USER_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveStoredUser(user) {
  const storage = STATIC_MODE ? localStorage : sessionStorage;
  if (!STATIC_MODE) localStorage.removeItem(AUTH_USER_KEY);
  storage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearStoredUser() {
  localStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
}

function composedStaticRecords(db) {
  const inspection = db.qualityInspection;
  return (inspection.notices.rows || []).map((row, index) => ({
    ...row,
    rowNumber: row.rowNumber || index + 1,
    schedule: inspection.schedules[row.id] || {},
    report: inspection.reports[row.id] || {},
    feedback: inspection.feedback[row.id] || {},
    rework: inspection.feedback[row.id]?.rework || {}
  }));
}

export {
  defaultStaticDb,
  normalizeStaticDb,
  normalizeDimensionLibrary,
  readStaticDb,
  saveStaticDb,
  readDimensionLibrary,
  saveDimensionLibrary,
  clearDimensionLibraryCache,
  readReportFileLibrary,
  saveReportFileLibrary,
  readStoredUser,
  saveStoredUser,
  clearStoredUser,
  composedStaticRecords
};
