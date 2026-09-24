/* Notice Chronology module tests — run: node notice-chronology.test.js */
const L = require('../caseflow-ledger.js');
const N = require('../notice-chronology.js');

let pass = 0, fail = 0;
const V = (m) => m._case.state().entries.length;
function ok(cond, name) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name); }
}
function throwsCode(fn, code, name) {
  try { fn(); fail++; console.log('  FAIL  ' + name + ' (no throw)'); }
  catch (e) {
    if (e.code === code) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + ' → got ' + e.code + ': ' + e.message); }
  }
}

console.log('\n[1] source.register — provenance + content hash required');
{
  const m = N.createNoticeModule(L.createCase({ id: 'n1' }));
  throwsCode(() => m.command('c1', 'operator', 0, 'source.register', { source_id: 'S1', kind: 'upload' }), 'N_SRC_HASH', 'missing sha256 rejected');
  const r = m.command('c1', 'operator', 0, 'source.register', { source_id: 'S1', kind: 'upload', sha256: 'a1b2c3d4e5f6789012345678', provenance: 'scanned notice, front desk', captured_at: '2026-08-15T12:00:00Z' });
  ok(r.seq === 1 && typeof r.hash === 'string' && r.version >= 1, 'register returns seq/hash/version');
  // idempotency: same cmd_id replays to the same entry, ledger unchanged
  const before = m._case.state().entries.length;
  const r2 = m.command('c1', 'operator', 999, 'source.register', { source_id: 'S1', kind: 'upload', sha256: 'a1b2c3d4e5f6789012345678', provenance: 'scanned notice, front desk', captured_at: '2026-08-15T12:00:00Z' });
  ok(r2.seq === 1 && r2.replayed && m._case.state().entries.length === before, 'idempotent replay returns original entry, no duplicate');
  // [changed] the same cmd_id carrying a DIFFERENT payload is refused, not silently absorbed
  throwsCode(() => m.command('c1', 'operator', 999, 'source.register', { source_id: 'S1', kind: 'upload', sha256: 'a1b2c3d4e5f6789012345678' }), 'V_IDEMPOTENCY_CONFLICT', 'cmd_id reused with different payload refused');
}

console.log('\n[2] expected case version — optimistic concurrency, no partial updates');
{
  const m = N.createNoticeModule(L.createCase({ id: 'n2' }));
  m.command('c1', 'op', 0, 'source.register', { source_id: 'S1', kind: 'upload', sha256: 'aaaabbbbccccdddd' });
  throwsCode(() => m.command('c2', 'op', 0, 'notice.create', { notice_id: 'NT1', label: '8/15 property notice' }), 'V_VERSION_MISMATCH', 'stale expected version rejected');
  ok(m._notices['NT1'] === undefined, 'rejected command left no partial state');
  m.command('c2', 'op', m._case.state().entries.length, 'notice.create', { notice_id: 'NT1', label: '8/15 property notice' });
  ok(!!m._notices['NT1'], 'correct version accepted');
}

console.log('\n[3] notice.create does not presume contents');
{
  const m = N.createNoticeModule(L.createCase({ id: 'n3' }));
  throwsCode(() => m.command('c1', 'op', 0, 'notice.create', { notice_id: 'NT1' }), 'N_NTC_LABEL', 'notice without label rejected');
  m.command('c1', 'op', 0, 'notice.create', { notice_id: 'NT1', label: 'Posted notice photographed 2026-08-15' });
  const v = m.chronologyView();
  ok(v.notices.length === 1 && v.notices[0].events.length === 0, 'notice record exists with zero presumed events');
}

