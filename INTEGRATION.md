# Kimi V4 compatibility adapter: integration notes

## What this solves

Before this change, the app kept two histories:

- Kimi's `logEvent()` pushed into `S.events` and saved it to localStorage.
- The CaseFlow ledger kept its own validated history.

After this change there is **one history**.

- `S.events` is no longer stored. It is rebuilt from the ledger every time the app boots and after every write.
- The app key (`execEvidence.v1`) still holds the rest of `S`, but with `events: []` and a `_ledger` pointer to the ledger's head.

## Files

| File | Status |
|---|---|
| `index.html` | Kimi V4 with 15 edits, each tagged `CF-ADAPTER`. See `diffs/index.html.diff`. The layout and all six tabs are unchanged. |
| `kimi-adapter.js` | New. The compatibility layer. |
| `caseflow-ledger.js` | Patched archive module. See `diffs/caseflow-ledger.js.diff`. |
| `notice-chronology.js` | Patched archive module. See `diffs/notice-chronology.js.diff`. |
| `tests/*.test.js` | Ledger: 22 tests. Notice Chronology: 53 tests (38 original, some updated, plus new ones). Adapter: 38 tests. All pass. |
| `tests/e2e_browser.py` | Playwright script that drives the real `index.html` in headless Chromium. |

## How actions are routed

| Kimi action | Route | Ledger provenance |
|---|---|---|
| Every `logEvent()` call | `kimi.event` | `legacy`, unless the caller has been migrated |
| Case setup: possession date and claim deadline | `proposition.submit` (fact, ungated). The clock entry is marked `unverified`. | `validated` |
| Complete interaction | Refused if no person, no question, and no outcome was captured. Otherwise records typed `interaction.outcome` entries. | `validated` |
| Abandon interaction | `interaction.outcome: attempt_abandoned` | `validated` |
| Annotate | Its own `kimi.annotation` entry. The original entry stays byte-identical. | `validated` |
| Any other direct change to `S`: persons, nodes, chain cells, clock entries, follow-ups, escalations, and so on | On `save()`, each changed collection gets one `kimi.legacy_write` entry listing the added, removed, and changed ids | `legacy_unvalidated` |
| Existing `S.events` on first boot | Imported once as `kimi.legacy_import`, keeping the original ids, timestamps, and annotations | `imported history` |

**Outcome typing.** Only exact equivalents are mapped: refusal, no record, and department or vendor redirect. "I don't know," "Cooperative," "Cannot release," and "Disposed" remain untyped Kimi events rather than being forced into a category.

**What the Ledger tab now shows:**
- a verification bar with head hash and entry count;
- the number of unvalidated legacy writes on record;
- a provenance badge and sequence number on every event;
- a **Copy resume packet** button. It produces a text packet for `case_reasoner` `/resume`: ledger head and verification status, latest checkpoint, unverified dates, pending propositions, open actions, and recent events with their provenance.

**What the Clocks tab now shows:** dates entered at setup are labelled **UNVERIFIED — not an anchor**. Conflict flags computed from an unverified possession date are prefixed **PROVISIONAL**.

## Problems found in the archive modules and fixed here

1. **Deadline approvals could be self-certified.**
   - `deadline.evaluate` accepted `rule_verified: true` and `trigger_verified: true` from the caller, so one command, from any actor including a skill, could pass the gate.
   - Now `deadline.evaluate` refuses those fields (`N_DL_SELF_CERT`).
   - Each approval is a separate, operator-only `deadline.approve` command with a stated basis. Each lands as its own ledger entry, and the same approval can't be counted twice.
   - Archive tests [6] and [11] relied on the old behaviour and were updated. See `diffs/notice-chronology.test.js.diff`.
2. **Commands were not atomic.**
   - A single command appended the command entry plus system entries through separate calls, with no rollback.
   - Now the ledger has `transaction()`, and every module command runs inside it along with its index updates.
   - Test [12] injects a failure partway through a command and confirms that the ledger and indexes are unchanged afterwards.
