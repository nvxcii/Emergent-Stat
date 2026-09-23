/* Kimi V4 compatibility adapter tests — run: node kimi-adapter.test.js */
const K = require('../kimi-adapter.js');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name); } }
function throwsCode(fn, code, name) {
  try { fn(); fail++; console.log('  FAIL  ' + name + ' (no throw)'); }
  catch (e) { if (e.code === code) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + ' → ' + e.code + ': ' + e.message); } }
}

function memStorage(init) {
  const d = Object.assign({}, init || {});
  return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, _d: d };
}
// Mirrors Kimi V4 defaultState() (index.html, "store" section)
function kimiState() {
  return {
    meta: { name: '', unit: '', property: '', evictDate: '', created: 1 },
    actions: ['A', 'B', 'C', 'D', 'E', 'F'].map((k) => ({ key: k, status: 'pending', personName: '', personContact: '', interactions: 0 })),
    persons: [], nodes: [], interactions: [], events: [], attachments: [],
    clockEntries: { possession: [], turnover: [], property: [], notice: [] },
    chain: ['Unit', 'Pre-Clearance'].map((n) => ({ name: n, fields: {}, gaps: 6 })),
    followUps: [], escalations: [], propositions: [],
    clockDates: { possession: '', noticeDeadline: '' },
    live: null, nextCustom: []
  };
}
let n = 0; const uid = () => 'u' + (++n);
const mk = (storage) => K.createKimiAdapter({ storage, uid });
const cmds = (a, name) => a._case().state().entries.filter((e) => e.command === name);

console.log('\n[1] fresh boot — ledger is the history, S.events is a projection');
{
  const st = memStorage(); const S = kimiState(); const A = mk(st);
  ok(A.boot(S).status === 'fresh', 'fresh case boots');
  const e = A.record('case', 'Case set up: test', '');
  S.events = A.events();
  ok(S.events.length === 1 && S.events[0].id === e.id && S.events[0].provenance === 'legacy', 'logEvent routed to ledger; unmigrated caller labelled legacy');
  A.persist(S);
  ok(JSON.parse(st._d['execEvidence.v1']).events.length === 0, 'app snapshot no longer stores a second event history');
  ok(JSON.parse(st._d['caseflow.ledger.v1']).length === cmds(A, 'kimi.event').length, 'ledger persisted under its own key');
}

console.log('\n[2] first boot over existing Kimi data — one-time import, originals preserved');
{
  const S0 = kimiState();
  S0.events = [{ id: 'old1', ts: 1700000000000, type: 'interview', summary: 'Interview completed: unidentified', ref: '' },
               { id: 'old2', ts: 1700000100000, type: 'clock', summary: 'Possession Clock started', ref: '', ann: [{ ts: 1700000200000, text: 'placeholder' }] }];
  const st = memStorage({ 'execEvidence.v1': JSON.stringify(S0) });
  const S = JSON.parse(st._d['execEvidence.v1']);
  const A = mk(st);
  ok(A.boot(S).status === 'migrated', 'legacy history imported');
  ok(S.events.length === 2 && S.events[0].ts === 1700000000000 && S.events[1].ann.length === 1, 'original ids, timestamps and annotations preserved');
  ok(S.events.every((e) => e.provenance === 'legacy_import'), 'imported events labelled legacy_import, not validated');
  ok(st._d['execEvidence.v1.pre-adapter-backup'] === JSON.stringify(S0), 'untouched pre-adapter backup kept for rollback');
  const S2 = JSON.parse(st._d['execEvidence.v1']); const A2 = mk(st);
  ok(A2.boot(S2).status === 'ledger' && cmds(A2, 'kimi.legacy_import').length === 2, 'reopen does not import twice');
  ok(S2.events.length === 2, 'history restored from ledger after reopen');
}

