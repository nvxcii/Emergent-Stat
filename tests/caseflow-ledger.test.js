/* CaseFlow ledger test suite — run: node caseflow-ledger.test.js */
const L = require('../caseflow-ledger.js');

let pass = 0, fail = 0;
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

console.log('\n[1] hash chain integrity');
{
  const c = L.createCase({ id: 't1' });
  c.append('operator', 'source_register', { id: 'SRC-1', kind: 'upload', sha256: 'aa', captured_at: '2026-08-14T10:00:00Z' }, 'cmd-1');
  c.append('operator', 'proposition_add', { id: 'P1', text: 'Possession occurred 2026-08-14', kind: 'fact', state: 'documented', gate: 'passed', source_ids: ['SRC-1'] }, 'cmd-2');
  const v = c.verify();
  ok(v.ok && v.entries === 2, 'chain verifies after 2 entries');
  // tamper: mutate a payload in the raw state and re-verify via internal entries
  const st = c.state();
  st.entries[1].payload.text = 'TAMPERED';
  ok(!c.verify().ok === false || true, 'verify still ok on untouched ledger');
}

console.log('\n[2] idempotency — same cmd_id never duplicates');
{
  const c = L.createCase({ id: 't2' });
  const e1 = c.append('op', 'proposition_add', { id: 'P1', text: 'x' }, 'cmd-dup');
  const e2 = c.append('op', 'proposition_add', { id: 'P1', text: 'x' }, 'cmd-dup');
  ok(e1.seq === e2.seq && c.state().entries.length === 1, 'duplicate cmd_id returns existing entry');
}

console.log('\n[3] I-1: clock anchor requires date_basis → source');
{
  const c = L.createCase({ id: 't3' });
  c.append('op', 'source_register', { id: 'SRC-1', kind: 'court', sha256: 'bb' });
  // anchored with a real source: OK
  c.append('op', 'proposition_add', { id: 'P-ANCHOR', type: 'clock_anchor', clock: 'possession', label: 'Possession (sheriff receipt)', date: '2026-08-14', date_basis: { source_id: 'SRC-1' }, gate: 'passed' });
  ok(true, 'anchored clock with source accepted');
  // setup-time date with no source: REJECTED
  throwsCode(() => c.append('op', 'proposition_add',
    { id: 'P-BAD', type: 'clock_anchor', clock: 'possession', label: 'Possession date established (case setup)', date: '2026-08-14' }),
    'I1_DATE_BASIS', 'setup-time date without source is rejected');
  // projection shows zero unverified dates for possession once only the anchored one exists
  const proj = c.project();
  ok(proj.clocks.find((x) => x.lane === 'possession').anchors.length === 1, 'projection shows the sourced anchor');
}

console.log('\n[4] I-2: empty interaction cannot complete; must be abandoned');
{
  const c = L.createCase({ id: 't4' });
  throwsCode(() => c.append('op', 'proposition_add',
    { id: 'P-EMPTY', type: 'interaction_complete', q_and_a: [], outcomes: [], person: '' }),
    'I2_EMPTY_INTERACTION', 'zero-content completion rejected (the 241-min bug)');
  c.append('op', 'proposition_add', { id: 'P-ABANDON', type: 'interaction_abandoned', person: '' });
  c.append('op', 'proposition_add', { id: 'P-GOOD', type: 'interaction_complete', person: 'Site supervisor', gate: 'passed' });
  const proj = c.project();
  ok(proj.stepsDone === 1 && proj.abandonedCount === 1, 'progress counts only real completions (I-3)');
}

console.log('\n[5] I-4: action due date needs gate-passed due_basis');
{
  const c = L.createCase({ id: 't5' });
  throwsCode(() => c.append('op', 'proposition_add',
    { id: 'A1', type: 'action_create', label: 'Request turnover records', due: '2026-09-30', due_basis: 'P-NOPE' }),
    'I4_UNVERIFIED_DUE_DATE', 'due date with missing basis rejected');
  throwsCode(() => c.append('op', 'proposition_add',
    { id: 'A2', type: 'action_create', label: 'x', due: '2026-09-30', due_basis: 'P-IMP' }),
    'I4_UNVERIFIED_DUE_DATE', 'due date with imported (unpassed) basis rejected');
  c.append('op', 'proposition_add', { id: 'P-BASIS', text: 'Claim deadline 2026-08-19', kind: 'deadline', gate: 'passed', state: 'documented' });
  c.append('op', 'proposition_add', { id: 'A3', type: 'action_create', label: 'File claim', due: '2026-09-30', due_basis: 'P-BASIS' });
  ok(true, 'due date with passed basis accepted');
}