3. **Reopening the app lost state.**
   - The ledger could not be rehydrated. The notice, checkpoint, retention, and grant maps lived only in memory, and `cmd_id`s weren't stored on entries, so duplicate replays went undetected after reload.
   - Now `createCase({entries})` verifies the stored chain before loading it, `cmd_id` is persisted on each entry, and the module rebuilds its maps by replaying the ledger.
   - Test [13] and adapter test [7] check that a reopened app has the same head hash, the same projection, the same checkpoint, and the same retention.
4. **Reusing a `cmd_id` silently absorbed a different payload.** It is now refused with `V_IDEMPOTENCY_CONFLICT` or `L_IDEMPOTENCY_CONFLICT`. Archive test [1] replayed with a changed payload and was updated.
5. **Decisions had no role check.** `proposition.review`, `deadline.approve`, `retention.set`, and `access.grant` now refuse actors named `skill:*`, `assistant:*`, or `system`.
6. **Added the `attempt_abandoned` outcome.** Logging an abandoned attempt as `unanswered_call` would assert something nobody observed.

The hash formula is unchanged, so ledgers written by the archive version still verify. `cmd_id` and `fingerprint` are stored outside the hashed body. The consequence is that they are not tamper-evident; everything inside the body is.

## Kimi V4 bug found during integration

The page-load "resume an interrupted live interaction" block had been pasted inside `completeInteraction()`. Because `S.live` is always null at that point, it always took the `else` branch (`showView('v-dash')`). I replaced it with the equivalent two calls, so behaviour is identical. The real load-time resume block at the bottom of the page is untouched.

## Browser verification (headless Chromium, patched `index.html`)

| Scenario | Result |
|---|---|
| First boot over existing V4 data containing the 241-minute / 0-question entry | Imported once, labelled as imported history; untouched backup saved to `execEvidence.v1.pre-adapter-backup` |
| Case setup with possession date and claim deadline | Stored as ungated propositions; shown as UNVERIFIED on Clocks |
| Completing an empty interaction | Refused with a message; abandoning it records `attempt_abandoned` |
| Completing an interaction with content | Typed outcomes `refusal` and `completed_interview` recorded |
| Annotating the imported bad entry | Appended; original unchanged |
| Editing a chain cell through Kimi's own inline handler | Survives reload and is labelled as a legacy write |
| Close and reopen | Same head hash, same event projection, chain verifies |
| Tampered ledger in storage | Boot reports integrity failure, writes are blocked, and the stored copy is not modified |
| JavaScript errors | None across all scenarios |

## Git sequence (for the step "preserve current state first")

```
git tag v4-baseline main                 # current main, recoverable
git switch -c report-view-9976ef4        # the Report-view change; diff and review, then merge
git switch -c cf-adapter main            # this package: index.html + 3 modules + tests + diffs
```

This archive does not let me confirm that `index.html` corresponds to website version 9976ef4, or that it has been committed anywhere. Verify that with `git log` or the Kimi version history before tagging.

**Rollback:**
1. Restore `execEvidence.v1` from `execEvidence.v1.pre-adapter-backup`.
2. Revert `index.html`.

The ledger key can remain in storage; the old app ignores it.

## Not done yet (next steps, in order)

1. **Notice Chronology panel.** The module is live and its commands persist, but there is no UI for `notice.create`, `notice.event.record`, `deadline.evaluate`, or `deadline.approve` yet. The Clocks and Today views should read notice data from `chronologyView()`.
2. **Migrate the remaining legacy writers** one at a time: `addPerson`, `createCustomAction`, `addClock`, chain cell edits, the escalation ladder, and `addProp`. Each migrated writer will stop appearing as a legacy write.
3. **Storage limits.** The ledger lives in localStorage, which has roughly a 5 MB quota. Attachments with data URLs were already stored in `S` before this change. Move to IndexedDB before real evidence volume arrives.
4. **Offline rebase and multi-device sync.** Not started. Idempotent replay and stale-version refusal are in place and tested; rebasing offline commands onto a newer version is not.
5. **Deployment.** None of this has been committed to GitHub or deployed to Kimi or Vercel.
