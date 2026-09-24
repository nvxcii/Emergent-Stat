
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
      ${p.contact?`<div class="muted" style="font-size:11.5px;margin:4px 0">Contact: ${esc(p.contact)}</div>`:''}
      <p style="font-size:12.5px"><b>Objective:</b> ${esc(p.objective)}</p>
    </div>
    <div class="sec"><h4>30-Second Briefing</h4><p style="font-size:12.5px">${esc(p.briefing)}</p></div>
    <div class="sec"><h4>Approach Script</h4><div class="scriptbox">${esc(p.script)}</div></div>
    <div class="sec"><h4>Questions Relevant to This Person's Authority</h4><ul>${p.questions.map(q=>`<li>${esc(q)}</li>`).join('')}</ul></div>
    <div class="sec"><h4>Records to Request</h4><ul>${p.records.map(q=>`<li>${esc(q)}</li>`).join('')}</ul></div>
    <div class="sec" style="border-left:4px solid var(--red)"><h4 style="color:var(--red)">Reinforcement Available Here</h4><p style="font-size:12px">${esc(p.reinforcement)}</p></div>
    <div class="sec"><h4>Evidence to Preserve From This Encounter</h4><p style="font-size:12px">${esc(p.evidence)}</p></div>
    ${p.tips.map(t=>`<div class="tip"><b>Context Tip</b>${esc(t)}</div>`).join('')}
    ${past.length?`<div class="sec"><h4>Past Interactions (${past.length})</h4>${past.map(i=>`<div class="muted" style="font-size:11.5px;padding:3px 0">• ${fmtTs(i.startTs)} → ${esc(i.personName||'unidentified')} · outcome: ${esc(i.outcomeLabel||'completed')}</div>`).join('')}</div>`:''}
    <button class="btn teal" onclick="startInteraction('${key}','${customId||''}')">Begin Interaction — Start Timestamp</button>`;
  showView('v-action');
}

/* ---------------- live interaction ---------------- */
let tick=null;
function nodeLabel(key){const p=PROTOCOL.find(p=>p.key===key); if(p) return p.role; const n=S.nextCustom.find(n=>n.key===key); return n?n.role:key;}
function startInteraction(key,customId){
  S.live={id:uid(),key,customId,startTs:Date.now(),endTs:null,qa:[{q:'',a:''}],
    recordsReq:'',recordsGot:'',recordsProm:'',recordsRef:'',names:'',depts:'',vendors:'',locns:'',
    followDue:'',followNote:'',clockSel:'',clockDate:'',clockLabel:'',notes:'',attachments:[],outcome:'',outcomeLabel:''};
  logEvent('contact','Interaction started: '+nodeLabel(key));
  save();
  document.getElementById('liveMeta').textContent=nodeLabel(key)+' · '+fmtTs(S.live.startTs);
  document.getElementById('livePill').classList.add('on');
  clearInterval(tick);tick=setInterval(()=>{
    const s=Math.floor((Date.now()-S.live.startTs)/1000);
    document.getElementById('timer').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
  },500);
  renderLiveForm();
  showView('v-live');
}
function renderLiveForm(){
  const L=S.live;
  const qaRows=L.qa.map((r,i)=>`<div class="qarow"><input placeholder="Question asked" value="${esc(r.q)}" onchange="S.live.qa[${i}].q=this.value;save()">
    <input placeholder="Answer received (exact wording)" value="${esc(r.a)}" onchange="S.live.qa[${i}].a=this.value;save()">
    <button class="btn red sm" onclick="S.live.qa.splice(${i},1);save();renderLiveForm()">✕</button></div>`).join('');
  document.getElementById('liveForm').innerHTML=`
    <div class="tip"><b>Live Protocol</b>Speak, then capture. Every answer creates the next node — you never need to reconstruct this later.</div>
    <div class="field"><label>Person's name</label><input id="lv_name" value="${esc(L.personName||'')}" onchange="S.live.personName=this.value;save()" placeholder="Name they give you"></div>
    <div class="row2">
      <div class="field"><label>Title / role</label><input id="lv_title" value="${esc(L.personTitle||'')}" onchange="S.live.personTitle=this.value;save()" placeholder="e.g. Facilities Supervisor"></div>
      <div class="field"><label>Method</label><select id="lv_method" onchange="S.live.method=this.value;save()">
        ${['In person','Phone','Email','Written / letter','Portal'].map(m=>`<option ${L.method===m?'selected':''}>${m}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Location / contact used</label><input id="lv_loc" value="${esc(L.location||'')}" onchange="S.live.location=this.value;save()" placeholder="Office, window, counter, number used"></div>

    <div class="sec"><h4>Questions & Answers</h4>${qaRows}
      <button class="btn ghost sm" onclick="S.live.qa.push({q:'',a:''});save();renderLiveForm()">+ Add Q/A</button></div>

    <div class="sec"><h4>Records</h4>
      <div class="field"><label>Requested</label><textarea onchange="S.live.recordsReq=this.value;save()">${esc(L.recordsReq)}</textarea></div>
      <div class="row2">
        <div class="field"><label>Received</label><textarea style="min-height:44px" onchange="S.live.recordsGot=this.value;save()">${esc(L.recordsGot)}</textarea></div>
        <div class="field"><label>Promised</label><textarea style="min-height:44px" onchange="S.live.recordsProm=this.value;save()">${esc(L.recordsProm)}</textarea></div>
      </div>
      <div class="field"><label>Refused (exact wording)</label><textarea style="min-height:44px" onchange="S.live.recordsRef=this.value;save()">${esc(L.recordsRef)}</textarea></div>
    </div>

    <div class="sec"><h4>Identified During the Encounter (comma-separated — tap outcomes below to formalize)</h4>
      <div class="field"><label>Names mentioned</label><input value="${esc(L.names)}" onchange="S.live.names=this.value;save()" placeholder="e.g. Maria (front desk), J. Cole (supervisor)"></div>
      <div class="field"><label>Departments identified</label><input value="${esc(L.depts)}" onchange="S.live.depts=this.value;save()"></div>
      <div class="field"><label>Vendors identified</label><input value="${esc(L.vendors)}" onchange="S.live.vendors=this.value;save()"></div>
      <div class="field"><label>Property locations identified</label><input value="${esc(L.locns)}" onchange="S.live.locns=this.value;save()" placeholder="e.g. Warehouse B, storage unit #12"></div>
    </div>

    <div class="sec"><h4>Clock Affected (if any)</h4>
      <div class="row2">
        <div class="field"><label>Clock</label><select onchange="S.live.clockSel=this.value;save()"><option value="">— none —</option>
          ${Object.entries(CLOCKS).map(([k,c])=>`<option value="${k}" ${L.clockSel===k?'selected':''}>${c.name}</option>`).join('')}</select></div>
        <div class="field"><label>Date of event</label><input type="date" value="${esc(L.clockDate)}" onchange="S.live.clockDate=this.value;save()"></div>
      </div>
      <div class="field"><label>Event label</label><input value="${esc(L.clockLabel)}" onchange="S.live.clockLabel=this.value;save()" placeholder="e.g. Work order #4720 opened"></div>
    </div>

    <div class="sec"><h4>Evidence Attached</h4>
      <input type="file" id="lv_file" multiple accept="image/*,.pdf,.txt,.eml" style="font-size:12px" onchange="attachFiles(this)">
      <div class="attach">${L.attachments.map(a=>`<span class="attchip">${esc(a.name)}<button onclick="delAtt('${a.id}')">✕</button></span>`).join('')}</div>
    </div>

    <div class="field"><label>Notes (context, demeanor, surroundings)</label><textarea onchange="S.live.notes=this.value;save()">${esc(L.notes)}</textarea></div>

    <div class="sec"><h4>Encounter Outcome — tap all that apply</h4>
      <div class="outcomes">${Object.entries(OUTCOMES).map(([k,o])=>`<button style="border-color:var(--${o.color==='navy'?'navy':o.color});color:var(--${o.color==='navy'?'navy':o.color})" onclick="openOutcome('${k}')">${o.label}</button>`).join('')}</div>
      <div id="outcomeLog">${renderOutcomeChips()}</div>
    </div>

    <button class="btn green" onclick="completeInteraction()">Complete Interaction — Lock Record</button>
    <button class="btn ghost" style="margin-top:8px" onclick="abandonLive()">Abandon (logs an attempted contact)</button>`;
}
function renderOutcomeChips(){
  return (S.live.branches||[]).map((b,i)=>`<div class="lev" style="border-left-color:var(--red)"><span class="tp" style="background:var(--${OUTCOMES[b.type].color==='navy'?'navy':OUTCOMES[b.type].color})">${esc(OUTCOMES[b.type].label.split(' ')[0])}</span>${esc(b.summary)}</div>`).join('');
}
function attachFiles(inp){
  [...inp.files].forEach(f=>{
    const a={id:uid(),name:f.name,size:f.size,type:f.type,ts:Date.now(),ref:S.live.id};
    S.live.attachments.push(a);S.attachments.push(a);
    if(f.size<1500000&&(f.type.startsWith('image/')||f.type==='application/pdf')){
      const r=new FileReader();r.onload=()=>{a.data=r.result;save();};r.readAsDataURL(f);}
  });
  save();renderLiveForm();toast('Evidence attached to this interaction');
}
function delAtt(id){S.live.attachments=S.live.attachments.filter(a=>a.id!==id);S.attachments=S.attachments.filter(a=>a.id!==id);save();renderLiveForm();}
function abandonLive(){
  try{CF.recordAbandon(S.live);}catch(err){cfBlocked();}   /* CF-ADAPTER (migrated) */
  logEvent('contact','Attempted contact, no completed interaction: '+(PROTOCOL.find(p=>p.key===S.live.key)?.role||S.live.key),undefined,{validated:true});
  S.live=null;clearInterval(tick);document.getElementById('livePill').classList.remove('on');save();showView('v-actions');toast('Attempted contact logged');
}