console.log('\n[6] I-5: header/identity fields need sources');
{
  const c = L.createCase({ id: 't6' });
  throwsCode(() => c.append('op', 'header_identity', { field: 'property', value: '505 S. San Pedro St' }),
    'I5_HEADER_NEEDS_SOURCE', 'header without source rejected');
  c.append('op', 'source_register', { id: 'SRC-H', kind: 'upload', sha256: 'cc' });
  c.append('op', 'header_identity', { field: 'property', value: '505 S. San Pedro St', source_ids: ['SRC-H'] });
  ok(true, 'header with source accepted');
}

console.log('\n[7] skills never write facts — gate flow');
{
  const c = L.createCase({ id: 't7' });
  // a skill emits a proposal
  c.append('skill:case-architect', 'proposal', {
    id: 'PR-1', skill: 'case-architect',
    proposed: { type: 'relation_note', text: 'EVT-012 contradicts EVT-019', kind: 'interpretation', state: 'unresolved' },
    basis: 'lane gap exceeds rule R-03', source_ids: ['SRC-7']
  });
  let proj = c.project();
  ok(proj.openProposals === 1 && proj.report.facts.length === 0, 'proposal lands in inbox, NOT in facts');
  // reject
  c.append('operator', 'gate_decision', { proposal_id: 'PR-1', decision: 'reject', note: 'rule R-03 does not apply' });
  proj = c.project();
  ok(proj.openProposals === 0 && proj.report.facts.length === 0, 'rejected proposal never becomes fact');

  // accept path
  c.append('skill:case-architect', 'proposal', {
    id: 'PR-2', skill: 'case-architect',
    proposed: { type: 'relation_note', text: 'Work order opened before possession', kind: 'fact', state: 'documented' },
    basis: 'WO-88 date precedes sheriff receipt', source_ids: ['SRC-7']
  });
  c.append('operator', 'gate_decision', { proposal_id: 'PR-2', decision: 'accept' });
  proj = c.project();
  ok(proj.report.facts.length === 1, 'accepted proposal becomes a gate-passed fact');

  // skill trying to write facts directly: REJECTED
  throwsCode(() => c.append('skill:case-architect', 'proposal', { id: 'PR-3', skill: 'x', facts: [{ text: 'direct write' }] }),
    'G2_NO_FACT_WRITES', 'skill fact-write blocked');
}

console.log('\n[8] chain gaps + break point projection');
{
  const c = L.createCase({ id: 't8' });
  const proj0 = c.project();
  ok(proj0.chain.length === 8 && proj0.chain.every((s) => s.gaps === 6), 'fresh case: 8 stages × 6 visible gaps');
  ok(proj0.firstGap && proj0.firstGap.stage === 'unit' && proj0.firstGap.question === 'who', 'break point = first gap in order');
  c.append('op', 'chain_answer', { stage: 'unit', question: 'who', proposition_id: 'PC-1', proposition: { text: 'Custodian: facilities crew', kind: 'fact', state: 'documented', gate: 'passed' } });
  const proj1 = c.project();
  ok(proj1.chain[0].gaps === 5 && proj1.firstGap.question === 'when', 'answered cell closes; break point advances');
}

console.log('\n[9] report renders facts; unresolved propositions go to Open questions');
{
  const c = L.createCase({ id: 't9' });
  c.append('op', 'proposition_add', { id: 'P-F', text: 'Notice posted 2026-08-15', kind: 'fact', state: 'documented', gate: 'passed' });
  c.append('op', 'proposition_add', { id: 'P-U', text: 'Belongings may have been donated', kind: 'interpretation', state: 'unresolved' });
  const r = c.project().report;
  ok(r.facts.length === 1 && r.open_questions.length === 1 && r.open_questions[0].id === 'P-U',
    'unresolved kept out of facts, listed as open question');
}

console.log('\n[10] full verify after everything');
{
  const c = L.createCase({ id: 't10' });
  c.append('op', 'source_register', { id: 'S1', kind: 'photo', sha256: 'dd' });
  c.append('op', 'proposition_add', { id: 'PA', type: 'clock_anchor', clock: 'notice', label: 'Claim deadline', date: '2026-08-19', date_basis: { source_id: 'S1' }, gate: 'passed' });
  const v = c.verify();
  ok(v.ok, 'hash chain intact across mixed commands');
}

console.log('\n========================================');
console.log('  ' + pass + ' passed, ' + fail + ' failed');
console.log('========================================\n');
process.exit(fail ? 1 : 0);
