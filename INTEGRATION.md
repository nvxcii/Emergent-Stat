# Kimi V4 compatibility adapter: integration notes

## What this solves

Before this change, the app kept two histories: Kimi's `logEvent()` pushed into `S.events` and saved it to localStorage, while the CaseFlow ledger kept its own validated history. After this change there is **one history**, stored durably in IndexedDB.

- `S.events` is no longer stored directly. It is rebuilt from the ledger every time the app boots and after every write.
- Four previously-direct writers — adding a person, adding a clock entry, editing a chain cell, recording an escalation — now go through validated commands instead of being labelled as legacy.
- Anything still not migrated is recorded as a labelled `kimi.legacy_write`, naming exactly what changed, rather than pretending it has ledger-backed provenance.
- Storage is IndexedDB, offline-tolerant: a write is visible immediately and becomes durable in the background, with automatic retry if the device is offline.
- If another tab, device, or session writes to storage in the meantime, the next write is refused rather than silently overwritten, and the operator explicitly chooses which branch to keep.

## Files

| File | Status |
|---|---|
| `index.html` | Kimi V4 with 21 edits, each tagged `CF-ADAPTER`. See `diffs/index.html.diff`. All six tabs are unchanged. |
| `kimi-adapter.js` | The compatibility layer: event routing, legacy-write detection, the four migrated writers, and multi-writer conflict handling. |
| `idb-storage.js` | New. Offline-tolerant IndexedDB storage with the same `getItem`/`setItem` shape `kimi-adapter.js` already expects. |
| `caseflow-ledger.js` | Patched archive module. See `diffs/caseflow-ledger.js.diff`. |
| `notice-chronology.js` | Patched archive module. See `diffs/notice-chronology.js.diff`. |
| `tests/*.test.js` | Ledger: 22 tests. Notice Chronology: 53. Adapter: 64. Storage: 9. **148 total, all passing.** |
| `tests/fake-idb.js` | A minimal in-memory IndexedDB used only by `idb-storage.test.js`, since this environment has no network access to install a package for it. |

## How actions are routed

| Kimi action | Route | Ledger provenance |
|---|---|---|
| Every `logEvent()` call | `kimi.event` | `legacy`, unless the caller has been migrated |
| Case setup: possession date, claim deadline | `proposition.submit` (fact, ungated); clock entry marked `unverified` | `validated` |
| **Add person** (`addPerson`) | `kimi.person_add` | `validated` |
| **Add clock entry** (`addClock`) | `kimi.clock_entry`; `unverified: true` when there's no source (e.g. manual "+Entry"), `false` when it came from a live interaction | `validated` |
| **Chain cell edit** (inline `onchange`, now `chainSetField`) | `kimi.chain_answer` | `validated` |
| **Escalation** (`logRung`) | `kimi.escalation`, carrying the rung, title, and note | `validated` |
| Complete / abandon interaction | Typed `interaction.outcome` entries; an empty interaction can't be completed | `validated` |
| Annotate | Its own `kimi.annotation` entry; the original entry stays byte-identical | `validated` |
| Any other direct change to `S` (persons via non-`addPerson` paths, nodes, follow-ups, and so on) | `kimi.legacy_write`, naming the added/removed/changed ids | `legacy_unvalidated` |
| Existing `S.events` on first boot | Imported once as `kimi.legacy_import` | `imported history` |

Everything under **Ledger tab** described in the previous release (verification bar, provenance badges, sequence numbers, the resume-packet button) is unchanged.

## New in this pass: migrated writers (B)

Each migrated writer follows the same shape: the adapter records a structured fact, the caller pushes the returned object into `S` as before (so the render functions needed no changes), then calls `CF.markValidated(S, [...])` so `persist()` doesn't also flag it as a legacy write.

```js
// example: addClock, after migration
function addClock(clock,label,date){
  const source=S.live?S.live.id:'';
  const e=CF.recordClockEntry(clock,label,date,source);
  S.clockEntries[clock].push(e);
  CF.markValidated(S,['clockEntries']);
  logEvent('clock', ..., undefined, {validated:true});
}
```

