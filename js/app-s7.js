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
function ncSaveDeadline(){
  const rule=gv('nc_drule'),d=gv('nc_ddate');
  if(!rule||!d){toast('Rule and candidate date required');return;}
  const trig=gv('nc_dtrig');const notice_id=trig.split('/')[0],event_id=trig.split('/')[1];
  const r=ncCmd('deadline.evaluate',{deadline_id:gv('nc_did')||uid(),rule_cite:rule,trigger_event_id:event_id,candidate_date:d});
  if(r){closeSheet();renderNotice();toast('Deadline evaluated — awaiting two approvals · seq '+r.seq);}
}
function ncApproveForm(id,which){
  openSheet('<h3>Approve '+(which==='rule'?'Rule Applicability':'Triggering Event')+'</h3><div class="why">A named-operator decision. State the basis — it is recorded on the ledger.</div>'
    +'<div class="field"><label>Basis — why the rule applies, or what verifies the event</label><textarea id="nc_ab"></textarea></div>'
    +'<button class="btn teal" onclick="ncSaveApprove(\''+id+'\',\''+which+'\')">Record Approval</button>',true);
}
function ncSaveApprove(id,which){
  const basis=gv('nc_ab');if(!basis){toast('Basis required — an approval without a stated basis is refused');return;}
  const r=ncCmd('deadline.approve',{deadline_id:id,approval:which,basis});
  if(r){closeSheet();renderNotice();toast('Approval recorded · seq '+r.seq);}
}
function ncCheckpointForm(){
  const m=CF._module(),v=m.chronologyView();
  openSheet('<h3>Create Checkpoint</h3><div class="why">A resume point for /resume — where to pick the investigation back up.</div>'
    +fld('nc_cpid','Checkpoint ID (blank = auto)')
    +(v.notices.length?'<div class="field"><label>Active notice (optional)</label><select id="nc_cpn"><option value="">—</option>'+ncOpts(v.notices.map(n=>[n.notice_id,n.label]))+'</select></div>':'')
    +fld('nc_cpo','Objective')+'<div class="field"><label>Open questions (one per line)</label><textarea id="nc_cpq"></textarea></div>'
    +fld('nc_cpl','Resume location — e.g. notice:N-4B:events')
    +'<button class="btn teal" onclick="ncSaveCheckpoint()">Create Checkpoint</button>',true);
}
function ncSaveCheckpoint(){
  const obj=gv('nc_cpo'),loc=gv('nc_cpl');
  if(!obj||!loc){toast('Objective and resume location required');return;}
  const r=ncCmd('checkpoint.create',{cp_id:gv('nc_cpid')||uid(),notice_id:gv('nc_cpn')||undefined,objective:obj,
    open_questions:gv('nc_cpq').split('\n').map(x=>x.trim()).filter(Boolean),resume_location:loc});
  if(r){closeSheet();renderNotice();toast('Checkpoint created · seq '+r.seq);}
}
function ncRestore(cp_id){
  try{
    const cp=CF._module().restoreCheckpoint(cp_id);
    openSheet('<h3>Checkpoint '+esc(cp_id)+'</h3><div class="why">Captured at ledger version '+cp.case_version+'. Nothing was rolled back — this is context, not an undo.</div>'
      +'<div class="sec"><h4>Objective</h4><div style="font-size:12px">'+esc(cp.objective)+'</div></div>'
      +'<div class="sec"><h4>Open questions</h4>'+(cp.open_questions||[]).map(q=>'<div style="font-size:12px">· '+esc(q)+'</div>').join('')+'</div>'
      +'<div class="sec"><h4>Resume at</h4><div style="font-size:12px">'+esc(cp.resume_location)+'</div></div>'
      +(cp.notice?'<div class="sec"><h4>Notice state at checkpoint</h4><div style="font-size:12px">'+esc(cp.notice.label)+' — '+cp.notice.events.length+' event(s)</div></div>':'')
      +'<button class="btn" onclick="closeSheet()">Close</button>',true);
  }catch(err){toast(err.message);}
}
function ncConflictForm(){
  const m=CF._module();
  const srcs=Object.keys(m.visibleSources(S.meta.name||'operator'));
  if(srcs.length<2){toast('Register both sources first — each account must be sourced');return;}
  const acct=(id,label)=>'<div class="sec"><h4>'+label+'</h4><div class="field"><label>Account (what was asserted)</label><textarea id="'+id+'t"></textarea></div><div class="field"><label>Sources</label><select id="'+id+'s" multiple size="'+Math.min(4,srcs.length)+'">'+ncOpts(srcs)+'</select></div></div>';
  openSheet('<h3>Record Conflict</h3><div class="why">Incompatible accounts are both preserved, each linked to its own sources — never resolved away silently.</div>'
    +fld('nc_cfid','Conflict ID (blank = auto)')+acct('nc_ca','Account A')+acct('nc_cb','Account B')
    +'<button class="btn teal" onclick="ncSaveConflict()">Record Conflict</button>',true);
}
function ncSaveConflict(){
  const pick=(tid,sid)=>({text:gv(tid),source_ids:[...document.getElementById(sid).selectedOptions].map(o=>o.value)});
  const a=pick('nc_cat','nc_cas'),b=pick('nc_cbt','nc_cbs');
  if(!a.text||!b.text||!a.source_ids.length||!b.source_ids.length){toast('Both accounts need text and at least one source each');return;}
  const r=ncCmd('conflict.record',{conflict_id:gv('nc_cfid')||uid(),account_a:a,account_b:b});
  if(r){closeSheet();renderNotice();toast('Conflict recorded — both accounts preserved · seq '+r.seq);}
}