console.log('\n[4] notice.event.record — typed events, each sourced');
{
  const m = N.createNoticeModule(L.createCase({ id: 'n4' }));
  m.command('c1', 'op', V(m), 'source.register', { source_id: 'S1', kind: 'photo', sha256: 'aaaabbbbccccdddd' });
  m.command('c2', 'op', V(m), 'notice.create', { notice_id: 'NT1', label: 'notice' });
  m.command('c3', 'op', V(m), 'notice.event.record', { notice_id: 'NT1', event_id: 'E1', type: 'posting', occurred_at: '2026-08-15', source_id: 'S1' });
  ok(m.noticeTimeline('NT1').events.length === 1, 'sourced posting event recorded');
  throwsCode(() => m.command('c4', 'op', V(m), 'notice.event.record', { notice_id: 'NT1', event_id: 'E2', type: 'telepathy', occurred_at: '2026-08-15', source_id: 'S1' }), 'N_EVT_TYPE', 'untyped event rejected');
  throwsCode(() => m.command('c5', 'op', V(m), 'notice.event.record', { notice_id: 'NT1', event_id: 'E3', type: 'mailing', occurred_at: '2026-08-16' }), 'N_EVT_SRC', 'unsourced event rejected (hearsay guard)');
  throwsCode(() => m.command('c6', 'op', V(m), 'notice.event.record', { notice_id: 'NT9', event_id: 'E4', type: 'mailing', occurred_at: '2026-08-16', source_id: 'S1' }), 'N_NTC_UNKNOWN', 'event on unknown notice rejected');
}

console.log('\n[5] proposition.submit + proposition.review lifecycle');
{
  const m = N.createNoticeModule(L.createCase({ id: 'n5' }));
  m.command('c1', 'op', V(m), 'source.register', { source_id: 'S1', kind: 'photo', sha256: 'aaaabbbbccccdddd' });
  m.command('c2', 'op', V(m), 'proposition.submit', { prop_id: 'P1', kind: 'fact', text: 'Notice was posted on the unit door on 2026-08-15', source_ids: ['S1'] });
  let st = m._case.state();
  ok(st.propositions['P1'] && st.propositions['P1'].gate === 'imported', 'submitted proposition enters as imported (unreviewed)');
  throwsCode(() => m.command('c3', 'op', V(m), 'proposition.review', { prop_id: 'P1', decision: 'maybe' }), 'N_REVIEW_DECISION', 'invalid decision rejected');
  m.command('c3', 'op', V(m), 'proposition.review', { prop_id: 'P1', decision: 'accept', note: 'photo metadata corroborates' });
  st = m._case.state();
  ok(st.propositions['P1'].gate === 'passed', 'accepted proposition is gate-passed');
  m.command('c4', 'op', V(m), 'proposition.submit', { prop_id: 'P2', kind: 'interpretation', text: 'Management knew the unit was occupied', source_ids: [] });
  m.command('c5', 'op', V(m), 'proposition.review', { prop_id: 'P2', decision: 'needs_evidence', note: 'need a witness or document' });
  st = m._case.state();
  ok(st.propositions['P2'].gate === 'in_review', 'needs_evidence keeps proposition in review');
}

console.log('\n[6] deadline.evaluate — TWO distinct approvals required');
{
  const m = N.createNoticeModule(L.createCase({ id: 'n6' }));
  m.command('c1', 'op', V(m), 'source.register', { source_id: 'S1', kind: 'scan', sha256: 'aaaabbbbccccdddd' });
  m.command('c2', 'op', V(m), 'notice.create', { notice_id: 'NT1', label: 'notice' });
  m.command('c3', 'op', V(m), 'notice.event.record', { notice_id: 'NT1', event_id: 'E1', type: 'posting', occurred_at: '2026-08-15', source_id: 'S1' });
  throwsCode(() => m.command('c4', 'op', V(m), 'deadline.evaluate', { deadline_id: 'D1', candidate_date: '2026-09-02' }), 'N_DL_RULE', 'deadline without rule rejected');

  // [changed] approvals can no longer be self-certified inside the evaluation command
  throwsCode(() => m.command('c4', 'op', V(m), 'deadline.evaluate', {
    deadline_id: 'D1', rule_cite: 'Cal. Civ. Code §1988', rule_verified: true,
    trigger_event_id: 'E1', trigger_verified: true, candidate_date: '2026-09-02'
  }), 'N_DL_SELF_CERT', 'evaluation carrying its own approvals is refused');

  // the scanned document alone: neither approval satisfied
  m.command('c4', 'op', V(m), 'deadline.evaluate', {
    deadline_id: 'D1', rule_cite: 'Cal. Civ. Code §1988 (storage claim window)',
    trigger_event_id: 'E1', candidate_date: '2026-09-02'
  });
  let ds = m.deadlineStatus('D1');
  ok(ds && !ds.sufficient && ds.gate === 'imported', 'scan alone satisfies neither approval — deadline stays unverified');

  // a skill may not approve
  throwsCode(() => m.command('c5', 'skill:caselaw', V(m), 'deadline.approve', { deadline_id: 'D1', approval: 'rule', basis: 'looks right' }), 'N_DL_APPROVE_ROLE', 'skill cannot approve a deadline element');
  throwsCode(() => m.command('c5', 'op', V(m), 'deadline.approve', { deadline_id: 'D1', approval: 'rule' }), 'N_DL_BASIS', 'approval without a stated basis refused');

  // only rule approved
  m.command('c5', 'op', V(m), 'deadline.approve', { deadline_id: 'D1', approval: 'rule', basis: 'Statute text reviewed; applies to this notice type' });
  ds = m.deadlineStatus('D1');
  ok(ds && !ds.sufficient && ds.note.indexOf('Trigger') >= 0, 'rule-only approval still insufficient');
  throwsCode(() => m.command('c6', 'op', V(m), 'deadline.approve', { deadline_id: 'D1', approval: 'rule', basis: 'again' }), 'N_DL_DUP_APPROVAL', 'the same approval cannot be counted twice');

  // both approved — two separate ledger entries
  m.command('c6', 'op', V(m), 'deadline.approve', { deadline_id: 'D1', approval: 'trigger', basis: 'Posting verified against dated photo S1' });
  ds = m.deadlineStatus('D1');
  ok(ds && ds.sufficient && ds.gate === 'passed', 'two distinct approvals → gate passed');
  const approvals = m._case.state().entries.filter((e) => e.command === 'deadline.approve');
  ok(approvals.length === 2 && approvals[0].seq !== approvals[1].seq, 'each approval is its own ledger entry');
}

