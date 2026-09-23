
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
/* ============================ PART 3: BRANCHING + NODES + CLOCKS + LEDGER ============================ */

/* ---------------- outcome branches ---------------- */
function addBranch(type,summary,data){
  S.live.branches=S.live.branches||[];
  S.live.branches.push({type,summary,data:data||{}});
  logEvent(type==='refusal'?'refusal':type==='norecord'?'nonexist':type==='disposed'?'chain':type==='dept'||type==='vendor'||type==='names'||type==='dontknow'?'branch':'record',summary,{});
}
function fld(id,label,ph){return `<div class="field"><label>${label}</label><input id="${id}" placeholder="${ph||''}"></div>`;}

function openOutcome(type){
  const o=OUTCOMES[type];
  let body='';
  if(type==='dontknow'){body=fld('br_who','Who would know? (name if given)','e.g. Maria, the facilities supervisor')+fld('br_title','Their title / role','');}
  else if(type==='dept'){body=fld('br_dept','Department name','')+fld('br_person','Contact person','')+fld('br_phone','Telephone','')+fld('br_email','Email','')+fld('br_loc','Location','');}
  else if(type==='cannotrelease'){body=fld('br_cust','Authorized records custodian (name/title)','')+fld('br_proc','Formal request procedure','e.g. written request to legal dept, 10-day response');}
  else if(type==='disposed'){body=`<div class="optgrid" id="dispGrid">${DISPOSITION_TYPES.map(d=>`<button onclick="selDisp(this)">${d}</button>`).join('')}</div>`+fld('br_auth','Who authorized?','')+fld('br_when','When? (date)','')+fld('br_dest','Destination','e.g. landfill, auction house, Warehouse B')+fld('br_rec','Underlying record (number/type)','');}
  else if(type==='vendor'){body=fld('br_vname','Vendor name','')+fld('br_wo','Work order / invoice number','')+fld('br_vphone','Phone / location','');}
  else if(type==='norecord'){body=fld('br_rec2','Which record allegedly does not exist?','e.g. inventory of unit 4B')+fld('br_by','Who said so (name/title)','');}
  else if(type==='refusal'){body=fld('br_word','Exact wording of the refusal','Quote them verbatim')+fld('br_by2','Who refused (name/title)','');}
  else if(type==='names'){body=fld('br_nm','Name mentioned','')+fld('br_nmrole','Their role / why mentioned','');}
  else if(type==='cooperative'){body=fld('br_got','What was provided / confirmed?','');}
  openSheet(`<h3>${o.label}</h3><div class="why">${o.why}</div>${body}
    <button class="btn ${o.color==='red'?'red':o.color==='teal'?'teal':''}" onclick="saveOutcome('${type}')">Create Event & Next Node</button>
    <button class="btn ghost" style="margin-top:8px" onclick="closeSheet()">Cancel</button>`,true);
}
let dispSel='';
function selDisp(b){document.querySelectorAll('#dispGrid button').forEach(x=>x.classList.remove('sel'));b.classList.add('sel');dispSel=b.textContent;}

