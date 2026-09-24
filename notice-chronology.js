/* ============================================================
   Notice Chronology module — the first domain module on the
   shared CaseFlow ledger (caseflow-ledger.js).

   Implements the command table:
     source.register        original notice / supporting record + provenance + content hash
     notice.create          notice record, without presuming claimed contents
     notice.event.record    issuance | service_attempt | posting | mailing | receipt | observation
     proposition.submit     fact | interpretation | deadline with supporting references
     proposition.review     accept | reject | needs_evidence (operator decision)
     deadline.evaluate      candidate date from a legal rule + triggering event — needs TWO approvals
     conflict.record        preserve incompatible accounts, link sources for each
     checkpoint.create      active notice + objective + open questions + resume location

   Every command carries: idempotency ID, actor identity,
   expected case version, and a validation result.
   A rejected command must not partially update the case.
   ============================================================ */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./caseflow-ledger.js'));
  } else {
    global.NoticeChronology = factory(global.CaseFlowLedger);
  }
})(typeof self !== 'undefined' ? self : this, function (Ledger) {
  'use strict';

  /* outcome types: an unanswered call, a refusal, and a completed
     interview are different results — never arbitrary text */
  const OUTCOME_TYPES = [
    'completed_interview', // substantive Q/A captured
    'refusal',             // declined to answer or provide records
    'unanswered_call',     // no contact established
    'voicemail_left',
    'redirected',          // pointed to another department/person
    'records_promised',
    'records_received',
    'no_record_exists',    // custodian asserts nothing exists
    'attempt_abandoned'    // contact attempted, nothing captured — not "unanswered", which is a claim
  ];

  /* Actors named skill:*, assistant:* or system may propose, never decide. */
  function isOperator(actor) {
    return typeof actor === 'string' && actor.length > 0 && !/^(skill|assistant)(:|$)|^system$/.test(actor);
  }

  const NOTICE_EVENT_TYPES = ['issuance', 'service_attempt', 'posting', 'mailing', 'receipt', 'observation'];
  const SENSITIVITY_CLASSES = ['recording', 'witness_detail', 'legal_document', 'financial', 'general'];

  function validationError(code, message, details) {
    const e = new Error(message);
    e.code = code; e.details = details || {}; e.isValidation = true;
    return e;
  }

  function createNoticeModule(caseHandle) {
    const c = caseHandle || Ledger.createCase();
    let notices = {};      // notice_id -> {label, created_seq, events:[]}
    let checkpoints = {};  // cp_id -> checkpoint record
    let retention = {};    // source_id -> {sensitivity, restricted, retention_until}
    let grants = {};       // source_id -> [actor]

    const version = () => c.state().entries.length;

    /* every command funnels through here:
       idempotency, actor, expected version, validation, atomic apply */
    function command(cmd_id, actor, expected_version, type, payload) {
      payload = payload || {};
      // 1. idempotency first: a replayed cmd_id returns the original result,
      //    even if the case has moved on since (safe offline replay).
      //    The same cmd_id with a different command is refused.
      if (cmd_id) {
        const prior = c.byCmdId(cmd_id);
        if (prior) {
          const fp = Ledger.hashOf(JSON.stringify({ command: type, payload: payload }));
          if (prior.fingerprint && prior.fingerprint !== fp) {
            throw validationError('V_IDEMPOTENCY_CONFLICT', 'cmd_id ' + cmd_id + ' was already used for a different command.', { cmd_id: cmd_id });
          }
          return { seq: prior.seq, hash: prior.hash, version: version(), replayed: true };
        }
      }
      // 2. expected case version (optimistic concurrency)
      const v = version();
      if (expected_version != null && expected_version !== v) {
        throw validationError('V_VERSION_MISMATCH',
          'Expected case version ' + expected_version + ' but ledger is at ' + v + '. Rebase and retry.', { expected: expected_version, actual: v });
      }
      if (!VALIDATORS[type]) throw validationError('V_UNKNOWN_COMMAND', 'Unknown command ' + type + '.');
      // 3. command-specific validation — throws before anything is appended
      const enriched = VALIDATORS[type](payload, actor || 'operator');
      // 4. append the command entry plus any system entries it emits, atomically:
      //    if anything throws, the ledger and indexes roll back together.
      const indexSnapshot = JSON.stringify({ notices, checkpoints, retention, grants });
      try {
        return c.transaction(() => {
          const entry = c.append(actor || 'operator', type, enriched, cmd_id);
          EMIT[type] && EMIT[type](enriched, entry);
          INDEX[type] && INDEX[type](enriched, entry);
          return { seq: entry.seq, hash: entry.hash, version: version() };
        });
      } catch (err) {
        const snap = JSON.parse(indexSnapshot);
        notices = snap.notices; checkpoints = snap.checkpoints; retention = snap.retention; grants = snap.grants;
        throw err;
      }
    }

    /* ---------------- validators (reject before append) ---------------- */
    const VALIDATORS = {
      'source.register': (p) => {
        if (!p.source_id) throw validationError('N_SRC_ID', 'source.register requires source_id.');
        if (!p.sha256 || p.sha256.length < 16) throw validationError('N_SRC_HASH', 'source.register requires a content hash (sha256).');
        if (!p.kind) throw validationError('N_SRC_KIND', 'source.register requires a kind.');
        return p;
      },
      'notice.create': (p) => {
        if (!p.notice_id) throw validationError('N_NTC_ID', 'notice.create requires notice_id.');
        if (!p.label) throw validationError('N_NTC_LABEL', 'notice.create requires a label. Contents are NOT presumed accurate.');
        return p;
      },
      'notice.event.record': (p) => {
        if (!p.notice_id || !notices[p.notice_id]) throw validationError('N_NTC_UNKNOWN', 'Unknown notice ' + p.notice_id + '.');
        if (NOTICE_EVENT_TYPES.indexOf(p.type) < 0) throw validationError('N_EVT_TYPE', 'Event type must be one of: ' + NOTICE_EVENT_TYPES.join(', ') + '.');
        if (!p.occurred_at) throw validationError('N_EVT_DATE', 'notice.event.record requires occurred_at.');
        if (!p.source_id) throw validationError('N_EVT_SRC', 'notice.event.record requires a source_id — an event without a source is hearsay, not evidence.');
        const src = c.state().sources[p.source_id];
        if (!src) throw validationError('N_EVT_SRC', 'Source ' + p.source_id + ' not registered.');
        return p;
      },
      'proposition.submit': (p) => {
        if (!p.prop_id) throw validationError('N_PROP_ID', 'proposition.submit requires prop_id.');
        if (!['fact', 'interpretation', 'deadline'].includes(p.kind)) throw validationError('N_PROP_KIND', 'kind must be fact | interpretation | deadline.');
        if (!p.text) throw validationError('N_PROP_TEXT', 'proposition.submit requires text.');
        return p;
      },
      'proposition.review': (p, actor) => {
        if (!isOperator(actor)) throw validationError('N_REVIEW_ROLE', 'Only an operator can review a proposition; ' + actor + ' may only propose.');
        if (!p.prop_id || !c.state().propositions[p.prop_id]) throw validationError('N_PROP_UNKNOWN', 'Unknown proposition ' + p.prop_id + '.');
        if (!['accept', 'reject', 'needs_evidence'].includes(p.decision)) throw validationError('N_REVIEW_DECISION', 'decision must be accept | reject | needs_evidence.');
        return p;
      },
      'deadline.evaluate': (p) => {
        if (!p.deadline_id) throw validationError('N_DL_ID', 'deadline.evaluate requires deadline_id.');
        if (!p.rule_cite) throw validationError('N_DL_RULE', 'deadline.evaluate requires rule_cite (the legal rule).');
        if (!p.trigger_event_id) throw validationError('N_DL_TRIG', 'deadline.evaluate requires trigger_event_id.');
        if (!p.candidate_date) throw validationError('N_DL_DATE', 'deadline.evaluate requires candidate_date.');
        // Approvals cannot ride along on the evaluation. Each is its own
        // operator decision (deadline.approve), so one command can never
        // self-certify both the rule and the triggering event.
        if ('rule_verified' in p || 'trigger_verified' in p) {
          throw validationError('N_DL_SELF_CERT', 'deadline.evaluate cannot carry rule_verified/trigger_verified. Record each approval separately with deadline.approve.');
        }
        return p;
      },
      'deadline.approve': (p, actor) => {
        if (!isOperator(actor)) throw validationError('N_DL_APPROVE_ROLE', 'Only an operator can approve a deadline element; ' + actor + ' may only propose.');
        const prop = c.state().propositions[p.deadline_id];
        if (!prop || prop.type !== 'deadline_eval') throw validationError('N_DL_UNKNOWN', 'Unknown deadline ' + p.deadline_id + '.');
        if (['rule', 'trigger'].indexOf(p.approval) < 0) throw validationError('N_DL_APPROVAL', 'approval must be rule | trigger.');
        if (!p.basis || !String(p.basis).trim()) throw validationError('N_DL_BASIS', 'deadline.approve requires basis: why the rule applies, or what verifies the triggering event.');
        const key = p.approval === 'rule' ? 'rule_verified' : 'trigger_verified';
        if (prop.approvals && prop.approvals[key] === true) throw validationError('N_DL_DUP_APPROVAL', 'The ' + p.approval + ' approval is already recorded for ' + p.deadline_id + '.');
        return p;
      },
      'conflict.record': (p) => {
        if (!p.conflict_id) throw validationError('N_CF_ID', 'conflict.record requires conflict_id.');
        if (!p.account_a || !p.account_b) throw validationError('N_CF_ACCOUNTS', 'conflict.record requires account_a and account_b.');
        if (!p.account_a.source_ids || !p.account_a.source_ids.length) throw validationError('N_CF_SRC_A', 'account_a must link at least one source.');
        if (!p.account_b.source_ids || !p.account_b.source_ids.length) throw validationError('N_CF_SRC_B', 'account_b must link at least one source.');
        return p;
      },
      'checkpoint.create': (p) => {
        if (!p.cp_id) throw validationError('N_CP_ID', 'checkpoint.create requires cp_id.');
        if (!p.resume_location) throw validationError('N_CP_RESUME', 'checkpoint.create requires resume_location.');
        return p;
      },
      /* retention & access — append-only does not mean unrestricted forever */
      'retention.set': (p, actor) => {
        if (!isOperator(actor)) throw validationError('N_ACCESS_ROLE', 'Only an operator can change retention or access.');
        if (!p.source_id) throw validationError('N_RT_SRC', 'retention.set requires source_id.');
        if (SENSITIVITY_CLASSES.indexOf(p.sensitivity) < 0) throw validationError('N_RT_CLASS', 'sensitivity must be one of: ' + SENSITIVITY_CLASSES.join(', ') + '.');
        return p;
      },
      'access.grant': (p, actor) => {
        if (!isOperator(actor)) throw validationError('N_ACCESS_ROLE', 'Only an operator can change retention or access.');
        if (!p.source_id) throw validationError('N_AC_SRC', 'access.grant requires source_id.');
        if (!p.actor) throw validationError('N_AC_ACTOR', 'access.grant requires actor.');
        return p;
      },
      /* typed outcomes on interactions */
      'interaction.outcome': (p) => {
        if (OUTCOME_TYPES.indexOf(p.outcome_type) < 0) {
          throw validationError('N_OUTCOME_TYPE', 'outcome_type must be one of: ' + OUTCOME_TYPES.join(', ') + ' — outcomes are typed, never arbitrary text.');
        }
        return p;
      }
    };

    /* ---------------- post-apply ----------------
       EMIT  appends system entries (runs once, inside the command's transaction).
       INDEX maintains in-memory maps and is pure over ledger entries, so it
       is replayed on construction: reopening the app rebuilds notices,
       checkpoints, retention and grants from the ledger alone. */
    const EMIT = {
      'source.register': (p, entry) => {
        c.append('system', 'source_register', {
          id: p.source_id, kind: p.kind, sha256: p.sha256,
          blob_url: p.blob_url || null, captured_at: p.captured_at || entry.at,
          captured_by: entry.actor, provenance: p.provenance || null
        }, null);
      },
      'proposition.submit': (p) => {
        c.append('system', 'proposition_add', {
          id: p.prop_id, text: p.text, kind: p.kind, state: 'unresolved',
          gate: 'imported', origin: 'operator', source_ids: p.source_ids || []
        }, null);
      },
      'proposition.review': (p) => {
        const prop = c.state().propositions[p.prop_id];
        if (prop) c.append('system', 'proposition_update', { id: p.prop_id, changes: { gate: p.decision === 'accept' ? 'passed' : (p.decision === 'reject' ? 'rejected' : 'in_review') } }, null);
      },
      'deadline.evaluate': (p) => {
        c.append('system', 'proposition_add', {
          id: p.deadline_id, text: 'Deadline ' + p.candidate_date + ' under ' + p.rule_cite,
          kind: 'deadline', type: 'deadline_eval', gate: 'imported', state: 'unresolved',
          origin: 'operator',
          approvals: { rule_verified: false, trigger_verified: false, rule_cite: p.rule_cite, trigger_event_id: p.trigger_event_id, rule_approval_seq: null, trigger_approval_seq: null }
        }, null);
      },
      'deadline.approve': (p, entry) => {
        const prop = c.state().propositions[p.deadline_id];
        const approvals = Object.assign({}, prop.approvals);
        if (p.approval === 'rule') { approvals.rule_verified = true; approvals.rule_approval_seq = entry.seq; approvals.rule_basis = p.basis; }
        else { approvals.trigger_verified = true; approvals.trigger_approval_seq = entry.seq; approvals.trigger_basis = p.basis; }
        const both = approvals.rule_verified === true && approvals.trigger_verified === true;
        c.append('system', 'proposition_update', { id: p.deadline_id, changes: { approvals: approvals, gate: both ? 'passed' : 'imported', state: both ? 'documented' : 'unresolved' } }, null);
      },
      'conflict.record': (p) => {
        [p.account_a, p.account_b].forEach((acct, i) => {
          c.append('system', 'proposition_add', {
            id: p.conflict_id + '-account-' + (i + 1), text: acct.text, kind: 'fact',
            state: 'documented', gate: 'imported', origin: 'operator',
            conflict_of: p.conflict_id, source_ids: acct.source_ids
          }, null);
        });
      }
    };

    const INDEX = {
      'source.register': (p) => {
        retention[p.source_id] = retention[p.source_id] || { sensitivity: 'general', restricted: false };
      },
      'notice.create': (p, entry) => {
        notices[p.notice_id] = { label: p.label, created_seq: entry.seq, events: [] };
      },
      'notice.event.record': (p, entry) => {
        notices[p.notice_id].events.push({ event_id: p.event_id, type: p.type, occurred_at: p.occurred_at, source_id: p.source_id, seq: entry.seq });
      },
      'checkpoint.create': (p, entry) => {
        const activeNotice = p.notice_id && notices[p.notice_id] ? notices[p.notice_id] : null;
        checkpoints[p.cp_id] = {
          cp_id: p.cp_id, at: entry.at, actor: entry.actor, case_version: entry.seq,
          notice: activeNotice ? { notice_id: p.notice_id, label: activeNotice.label, events: activeNotice.events.slice() } : null,
          objective: p.objective || null,
          open_questions: p.open_questions || [],
          resume_location: p.resume_location,
          head_hash: entry.hash
        };
      },
      'retention.set': (p) => {
        retention[p.source_id] = {
          sensitivity: p.sensitivity,
          restricted: p.restricted !== false,
          retention_until: p.retention_until || null,
          note: p.note || null
        };
      },
      'access.grant': (p) => {
        (grants[p.source_id] = grants[p.source_id] || []).push(p.actor);
      }
    };

    // Rebuild derived maps from whatever the ledger already holds (rehydrated case).
    c.state().entries.forEach((e) => { if (INDEX[e.command]) INDEX[e.command](e.payload, e); });

    /* ---------------- reads ---------------- */
    function visibleSources(actor) {
      const st = c.state();
      const out = {};
      Object.keys(st.sources).forEach((sid) => {
        const rt = retention[sid] || { restricted: false };
        if (!rt.restricted || (grants[sid] || []).includes(actor)) out[sid] = st.sources[sid];
        else out[sid] = { id: sid, restricted: true, sensitivity: rt.sensitivity, sha256: st.sources[sid].sha256 };
      });
      return out;
    }

    function deadlineStatus(deadline_id) {
      const prop = c.state().propositions[deadline_id];
      if (!prop || !prop.approvals) return null;
      const a = prop.approvals;
      return {
        gate: prop.gate,
        rule_verified: a.rule_verified, trigger_verified: a.trigger_verified,
        sufficient: a.rule_verified === true && a.trigger_verified === true,
        note: a.rule_verified !== true
          ? 'Rule applicability unverified — a scanned document alone satisfies neither approval.'
          : (a.trigger_verified !== true ? 'Trigger event unverified.' : 'Both approvals recorded.')
      };
    }

    function noticeTimeline(notice_id) {
      const n = notices[notice_id];
      if (!n) return null;
      return { notice_id, label: n.label, events: n.events.slice().sort((a, b) => a.occurred_at < b.occurred_at ? -1 : 1) };
    }

    function restoreCheckpoint(cp_id) {
      const cp = checkpoints[cp_id];
      if (!cp) throw validationError('N_CP_UNKNOWN', 'Unknown checkpoint ' + cp_id + '.');
      return { resume_location: cp.resume_location, objective: cp.objective, open_questions: cp.open_questions.slice(), case_version: cp.case_version, notice: cp.notice };
    }

    function chronologyView() {
      const st = c.state();
      const deadlines = Object.values(st.propositions).filter((p) => p.type === 'deadline_eval');
      const conflicts = Object.values(st.propositions).filter((p) => p.conflict_of).reduce((acc, p) => {
        (acc[p.conflict_of] = acc[p.conflict_of] || []).push(p); return acc;
      }, {});
      return {
        notices: Object.keys(notices).map(noticeTimeline),
        deadlines: deadlines.map((d) => ({ id: d.id, text: d.text, gate: d.gate, approvals: d.approvals })),
        conflicts,
        checkpoints: Object.keys(checkpoints).map((k) => ({ cp_id: k, at: checkpoints[k].at, case_version: checkpoints[k].case_version, resume_location: checkpoints[k].resume_location })),
        version: version()
      };
    }

    return {
      command, chronologyView, noticeTimeline, restoreCheckpoint, visibleSources, deadlineStatus,
      OUTCOME_TYPES, NOTICE_EVENT_TYPES, constants: { OUTCOME_TYPES, NOTICE_EVENT_TYPES, SENSITIVITY_CLASSES },
      _case: c,
      get _notices() { return notices; }, get _checkpoints() { return checkpoints; }, get _retention() { return retention; }
    };
  }

  return { createNoticeModule, isOperator, OUTCOME_TYPES, NOTICE_EVENT_TYPES, SENSITIVITY_CLASSES };
});