console.log('\n[7] conflict.record — incompatible accounts both preserved, sources linked');
{
  const m = N.createNoticeModule(L.createCase({ id: 'n7' }));
  m.command('c1', 'op', V(m), 'source.register', { source_id: 'S1', kind: 'photo', sha256: 'aaaabbbbccccdddd' });
  m.command('c2', 'op', V(m), 'source.register', { source_id: 'S2', kind: 'witness', sha256: 'eeeeffff00001111' });
  throwsCode(() => m.command('c3', 'op', V(m), 'conflict.record', { conflict_id: 'CF1', account_a: { text: 'Posted 8/15', source_ids: [] }, account_b: { text: 'Posted 8/20', source_ids: ['S2'] } }), 'N_CF_SRC_A', 'account without sources rejected');
  m.command('c3', 'op', V(m), 'conflict.record', {
    conflict_id: 'CF1',
    account_a: { text: 'Manager: notice posted 2026-08-15', source_ids: ['S1'] },
    account_b: { text: 'Resident: notice first seen 2026-08-20', source_ids: ['S2'] }
  });
  const v = m.chronologyView();
  ok(v.conflicts['CF1'] && v.conflicts['CF1'].length === 2, 'both accounts preserved as propositions');
  ok(v.conflicts['CF1'][0].source_ids.length === 1 && v.conflicts['CF1'][1].source_ids.length === 1, 'each account links its own sources');
  ok(v.conflicts['CF1'].every((p) => p.state === 'documented'), 'conflicting accounts preserved, not resolved away');
}

console.log('\n[8] checkpoint.create — save and restore resume context');
{
  const m = N.createNoticeModule(L.createCase({ id: 'n8' }));
  m.command('c1', 'op', V(m), 'source.register', { source_id: 'S1', kind: 'photo', sha256: 'aaaabbbbccccdddd' });
  m.command('c2', 'op', V(m), 'notice.create', { notice_id: 'NT1', label: 'property notice' });
  m.command('c3', 'op', V(m), 'notice.event.record', { notice_id: 'NT1', event_id: 'E1', type: 'posting', occurred_at: '2026-08-15', source_id: 'S1' });
  throwsCode(() => m.command('c4', 'op', V(m), 'checkpoint.create', { cp_id: 'CP1' }), 'N_CP_RESUME', 'checkpoint without resume location rejected');
  m.command('c4', 'op', V(m), 'checkpoint.create', {
    cp_id: 'CP1', notice_id: 'NT1', objective: 'Establish when notice was actually posted',
    open_questions: ['Who posted it?', 'Was mailing also done?'], resume_location: 'notice:NT1:events'
  });
  const cp = m.restoreCheckpoint('CP1');
  ok(cp.case_version === V(m) && cp.resume_location === 'notice:NT1:events', 'restore returns case version + resume pointer');
  ok(cp.notice && cp.notice.events.length === 1 && cp.open_questions.length === 2, 'checkpoint captured notice state + open questions');
  throwsCode(() => m.restoreCheckpoint('NOPE'), 'N_CP_UNKNOWN', 'unknown checkpoint rejected');
}

