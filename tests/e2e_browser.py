from playwright.sync_api import sync_playwright
import json
import pathlib
URL=pathlib.Path(__file__).resolve().parent.parent.joinpath("index.html").as_uri()
errs=[]
def ev(pg,js): return pg.evaluate(js)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":420,"height":900}); pg=ctx.new_page()
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.on("console",lambda m: errs.append("console:"+m.text) if m.type=="error" else None)
    pg.route("**/fonts.*/**",lambda r:r.abort())
    # ---------- F: seed legacy Kimi data (the observed bug pattern) before first adapter boot
    pg.goto(URL); pg.evaluate("localStorage.clear()")
    legacy={"meta":{"name":"Op","unit":"221","property":"Test Prop","evictDate":"","created":1},
      "actions":[{"key":k,"status":"pending","personName":"","personContact":"","interactions":0} for k in "ABCDEF"],
      "persons":[],"nodes":[],"interactions":[],"attachments":[],
      "events":[{"id":"old1","ts":1700000000000,"type":"clock","summary":"Possession Clock started: 2030-01-01","ref":""},
                {"id":"old2","ts":1700000500000,"type":"interview","summary":"Interview completed: unidentified · 241 min · 0 questions","ref":""}],
      "clockEntries":{"possession":[],"turnover":[],"property":[],"notice":[]},
      "chain":[{"name":"Unit (former apartment)","fields":{},"gaps":6}],
      "followUps":[],"escalations":[],"propositions":[],"clockDates":{"possession":"","noticeDeadline":""},"live":None,"nextCustom":[]}
    pg.evaluate("s=>localStorage.setItem('execEvidence.v1',s)",json.dumps(legacy)); pg.reload()
    print("F boot:", ev(pg,"CF_BOOT.status"), "| events:", ev(pg,"S.events.length"), "| backup kept:", ev(pg,"!!localStorage.getItem('execEvidence.v1.pre-adapter-backup')"))
    print("F provenance:", ev(pg,"S.events.map(e=>e.provenance).join(',')"))
    # ---------- A: case setup through the real saveCase()
    ev(pg,"openCaseSetup()"); pg.fill("#cs_pos","2030-01-10"); pg.fill("#cs_dl","2030-02-01"); ev(pg,"saveCase()")
    print("A clock entries unverified:", ev(pg,"S.clockEntries.possession.map(e=>e.unverified).join(',')"), "| gate:", ev(pg,"CF.propositionGate(S.clockEntries.possession[0].prop_id)"))
    ev(pg,"showView('v-clocks')"); print("A clocks shows UNVERIFIED:", "UNVERIFIED" in pg.inner_text("#clocksBody"))
    lw=ev(pg,"CF._case().state().entries.filter(e=>e.command==='kimi.legacy_write').map(e=>e.payload.collection).join(',')")
    print("A legacy writes from saveCase:", lw)
    # ---------- B: empty interaction cannot complete
    ev(pg,"startInteraction('A')"); n0=ev(pg,"S.events.length")
    ev(pg,"completeInteraction()")
    print("B empty completion refused:", ev(pg,"!!S.live"), "| toast:", pg.inner_text("#toast"))
    ev(pg,"abandonLive()")
    print("B abandon outcome:", ev(pg,"CF._case().state().entries.filter(e=>e.command=='interaction.outcome').map(e=>e.payload.outcome_type).join(',')"))
    # ---------- C: interaction with content
    ev(pg,"startInteraction('B')"); ev(pg,"S.live.personName='J. Doe';S.live.qa=[{q:'Work order?',a:'WO-1'}];S.live.branches=[{type:'refusal',summary:'refused'}]")
    ev(pg,"completeInteraction()")
    print("C completed:", ev(pg,"!S.live"), "| outcomes:", ev(pg,"CF._case().state().entries.filter(e=>e.command=='interaction.outcome').map(e=>e.payload.outcome_type).join(',')"))
    # ---------- D: annotate the imported buggy interview entry
    ev(pg,"annotate('old2')"); pg.fill("#ann_text","Timer left running; nothing captured"); ev(pg,"saveAnn('old2')")
    print("D annotation on imported entry:", ev(pg,"S.events.find(e=>e.id=='old2').ann.map(a=>a.text).join('|')"))
    # ---------- chain edit through Kimi's inline handler (legacy path)
    ev(pg,"showView('v-chain')"); pg.fill(".chainfields input >> nth=0","Crew lead"); pg.press(".chainfields input >> nth=0","Tab")
    ev(pg,"showView('v-ledger')"); pg.screenshot(path="e2e_ledger.png",full_page=True)
    before=ev(pg,"JSON.stringify({head:CF.verify().head,events:S.events,seq:CF.version(),lw:CF.legacyWriteCount()})")
    # ---------- E: reopen
    pg.reload()
    after=ev(pg,"JSON.stringify({head:CF.verify().head,events:S.events,seq:CF.version(),lw:CF.legacyWriteCount()})")
    print("E reopen status:", ev(pg,"CF_BOOT.status"), "| identical:", before==after, "| verified:", ev(pg,"CF.verify().ok"))
    print("E chain edit survived + labelled:", ev(pg,"S.chain[0].fields['Who?']"), ev(pg,"CF._case().state().entries.some(e=>e.command=='kimi.legacy_write'&&e.payload.collection=='chain')"))
    ev(pg,"showView('v-clocks')"); pg.screenshot(path="e2e_clocks.png",full_page=True)
    # ---------- G: tamper
    pg.evaluate("()=>{const L=JSON.parse(localStorage.getItem('caseflow.ledger.v1'));L[1].payload.summary='edited';localStorage.setItem('caseflow.ledger.v1',JSON.stringify(L));}")
    tampered=ev(pg,"localStorage.getItem('caseflow.ledger.v1')")
    pg.reload()
    ev(pg,"logEvent('case','attempted write')")
    print("G status:", ev(pg,"CF_BOOT.status"), "| storage untouched:", ev(pg,"localStorage.getItem('caseflow.ledger.v1')")==tampered)
    ev(pg,"showView('v-ledger')"); print("G ledger bar:", pg.inner_text(".cf-bar")[:90])
    b.close()
print("PAGE ERRORS:", errs)
