const DB_NAME = "animal-groove-progress";
const DB_VERSION = 1;
const STORE_NAME = "level-completion";
const COMPLETED_KEY = "completed-level-ids";

/** Opens the IndexedDB database used for level completion persistence. */
function openProgressDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Reads the completed level id set from IndexedDB. */
export async function loadCompletedLevelIds(): Promise<Set<string>> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return new Set();
  }

  const db = await openProgressDb();
  try {
    const completed = await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(COMPLETED_KEY);
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error);
    });
    return new Set(completed);
  } finally {
    db.close();
  }
}

/** Persists one completed level id and returns the resulting completed id set. */
export async function markLevelCompleted(levelId: string): Promise<Set<string>> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return new Set();
  }

  const db = await openProgressDb();
  try {
    const current = await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(COMPLETED_KEY);
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error);
    });

    const next = new Set(current);
    next.add(levelId);

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put([...next], COMPLETED_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    return next;
  } finally {
    db.close();
  }
}

