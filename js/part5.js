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

/* ---------------- node helpers ---------------- */
function addPerson(name,role){
  if(S.persons.some(p=>p.name.toLowerCase()===name.toLowerCase()))return;
  S.persons.push({id:uid(),name,role,ts:Date.now(),source:'investigation'});logEvent('branch','New person identified: '+name+' ('+role+')');
}
function createCustomAction(role,where,summary,contact){
  S.nextCustom.push({id:uid(),key:'X'+uid(),role,where,summary,fromSummary:summary,done:false});
}
function addProp(text,status){S.propositions.push({id:uid(),text,status,sources:[S.live?S.live.id:''],ts:Date.now()});}
function addClock(clock,label,date){
  S.clockEntries[clock].push({id:uid(),label,date,ts:Date.now(),src:S.live?S.live.id:''});
  logEvent('clock',CLOCKS[clock].name+': '+label+' ('+date+')');
}

/* ---------------- legal reinforcement ---------------- */
function openEscalate(intro){
  const opts=LADDER.map((l,i)=>`<div class="card" style="margin-bottom:8px"><b style="font-size:12.5px">${i+1}. ${l.t}</b>
    <div class="muted" style="margin:3px 0"><b style="color:var(--red)">Prerequisite:</b> ${l.pre}</div>
    <div class="muted" style="font-size:11px"><b>Purpose:</b> ${l.purpose} · <b>Target:</b> ${l.target} · <b>Seeks:</b> ${l.sought}</div>
    <button class="btn sm ghost" style="margin-top:6px" onclick="useRung(${i})">Use This Rung</button></div>`).join('');
  openSheet(`<h3>Legal Reinforcement Ladder</h3><div class="why">${intro||'Every rung lists its prerequisite. The system will not call a mechanism “available” just because it exists — procedural posture governs.'}</div>${opts}
    <button class="btn ghost" onclick="closeSheet()">Close</button>`,true);
}
