/* ============================================================
   CaseFlow Ledger — the ledger is the database.
   Append-only, hash-chained command log. Everything else
   (clocks, chain gaps, alerts, progress, report) is a
   projection recomputed from the ledger.

   Isomorphic: runs in the browser and in Node (CommonJS).
   No dependencies. SHA-256 is embedded so it works offline.

   Architecture rules enforced here:
   1. Skills never write facts. Skills emit PROPOSALS; a
      proposal enters the ledger only via gate_decision accept.
   2. The report is a view — it renders from propositions only.
   ============================================================ */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.CaseFlowLedger = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- embedded SHA-256 (public domain implementation) ---------------- */
  function sha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var maxWord = Math.pow(2, 32), result = '';
    var words = [], bitLen = ascii.length * 8;
    var hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [];
    var primeCounter = k.length;
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) {
      var j = ascii.charCodeAt(i); if (j >> 8) return sha256(unescape(encodeURIComponent(ascii)));
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (bitLen / maxWord) | 0;
    words[words.length] = bitLen;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), oldHash = hash;
      hash = hash.slice(0, 8);
      for (var i0 = 0; i0 < 64; i0++) {
        var w15 = w[i0 - 15], w2 = w[i0 - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7]
          + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[i0]
          + (w[i0] = (i0 < 16) ? w[i0] : (w[i0 - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i0 - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i0 = 0; i0 < 8; i0++) hash[i0] = (hash[i0] + oldHash[i0]) | 0;
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? 0 : '') + b.toString(16);
      }
    }
    return result;
  }

  const hashOf = (s) => sha256(s);
  const GENESIS_PREV = '0'.repeat(64);

  /* ---------------- evidence states & gates ---------------- */
  const EVIDENCE_STATES = ['documented', 'corroborated', 'disputed', 'inferred', 'alleged', 'unresolved'];
  const GATES = ['imported', 'in_review', 'passed', 'rejected'];

  /* ============================================================
     CaseFlow — one case = one ledger.
     ============================================================ */
  function createCase(opts) {
    opts = opts || {};
    const caseId = opts.id || 'case-' + Math.random().toString(36).slice(2, 8);
    const template = opts.template || {
      clocks: ['possession', 'turnover', 'property', 'notice'],
      chainStages: [
        'unit', 'pre_clearance_inspection', 'assigned_crew', 'loading_handoff',
        'vehicle_vendor', 'storage_safekeeping', 'valuation_decision', 'final_destination'
      ],
      chainQuestions: ['who', 'when', 'where', 'authority', 'record', 'next_custodian']
    };

    let entries = [];   // LedgerEntry[]  (restored below when opts.entries is given)
    let sources = {};   // id -> Source
    let props = {};     // id -> Proposition
    let events = {};    // id -> Event
    let proposals = {}; // id -> Proposal (pending gate decisions)
    let cmdIndex = {};  // cmd_id -> seq (idempotency)

    const now = () => new Date().toISOString();
    const nextSeq = () => entries.length + 1;

    function emit(entry) {
      entry.seq = nextSeq();
      entry.prev_hash = entries.length ? entries[entries.length - 1].hash : GENESIS_PREV;
      entry.hash = hashOf(JSON.stringify({ seq: entry.seq, prev_hash: entry.prev_hash, at: entry.at, actor: entry.actor, command: entry.command, payload: entry.payload }));
      entries.push(entry);
      return entry;
    }

    function invariant(code, message, details) {
      const e = new Error(message);
      e.code = code; e.details = details; e.isInvariant = true;
      return e;
    }

    /* ---------- invariant checks (section 4 of the design) ---------- */

    // I-1: A clock anchor needs a date_basis pointing to a source.
    //      Setup-time dates are stored as 'unresolved' propositions.
    function checkClockAnchor(p, cmd) {
      if (p.type !== 'clock_anchor' && cmd !== 'clock_anchor') return;
      const db = p.date_basis;
      if (db && db.source_id && sources[db.source_id]) return;
      // no source → must be recorded as an unresolved proposition, not an anchor
      throw invariant('I1_DATE_BASIS',
        'Clock anchor "' + p.label + '" has no date_basis pointing to a source. ' +
        'Record it as an unresolved proposition instead.', { label: p.label });
    }

    // I-2: An Interaction can't be completed unless it has a person,
    //      at least one Q/A pair, or an outcome. Otherwise → Abandoned.
    function checkInteractionComplete(p, cmd) {
      if (p.type !== 'interaction_complete' && cmd !== 'interaction_complete') return;
      const has = (p.person && String(p.person).trim()) ||
        (Array.isArray(p.q_and_a) && p.q_and_a.length > 0) ||
        (Array.isArray(p.outcomes) && p.outcomes.length > 0);
      if (!has) {
        throw invariant('I2_EMPTY_INTERACTION',
          'Interaction has no person, no Q/A, and no outcome — it must be recorded as abandoned, not completed.', {});
      }
    }

    // I-4: An Action's due date needs a due_basis whose gate is passed.
    function checkActionDue(p, cmd) {
      if (p.type !== 'action_create' && cmd !== 'action_create') return;
      if (!p.due) return;
      const basis = p.due_basis && props[p.due_basis];
      if (!basis || basis.gate !== 'passed') {
        throw invariant('I4_UNVERIFIED_DUE_DATE',
          'Action due date has no due_basis proposition with gate=passed. ' +
          'It would show an "unverified date" flag.', { due: p.due });
      }
    }

    // I-5: Header and identity fields are propositions with sources.
    function checkHeaderIdentity(p, cmd) {
      if (p.type !== 'header_identity' && cmd !== 'header_identity') return;
      if (!Array.isArray(p.source_ids) || p.source_ids.length === 0) {
        throw invariant('I5_HEADER_NEEDS_SOURCE',
          'Header/identity field "' + (p.field || '?') + '" must cite at least one source.', { field: p.field });
      }
      p.source_ids.forEach((sid) => {
        if (!sources[sid]) throw invariant('I5_HEADER_NEEDS_SOURCE', 'Unknown source ' + sid + ' for header field.', { field: p.field });
      });
    }

    const CHECKS = [checkClockAnchor, checkInteractionComplete, checkActionDue, checkHeaderIdentity];

    /* ---------- proposal gate (skills never write facts) ---------- */
    function checkProposal(p, cmd) {
      if (p.type !== 'proposal' && cmd !== 'proposal') return;
      if (!p.skill) throw invariant('G1_PROPOSAL_SKILL', 'Proposal must name the skill that emitted it.', {});
      if (Array.isArray(p.facts)) {
        throw invariant('G2_NO_FACT_WRITES',
          'Skills never write facts. Emit proposals only; facts enter via gate acceptance.', {});
      }
    }

    /* ---------------- public command API ---------------- */
    function append(actor, type, payload, cmd_id) {
      payload = payload || {};
      cmd_id = cmd_id || null;

      // idempotency: same cmd_id → return existing entry, never duplicate.
      // Reusing a cmd_id for a DIFFERENT command is refused rather than silently absorbed.
      const fp = hashOf(JSON.stringify({ command: type, payload: payload }));
      if (cmd_id && cmdIndex[cmd_id] != null) {
        const prior = entries[cmdIndex[cmd_id] - 1];
        if (prior.fingerprint && prior.fingerprint !== fp) {
          throw invariant('L_IDEMPOTENCY_CONFLICT', 'cmd_id ' + cmd_id + ' was already used for a different command.', { cmd_id: cmd_id });
        }
        return prior;
      }

      const p = Object.assign({}, payload);
      CHECKS.forEach((fn) => fn(p, type));
      checkProposal(p, type);

      // cmd_id and fingerprint sit outside the hashed body so existing chains stay verifiable.
      const entry = emit({ at: now(), actor: actor || 'operator', command: type, payload: p, annotates: payload.annotates || null, cmd_id: cmd_id, fingerprint: fp });
      if (cmd_id) cmdIndex[cmd_id] = entry.seq;
      apply(entry);
      return entry;
    }

    function apply(entry) {
      const p = entry.payload;
      switch (entry.command) {
        case 'source_register':
          sources[p.id] = Object.assign({}, p);
          break;
        case 'proposition_add':
          props[p.id] = Object.assign({ gate: 'imported', state: 'unresolved', origin: 'operator' }, p);
          break;
        case 'gate_decision': {
          const target = proposals[p.proposal_id];
          if (target && p.decision === 'accept') {
            // accepted proposal becomes a proposition (gate passed on arrival if corroborated etc.)
            props[target.id] = Object.assign({}, target.proposed, { id: target.id, origin: 'skill:' + target.skill, gate: 'passed' });
          }
          if (target) target.resolution = { decision: p.decision, note: p.note || null, at: entry.at, actor: entry.actor };
          break;
        }
        case 'proposal':
          proposals[p.id] = Object.assign({}, p);
          break;
        case 'event_add':
          events[p.id] = Object.assign({}, p);
          break;
        case 'proposition_update':
          if (props[p.id]) props[p.id] = Object.assign({}, props[p.id], p.changes || {});
          break;
        case 'chain_answer': {
          // answer stored as proposition on the cell; cell filled only if prop passes gate later
          const cellId = p.stage + ':' + p.question;
          props[p.proposition_id] = Object.assign({ id: p.proposition_id, kind: 'fact', state: 'unresolved', gate: 'imported', origin: 'operator', chain_cell: cellId }, p.proposition || {});
          break;
        }
      }
    }

    /* ---------------- projections (recomputed, never stored as truth) ---------------- */
    function project() {
      const propList = Object.values(props);

      // clocks: anchors need date_basis; unresolved setup dates surface as flags
      const clocks = template.clocks.map((lane) => {
        const anchors = propList.filter((pr) => pr.type === 'clock_anchor' && pr.clock === lane && pr.gate === 'passed');
        const unverified = propList.filter((pr) => pr.clock === lane && pr.gate !== 'passed' && (pr.kind === 'deadline' || pr.type === 'clock_anchor'));
        return { lane, anchors: anchors.map((a) => ({ label: a.label, date: a.date, source: a.date_basis && a.date_basis.source_id })), unverified_dates: unverified.length };
      });

      // chain: 8 stages × 6 questions; null = visible gap
      const chain = template.chainStages.map((stage) => {
        const cells = template.chainQuestions.map((q) => {
          const cellId = stage + ':' + q;
          const answered = propList.filter((pr) => pr.chain_cell === cellId && pr.gate === 'passed');
          return { question: q, gap: answered.length === 0, propositions: answered.map((a) => a.id) };
        });
        return { stage, gaps: cells.filter((c) => c.gap).length, cells };
      });
      const firstGap = (() => {
        for (let s = 0; s < chain.length; s++) {
          const c = chain[s].cells.find((cell) => cell.gap);
          if (c) return { stage: chain[s].stage, question: c.question };
        }
        return null;
      })();

      // progress: steps done counts ONLY completed interactions (I-3)
      const interactions = propList.filter((pr) => pr.type === 'interaction_complete' && pr.gate === 'passed');
      const abandoned = propList.filter((pr) => pr.type === 'interaction_abandoned');
      const stepsDone = interactions.length;

      // alerts
      const alerts = [];
      chain.forEach((s) => { if (s.gaps > 0) alerts.push({ type: 'gap', ref: s.stage, message: s.gaps + ' unanswered questions at ' + s.stage }); });
      if (firstGap) alerts.push({ type: 'break_point', ref: firstGap.stage + ':' + firstGap.question, message: 'Break point: ' + firstGap.question + ' at ' + firstGap.stage });
      propList.filter((pr) => pr.kind === 'deadline' && pr.gate !== 'passed').forEach((pr) =>
        alerts.push({ type: 'unverified_date', ref: pr.id, message: 'Deadline "' + pr.text + '" is not gate-passed' }));
      const openProposals = Object.values(proposals).filter((pr) => !pr.resolution);
      alerts.push({ type: 'gate_inbox', ref: 'gate', message: openProposals.length + ' proposals awaiting review' });

      // actions with unverified due dates (I-4 projection side)
      const unverifiedDue = propList.filter((pr) => pr.type === 'action_create' && pr.due && (!pr.due_basis || !props[pr.due_basis] || props[pr.due_basis].gate !== 'passed'));

      // report view: only gate-passed propositions may render as fact;
      // unresolved ones go to "Open questions"
      const report = {
        facts: propList.filter((pr) => pr.gate === 'passed'),
        open_questions: propList.filter((pr) => pr.gate !== 'passed' && pr.state === 'unresolved'),
        generated_at: now()
      };

      return { clocks, chain, firstGap, stepsDone, abandonedCount: abandoned.length, alerts, openProposals: openProposals.length, unverifiedDue, report };
    }

    /* ---------------- integrity ---------------- */
    function verify() {
      let prev = GENESIS_PREV;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.seq !== i + 1) return { ok: false, at: e.seq, error: 'sequence gap' };
        if (e.prev_hash !== prev) return { ok: false, at: e.seq, error: 'prev_hash mismatch' };
        const expect = hashOf(JSON.stringify({ seq: e.seq, prev_hash: e.prev_hash, at: e.at, actor: e.actor, command: e.command, payload: e.payload }));
        if (e.hash !== expect) return { ok: false, at: e.seq, error: 'hash mismatch' };
        prev = e.hash;
      }
      return { ok: true, entries: entries.length, head: prev };
    }

    function state() {
      return {
        caseId, template,
        entries: entries.slice(),
        sources: Object.assign({}, sources),
        propositions: Object.assign({}, props),
        events: Object.assign({}, events),
        proposals: Object.assign({}, proposals)
      };
    }

    /* ---------------- atomic multi-entry commands ----------------
       A domain command may append several entries (e.g. notice.create +
       proposition_add). transaction() guarantees all-or-nothing: on any
       throw, the ledger and every index are restored exactly. */
    function transaction(fn) {
      const snap = {
        n: entries.length,
        sources: JSON.stringify(sources), props: JSON.stringify(props),
        events: JSON.stringify(events), proposals: JSON.stringify(proposals),
        cmdIndex: JSON.stringify(cmdIndex)
      };
      try { return fn(); }
      catch (err) {
        entries.length = snap.n;
        sources = JSON.parse(snap.sources); props = JSON.parse(snap.props);
        events = JSON.parse(snap.events); proposals = JSON.parse(snap.proposals);
        cmdIndex = JSON.parse(snap.cmdIndex);
        throw err;
      }
    }

    /* ---------------- rehydration (reopen the app) ----------------
       Verifies the stored chain first; replays apply() without re-hashing,
       so seq, timestamps, and hashes are exactly what was stored. */
    if (Array.isArray(opts.entries) && opts.entries.length) {
      const incoming = JSON.parse(JSON.stringify(opts.entries));
      let prev = GENESIS_PREV;
      for (let i = 0; i < incoming.length; i++) {
        const e = incoming[i];
        const expect = hashOf(JSON.stringify({ seq: e.seq, prev_hash: e.prev_hash, at: e.at, actor: e.actor, command: e.command, payload: e.payload }));
        if (e.seq !== i + 1 || e.prev_hash !== prev || e.hash !== expect) {
          throw invariant('L_REHYDRATE_INTEGRITY', 'Stored ledger failed verification at seq ' + (i + 1) + '; refusing to load it as authoritative.', { at: i + 1 });
        }
        prev = e.hash;
      }
      incoming.forEach((e) => { entries.push(e); if (e.cmd_id) cmdIndex[e.cmd_id] = e.seq; apply(e); });
    }

    return { caseId, template, append, project, verify, state, transaction,
      byCmdId: (id) => (cmdIndex[id] != null ? entries[cmdIndex[id] - 1] : null),
      constants: { EVIDENCE_STATES, GATES } };
  }

  return { createCase, sha256, hashOf, EVIDENCE_STATES, GATES };
});