`recordClockEntry` sets `unverified: true` automatically whenever there's no source, the same rule already used for case-setup dates. `meta` (the operator/property/unit fields set in Case Setup) is **not** migrated in this pass — it still shows as a legacy write. That's a reasonable next candidate, not an oversight.

## New in this pass: IndexedDB and multi-writer conflicts (C)

**Storage.** `idb-storage.js` exposes the same synchronous `getItem`/`setItem` shape the adapter already used, on top of an async store:
- `ready()` hydrates an in-memory cache once; after that, `getItem` is instant.
- `setItem` updates the cache immediately (read-your-writes) and queues a durable write; a failed write stays queued and is retried on the next `setItem` or `drain()` call. The app never blocks or throws because the network or disk is unavailable.
- `drain()` resolves once every queued write has landed — call it before anything that needs a durability guarantee (`index.html` calls it on `beforeunload`).

`index.html`'s boot is now `async`: it awaits `CF_STORAGE.ready()`, migrates any old localStorage-based ledger into IndexedDB the first time (so upgrading from the previous release loses nothing), then calls `CF.boot(S)`. Everything that used to run synchronously at script load (the "resume an interrupted interaction" block, the initial `showView`) now runs in a `cfAfterBoot()` callback.

**Conflict detection.** `persist()` now compares what's on disk to what it last read or wrote. If they differ — another tab or device wrote in the meantime — the write is refused and `CF.lastConflict` is populated with both branches. Nothing is picked automatically:

```js
if (CF.persist(S) === false && CF.lastConflict) {
  // show the conflict, let the operator decide:
  const result = CF.resolveConflictKeepRemote(S); // adopt the other branch
  // result.droppedLocalCommands lists exactly what this session's own
  // commands were dropped, so they can be deliberately redone if still wanted
}
// or, to keep this session's branch and overwrite the other:
const result = CF.resolveConflictKeepLocal(S);
// result.overwrittenRemoteCommands lists what was overwritten
```

This mirrors the ledger's own philosophy for `conflict.record`: preserve both accounts, name what would be lost either way, and let a person choose — never silently pick a winner.

## Problems found and fixed (carried over from the previous pass, plus one new one)

1. Deadlines could be self-certified in one command → split into two separate, operator-only `deadline.approve` calls.
2. Commands were not atomic → every module command now runs inside `c.transaction()`.
3. Reopening the app lost notice/checkpoint state → the ledger verifies and replays from storage on rehydration.
4. Reusing a `cmd_id` with a different payload was silently accepted → now refused.
5. Decisions had no role check → `proposition.review`, `deadline.approve`, `retention.set`, `access.grant` refuse non-operator actors.
6. Added the `attempt_abandoned` outcome, distinct from a completed interview or a refusal.
7. **New:** a second writer overwriting the first writer's storage went undetected → `persist()` now compares against the last known on-disk state and refuses to clobber a divergent write.
8. **New (post-merge fix):** `renderChain()` wrote `n.gaps` back into `S.chain` at display time — *after* `chainSetField` had already called `CF.markValidated(S,['chain'])` — so the next unrelated persist re-flagged the chain as a `kimi.legacy_write`, defeating the migrated-writer guarantee. `renderChain` is now display-pure (`const g=6-filled;`). Post-fix browser e2e: setup, then `addPerson` / `addClock` / `chainSetField` / `logRung` in sequence produce **zero** legacy writes; only the documented `meta` write remains.

## Browser verification (headless Chromium)

All scenarios from the previous release still pass, plus:

| Scenario | Result |
|---|---|
| Async boot over a fresh IndexedDB store | `status: fresh`, app renders normally |
| `addPerson`, `addClock`, a chain-cell edit, and `logRung` through the real UI | Each recorded as its own structured, `validated` ledger command; **zero** legacy writes from these four actions |
| An unrelated direct `S` mutation (`S.nodes.push`) | Still correctly caught as a legacy write |
| Close and reopen (real IndexedDB, not just in-memory) | Same head hash, same event projection, persons/chain/escalations all restored |
| Two adapters sharing the same storage, each making an independent change | Second `persist()` refused; `lastConflict` names exactly what's on disk; `resolveConflictKeepRemote` adopts the other branch and reports which local command was dropped; both adapters then have an identical head |
| JavaScript errors | None |

