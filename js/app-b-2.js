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
