/* ============================================================
   Kimi V4 compatibility adapter
   Makes the CaseFlow ledger the single authoritative history for the
   existing ExecEvidence app without replacing its UI or its actions.

   - S.events is no longer stored. It is a projection of the ledger,
     rebuilt on every write and on boot. There is one history.
   - Actions that still mutate S directly are "legacy writes". On every
     save() the adapter diffs the tracked collections and appends a
     kimi.legacy_write entry naming exactly what changed. They are
     labelled as unvalidated; nothing pretends they have provenance.
   - Migrated actions (case-setup dates, interaction completion and
     abandonment, annotations) go through validated commands.
   - The ledger persists to its own storage key and is verified on boot.
     A failed verification blocks writes and never overwrites storage.

   Isomorphic (browser global CaseFlowKimi / CommonJS). No dependencies
   beyond caseflow-ledger.js and notice-chronology.js.
   ============================================================ */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./caseflow-ledger.js'), require('./notice-chronology.js'));
  } else {
    global.CaseFlowKimi = factory(global.CaseFlowLedger, global.NoticeChronology);
  }
})(typeof self !== 'undefined' ? self : this, function (Ledger, Notice) {
  'use strict';

  const TRACKED = ['meta', 'actions', 'persons', 'nodes', 'interactions', 'attachments', 'clockEntries',
    'chain', 'followUps', 'escalations', 'propositions', 'clockDates', 'nextCustom'];

  // Kimi outcome chips → typed outcomes. Only exact equivalents are mapped;
  // anything else stays an untyped Kimi event rather than being coerced.
  const OUTCOME_MAP = { refusal: 'refusal', norecord: 'no_record_exists', dept: 'redirected', vendor: 'redirected' };

  function adapterError(code, message) { const e = new Error(message); e.code = code; e.isAdapter = true; return e; }
  const h = (v) => Ledger.hashOf(JSON.stringify(v === undefined ? null : v));
  const text = (v) => (typeof v === 'string' ? v.trim() : '');

  // Attachment payloads (data URLs) are excluded from digests: hashing megabytes
  // on every save is slow, and the metadata identifies the change.
  function stripAttachmentData(v) { return Array.isArray(v) ? v.map((a) => { const o = Object.assign({}, a); delete o.data; return o; }) : v; }
  function digestCollection(name, v) { return h(name === 'attachments' ? stripAttachmentData(v) : v); }

  function itemDigests(name, v) {
    const out = {};
    if (Array.isArray(v)) v.forEach((it, i) => { const k = it && it.id != null ? String(it.id) : (it && it.key != null ? 'key:' + it.key : '#' + i); out[k] = digestCollection(name, [it]); });
    else if (v && typeof v === 'object') Object.keys(v).forEach((k) => { out[k] = h(v[k]); });
    else out['value'] = h(v);
    return out;
  }

  function createKimiAdapter(opts) {
    opts = opts || {};
    const storage = opts.storage;
    const ledgerKey = opts.ledgerKey || 'caseflow.ledger.v1';
    const appKey = opts.appKey || 'execEvidence.v1';
    const backupKey = appKey + '.pre-adapter-backup';
    const actor = opts.actor || 'operator';
    const uid = opts.uid || (() => Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

    let c = null, m = null;
    let blocked = null;             // integrity failure description, if any
    let baseline = {};              // collection -> { digest, items }
    let validated = {};             // collection -> digest produced by a validated command

    const version = () => c.state().entries.length;

    /* ---------- low-level: adapter-owned commands, atomic + idempotent ---------- */
    const KIMI_VALIDATORS = {
      'kimi.event': (p) => {
        if (!text(p.event_type) || p.event_type.length > 40) throw adapterError('K_EVENT_TYPE', 'kimi.event needs an event_type (≤ 40 chars).');
        if (!text(p.summary)) throw adapterError('K_EVENT_SUMMARY', 'kimi.event needs a summary.');
        if (['validated', 'legacy'].indexOf(p.provenance) < 0) throw adapterError('K_EVENT_PROV', 'provenance must be validated | legacy.');
      },
      'kimi.annotation': (p) => {
        if (!text(p.text)) throw adapterError('K_ANN_TEXT', 'Annotation text is required.');
        if (!projectEvents().some((e) => e.id === p.target_id)) throw adapterError('K_ANN_TARGET', 'Annotation target ' + p.target_id + ' is not in the ledger.');
      },
      'kimi.legacy_write': (p) => {
        if (TRACKED.indexOf(p.collection) < 0) throw adapterError('K_LW_COLL', 'Unknown collection ' + p.collection + '.');
      },
      'kimi.legacy_import': (p) => {
        if (!text(p.summary)) throw adapterError('K_IMPORT', 'Imported legacy event has no summary.');
      }
    };

    function run(type, payload, cmd_id) {
      if (blocked) throw adapterError('K_BLOCKED', 'Ledger failed verification; writes are blocked. ' + blocked);
      KIMI_VALIDATORS[type](payload);
      return c.transaction(() => c.append(actor, type, payload, cmd_id || 'k-' + uid()));
    }

    function command(type, payload) {
      if (blocked) throw adapterError('K_BLOCKED', 'Ledger failed verification; writes are blocked. ' + blocked);
      return m.command('n-' + uid(), actor, version(), type, payload);
    }

    /* ---------- projection: the Kimi S.events shape, derived from the ledger ---------- */
    function projectEvents() {
      if (!c) return [];
      const list = [], byId = {};
      c.state().entries.forEach((e) => {
        const p = e.payload;
        if (e.command === 'kimi.legacy_import') {
          const ev = { id: p.orig_id, ts: p.orig_ts, type: p.event_type, summary: p.summary, ref: p.ref || '', ann: (p.ann || []).slice(), seq: e.seq, provenance: 'legacy_import', imported_at: e.at };
          list.push(ev); byId[ev.id] = ev;
        } else if (e.command === 'kimi.event') {
          const ev = { id: p.event_id, ts: Date.parse(e.at), type: p.event_type, summary: p.summary, ref: p.ref || '', ann: [], seq: e.seq, provenance: p.provenance };
          list.push(ev); byId[ev.id] = ev;
        } else if (e.command === 'kimi.annotation' && byId[p.target_id]) {
          byId[p.target_id].ann.push({ ts: Date.parse(e.at), text: p.text, seq: e.seq });
        }
      });
      return list;
    }

    function legacyWriteCount() { return c ? c.state().entries.filter((e) => e.command === 'kimi.legacy_write').length : 0; }

    /* ---------- legacy-write detection ---------- */
    function takeBaseline(S) {
      baseline = {};
      TRACKED.forEach((k) => { baseline[k] = { digest: digestCollection(k, S[k]), items: itemDigests(k, S[k]) }; });
    }

    function markValidated(S, collections) {
      collections.forEach((k) => { validated[k] = digestCollection(k, S[k]); });
    }

    function detectLegacyWrites(S) {
      const changes = [];
      TRACKED.forEach((k) => {
        const digest = digestCollection(k, S[k]);
        const base = baseline[k];
        if (base && base.digest === digest) return;
        const items = itemDigests(k, S[k]);
        if (validated[k] === digest) { baseline[k] = { digest, items }; delete validated[k]; return; } // produced by a validated command
        const prev = base ? base.items : {};
        const added = Object.keys(items).filter((i) => !(i in prev));
        const removed = Object.keys(prev).filter((i) => !(i in items));
        const changed = Object.keys(items).filter((i) => i in prev && prev[i] !== items[i]);
        changes.push({ collection: k, added_ids: added, removed_ids: removed, changed_ids: changed, digest });
        baseline[k] = { digest, items };
        delete validated[k];
      });
      changes.forEach((ch) => run('kimi.legacy_write', Object.assign({ provenance: 'legacy_unvalidated' }, ch)));
      return changes;
    }

    /* ---------- boot / persist ---------- */
    function boot(S) {
      blocked = null;
      const raw = storage.getItem(ledgerKey);
      let status;
      if (raw) {
        try {
          c = Ledger.createCase({ id: opts.caseId || 'kimi-case', entries: JSON.parse(raw) });
          status = 'ledger';
        } catch (err) {
          blocked = err.message;
          c = Ledger.createCase({ id: opts.caseId || 'kimi-case' });
          m = Notice.createNoticeModule(c);
          S.events = [];
          takeBaseline(S);
          return { status: 'integrity_failure', message: err.message };
        }
      } else {
        c = Ledger.createCase({ id: opts.caseId || 'kimi-case' });
        const legacy = Array.isArray(S.events) ? S.events : [];
        if (legacy.length) {
          if (storage.getItem(backupKey) == null) storage.setItem(backupKey, storage.getItem(appKey) || JSON.stringify(S));
          c.transaction(() => legacy.forEach((ev) => c.append(actor, 'kimi.legacy_import', {
            orig_id: ev.id, orig_ts: ev.ts, event_type: ev.type, summary: ev.summary || '(no summary)', ref: ev.ref || '', ann: ev.ann || []
          }, 'import-' + ev.id)));
          status = 'migrated';
        } else status = 'fresh';
      }
      m = Notice.createNoticeModule(c);
      S.events = projectEvents();
      takeBaseline(S);
      if (status !== 'ledger') persist(S);
      return { status, version: version(), head: c.verify().head };
    }

    function persist(S) {
      if (blocked) return false;
      detectLegacyWrites(S);
      const snapshot = Object.assign({}, S, { events: [], _ledger: { key: ledgerKey, seq: version(), head: c.verify().head } });
      storage.setItem(ledgerKey, JSON.stringify(c.state().entries));
      storage.setItem(appKey, JSON.stringify(snapshot));
      return true;
    }

    /* ---------- routed actions ---------- */
    // Replaces Kimi's logEvent body. Unmigrated callers are labelled legacy.
    function record(type, summary, ref, o) {
      const provenance = o && o.validated ? 'validated' : 'legacy';
      const event_id = uid();
      run('kimi.event', { event_id, event_type: type, summary: summary, ref: ref == null ? '' : ref, provenance });
      return projectEvents().find((e) => e.id === event_id);
    }

    function annotate(target_id, annText) {
      run('kimi.annotation', { target_id, text: annText });
      return record('annotation', 'Annotation appended to event ' + target_id, target_id, { validated: true });
    }

    // Case-setup dates become unresolved propositions, not clock anchors.
    function setupDate(S, which, date, label) {
      if (!date) return null;
      const prop_id = 'SETUP-' + which + '-' + uid();
      command('proposition.submit', { prop_id, kind: 'fact', text: label + ' entered at case setup: ' + date + ' (no source attached)', source_ids: [] });
      record('clock', label + ' recorded as UNVERIFIED (no source): ' + date, prop_id, { validated: true });
      return prop_id;
    }

    function guardComplete(L) {
      const hasPerson = !!text(L && L.personName);
      const hasQa = !!(L && Array.isArray(L.qa) && L.qa.some((x) => text(x.q)));
      const hasOutcome = !!(L && Array.isArray(L.branches) && L.branches.length);
      if (hasPerson || hasQa || hasOutcome) return { ok: true };
      return { ok: false, reason: 'Nothing was captured (no name, no question, no outcome). Use Abandon to log an attempted contact instead.' };
    }

    function recordOutcomes(L) {
      const typed = [];
      (L.branches || []).forEach((b) => {
        const t = OUTCOME_MAP[b.type];
        if (t) { command('interaction.outcome', { outcome_type: t, interaction_id: L.id, detail: b.summary || '' }); typed.push(t); }
      });
      if ((L.qa || []).some((x) => text(x.q) && text(x.a))) { command('interaction.outcome', { outcome_type: 'completed_interview', interaction_id: L.id, detail: (L.personName || 'unidentified') }); typed.push('completed_interview'); }
      return typed;
    }

    function recordAbandon(L) {
      return command('interaction.outcome', { outcome_type: 'attempt_abandoned', interaction_id: L && L.id, detail: L && L.key ? 'protocol ' + L.key : '' });
    }

    /* ---------- read models ---------- */
    function propositionGate(prop_id) { const p = c && c.state().propositions[prop_id]; return p ? p.gate : null; }

    function resumePacket(S) {
      const st = c.state();
      const v = c.verify();
      const props = Object.values(st.propositions);
      const cps = m.chronologyView().checkpoints;
      return {
        generated_at: new Date().toISOString(),
        case: { operator: S.meta && S.meta.name || null, property: S.meta && S.meta.property || null, unit: S.meta && S.meta.unit || null },
        ledger: { seq: version(), head: v.head || null, verified: !!v.ok, blocked: blocked },
        latest_checkpoint: cps.length ? cps[cps.length - 1] : null,
        unverified_dates: props.filter((p) => /^SETUP-/.test(p.id) && p.gate !== 'passed').map((p) => ({ id: p.id, text: p.text })),
        pending_propositions: props.filter((p) => p.gate === 'imported' || p.gate === 'in_review').map((p) => ({ id: p.id, kind: p.kind, text: p.text, gate: p.gate })),
        open_actions: (S.actions || []).filter((a) => a.status === 'pending').map((a) => a.key).concat((S.nextCustom || []).filter((n) => !n.done).map((n) => n.role)),
        recent_events: projectEvents().slice(-8).map((e) => ({ seq: e.seq, type: e.type, summary: e.summary, provenance: e.provenance })),
        legacy_write_count: legacyWriteCount()
      };
    }

    function resumeText(S) {
      const p = resumePacket(S);
      const L = [];
      L.push('CASEFLOW RESUME PACKET — for case_reasoner /resume');
      L.push('Case: ' + [p.case.property, p.case.unit].filter(Boolean).join(' · ') + (p.case.operator ? ' (operator ' + p.case.operator + ')' : ''));
      L.push('Ledger: seq ' + p.ledger.seq + ' · head ' + (p.ledger.head || '').slice(0, 16) + ' · ' + (p.ledger.verified ? 'VERIFIED' : 'NOT VERIFIED') + (p.ledger.blocked ? ' · BLOCKED: ' + p.ledger.blocked : ''));
      L.push('Latest checkpoint: ' + (p.latest_checkpoint ? p.latest_checkpoint.cp_id + ' → ' + p.latest_checkpoint.resume_location : 'none'));
      L.push('Unverified dates (not facts): ' + (p.unverified_dates.length ? p.unverified_dates.map((d) => d.text).join('; ') : 'none'));
      L.push('Pending propositions: ' + p.pending_propositions.length);
      L.push('Open actions: ' + (p.open_actions.join(', ') || 'none'));
      L.push('Legacy (unvalidated) writes on record: ' + p.legacy_write_count);
      L.push('Recent ledger events:');
      p.recent_events.forEach((e) => L.push('  #' + e.seq + ' [' + e.type + (e.provenance === 'validated' ? '' : ', ' + e.provenance) + '] ' + e.summary));
      return L.join('\n');
    }

    return {
      boot, persist, record, annotate, setupDate, guardComplete, recordOutcomes, recordAbandon, markValidated,
      events: projectEvents, legacyWriteCount, propositionGate, resumePacket, resumeText,
      verify: () => c.verify(), version, get blocked() { return blocked; },
      _case: () => c, _module: () => m
    };
  }

  return { createKimiAdapter, TRACKED, OUTCOME_MAP };
});
