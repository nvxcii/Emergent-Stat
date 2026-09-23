
/* ---------------- store ---------------- */
const KEY='execEvidence.v1';
let S;
function defaultState(){return{
  meta:{name:'',unit:'',property:'',evictDate:'',created:Date.now()},
  actions:PROTOCOL.map(p=>({key:p.key,status:'pending',personName:'',personContact:'',interactions:0})),
  persons:[],nodes:[],interactions:[],events:[],attachments:[],
  clockEntries:{possession:[],turnover:[],property:[],notice:[]},
  chain:CHAIN_TEMPLATE.map(n=>({name:n,fields:{},gaps:6})),
  followUps:[],escalations:[],propositions:[],
  clockDates:{possession:'',noticeDeadline:''},
  live:null, nextCustom:[]
};}
/* CF-ADAPTER: the ledger key holds the history; the app key holds S without events. */
function save(){ if(!CF.persist(S)) cfBlocked(); }
function cfBlocked(){ toast('Ledger failed verification — changes are not being saved'); }
function load(){try{S=JSON.parse(localStorage.getItem(KEY))||defaultState();}catch(e){S=defaultState();}
  if(!S.clockEntries)S=defaultState();}
load();
/* CF-ADAPTER: boot verifies the stored ledger (or imports legacy S.events once) and projects S.events */
const CF=CaseFlowKimi.createKimiAdapter({storage:localStorage,appKey:KEY});
const CF_BOOT=CF.boot(S);

const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTs=ts=>new Date(ts).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.style.display='block';clearTimeout(t._h);t._h=setTimeout(()=>t.style.display='none',2200);}

/* ---------------- ledger ---------------- */
const EV_COLORS={contact:'#2f6fb2',interview:'#1e9e8f',branch:'#f28c28',refusal:'#d2373c',record:'#4caf50',evidence:'#7b4fa6',escalation:'#8a6d3b',clock:'#2f6fb2',chain:'#1e9e8f',followup:'#f28c28',prop:'#5a6b80',annotation:'#8a6d3b',case:'#12325e',nonexist:'#d2373c',contradiction:'#d2373c'};
/* CF-ADAPTER: single history. Unmigrated callers are recorded with provenance "legacy". */
function logEvent(type,summary,ref,opt){
  try{const e=CF.record(type,summary,ref,opt);S.events=CF.events();save();return e;}
  catch(err){cfBlocked();return null;}
}

/* ---------------- view router ---------------- */
function showView(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('on'));
  document.getElementById(id).classList.add('on');
  document.querySelectorAll('.tabbar button').forEach(b=>b.classList.toggle('on',b.dataset.v===id));
  document.querySelector('main').scrollTop=0;
  renderers[id]&&renderers[id]();
}
document.querySelectorAll('.tabbar button').forEach(b=>b.onclick=()=>showView(b.dataset.v));

/* ---------------- case setup ---------------- */
function openCaseSetup(){
  openSheet(`
    <h3>Case Setup</h3><div class="why">The system needs the frame before it can guide, branch, and report.</div>
    <div class="caseform">
    <div class="field"><label>Operator name</label><input id="cs_name" value="${esc(S.meta.name)}" placeholder="Your name"></div>
    <div class="field"><label>Former unit</label><input id="cs_unit" value="${esc(S.meta.unit)}" placeholder="Unit number"></div>
    <div class="field"><label>Property / SRO</label><input id="cs_prop" value="${esc(S.meta.property)}" placeholder="Property name & address"></div>
    <div class="field"><label>Eviction / move-out date</label><input id="cs_date" type="date" value="${esc(S.meta.evictDate)}"></div>
    <div class="field"><label>Sheriff / internal possession date (starts Possession Clock)</label><input id="cs_pos" type="date" value="${esc(S.clockDates.possession)}"></div>
    <div class="field"><label>Notice claim deadline (if known)</label><input id="cs_dl" type="date" value="${esc(S.clockDates.noticeDeadline)}"></div>
    </div>
    <button class="btn teal" onclick="saveCase()">Save & Begin</button>`,true);
}
function saveCase(){
  S.meta.name=gv('cs_name');S.meta.unit=gv('cs_unit');S.meta.property=gv('cs_prop');S.meta.evictDate=gv('cs_date');
  const pos=gv('cs_pos'),dl=gv('cs_dl');
  /* CF-ADAPTER (migrated): a date typed at setup has no source, so it is stored as an
     unresolved proposition and shown as UNVERIFIED — never as an established anchor. */
  try{
    if(pos&&pos!==S.clockDates.possession){const pid=CF.setupDate(S,'possession',pos,'Possession date');S.clockDates.possession=pos;
      S.clockEntries.possession.push({id:uid(),label:'Possession date entered at setup (unverified)',date:pos,ts:Date.now(),src:'',unverified:true,prop_id:pid});}
    if(dl&&dl!==S.clockDates.noticeDeadline){const pid=CF.setupDate(S,'noticeDeadline',dl,'Notice claim deadline');S.clockDates.noticeDeadline=dl;
      S.clockEntries.notice.push({id:uid(),label:'Claim deadline entered at setup (unverified)',date:dl,ts:Date.now(),src:'',unverified:true,prop_id:pid});}
    CF.markValidated(S,['clockEntries','clockDates']);S.events=CF.events();
  }catch(err){cfBlocked();}
  logEvent('case','Case set up: '+(S.meta.name||'operator')+' · '+(S.meta.property||'property'));
  save();closeSheet();renderDash();toast('Case frame saved');
}
const gv=id=>document.getElementById(id)?.value.trim()||'';

/* ---------------- modal ---------------- */
function openSheet(html,full){const m=document.getElementById('modal');document.getElementById('sheet').innerHTML=html;m.classList.add('on');}
function closeSheet(){document.getElementById('modal').classList.remove('on');}
document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeSheet();});
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
