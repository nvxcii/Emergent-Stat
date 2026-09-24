/* IndexedDB storage adapter tests — run: node test/idb-storage.test.js */
const { createIndexedDBStorage } = require('../idb-storage.js');
const { createFakeIndexedDB } = require('./fake-idb.js');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name); } }
async function run() {
  console.log('\n[1] hydration + read-your-writes');
  {
    const idbFactory = createFakeIndexedDB();
    const s = createIndexedDBStorage({ dbName: 'd1', indexedDB: idbFactory });
    await s.ready();
    ok(s.getItem('k') === null, 'empty store reads null');
    s.setItem('k', 'v1');
    ok(s.getItem('k') === 'v1', 'write is visible synchronously (read-your-writes) before it reaches disk');
    await s.drain();
    ok(s.pendingKeys().length === 0, 'nothing pending after drain');
  }

  console.log('\n[2] durability — a second handle on the same "disk" sees prior writes');
  {
    const idbFactory = createFakeIndexedDB();
    const s1 = createIndexedDBStorage({ dbName: 'd2', indexedDB: idbFactory });
    await s1.ready();
    s1.setItem('ledger', '[1,2,3]');
    await s1.drain();
    const s2 = createIndexedDBStorage({ dbName: 'd2', indexedDB: idbFactory }); // simulates reopening the app
    await s2.ready();
    ok(s2.getItem('ledger') === '[1,2,3]', 'reopened storage sees the durable write');
  }

  console.log('\n[3] offline write: failure does not lose data, and is retried');
  {
    const idbFactory = createFakeIndexedDB();
    function directPut(key, value) { // bypasses the wrapper's own put, used only to let the retry actually land
      return new Promise((resolve, reject) => {
        const req = idbFactory.open('d3');
        req.onsuccess = () => {
          const tx = req.result.transaction('kv');
          tx.objectStore().put(value, key);
          tx.oncomplete = resolve; tx.onerror = reject;
        };
      });
    }
    let fail1 = true;
    const flaky = (key, value) => fail1 ? (fail1 = false, Promise.reject(new Error('offline'))) : directPut(key, value);
    const s = createIndexedDBStorage({ dbName: 'd3', indexedDB: idbFactory, put: flaky });
    await s.ready();
    s.setItem('a', 'first-value');
    ok(s.getItem('a') === 'first-value', 'cache holds the value immediately even though the first write will fail');
    await s.drain(); // the initial write fails inside here; drain() retries pending writes before resolving
    ok(s.pendingKeys().length === 0, 'drain() retries a failed write until it succeeds');
    const s2 = createIndexedDBStorage({ dbName: 'd3', indexedDB: idbFactory });
    await s2.ready();
    ok(s2.getItem('a') === 'first-value', 'the value actually reached disk despite the first attempt failing');
  }

  console.log('\n[4] two independent stores (different dbName) do not see each other');
  {
    const idbFactory = createFakeIndexedDB();
    const s1 = createIndexedDBStorage({ dbName: 'case-A', indexedDB: idbFactory });
    const s2 = createIndexedDBStorage({ dbName: 'case-B', indexedDB: idbFactory });
    await s1.ready(); await s2.ready();
    s1.setItem('x', 'A'); await s1.drain();
    ok(s2.getItem('x') === null, 'separate database namespaces stay isolated');
  }

  console.log('\n[5] setItem before ready() is refused rather than silently dropped');
  {
    const idbFactory = createFakeIndexedDB();
    const s = createIndexedDBStorage({ dbName: 'd5', indexedDB: idbFactory });
    let threw = false;
    try { s.setItem('k', 'v'); } catch (e) { threw = true; }
    ok(threw, 'writing before hydration throws instead of writing into an empty cache');
  }

  console.log('\n========================================');
  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  console.log('========================================\n');
  process.exit(fail ? 1 : 0);
}
run();
