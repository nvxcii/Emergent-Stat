
/* ---------------- report ---------------- */
function stPill(s){return `<span class="st st-${s.replace(/ /g,'-')}">${s}</span>`;}
function srcLink(refId){
  if(!refId)return '';
  const i=S.interactions.find(x=>x.id===refId);
  return `<span class="src" onclick="jumpSource('${refId}')">${i?('src: interview '+fmtTs(i.startTs)):'src: event'}</span>`;
}
function jumpSource(id){
  const i=S.interactions.find(x=>x.id===id);
  openSheet(`<h3>Source Record</h3><div class="why">Every report statement traces here.</div>
    ${i?`<div class="sec"><h4>Interview ${fmtTs(i.startTs)}</h4>
      <div class="muted" style="font-size:12px"><b>${esc(i.personName||'unidentified')}</b> ${esc(i.personTitle||'')} · ${esc(i.method||'')} · ${esc(i.location||'')}</div>
      ${i.qa.filter(x=>x.q).map(x=>`<div style="font-size:12px;margin-top:5px"><b>Q:</b> ${esc(x.q)}<br><b>A:</b> ${esc(x.a)}</div>`).join('')}
      ${i.recordsReq?`<div style="font-size:11.5px;margin-top:5px"><b>Records requested:</b> ${esc(i.recordsReq)}</div>`:''}
      ${i.recordsGot?`<div style="font-size:11.5px"><b>Records received:</b> ${esc(i.recordsGot)}</div>`:''}
      ${i.notes?`<div style="font-size:11.5px;margin-top:5px"><b>Notes:</b> ${esc(i.notes)}</div>`:''}
    </div>`:'<div class="muted">Source event not found.</div>'}
    <button class="btn ghost" onclick="closeSheet()">Close</button>`,true);
}
function repSec(title,rows){
  return `<div class="repsec"><h3>${title}<span class="cnt">${rows.length} item${rows.length===1?'':'s'}</span></h3>
    ${rows.length?rows.join(''):'<div class="muted" style="font-size:11.5px">Nothing recorded yet.</div>'}</div>`;
}
function renderReport(){
  const evs=[...S.events].sort((a,b)=>a.ts-b.ts);
  const inter=[...S.interactions].sort((a,b)=>a.startTs-b.startTs);

  /* chronological execution history */
  const chrono=evs.map(e=>`<div class="repline"><span class="ts">${fmtTs(e.ts)}</span> ${esc(e.summary)}</div>`);

  /* contact ledger */
  const contacts=inter.map(i=>`<div class="repline"><b>${esc(i.personName||'unidentified')}</b> ${esc(i.personTitle||'')} · ${fmtTs(i.startTs)} · ${esc(i.method||'')} · ${esc(i.location||'')} ${srcLink(i.id)}</div>`);

  /* witness matrix */
  const wit=S.persons.map(p=>`<div class="repline"><b>${esc(p.name)}</b> — ${esc(p.role)} · identified ${fmtTs(p.ts)} · ${S.interactions.some(i=>i.personName===p.name)?'interviewed':'not yet interviewed'}</div>`);

  /* records-request ledger */
  const rr=inter.filter(i=>i.recordsReq||i.recordsGot||i.recordsProm||i.recordsRef).map(i=>`<div class="repline">${srcLink(i.id)} <b>Requested:</b> ${esc(i.recordsReq||'—')}<br><b>Received:</b> ${esc(i.recordsGot||'—')} · <b>Promised:</b> ${esc(i.recordsProm||'—')} · <b>Refused:</b> ${esc(i.recordsRef||'—')}</div>`);
  S.events.filter(e=>e.type==='nonexist').forEach(e=>rr.push(`<div class="repline">${stPill('UNEXPLAINED')} Record Nonexistence asserted — ${esc(e.summary)}</div>`));

  /* evidence index */
  const evIdx=S.attachments.map(a=>{const i=S.interactions.find(x=>x.id===a.ref);
    return `<div class="repline"><b>${esc(a.name)}</b> · ${Math.round(a.size/1024)}KB · attached ${fmtTs(a.ts)} · re: ${i?('interview with '+esc(i.personName||'unidentified')+' '+fmtTs(i.startTs)):'case'}</div>`;});

  /* four-clock timeline */
  const clockRows=Object.entries(CLOCKS).flatMap(([k,c])=>[...S.clockEntries[k]].sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(e=>`<div class="repline"><span class="pill" style="background:${c.color};color:#fff">${c.name.replace(' Clock','')}</span> ${esc(e.label)} — ${esc(e.date||'undated')} · logged ${fmtTs(e.ts)}</div>`));
  const conf=computeConflicts();
  conf.forEach(c=>clockRows.push(`<div class="repline">${stPill('CONTRADICTED')} <b>Clock conflict:</b> ${esc(c.label)} — ${esc(c.why)}</div>`));

  /* chain map */
  const chainRows=S.chain.map((n,i)=>{const g=6-Object.values(n.fields).filter(v=>v&&v.trim()).length;
    return `<div class="repline"><b>${i+1}. ${esc(n.name)}</b> — ${g===0?'complete':g+' unanswered question'+(g>1?'s':'')}${g?': '+SIX_Q.filter(q=>!n.fields[q]).map(q=>esc(q)).join(', '):''}</div>`;});

  /* unresolved-question register */
  const unr=[];
  S.chain.forEach((n,i)=>SIX_Q.forEach(q=>{if(!n.fields[q]||!String(n.fields[q]).trim())unr.push(`<div class="repline"><b>${esc(n.name)}:</b> ${esc(q)}</div>`);}));
  S.propositions.filter(p=>p.status==='UNEXPLAINED'||p.status==='PENDING').forEach(p=>unr.push(`<div class="repline">${stPill(p.status)} ${esc(p.text)} ${srcLink(p.sources[0])}</div>`));
  S.events.filter(e=>e.type==='nonexist').forEach(e=>unr.push(`<div class="repline">${stPill('UNRESOLVED')} ${esc(e.summary)} — obtain written confirmation</div>`));

  /* contradiction register */
  const contra=S.propositions.filter(p=>p.status==='CONTRADICTED').map(p=>`<div class="repline">${stPill('CONTRADICTED')} ${esc(p.text)} ${srcLink(p.sources[0])}<div class="muted" style="font-size:11px;margin-top:2px">Both accounts preserved in the ledger. Neither was overwritten.</div></div>`);
  computeConflicts().forEach(c=>contra.push(`<div class="repline">${stPill('CONTRADICTED')} ${esc(c.label)} — ${esc(c.why)}</div>`));

  /* refusal / nonresponse log */
  const refRows=S.events.filter(e=>e.type==='refusal').map(e=>`<div class="repline">${stPill('DOCUMENTED')} ${esc(e.summary)}</div>`);
  S.followUps.filter(f=>f.status==='open').forEach(f=>refRows.push(`<div class="repline">${stPill('PENDING')} Nonresponse / open follow-up: ${esc(f.desc)} (due ${esc(f.due)})</div>`));

  /* follow-up schedule */
  const fu=S.followUps.map(f=>`<div class="repline">${f.status==='open'?stPill('PENDING'):stPill('DOCUMENTED')} ${esc(f.desc)} — due ${esc(f.due||'unset')} · created ${fmtTs(f.ts)}</div>`);

  /* escalation history */
  const escHist=S.escalations.map((e,i)=>`<div class="repline"><b>Rung ${e.rung+1}: ${esc(e.title)}</b> · ${fmtTs(e.ts)}${e.note?' — '+esc(e.note):''}<div class="muted" style="font-size:11px">Prerequisite: ${esc(e.pre)} · Next: ${esc(e.next)}</div></div>`);

  /* source-supported factual chronology */
  const facts=S.propositions.map(p=>`<div class="repline">${stPill(p.status)} ${esc(p.text)} ${srcLink(p.sources[0])}</div>`);

  /* category banner rows for the distinction requirement */
  const catNote=(txt)=>`<div class="repline" style="background:#f6f8fb;border-radius:6px;padding:7px 9px;font-size:11px;color:#42536a">${txt}</div>`;

  document.getElementById('reportBody').innerHTML=
    repSec('1 · Case Summary',[
      `<div class="repline"><b>Operator:</b> ${esc(S.meta.name||'—')} · <b>Unit:</b> ${esc(S.meta.unit||'—')} · <b>Property:</b> ${esc(S.meta.property||'—')}</div>`,
      `<div class="repline"><b>Eviction / move-out:</b> ${esc(S.meta.evictDate||'—')} · <b>Possession date:</b> ${esc(S.clockDates.possession||'—')} · <b>Notice claim deadline:</b> ${esc(S.clockDates.noticeDeadline||'—')}</div>`,
      `<div class="repline"><b>Report generated:</b> ${fmtTs(Date.now())} — continuously built from the case model, not reconstructed after the fact.</div>`])
    +repSec('2 · Chronological Execution History',chrono)
    +repSec('3 · Contact Ledger',contacts)
    +repSec('4 · Witness Matrix',wit)
    +repSec('5 · Records-Request Ledger',rr)
    +repSec('6 · Evidence Index',evIdx)
    +repSec('7 · Four-Clock Timeline',clockRows)
    +repSec('8 · Property Chain-of-Possession Map',chainRows)
    +repSec('9 · Unresolved-Question Register',unr)
    +repSec('10 · Contradiction Register',contra)
    +repSec('11 · Refusal / Nonresponse Log',refRows)
    +repSec('12 · Follow-Up Schedule',fu)
    +repSec('13 · Legal-Escalation History',escHist)
    +repSec('14 · Source-Supported Factual Chronology',
      [catNote('Status key — DOCUMENTED: record exists · CORROBORATED: multiple sources · CONTRADICTED: preserved conflict · UNEXPLAINED: no record · PENDING: verification outstanding · RECOLLECTION: user memory, uncorroborated · ALLEGATION: assertion, unproven · INTERPRETATION: user inference · LEGAL: legal conclusion for counsel · UNRESOLVED: open question.')]
      .concat(facts));
}

