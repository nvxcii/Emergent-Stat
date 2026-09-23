/* ============================ PART 2: EXECUTION ENGINE ============================ */

/* ---------------- dashboard ---------------- */
function renderDash(){
  const has=!!(S.meta.name||S.meta.property);
  document.getElementById('dashNoCase').style.display=has?'none':'block';
  document.getElementById('dashBody').style.display=has?'block':'none';
  document.getElementById('caseName').textContent=S.meta.name||'Untitled Case';
  document.getElementById('caseSub').textContent=[S.meta.property,S.meta.unit].filter(Boolean).join(' · ')||'No property set';
  if(!has)return;

  const pend=S.actions.filter(a=>a.status==='pending');
  const done=S.actions.filter(a=>a.status==='done').length;
  const customOpen=S.nextCustom.filter(n=>!n.done);
  document.getElementById('stDone').textContent=done;
  document.getElementById('stOpen').textContent=pend.length+customOpen.length;
  document.getElementById('stEvents').textContent=S.events.length;
  document.getElementById('stPeople').textContent=S.persons.length;

  // next action
  const na=document.getElementById('nextAction');
  let target=customOpen[0]||pend[0];
  if(!target){na.innerHTML='<div class="k">INVESTIGATION</div><h3>All protocol steps complete</h3><p>Unresolved branches, follow-ups, and escalation remain below. Keep logging until every clock aligns.</p>';}
  else{
    const isCustom=!PROTOCOL.some(p=>p.key===target.key);
    const roleName=isCustom?target.role:(PROTOCOL.find(p=>p.key===target.key)?.role||target.key);
    na.innerHTML=`<div class="k">NEXT RECOMMENDED ACTION</div><h3>${esc(roleName)}</h3>
    <p>${isCustom?'Created by evidence during the investigation.':'Protocol step '+target.key+' of A–F.'} ${esc(target.where||'')}</p>
    <button class="btn" style="background:#ffd166;color:var(--navy-deep)" onclick="event.stopPropagation();openAction('${target.key}','${isCustom?target.id:''}')">Open Action Card →</button>`;
  }
  // progress
  const total=S.actions.length+S.nextCustom.length||1;
  document.getElementById('progBar').style.width=Math.round(100*(done+S.nextCustom.filter(n=>n.done).length)/total)+'%';

  // unresolved branches
  const conf=computeConflicts();
  const overdue=S.followUps.filter(f=>f.status==='open'&&f.due&&f.due<new Date().toISOString().slice(0,10));
  let bw='';
  if(conf.length)bw+=`<div class="branchwarn"><b>⏱ ${conf.length} clock conflict${conf.length>1?'s':''}</b> — chronological mismatch flagged. Investigate before relying on either date.</div>`;
  if(overdue.length)bw+=`<div class="branchwarn"><b>↻ ${overdue.length} overdue follow-up${overdue.length>1?'s':''}</b> — oldest: ${esc(overdue[0].desc||overdue[0].due)}</div>`;
  const contra=S.propositions.filter(p=>p.status==='CONTRADICTED').length;
  if(contra)bw+=`<div class="branchwarn"><b>⚠ ${contra} unresolved contradiction${contra>1?'s':''}</b> — both accounts preserved in the contradiction register.</div>`;
  document.getElementById('dashBranches').innerHTML=bw;

  // clocks summary
  document.getElementById('dashClocks').innerHTML=Object.entries(CLOCKS).map(([k,c])=>{
    const n=S.clockEntries[k].length;
    return `<div class="clockrow" onclick="showView('v-clocks')"><span class="dot" style="background:${c.color}"></span>
    <span class="nm">${c.name}</span>${conf.some(x=>x.clock===k)?'<span class="flag">⚠ CONFLICT</span>':''}<span class="ct">${n}</span></div>`;
  }).join('');
  updateBadges(conf.length,pend.length+customOpen.length);
}
function goNextAction(){
  const pend=S.actions.filter(a=>a.status==='pending');
  const customOpen=S.nextCustom.filter(n=>!n.done);
  const t=customOpen[0]||pend[0];
  if(t)openAction(t.key, !PROTOCOL.some(p=>p.key===t.key)?t.id:'');
}
function updateBadges(conflicts,openActions){
  const b1=document.getElementById('bdgConflicts');b1.style.display=conflicts?'flex':'none';b1.textContent=conflicts;
  const b2=document.getElementById('bdgActions');b2.style.display=openActions?'flex':'none';b2.textContent=openActions;
}

/* ---------------- actions ---------------- */
function renderActions(){
  let h='';
  const open=S.nextCustom.filter(n=>!n.done);
  if(open.length){
    h+=`<div class="newnode"><b>Evidence-created actions (${open.length})</b> — the investigation grew these nodes. Clear them before the next protocol step.</div>`;
    open.forEach(n=>{h+=`<div class="acard" onclick="openAction('${n.key}','${n.id}')">
      <div class="top"><span class="lt" style="background:var(--orange)">★</span><h3>${esc(n.role)}</h3></div>
      <div class="where">${esc(n.where||'Location identified during investigation')} · from ${esc(n.fromSummary||'evidence')}</div>
      <div class="tags"><span class="pill orange">EVIDENCE-CREATED</span></div></div>`;});
  }
  h+=S.actions.map(a=>{
    const p=PROTOCOL.find(x=>x.key===a.key);
    return `<div class="acard ${a.status==='done'?'done':''}" onclick="openAction('${a.key}','')">
      <div class="top"><span class="lt">${a.key}</span><h3>${esc(p.role)}</h3><span class="pill ${a.status==='done'?'green':'blue'}">${a.status==='done'?'DONE':'OPEN'}</span></div>
      <div class="where">${esc(p.where)}</div>
      <div class="tags"><span class="pill gray">${a.interactions} interaction${a.interactions===1?'':'s'}</span>${a.personName?`<span class="pill purple">${esc(a.personName)}</span>`:''}</div>
    </div>`;}).join('');
  document.getElementById('actionList').innerHTML=h;
}

function openAction(key,customId){
  const custom=customId?S.nextCustom.find(n=>n.id===customId):null;
  const a=S.actions.find(x=>x.key===key);
  const p=custom?{role:custom.role,where:custom.where||'',objective:'Follow up on evidence obtained during the investigation.',briefing:'Evidence-created node. Work it like any protocol card: open the record, capture the routing, create the next node.',script:'"I\'m following up on [the matter referenced in my conversation with '+esc(custom.fromSummary||'your office')+']. I need [record / name / destination] confirmed in writing."',questions:['Can you confirm what was discussed/promised?','Who is responsible for the next step?','When will I have it in writing?'],records:['Whatever the originating evidence pointed to'],reinforcement:'Same-day written confirmation · Log everything.',evidence:'Photograph or screenshot anything shown to you.',tips:['If they do not know, ask who would know.','Document the exact wording of a refusal.']}:PROTOCOL.find(x=>x.key===key);
  const past=S.interactions.filter(i=>i.key===key);
  document.getElementById('actionDetail').innerHTML=`
    <div class="card" style="border-color:var(--teal)">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:4px">
        <span class="lt" style="width:34px;height:34px;border-radius:50%;background:${custom?'var(--orange)':'var(--teal)'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;flex:none">${custom?'★':key}</span>
        <div><h3 style="margin:0">${esc(p.role)}</h3><div class="muted" style="font-size:11px">${esc(p.where)}</div></div>
      </div>
