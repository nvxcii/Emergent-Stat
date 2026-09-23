/* ============================ PART 4: LEDGER + REPORT + INIT ============================ */

/* ---------------- ledger ---------------- */
function renderLedger(){
  const evs=[...S.events].sort((a,b)=>b.ts-a.ts);
  document.getElementById('ledgerBody').innerHTML=evs.map(e=>`
    <div class="lev" style="border-left-color:${EV_COLORS[e.type]||'#12325e'}">
      <span class="tp" style="background:${EV_COLORS[e.type]||'#12325e'}">${e.type}</span><span class="ts">${fmtTs(e.ts)}</span>
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
  const e=S.events.find(x=>x.id===id);if(!e)return;
  e.ann=e.ann||[];e.ann.push({ts:Date.now(),text:document.getElementById('ann_text').value});
  logEvent('annotation','Annotation appended to event of '+fmtTs(e.ts));
  save();closeSheet();renderLedger();
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
