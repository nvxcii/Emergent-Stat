/* Minimal fake IndexedDB — just enough of the API surface idb-storage.js uses
   (open/onupgradeneeded/onsuccess, transaction/objectStore/put/getAll/getAllKeys,
   oncomplete/onerror) to test it in Node without a real browser or a network
   install. Backing data is a module-level Map keyed by "dbName", shared across
   every createFakeIndexedDB() call in the same process — that's what lets a
   test simulate "close the app, reopen it" by creating a fresh indexedDB handle
   that still sees the same on-disk data. */
function createFakeIndexedDB() {
  const disk = createFakeIndexedDB._disk || (createFakeIndexedDB._disk = new Map()); // dbName -> Map(store -> Map(key,val))

  function open(dbName /*, version */) {
    const req = { result: null, onupgradeneeded: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      let stores = disk.get(dbName);
      const isNew = !stores;
      if (isNew) { stores = new Map(); disk.set(dbName, stores); }
      const dbHandle = {
        createObjectStore(name) { stores.set(name, new Map()); return { name }; },
        transaction(name /*, mode */) {
          const store = stores.get(name);
          const tx = { onerror: null, oncomplete: null, _pending: 0, _done: false };
          function finish() { if (tx._pending === 0 && !tx._done) { tx._done = true; queueMicrotask(() => tx.oncomplete && tx.oncomplete()); } }
          tx.objectStore = () => ({
            put(value, key) {
              tx._pending++;
              queueMicrotask(() => { store.set(key, value); tx._pending--; finish(); });
              return {};
            },
            getAllKeys() { const r = { result: undefined }; tx._pending++; queueMicrotask(() => { r.result = Array.from(store.keys()); tx._pending--; finish(); }); return r; },
            getAll() { const r = { result: undefined }; tx._pending++; queueMicrotask(() => { r.result = Array.from(store.values()); tx._pending--; finish(); }); return r; }
          });
          queueMicrotask(finish); // in case nothing is ever called on this tx
          return tx;
        }
      };
      req.result = dbHandle;
      if (isNew && req.onupgradeneeded) req.onupgradeneeded({ target: req });
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  return { open };
}
module.exports = { createFakeIndexedDB };