console.log('\n[9] typed interaction outcomes — not arbitrary text');
{
  const m = N.createNoticeModule(L.createCase({ id: 'n9' }));
  throwsCode(() => m.command('c1', 'op', V(m), 'interaction.outcome', { outcome_type: 'went fine I guess' }), 'N_OUTCOME_TYPE', 'free-text outcome rejected');
  m.command('c1', 'op', V(m), 'interaction.outcome', { outcome_type: 'refusal', detail: 'Refused to state who authorized disposal' });
  m.command('c2', 'op', V(m), 'interaction.outcome', { outcome_type: 'unanswered_call', detail: 'Front desk, 14:20, rang 6x' });
  m.command('c3', 'op', V(m), 'interaction.outcome', { outcome_type: 'completed_interview', detail: 'Supervisor, 12 min, 6 Q/A' });
  ok(m._case.state().entries.length === 3, 'three distinct typed outcomes preserved separately');
}

console.log('\n[10] retention & access control — append-only ≠ unrestricted');
{
  const m = N.createNoticeModule(L.createCase({ id: 'n10' }));
  m.command('c1', 'op', V(m), 'source.register', { source_id: 'S-PUB', kind: 'photo', sha256: 'aaaabbbbccccdddd' });
  m.command('c2', 'op', V(m), 'source.register', { source_id: 'S-REC', kind: 'recording', sha256: 'eeeeffff00001111' });
  m.command('c3', 'op', V(m), 'retention.set', { source_id: 'S-REC', sensitivity: 'recording', restricted: true, retention_until: '2027-08-15', note: 'witness recording — restrict to operator' });
  let vis = m.visibleSources('collaborator-1');
  ok(vis['S-PUB'] && !vis['S-PUB'].restricted, 'public source fully visible');
  ok(vis['S-REC'].restricted === true && !vis['S-REC'].blob_url, 'restricted source visible only as a stub (hash preserved, content hidden)');
  m.command('c4', 'op', V(m), 'access.grant', { source_id: 'S-REC', actor: 'collaborator-1' });
  vis = m.visibleSources('collaborator-1');
  ok(vis['S-REC'] && !vis['S-REC'].restricted, 'granted actor sees the source again');
  const ver = m._case.verify();
  ok(ver.ok, 'hash chain intact after retention commands — integrity and access are separate concerns');
}

console.log('\n[11] end-to-end notice chronology (commands compose)');
{
  const m = N.createNoticeModule(L.createCase({ id: 'n11' }));
  let v = 0; const step = (id, type, payload) => m.command(id, 'operator', v = m._case.state().entries.length, type, payload);
  step('s1', 'source.register', { source_id: 'SRC-NOTICE', kind: 'photo', sha256: 'deadbeef12345678', provenance: 'unit door, photographed 2026-08-15 09:12' });
  step('s2', 'notice.create', { notice_id: 'N-4B', label: 'Property disposition notice — unit 4B' });
  step('s3', 'notice.event.record', { notice_id: 'N-4B', event_id: 'EV-POST', type: 'posting', occurred_at: '2026-08-15', source_id: 'SRC-NOTICE' });
  step('s4', 'proposition.submit', { prop_id: 'PR-POST', kind: 'fact', text: 'Notice posted on unit door 2026-08-15', source_ids: ['SRC-NOTICE'] });
  step('s5', 'proposition.review', { prop_id: 'PR-POST', decision: 'accept' });
  step('s6', 'deadline.evaluate', { deadline_id: 'DL-CLAIM', rule_cite: 'Cal. Civ. Code §1988', trigger_event_id: 'EV-POST', candidate_date: '2026-09-02' });
  step('s6a', 'deadline.approve', { deadline_id: 'DL-CLAIM', approval: 'rule', basis: 'rule reviewed' });
  step('s6b', 'deadline.approve', { deadline_id: 'DL-CLAIM', approval: 'trigger', basis: 'posting verified' });
  step('s7', 'checkpoint.create', { cp_id: 'CP-A', notice_id: 'N-4B', objective: 'Verify service before claim window closes', open_questions: ['Was notice also mailed?'], resume_location: 'notice:N-4B' });
  const view = m.chronologyView();
  ok(view.notices.length === 1 && view.notices[0].events.length === 1, 'chronology holds notice + event');
  ok(view.deadlines.length === 1 && view.deadlines[0].gate === 'passed', 'verified deadline present');
  ok(view.checkpoints.length === 1, 'checkpoint present');
  ok(m._case.verify().ok, 'whole chain verifies');
}

