function cfCopyResume(){
  const t=CF.resumeText(S);
  (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('Resume packet copied — paste it with /resume'),
    ()=>openSheet('<h3>Resume packet</h3><div class="why">Copy this into Claude with /resume.</div><textarea style="width:100%;height:260px;font-size:11px">'+esc(t)+'</textarea>',true));
}

/* ---------------- notice chronology panel ----------------
   CF-ADAPTER: this panel has no storage of its own. Reads come from
   chronologyView(); writes go through module.command() onto the shared
   hash-chained ledger. Blocked ledger → panel degrades to read-only. */
function ncCmd(type,payload){
  if(CF.blocked){toast('Ledger failed verification — writes blocked');return null;}
  try{
    const r=CF._module().command(uid(),(S.meta.name||'operator'),CF.version(),type,payload);
    S.events=CF.events();
    if(!CF.persist(S)){cfBlocked();return null;}
    return r;
  }catch(err){toast((err.code?err.code+': ':'')+err.message);return null;}
}
function ncGateBadge(g){
  if(g==='passed')return '<span class="cf-prov cf-valid">verified</span>';
  if(g==='rejected')return '<span class="cf-prov cf-rej">rejected</span>';
  return '<span class="cf-prov cf-legacy">unverified</span>';
}
function ncOpts(list,sel){return list.map(o=>{const v=Array.isArray(o)?o[0]:o,t=Array.isArray(o)?o[1]:o;return '<option value="'+esc(v)+'"'+(v===sel?' selected':'')+'>'+esc(t)+'</option>';}).join('');}
function renderNotice(){
  const m=CF._module(),v=m.chronologyView();
  const ver=CF.verify();
  const bar='<div class="cf-bar '+(CF.blocked||!ver.ok?'bad':'')+'">'+(CF.blocked?'Stored ledger FAILED verification — Notice panel is read-only. '+esc(CF.blocked)
    :'Shared ledger · v'+v.version+' · head '+esc((ver.head||'').slice(0,12))+' · reads and writes on this panel go through the same hash chain as the Ledger tab')+'</div>';
  const acts=CF.blocked?'':'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">'
    +'<button class="btn sm teal" onclick="ncSourceForm()">+ Source</button>'
    +'<button class="btn sm" onclick="ncNoticeForm()">+ Notice</button>'
    +'<button class="btn sm" onclick="ncEventForm()">+ Event</button>'
    +'<button class="btn sm ghost" onclick="ncPropForm()">+ Proposition</button>'
    +'<button class="btn sm ghost" onclick="ncDeadlineForm()">Evaluate Deadline</button>'
    +'<button class="btn sm ghost" onclick="ncCheckpointForm()">+ Checkpoint</button>'
    +'<button class="btn sm ghost" onclick="ncConflictForm()">+ Conflict</button></div>';
  /* deadlines — two distinct operator approvals each */
  const dl=v.deadlines.map(d=>{
    const ds=m.deadlineStatus(d.id);
    const btns=(CF.blocked||!ds||ds.sufficient)?'':('<div style="margin-top:5px;display:flex;gap:6px">'
      +(ds.rule_verified?'':'<button class="btn sm ghost" onclick="ncApproveForm(\''+d.id+'\',\'rule\')">Approve rule</button>')
      +(ds.trigger_verified?'':'<button class="btn sm ghost" onclick="ncApproveForm(\''+d.id+'\',\'trigger\')">Approve trigger</button>')+'</div>');
    return '<div class="lev" style="border-left-color:#2f6fb2"><span class="tp" style="background:#2f6fb2">deadline</span>'+ncGateBadge(d.gate)
      +'<div style="margin-top:3px">'+esc(d.text)+'</div>'
      +(ds?'<div class="muted" style="font-size:10px;margin-top:2px">rule: '+(ds.rule_verified?'approved':'not approved')+' · trigger: '+(ds.trigger_verified?'approved':'not approved')+' — '+esc(ds.note)+'</div>':'')
      +btns+'</div>';
  }).join('');
  /* notices + their sourced events */
  const nt=v.notices.map(n=>'<div class="card" style="margin-bottom:8px"><div style="font-weight:700;font-size:13px">'+esc(n.label)+' <span class="muted" style="font-weight:400;font-size:10px">'+esc(n.notice_id)+'</span></div>'
    +(n.events.length?n.events.map(e=>'<div class="tlentry"><div class="d">'+esc(e.type)+'</div><div class="m">'+esc(e.occurred_at)+' · src '+esc(e.source_id)+'</div></div>').join(''):'<div class="muted" style="font-size:11px;margin-top:4px">No events recorded — this record presumes nothing.</div>')+'</div>').join('');
  /* sources — operator view (restricted ones arrive as stubs) */
  const srcs=m.visibleSources(S.meta.name||'operator');
  const sr=Object.keys(srcs).map(k=>{const s=srcs[k];
    return '<div class="lev" style="border-left-color:#7b4fa6"><span class="tp" style="background:#7b4fa6">'+esc(s.kind||'source')+'</span> <b>'+esc(k)+'</b>'+(s.restricted?' <span class="cf-prov cf-legacy">restricted</span>':'')
      +'<div class="muted" style="font-size:10px">sha256 '+esc(String(s.sha256||'').slice(0,16))+'…'+(s.provenance?' · '+esc(s.provenance):'')+'</div></div>';}).join('');
  /* pending propositions (not deadlines/conflict accounts) — operator review gate */
  const st=CF._case().state();
  const pr=Object.values(st.propositions).filter(p=>!p.type&&!p.conflict_of&&(p.gate==='imported'||p.gate==='in_review')).map(p=>'<div class="lev" style="border-left-color:#5a6b80"><span class="tp" style="background:#5a6b80">'+esc(p.kind||'proposition')+'</span>'+ncGateBadge(p.gate)
    +'<div style="margin-top:3px">'+esc(p.text)+'</div>'
    +(CF.blocked?'':'<div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm teal" onclick="ncReview(\''+p.id+'\',\'accept\')">Accept</button><button class="btn sm ghost" onclick="ncReview(\''+p.id+'\',\'needs_evidence\')">Needs evidence</button><button class="btn sm ghost" onclick="ncReview(\''+p.id+'\',\'reject\')">Reject</button></div>')+'</div>').join('');
  /* checkpoints */
  const cps=v.checkpoints.map(c=>'<div class="lev" style="border-left-color:#1e9e8f"><span class="tp" style="background:#1e9e8f">checkpoint</span> v'+c.case_version
    +'<div style="margin-top:3px;font-size:11.5px"><b>'+esc(c.cp_id)+'</b> → '+esc(c.resume_location)+'</div>'
    +'<button class="btn sm ghost" style="margin-top:4px" onclick="ncRestore(\''+c.cp_id+'\')">Restore context</button></div>').join('');
  /* conflicts — both accounts preserved */
  const cf=Object.keys(v.conflicts).map(k=>'<div class="lev" style="border-left-color:#d2373c"><span class="tp" style="background:#d2373c">conflict</span> <b>'+esc(k)+'</b>'
    +v.conflicts[k].map(p=>'<div style="margin-top:3px;font-size:11.5px">“'+esc(p.text)+'” <span class="muted">['+(p.source_ids||[]).map(esc).join(', ')+']</span></div>').join('')+'</div>').join('');
  const sec=(title,body)=>'<div class="sec"><h4>'+title+'</h4>'+(body||'<div class="muted" style="font-size:11px">None recorded.</div>')+'</div>';
  document.getElementById('noticeBody').innerHTML=bar+acts
    +sec('Deadlines — two distinct operator approvals',dl)
    +sec('Notices',nt)
    +sec('Pending propositions',pr)
    +sec('Sources',sr)
    +sec('Checkpoints',cps)
    +sec('Conflicting accounts (both preserved)',cf);
}
/* ---- panel forms: every save is a validated command ---- */
function ncSourceForm(){
  openSheet('<h3>Register Source</h3><div class="why">A source is content plus its hash. Attach the file and the SHA-256 is computed at registration; or paste an existing hash.</div>'
    +fld('nc_sid','Source ID (blank = auto)')+'<div class="field"><label>Kind</label><select id="nc_kind">'+ncOpts(['photo','scan','upload','witness','recording','court','other'])+'</select></div>'
    +'<div class="field"><label>File (optional — hashed locally, never uploaded)</label><input type="file" id="nc_file"></div>'
    +fld('nc_sha','SHA-256 (only if no file attached)')+fld('nc_prov','Provenance — where/when obtained, by whom')
    +'<button class="btn teal" onclick="ncSaveSource()">Register Source</button>',true);
}
async function ncSaveSource(){
  const id=gv('nc_sid')||uid(),kind=gv('nc_kind')||'upload';
  const f=document.getElementById('nc_file').files[0];
  let sha=gv('nc_sha').trim();
  if(f){try{const buf=await f.arrayBuffer();const h=await crypto.subtle.digest('SHA-256',buf);sha=[...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('');}catch(e){toast('Could not hash file: '+e.message);return;}}
  if(!sha){toast('Attach the file (hash computed on register) or paste its SHA-256');return;}
  const r=ncCmd('source.register',{source_id:id,kind,sha256:sha,provenance:gv('nc_prov')||null,captured_at:new Date().toISOString()});
  if(r){closeSheet();renderNotice();toast('Source registered · seq '+r.seq);}
}
function ncNoticeForm(){
  openSheet('<h3>Create Notice</h3><div class="why">Creates an empty notice record — it presumes no contents until sourced events are added.</div>'
    +fld('nc_nid','Notice ID (blank = auto)')+fld('nc_nlabel','Label — what the notice is, as observed')
    +'<button class="btn teal" onclick="ncSaveNotice()">Create Notice</button>',true);
}
function ncSaveNotice(){
  const label=gv('nc_nlabel');if(!label){toast('Label required — describe the notice as observed');return;}
  const r=ncCmd('notice.create',{notice_id:gv('nc_nid')||uid(),label});
  if(r){closeSheet();renderNotice();toast('Notice created · seq '+r.seq);}
}
function ncEventForm(){
  const m=CF._module(),v=m.chronologyView();
  if(!v.notices.length){toast('Create a notice first');return;}
  const srcs=Object.keys(m.visibleSources(S.meta.name||'operator'));
  if(!srcs.length){toast('Register a source first — events must be sourced');return;}
  openSheet('<h3>Record Notice Event</h3><div class="why">Every event must name its source. Hearsay is refused by the validator.</div>'
    +'<div class="field"><label>Notice</label><select id="nc_en">'+ncOpts(v.notices.map(n=>[n.notice_id,n.label]))+'</select></div>'
    +'<div class="field"><label>Event type</label><select id="nc_et">'+ncOpts(m.NOTICE_EVENT_TYPES)+'</select></div>'
    +'<div class="field"><label>Occurred on (date)</label><input id="nc_ed" type="date"></div>'
    +'<div class="field"><label>Source</label><select id="nc_es">'+ncOpts(srcs)+'</select></div>'
    +'<button class="btn teal" onclick="ncSaveEvent()">Record Event</button>',true);
}
function ncSaveEvent(){
  const d=gv('nc_ed');if(!d){toast('Date required');return;}
  const r=ncCmd('notice.event.record',{notice_id:gv('nc_en'),event_id:uid(),type:gv('nc_et'),occurred_at:d,source_id:gv('nc_es')});
  if(r){closeSheet();renderNotice();toast('Event recorded · seq '+r.seq);}
}
function ncPropForm(){
  const m=CF._module();
  const srcs=Object.keys(m.visibleSources(S.meta.name||'operator'));
  openSheet('<h3>Submit Proposition</h3><div class="why">Enters as <i>imported</i> — unreviewed. It becomes a fact only if the operator accepts it.</div>'
    +'<div class="field"><label>Kind</label><select id="nc_pk">'+ncOpts([['fact','fact'],['interpretation','interpretation']])+'</select></div>'
    +'<div class="field"><label>Statement</label><textarea id="nc_pt"></textarea></div>'
    +(srcs.length?'<div class="field"><label>Sources</label><select id="nc_ps" multiple size="'+Math.min(5,srcs.length)+'">'+ncOpts(srcs)+'</select></div>':'')
    +'<button class="btn teal" onclick="ncSaveProp()">Submit</button>',true);
}
function ncSaveProp(){
  const text=gv('nc_pt');if(!text){toast('Statement required');return;}
  const sel=document.getElementById('nc_ps');
  const source_ids=sel?[...sel.selectedOptions].map(o=>o.value):[];
  const r=ncCmd('proposition.submit',{prop_id:uid(),kind:gv('nc_pk'),text,source_ids});
  if(r){closeSheet();renderNotice();toast('Proposition submitted · seq '+r.seq);}
}
function ncReview(id,decision){
  openSheet('<h3>Review Proposition</h3><div class="why">Decision: <b>'+esc(decision)+'</b>. Recorded as its own ledger entry.</div>'
    +'<div class="field"><label>Note (basis for the decision)</label><textarea id="nc_rn"></textarea></div>'
    +'<button class="btn teal" onclick="ncSaveReview(\''+id+'\',\''+decision+'\')">Record Decision</button>',true);
}
function ncSaveReview(id,decision){
  const r=ncCmd('proposition.review',{prop_id:id,decision,note:gv('nc_rn')||undefined});
  if(r){closeSheet();renderNotice();toast('Decision recorded · seq '+r.seq);}
}
function ncDeadlineForm(){
  const m=CF._module(),v=m.chronologyView();
  const evs=v.notices.flatMap(n=>n.events.map(e=>[n.notice_id+'/'+e.event_id,n.label+' · '+e.type+' '+e.occurred_at]));
  if(!evs.length){toast('Record a sourced notice event first — a deadline needs a verified trigger');return;}
  openSheet('<h3>Evaluate Deadline</h3><div class="why">The evaluation carries <b>no approvals</b>. Each approval is a separate operator decision afterwards — one command can never self-certify both.</div>'
    +fld('nc_did','Deadline ID (blank = auto)')
    +fld('nc_drule','Rule cited — statute/code and section')
    +'<div class="field"><label>Triggering event</label><select id="nc_dtrig">'+ncOpts(evs)+'</select></div>'
    +'<div class="field"><label>Candidate date</label><input id="nc_ddate" type="date"></div>'
    +'<button class="btn teal" onclick="ncSaveDeadline()">Evaluate</button>',true);
}
