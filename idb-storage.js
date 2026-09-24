/* ============================================================
   IndexedDB-backed storage for the CaseFlow ledger.

   Exposes the synchronous getItem/setItem interface kimi-adapter.js
   already expects, on top of an async store:
     - ready() hydrates an in-memory cache from IndexedDB once.
     - getItem() reads the cache (synchronous, no await needed).
     - setItem() updates the cache immediately (read-your-writes)
       and queues a durable write; a failed write is retried on the
       next setItem() or drain() rather than losing the change.
     - drain() resolves once every queued write has reached IndexedDB
       (or failed and been re-queued) — call it when durability must
       be confirmed, e.g. before navigating away.

   This means the app keeps working immediately while offline: writes
   never block or throw, they just become durable a little later.
   ============================================================ */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.CaseFlowIDB = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createIndexedDBStorage(opts) {
    opts = opts || {};
    const dbName = opts.dbName || 'caseflow-storage';
    const storeName = opts.storeName || 'kv';
    const idb = opts.indexedDB || (typeof indexedDB !== 'undefined' ? indexedDB : null);
    if (!idb) throw new Error('IndexedDB is not available in this environment.');

    let db = null;
    const cache = new Map();
    const failed = new Set(); // keys whose last write attempt failed and needs retry
    let queue = Promise.resolve();
    let ready = false;

    function openDB() {
      return new Promise((resolve, reject) => {
        const req = idb.open(dbName, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(storeName); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
      });
    }
    function idbGetAll() {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const keysReq = store.getAllKeys(), valsReq = store.getAll();
        tx.oncomplete = () => resolve({ keys: keysReq.result, vals: valsReq.result });
        tx.onerror = () => reject(tx.error);
      });
    }
    // opts.put lets tests substitute a failing write without touching real IndexedDB.
    const rawPut = opts.put || ((key, value) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
    }));

    async function readyFn() {
      if (ready) return true;
      db = await openDB();
      const { keys, vals } = await idbGetAll();
      keys.forEach((k, i) => cache.set(k, vals[i]));
      ready = true;
      return true;
    }

    function getItem(key) { return cache.has(key) ? cache.get(key) : null; }

    function writeOne(key) {
      const value = cache.get(key);
      return rawPut(key, value).then(
        () => { if (cache.get(key) === value) failed.delete(key); },
        () => { failed.add(key); } // stay queued; next setItem/drain retries
      );
    }

    function setItem(key, value) {
      if (!ready) throw new Error('Storage not ready — await ready() before use.');
      cache.set(key, value);
      failed.add(key);
      queue = queue.then(() => writeOne(key));
      return true;
    }

    // Retries anything that previously failed, then resolves once every
    // queued write (old and new) has settled.
    function drain() {
      failed.forEach((k) => { queue = queue.then(() => writeOne(k)); });
      return queue;
    }

    function pendingKeys() { return Array.from(failed); }

    return { ready: readyFn, getItem, setItem, drain, pendingKeys };
  }

  return { createIndexedDBStorage };
});