console.log('\n[12] atomicity — a failure inside a multi-entry command rolls back everything');
{
  const c = L.createCase({ id: 'n12' });
  const m = N.createNoticeModule(c);
  m.command('c1', 'op', V(m), 'source.register', { source_id: 'S1', kind: 'scan', sha256: 'aaaabbbbccccdddd' });
  const before = JSON.stringify(c.state());
  const realAppend = c.append;
  let calls = 0;
  c.append = function () { if (++calls === 2) throw new Error('simulated storage failure on the system entry'); return realAppend.apply(null, arguments); };
  try { m.command('c2', 'op', V(m), 'proposition.submit', { prop_id: 'P1', kind: 'fact', text: 't', source_ids: ['S1'] }); } catch (e) {}
  c.append = realAppend;
  ok(JSON.stringify(c.state()) === before, 'ledger and indexes identical after a mid-command failure');
  ok(c.verify().ok, 'chain still verifies after rollback');
}

console.log('\n[13] reopen the app — rehydrate the ledger and rebuild module state');
{
  const c1 = L.createCase({ id: 'n13' });
  const m1 = N.createNoticeModule(c1);
  const s = (id, type, p) => m1.command(id, 'operator', V(m1), type, p);
  s('a', 'source.register', { source_id: 'S1', kind: 'photo', sha256: 'deadbeef12345678' });
  s('b', 'notice.create', { notice_id: 'N1', label: 'notice' });
  s('c', 'notice.event.record', { notice_id: 'N1', event_id: 'E1', type: 'posting', occurred_at: '2026-08-15', source_id: 'S1' });
  s('d', 'checkpoint.create', { cp_id: 'CP1', notice_id: 'N1', objective: 'o', open_questions: ['q'], resume_location: 'notice:N1' });
  s('e', 'retention.set', { source_id: 'S1', sensitivity: 'witness_detail', restricted: true });
  const stored = JSON.parse(JSON.stringify(c1.state().entries));   // what localStorage would hold

  const c2 = L.createCase({ id: 'n13', entries: stored });
  const m2 = N.createNoticeModule(c2);
  ok(c2.verify().ok && c2.verify().head === c1.verify().head, 'same head hash after reopen');
  ok(JSON.stringify(m2.chronologyView()) === JSON.stringify(m1.chronologyView()), 'chronology view identical after reopen');
  ok(m2.restoreCheckpoint('CP1').resume_location === 'notice:N1', 'checkpoint restores after reopen');
  ok(m2.visibleSources('someone')['S1'].restricted === true, 'retention restriction survives reopen');
  const replay = m2.command('c', 'operator', 0, 'notice.event.record', { notice_id: 'N1', event_id: 'E1', type: 'posting', occurred_at: '2026-08-15', source_id: 'S1' });
  ok(replay.replayed === true && c2.state().entries.length === stored.length, 'duplicate replay after reopen is recognized (cmd_id persisted)');
  throwsCode(() => m2.command('f', 'operator', 1, 'notice.create', { notice_id: 'N2', label: 'x' }), 'V_VERSION_MISMATCH', 'stale version after reopen refused');

  const tampered = JSON.parse(JSON.stringify(stored)); tampered[2].payload.label = 'edited';
  throwsCode(() => L.createCase({ id: 'n13', entries: tampered }), 'L_REHYDRATE_INTEGRITY', 'tampered storage refused on reopen');
}

console.log('\n========================================');
console.log('  ' + pass + ' passed, ' + fail + ' failed');
console.log('========================================\n');
process.exit(fail ? 1 : 0);
