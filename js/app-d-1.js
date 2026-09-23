/* ============================ PART 4: LEDGER + REPORT + INIT ============================ */

/* ---------------- ledger ---------------- */
function renderLedger(){
  const evs=[...S.events].sort((a,b)=>b.ts-a.ts);
  /* CF-ADAPTER: integrity status, unvalidated-write count, and a resume packet for case_reasoner */
  const v=CF.verify(),blocked=CF.blocked;
  const bar=`<div class="cf-bar ${blocked||!v.ok?'bad':''}">${blocked?'Stored ledger FAILED verification. Writes are blocked; the stored copy was not modified. '+esc(blocked)
    :'Ledger verified · '+v.entries+' entries · head '+esc((v.head||'').slice(0,12))+' · '+CF.legacyWriteCount()+' unvalidated legacy writes on record'}
    <div style="margin-top:6px"><button class="btn sm ghost" style="padding:4px 9px;font-size:10.5px" onclick="cfCopyResume()">Copy resume packet</button></div></div>`;
  document.getElementById('ledgerBody').innerHTML=bar+evs.map(e=>`
    <div class="lev" style="border-left-color:${EV_COLORS[e.type]||'#12325e'}">
      <span class="tp" style="background:${EV_COLORS[e.type]||'#12325e'}">${e.type}</span><span class="ts">#${e.seq} · ${fmtTs(e.ts)}</span>${cfProv(e)}
      <div style="margin-top:3px">${esc(e.summary)}</div>
      ${(e.ann&&e.ann.length?e.ann.map(a=>`<div class="ann">✎ Annotation ${fmtTs(a.ts)}: ${esc(a.text)}</div>`).join(''):'')}
      <button class="btn sm ghost" style="margin-top:5px;padding:4px 9px;font-size:10.5px" onclick="annotate('${e.id}')">+ Annotate (never overwrites)</button>
    </div>`).join('')||'<div class="emptyrep">No events yet. The ledger fills itself as you execute.</div>';
}
function annotate(id){
  openSheet(`<h3>Annotate Event</h3><div class="why">Annotations append to history. The original entry is never altered or deleted.</div>
    <div class="field"><label>Annotation</label><textarea id="ann_text"></textarea></div>
    <button class="btn" onclick="saveAnn('${id}')">Append Annotation</button>`,true);
}
function saveAnn(id){
  /* CF-ADAPTER (migrated): the annotation is its own ledger entry; the original is untouched */
  try{CF.annotate(id,document.getElementById('ann_text').value);S.events=CF.events();save();closeSheet();renderLedger();}
  catch(err){toast(err.code==='K_ANN_TEXT'?'Annotation is empty':(err.code==='K_BLOCKED'?'Ledger failed verification — not saved':err.message));}
}
function cfProv(e){
  if(e.provenance==='validated')return '<span class="cf-prov cf-valid">validated</span>';
  if(e.provenance==='legacy_import')return '<span class="cf-prov cf-import">imported history</span>';
  return '<span class="cf-prov cf-legacy">legacy write</span>';
}
function cfCopyResume(){
  const t=CF.resumeText(S);
  (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('Resume packet copied — paste it with /resume'),
    ()=>openSheet('<h3>Resume packet</h3><div class="why">Copy this into Claude with /resume.</div><textarea style="width:100%;height:260px;font-size:11px">'+esc(t)+'</textarea>',true));
}

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