console.log('\n[3] direct S mutations are recorded as labelled legacy writes');
{
  const st = memStorage(); const S = kimiState(); const A = mk(st); A.boot(S);
  A.persist(S);
  ok(cmds(A, 'kimi.legacy_write').length === 0, 'no change → no legacy write');
  S.persons.push({ id: 'p1', name: 'Front desk', role: 'x' });
  S.chain[0].fields['Who?'] = 'crew lead';
  A.persist(S);
  const lw = cmds(A, 'kimi.legacy_write');
  ok(lw.length === 2, 'two changed collections → two entries');
  const persons = lw.find((e) => e.payload.collection === 'persons');
  ok(persons && persons.payload.added_ids[0] === 'p1' && persons.payload.provenance === 'legacy_unvalidated', 'entry names the added id and is marked unvalidated');
  ok(lw.find((e) => e.payload.collection === 'chain').payload.changed_ids.includes('#0'), 'chain cell edit captured by position');
  S.attachments.push({ id: 'a1', name: 'photo.jpg', size: 10, data: 'data:image/jpeg;base64,AAAA' });
  A.persist(S);
  const att = cmds(A, 'kimi.legacy_write').find((e) => e.payload.collection === 'attachments');
  ok(att && JSON.stringify(att.payload).indexOf('base64') < 0, 'attachment bytes never enter the ledger');
  ok(A.legacyWriteCount() === 3, 'legacy write count exposed for the UI');
}

console.log('\n[4] case-setup dates → unresolved propositions, not clock anchors');
{
  const st = memStorage(); const S = kimiState(); const A = mk(st); A.boot(S);
  const pid = A.setupDate(S, 'possession', '2030-01-10', 'Possession date');
  S.clockDates.possession = '2030-01-10';
  S.clockEntries.possession.push({ id: 'ce1', label: 'Possession date (case setup)', date: '2030-01-10', unverified: true, prop_id: pid });
  A.markValidated(S, ['clockEntries', 'clockDates']);
  A.persist(S);
  ok(A.propositionGate(pid) === 'imported', 'setup date stored as an ungated proposition');
  ok(cmds(A, 'kimi.legacy_write').length === 0, 'the validated command\'s own S changes are not mislabelled as legacy');
  ok(A.resumePacket(S).unverified_dates.length === 1, 'resume packet lists it as an unverified date');
  S.clockEntries.turnover.push({ id: 'x', label: 'hand-entered', date: '2030-01-11' });
  A.persist(S);
  ok(cmds(A, 'kimi.legacy_write').length === 1, 'a later manual clock edit is still caught as legacy');
}

console.log('\n[5] interaction completion guard + typed outcomes');
{
  const st = memStorage(); const S = kimiState(); const A = mk(st); A.boot(S);
  const empty = { id: 'L1', key: 'A', personName: '', qa: [{ q: '', a: '' }], branches: [] };
  ok(A.guardComplete(empty).ok === false, 'empty interaction cannot be completed (the 241-min / 0-question case)');
  A.recordAbandon(empty);
  ok(cmds(A, 'interaction.outcome')[0].payload.outcome_type === 'attempt_abandoned', 'abandon recorded as attempt_abandoned, not "unanswered"');
  const L = { id: 'L2', key: 'B', personName: 'J. Doe', qa: [{ q: 'Work order?', a: 'WO-1' }],
    branches: [{ type: 'refusal', summary: 'refused records' }, { type: 'dontknow', summary: 'unsure' }, { type: 'vendor', summary: 'hauler' }] };
  ok(A.guardComplete(L).ok, 'interaction with content can complete');
  const typed = A.recordOutcomes(L);
  ok(typed.join(',') === 'refusal,redirected,completed_interview', 'only exact equivalents are typed; "I don\'t know" is not coerced');
}

console.log('\n[6] annotations append; the original entry never changes');
{
  const st = memStorage(); const S = kimiState(); const A = mk(st); A.boot(S);
  const e = A.record('interview', 'Interview completed: x', '');
  const before = JSON.stringify(A._case().state().entries.find((x) => x.seq === e.seq));
  A.annotate(e.id, 'Timer left running; no questions captured');
  const after = JSON.stringify(A._case().state().entries.find((x) => x.seq === e.seq));
  ok(before === after, 'annotated entry is byte-identical');
  ok(A.events().find((x) => x.id === e.id).ann.length === 1, 'projection shows the annotation');
  throwsCode(() => A.annotate('nope', 'x'), 'K_ANN_TARGET', 'annotation must target an existing event');
  throwsCode(() => A.annotate(e.id, '   '), 'K_ANN_TEXT', 'empty annotation refused');
}