function saveOutcome(type){
  const g=id=>document.getElementById(id)?.value.trim()||'';
  switch(type){
    case 'dontknow':{
      const who=g('br_who'),title=g('br_title');
      if(who){addPerson(who,title||'Person identified by referral');createCustomAction(who,title||'Referred contact','Referred by '+(S.live.personName||'unknown')+' during live interaction','');
        addBranch(type,'“I don’t know” → referral: '+who+(title?' ('+title+')':''));}
      else addBranch(type,'“I don’t know” — no referral obtained');break;}
    case 'dept':{
      const d=g('br_dept');if(d){S.nodes.push({id:uid(),type:'department',label:d,ts:Date.now()});}
      if(g('br_person')){addPerson(g('br_person'),d||'Department contact');createCustomAction(g('br_person'),d||'Department contact','Department routing: '+d,'');}
      addBranch(type,'Routed to department: '+d+(g('br_person')?' — contact: '+g('br_person'):'')+(g('br_phone')?' — '+g('br_phone'):''));
      break;}
    case 'cannotrelease':{
      const c=g('br_cust');if(c){addPerson(c,'Records custodian');createCustomAction(c,'Records custodian','Cannot-release path from '+(S.live.personName||'contact'),'');}
      addBranch(type,'Record not releasable by this person'+(c?' — authorized custodian: '+c:'')+(g('br_proc')?' — procedure: '+g('br_proc'):''));
      toast('If records cannot be released — identify the custodian ✓');break;}
    case 'disposed':{
      const t=dispSel||'Unknown';
      addBranch(type,'Property DISPOSED — '+t+' · by: '+(g('br_auth')||'?')+' · when: '+(g('br_when')||'?')+' → '+(g('br_dest')||'destination unknown')+' · record: '+(g('br_rec')||'none cited'),
        {disp:t,auth:g('br_auth'),when:g('br_when'),dest:g('br_dest'),rec:g('br_rec')});
      addProp('Property was '+t.toLowerCase()+(g('br_when')?' on or around '+g('br_when'):'')+(g('br_auth')?' — authorized by '+g('br_auth'):''),'PENDING');
      if(g('br_when'))addClock('property','Final disposition ('+t+')',g('br_when'));
      if(/stored/i.test(t)&&g('br_dest')){S.nodes.push({id:uid(),type:'propertyLocation',label:g('br_dest'),ts:Date.now()});createCustomAction('Retrieve property — '+g('br_dest'),'Property location','Disposition branch: stored at '+g('br_dest'),'');}
      break;}
    case 'vendor':{
      const v=g('br_vname');if(v){S.nodes.push({id:uid(),type:'vendor',label:v,ts:Date.now()});addPerson(v,'Vendor / hauler / storage');createCustomAction(v,'Vendor','Vendor identified by '+(S.live.personName||'contact')+(g('br_wo')?' — work order '+g('br_wo'):''),'');}
      if(g('br_wo')){S.nodes.push({id:uid(),type:'workOrder',label:'Work order '+g('br_wo'),ts:Date.now()});addProp('Work order '+g('br_wo')+' exists and is associated with this unit','PENDING');}
      addBranch(type,'Vendor handled property: '+(v||'unnamed')+(g('br_wo')?' — WO/invoice '+g('br_wo'):''));break;}
    case 'norecord':{
      addBranch(type,'Formal Record Nonexistence: “'+(g('br_rec2')||'unspecified record')+' does not exist” — asserted by '+(g('br_by')||'unidentified'));
      addProp('No record of '+(g('br_rec2')||'the requested item')+' exists (asserted '+(g('br_by')?'by '+g('br_by'):'verbally')+')','UNEXPLAINED');
      toast('A written “record does not exist” is itself evidence — request it in writing');break;}
    case 'refusal':{
      addBranch(type,'REFUSAL — “'+(g('br_word')||'refusal not quoted')+'” — by '+(g('br_by2')||'unidentified person'));
      logEvent('refusal','Refusal preserved verbatim: "'+(g('br_word')||'')+'" by '+(g('br_by2')||'?'));
      addProp('A request was refused: "'+(g('br_word')||'')+'"','DOCUMENTED');
      setTimeout(()=>openEscalate('A refusal was documented. Escalation is a deliberate choice — the ladder below shows prerequisites, not shortcuts.'),400);
      break;}
    case 'names':{
      const n=g('br_nm');if(n){addPerson(n,g('br_nmrole')||'Mentioned during investigation');createCustomAction(n,g('br_nmrole')||'Mentioned contact','Named during live interaction','');}
      addBranch(type,'Name mentioned: '+n+(g('br_nmrole')?' — '+g('br_nmrole'):''));break;}
    case 'cooperative':{
      addBranch(type,'Cooperative — obtained: '+(g('br_got')||'answers (see Q/A log)'));
      addProp('Information provided during this encounter (see Q/A): '+(g('br_got')||'recorded in interaction'),'DOCUMENTED');break;}
  }
  save();closeSheet();
  const btns=document.querySelectorAll('#liveForm .outcomes button');
  toast('Event created · node added · next action queued');
  renderLiveForm();
}
