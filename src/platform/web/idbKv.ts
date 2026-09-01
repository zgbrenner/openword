import type { AtomicKeyValueStore } from "./web_recovery_store";

// A minimal promise wrapper over one IndexedDB object store. Each set() or
// delete() runs in its own readwrite transaction, so a write is committed
// completely or not at all — the atomicity the recovery store relies on.

const DATABASE_NAME = "openword-web";
const STORE_NAME = "kv";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

// Request success fires before the transaction is durable; a write is only
// atomic-and-committed once the transaction itself completes.
function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open OpenWord browser storage"));
    request.onblocked = () => reject(new Error("OpenWord browser storage is blocked by another tab"));
  });
}

let databasePromise: Promise<IDBDatabase> | null = null;

async function database(): Promise<IDBDatabase> {
  databasePromise ??= openDatabase().catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

export const webKvStore: AtomicKeyValueStore = {
  async get(key: string): Promise<unknown> {
    const db = await database();
    const transaction = db.transaction(STORE_NAME, "readonly");
    return requestToPromise(transaction.objectStore(STORE_NAME).get(key));
  },

  async set(key: string, value: unknown): Promise<void> {
    const db = await database();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).put(value, key);
    await done;
  },

  async delete(key: string): Promise<void> {
    const db = await database();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).delete(key);
    await done;
  },
};