/* ---------------- renderers registry + init ---------------- */
const renderers={'v-dash':renderDash,'v-actions':renderActions,'v-clocks':renderClocks,'v-notice':renderNotice,'v-chain':renderChain,'v-ledger':renderLedger,'v-report':renderReport};
/* CF-ADAPTER: everything below ran synchronously at parse time before storage was
   async; it now runs once cfInit() has hydrated storage, booted the ledger, and
   restored S from the last saved snapshot. */
function cfAfterBoot(){
  if(S.live && !S.live.endTs){
    document.getElementById('liveMeta').textContent=nodeLabel(S.live.key)+' · '+fmtTs(S.live.startTs)+' (resumed)';
    document.getElementById('livePill').classList.add('on');
    clearInterval(tick);tick=setInterval(()=>{
      const s=Math.floor((Date.now()-S.live.startTs)/1000);
      document.getElementById('timer').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
    },500);
    renderLiveForm();
    renderDash();
    showView('v-live');
  } else { showView('v-dash'); }
  /* CF-ADAPTER: surface a failed ledger verification or an unresolved multi-writer conflict immediately */
  if(CF_BOOT.status==='integrity_failure'){toast('Stored ledger failed verification — writes blocked. See Ledger tab.');}
  if(CF.lastConflict){toast('This case changed on another device — resolve it on the Ledger tab before continuing.');}
  window.addEventListener('beforeunload',()=>{CF_STORAGE.drain();});
}
cfInit().then(cfAfterBoot);
