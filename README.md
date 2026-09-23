# Emergent-Stat

A utility application that give you the Interactive ability to discover, execute, an record your interaction whether it be a person institution or a single event resulting in a comprehensive report that you can utilize at your leisure

## ExecEvidence — Guided Investigation System

The first application in this repository. A mobile-first, single-page web app that turns an execution plan into a living protocol: it guides each contact, captures the encounter contemporaneously, timestamps everything, links evidence to events, and continuously generates a source-traced report.

**Principle:** Guide → Execute → Capture → Timestamp → Link → Verify → Branch → Escalate → Reconcile → Report. The interface is the protocol.

### Run it

Static files only — no build step, no dependencies, no server code:

- Open `index.html` in a browser, **or**
- Serve the folder (`python3 -m http.server`) and visit it on your phone, **or**
- Enable GitHub Pages on this repo and use the generated URL.

### How it works

1. **Case setup** — operator, unit, property, eviction/move-out date, possession date, notice deadline. These start the four synchronized clocks.
2. **Action cards (A–F)** — each card carries the person's role, where to find them (no personal contact info — counters, windows, and written channels only), the objective, a 30-second briefing, an approach script, authority-specific questions, records to request, available legal reinforcement, evidence to preserve, and context tips.
3. **Live interaction** — tap "Begin Interaction" to start an auto-timestamped session: Q/A capture (exact wording), records requested/received/promised/refused, entities identified, evidence attachments, and nine structured outcome buttons.
4. **Branching** — every answer creates the next node. "I don't know" routes to who-would-know; vendor outcomes create vendor + work-order nodes and a new action card that jumps the queue; refusals are preserved verbatim and open the escalation ladder (each rung lists its prerequisite — a mechanism is never presented as available merely because it exists).
5. **Four clocks** — possession, turnover, property, and notice timelines with automatic conflict flagging (e.g., a property event dated before the possession date).
6. **Chain of possession** — eight nodes, six questions per transition; empty fields are visible gaps, and the gap is your next question.
7. **Execution ledger** — append-only. Corrections are annotations; contradictions are preserved, never overwritten.
8. **Case report** — 14 sections generated continuously from the case model (chronological history, contact ledger, witness matrix, records-request ledger, evidence index, four-clock timeline, chain map, unresolved-question register, contradiction register, refusal/nonresponse log, follow-up schedule, legal-escalation history, and a source-supported factual chronology). Every line links back to its source record. Export as JSON or print/PDF.

### Data storage

All case data lives in your browser's `localStorage` — nothing leaves the device. Clearing browser storage will erase an unsaved case. Use **Export Case (JSON)** in the Report tab regularly as your backup and transfer mechanism.

### File layout

```
index.html      app shell (views + tab bar)
styles.css      main mobile-first stylesheet
print.css       print/PDF layout for the report
js/part1.js     seeded protocol: chain template, clocks, action cards A–F
js/part2.js     outcomes, disposition types, escalation ladder, state store
js/part3.js     dashboard + action card renderer
js/part4.js     live interaction form (auto-timestamp, outcomes, attachments)
js/part5.js     branching engine + legal reinforcement ladder
js/part6.js     escalation logging, interaction completion, clocks, chain
js/part7.js     ledger, report helpers
js/part8.js     14-section report renderer, JSON export, init/resume
```
