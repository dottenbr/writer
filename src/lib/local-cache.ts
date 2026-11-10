/**
 * What this browser last saw, so pages open instantly and refresh quietly
 * (stale-while-revalidate). Everything is keyed by the signed-in user and
 * cleared on sign-out.
 *
 * - Small things (the library list, the workspace) live in localStorage so
 *   the first render already has them.
 * - Book files can be megabytes, so they live in IndexedDB, with the books
 *   opened in this tab also kept in memory.
 */

const PREFIX = "bookkit-cache:";
const MAX_LOCAL = 1_500_000;

export function readLocal<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    const raw = JSON.stringify(value);
    if (raw.length > MAX_LOCAL) { localStorage.removeItem(PREFIX + key); return; }
    localStorage.setItem(PREFIX + key, raw);
  } catch { /* storage full or unavailable: the next visit loads from the network */ }
}

let database: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB unavailable")); return; }
      const request = indexedDB.open("bookkit-cache", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("kv");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.catch(() => { database = null; });
  }
  return database;
}

export async function readStored<T>(key: string): Promise<T | undefined> {
  try {
    const store = await db();
    return await new Promise<T | undefined>((resolve, reject) => {
      const r = store.transaction("kv").objectStore("kv").get(key);
      r.onsuccess = () => resolve(r.result as T | undefined);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return undefined;
  }
}

export async function writeStored(key: string, value: unknown): Promise<void> {
  try {
    const store = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = store.transaction("kv", "readwrite");
      tx.objectStore("kv").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* the cache is an optimisation only */ }
}

/** Forget everything this browser cached (sign-out). */
export async function clearCaches(): Promise<void> {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* storage unavailable */ }
  try {
    const store = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = store.transaction("kv", "readwrite");
      tx.objectStore("kv").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* nothing cached */ }
}