## Git sequence (unchanged from the previous release)

```
git tag v4-baseline main                 # current main, recoverable
git switch -c report-view-9976ef4        # the Report-view change; diff and review, then merge
git switch -c cf-adapter main            # this package: index.html + 4 modules + tests + diffs
```

This archive still doesn't let me confirm that `index.html` corresponds to website version 9976ef4, or that it has been committed anywhere. Verify that separately before tagging.

**Rollback:** restore `execEvidence.v1` from `execEvidence.v1.pre-adapter-backup` (still written on first migration), and revert `index.html`. The IndexedDB database (`execEvidence`) and the old localStorage ledger key can both be left in place; a reverted app ignores them.

## Not done yet

1. **Remaining legacy writers.** `meta` (Case Setup's operator/property/unit fields), `createCustomAction`, and `addProp` are still unmigrated.
2. **Automatic rebase.** Conflict resolution is explicit and operator-driven (by design), not automatic. There's no "replay my dropped commands on top of the adopted branch" helper yet — the dropped commands are only reported.
3. **True multi-device sync.** What exists now detects and surfaces a conflict when both writers share the same storage (e.g. two tabs, or a shared network drive). It does not yet push/pull between genuinely separate devices; that needs the Vercel/Postgres sync layer from the system design.
4. **Deployment.** None of this has been committed to GitHub or deployed to Kimi or Vercel.

## Merge with the Notice Chronology panel (28e1fe1 → this build)

A separate line of work added a Notice Chronology tab directly on top of the *pre-B/C* adapter (before IndexedDB, before the migrated writers, before multi-writer conflict detection). This `index.html` merges both: the Notice panel's HTML/CSS/JS is layered onto the B/C-updated base rather than the base being layered onto the panel, so nothing already fixed gets lost.

**What was confirmed working, driven through the actual UI in headless Chromium (not just unit tests):**
- Source registration with a client-side SHA-256 hash.
- Notice creation, which asserts nothing until a sourced event is added.
- An event naming a non-existent source is refused (`N_EVT_SRC`) — hearsay is structurally blocked, not just discouraged.
- A proposition enters as `imported`; only an explicit operator accept promotes it to `passed`.
- A deadline evaluation carries **zero** approvals. After one approval (rule only) the gate stays insufficient. After both separate, named-operator approvals with a stated basis, it becomes sufficient and `passed`. Approving the same element twice is refused (`N_DL_DUP_APPROVAL`).
- Checkpoint creation and "Restore context" — which states plainly that nothing was rolled back.
- Conflict recording preserves both accounts, each linked to its own sources.
- After merging, all of B (migrated writers) and C (IndexedDB, offline tolerance, multi-writer conflict detection) still work exactly as before: `addPerson`/`addClock` still produce zero legacy writes, and closing and reopening the app reproduces the same ledger head with both the Notice data and the migrated-writer data intact.

**Independently verified, not just taken on trust:**
- The `app-s1.js … app-s6.js` split: concatenating all six files and comparing to the monolith's inline scripts, ignoring only whitespace at the join boundaries, is character-for-character identical, and both parse as valid JavaScript.

**Could not verify from this environment:**
- The GitHub commit hash, PR #5, and "every blob SHA re-verified" claims — this environment has no network access to `github.com`/`api.github.com`, so the repository state itself is outside what I can check.
- The `evireport.kimi.page` share link still serves the static nine-panel infographic template, not the live app — this was already true in earlier turns and is unchanged. In particular, the "Place after appealing (CCP §1174)" wording error flagged previously is still present on that page.

**Not migrated in this build:** `S.meta` (the Case Setup operator/property/unit fields) still writes as a legacy write, exactly as documented above — confirmed still true after the merge, and not something this pass touched.
