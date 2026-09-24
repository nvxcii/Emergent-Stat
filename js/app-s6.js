
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