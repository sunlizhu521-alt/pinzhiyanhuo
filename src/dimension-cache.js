const DIMENSION_CACHE_DB_NAME = 'pinzhiyanhuo';
const DIMENSION_CACHE_STORE_NAME = 'dimensionCache';
const DIMENSION_CACHE_KEY = 'dimensionLibrary';

function openDimensionCache() {
  return new Promise((resolve) => {
    try {
      if (!globalThis.indexedDB) {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DIMENSION_CACHE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DIMENSION_CACHE_STORE_NAME)) {
          db.createObjectStore(DIMENSION_CACHE_STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function getCachedDimensionLibrary() {
  try {
    const db = await openDimensionCache();
    if (!db) return null;
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(DIMENSION_CACHE_STORE_NAME, 'readonly');
        const store = tx.objectStore(DIMENSION_CACHE_STORE_NAME);
        const request = store.get(DIMENSION_CACHE_KEY);
        request.onsuccess = () => {
          const record = request.result;
          resolve(record?.library ? { library: record.library, cachedAt: record.cachedAt || '' } : null);
        };
        request.onerror = () => resolve(null);
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        tx.onabort = () => db.close();
      } catch {
        db.close();
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

async function setCachedDimensionLibrary(library) {
  try {
    const db = await openDimensionCache();
    if (!db) return null;
    const cachedAt = new Date().toISOString();
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(DIMENSION_CACHE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(DIMENSION_CACHE_STORE_NAME);
        store.put({ key: DIMENSION_CACHE_KEY, library, cachedAt });
        tx.oncomplete = () => {
          db.close();
          resolve({ library, cachedAt });
        };
        tx.onerror = () => {
          db.close();
          resolve(null);
        };
        tx.onabort = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

async function clearCachedDimensionLibrary() {
  try {
    const db = await openDimensionCache();
    if (!db) return null;
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(DIMENSION_CACHE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(DIMENSION_CACHE_STORE_NAME);
        store.delete(DIMENSION_CACHE_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          resolve(null);
        };
        tx.onabort = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

export {
  openDimensionCache,
  getCachedDimensionLibrary,
  setCachedDimensionLibrary,
  clearCachedDimensionLibrary
};