console.log('\n[7] close and reopen reconstructs the same ledger, projection and resume point');
{
  const st = memStorage(); const S = kimiState(); S.meta.property = 'Test Property'; const A = mk(st); A.boot(S);
  A.record('contact', 'Interaction started', '');
  A.setupDate(S, 'noticeDeadline', '2030-02-01', 'Notice claim deadline');
  S.persons.push({ id: 'p9', name: 'n' });
  A._module().command('cp-1', 'operator', A.version(), 'source.register', { source_id: 'S1', kind: 'photo', sha256: 'deadbeef12345678' });
  A._module().command('cp-2', 'operator', A.version(), 'notice.create', { notice_id: 'N1', label: 'n' });
  A._module().command('cp-3', 'operator', A.version(), 'checkpoint.create', { cp_id: 'CP1', notice_id: 'N1', objective: 'o', open_questions: [], resume_location: 'notice:N1' });
  A.persist(S);
  const headBefore = A.verify().head, evBefore = JSON.stringify(A.events()), packetBefore = A.resumePacket(S);

  const S2 = JSON.parse(st._d['execEvidence.v1']); const A2 = mk(st);
  ok(A2.boot(S2).status === 'ledger', 'reopened from stored ledger');
  ok(A2.verify().head === headBefore, 'identical head hash');
  ok(JSON.stringify(S2.events) === evBefore, 'identical event projection');
  const p2 = A2.resumePacket(S2);
  ok(p2.latest_checkpoint.cp_id === 'CP1' && p2.latest_checkpoint.resume_location === packetBefore.latest_checkpoint.resume_location, 'active investigation (checkpoint) restored');
  ok(p2.unverified_dates.length === 1 && S2.persons.length === 1, 'derived state and app state restored');
  A2.persist(S2);
  ok(cmds(A2, 'kimi.legacy_write').length === cmds(A, 'kimi.legacy_write').length, 'reopening does not fabricate legacy writes');
}

console.log('\n[8] tampered storage blocks writes and is never overwritten');
{
  const st = memStorage(); const S = kimiState(); const A = mk(st); A.boot(S);
  A.record('case', 'x', ''); A.record('case', 'y', ''); A.persist(S);
  const L = JSON.parse(st._d['caseflow.ledger.v1']); L[0].payload.summary = 'edited'; st._d['caseflow.ledger.v1'] = JSON.stringify(L);
  const tampered = st._d['caseflow.ledger.v1'];
  const S2 = JSON.parse(st._d['execEvidence.v1']); const A2 = mk(st);
  const r = A2.boot(S2);
  ok(r.status === 'integrity_failure' && !!A2.blocked, 'integrity failure reported');
  throwsCode(() => A2.record('case', 'z', ''), 'K_BLOCKED', 'writes blocked while unverified');
  ok(A2.persist(S2) === false && st._d['caseflow.ledger.v1'] === tampered, 'stored ledger left untouched for inspection');
}

console.log('\n[9] resume packet feeds case_reasoner /resume');
{
  const st = memStorage(); const S = kimiState(); S.meta.property = 'P'; const A = mk(st); A.boot(S);
  A.record('interview', 'Interview completed: x', ''); A.persist(S);
  const txt = A.resumeText(S);
  ok(/VERIFIED/.test(txt) && /Legacy \(unvalidated\) writes/.test(txt) && /#1 \[interview, legacy\]/.test(txt), 'text packet carries verification, legacy count and provenance per event');
}

console.log('\n========================================');
console.log('  ' + pass + ' passed, ' + fail + ' failed');
console.log('========================================\n');
process.exit(fail ? 1 : 0);
