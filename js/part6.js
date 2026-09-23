function useRung(i){
  const l=LADDER[i];
  openSheet(`<h3>${l.t}</h3><div class="why"><b>Prerequisite:</b> ${l.pre}<br><b>Purpose:</b> ${l.purpose}<br><b>Target:</b> ${l.target}<br><b>Evidence sought:</b> ${l.sought}<br><b>Escalation path:</b> ${l.next}</div>
    ${fld('rg_note','Case-specific note (dates, records, people involved)','')}
    <button class="btn red" onclick="logRung(${i})">Record This Escalation</button>
    <button class="btn ghost" style="margin-top:8px" onclick="closeSheet()">Cancel</button>`,true);
}
function logRung(i){
  const l=LADDER[i],note=document.getElementById('rg_note')?.value.trim();
  S.escalations.push({id:uid(),rung:i,title:l.t,pre:l.pre,target:l.target,sought:l.sought,next:l.next,note,ts:Date.now()});
  logEvent('escalation','Reinforcement used — Rung '+(i+1)+': '+l.t+(note?' — '+note:''));
  save();closeSheet();toast('Escalation recorded in legal-escalation history');if(document.getElementById('v-ledger').classList.contains('on'))renderLedger();
}

/* ---------------- complete interaction ---------------- */
function completeInteraction(){
  const L=S.live;if(!L)return;
  L.endTs=Date.now();clearInterval(tick);document.getElementById('livePill').classList.remove('on');
  const role=PROTOCOL.find(p=>p.key===L.key)?.role||'Evidence-created contact';
  // record clock entry
  if(L.clockSel&&L.clockDate){addClock(L.clockSel,L.clockLabel||('Event recorded from interaction with '+(L.personName||role)),L.clockDate);}
  // named entities → nodes
  (L.names||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(n=>addPerson(n,'Named in encounter '+fmtTs(L.startTs)));
  (L.vendors||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(v=>{if(!S.nodes.some(x=>x.label===v)){S.nodes.push({id:uid(),type:'vendor',label:v,ts:Date.now()});createCustomAction(v,'Vendor','Identified in completed encounter','');}});
  (L.locns||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(l=>{if(!S.nodes.some(x=>x.label===l)){S.nodes.push({id:uid(),type:'propertyLocation',label:l,ts:Date.now()});}});
  // follow-up
  if(L.followDue){S.followUps.push({id:uid(),due:L.followDue,desc:L.followNote||('Follow-up: '+role),status:'open',ts:Date.now()});logEvent('followup','Follow-up scheduled '+L.followDue+': '+(L.followNote||role));}
  // chain nudge: if disposition data exists, mark final node fields
  const disp=(L.branches||[]).find(b=>b.type==='disposed');
  if(disp&&disp.data){
    const cn=S.chain[S.chain.length-1];
    cn.fields['Who?']=cn.fields['Who?']||disp.data.auth;cn.fields['When?']=cn.fields['When?']||disp.data.when;
    cn.fields['Where?']=cn.fields['Where?']||disp.data.dest;cn.fields['What record proves it?']=cn.fields['What record proves it?']||disp.data.rec;
    cn.gaps=6-Object.values(cn.fields).filter(v=>v&&v.trim()).length;
  }
  // log interview
  logEvent('interview','Interview completed: '+(L.personName||'unidentified')+(L.personTitle?' ('+L.personTitle+')':'')+' — '+role+' · '+Math.round((L.endTs-L.startTs)/60000)+' min · '+(L.qa.filter(x=>x.q).length)+' questions');
  // update action
  const a=S.actions.find(x=>x.key===L.key);
  if(a){a.interactions++;a.status='done';if(L.personName)a.personName=L.personName;if(L.personContact)a.personContact=L.personContact;}
  const c=S.nextCustom.find(n=>n.id===L.customId);if(c)c.done=true;
  S.interactions.push({...L});
  S.live=null;save();
  toast('Interaction locked into the ledger');
  /* resume an interrupted live interaction */
if(S.live && !S.live.endTs){
  document.getElementById('liveMeta').textContent=nodeLabel(S.live.key)+' · '+fmtTs(S.live.startTs)+' (resumed)';
  document.getElementById('livePill').classList.add('on');
  clearInterval(tick);tick=setInterval(()=>{
    const s=Math.floor((Date.now()-S.live.startTs)/1000);
    document.getElementById('timer').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
  },500);
  renderLiveForm();
  renderDash();
  showView('v-live');
} else { showView('v-dash'); }renderDash();
}

/* ---------------- clocks ---------------- */
function computeConflicts(){
  const conf=[];const pos=S.clockDates.possession,dl=S.clockDates.noticeDeadline;
  const chk=(clock,entries)=>entries.forEach(e=>{
    if(pos&&e.date&&e.date<pos&&/removed|moved|entered|cleared|encountered|transported/i.test(e.label))
      conf.push({clock,label:e.label,why:'Dated before the possession date ('+pos+') — property event predates lawful possession.'});
  });
  chk('property',S.clockEntries.property);chk('turnover',S.clockEntries.turnover);
  if(dl){const disp=S.clockEntries.property.find(e=>/disposition/i.test(e.label)&&e.date&&e.date<dl);
    if(disp)conf.push({clock:'notice',label:disp.label,why:'Disposition dated before the notice claim deadline ('+dl+') — unlawful-disposition red flag under Civ. Code §§1983–1988.'});}
  return conf;
}
function renderClocks(){
  const conf=computeConflicts();
  document.getElementById('clocksBody').innerHTML=Object.entries(CLOCKS).map(([k,c])=>{
    const entries=[...S.clockEntries[k]].sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    return `<div class="clockcard"><h3><span><span class="pill" style="background:${c.color};color:#fff">${c.name}</span></span>
      <button class="btn sm ghost" onclick="addClockEntry('${k}')">+ Entry</button></h3>
      <div class="muted" style="font-size:10px;margin-bottom:6px">Template: ${c.steps.join(' → ')}</div>
      ${entries.map(e=>{
        const cf=conf.find(x=>x.label===e.label&&x.clock===k);
        return `<div class="tlentry ${cf?'conflict':''}"><div class="d">${esc(e.label)}</div><div class="m">${esc(e.date||'no date')} · logged ${fmtTs(e.ts)}</div>${cf?`<div class="conflictnote">⚠ ${cf.why}</div>`:''}</div>`;
      }).join('')||'<div class="muted" style="font-size:11.5px">No entries yet. Log clock events during live interactions or tap + Entry.</div>'}
    </div>`;}).join('');
  updateBadges(conf.length,S.actions.filter(a=>a.status==='pending').length+S.nextCustom.filter(n=>!n.done).length);
}
function addClockEntry(k){
  openSheet(`<h3>Add ${CLOCKS[k].name} Entry</h3><div class="why">Anchor it to a date. Conflicts against the possession date and notice deadline are checked automatically.</div>
    ${fld('ce_label','Event label','e.g. Unit entered & cleared')}
    <div class="field"><label>Date</label><input type="date" id="ce_date"></div>
    <button class="btn" onclick="saveClockEntry('${k}')">Add Entry</button>`,true);
}
function saveClockEntry(k){addClock(k,document.getElementById('ce_label').value||'Event',document.getElementById('ce_date').value||'');save();closeSheet();renderClocks();toast('Clock entry added');}

/* ---------------- chain ---------------- */
function renderChain(){
  document.getElementById('chainBody').innerHTML=S.chain.map((n,i)=>{
    const filled=Object.values(n.fields).filter(v=>v&&v.trim()).length;
    const g=n.gaps=6-filled;
    return `<div class="chainnode ${i===0?'open':''}"><div class="hd" onclick="this.parentElement.classList.toggle('open')">
      <h3>${i+1}. ${esc(n.name)}</h3><span class="gapcount ${g===0?'g0':g<=2?'g1':'g2'}">${g===0?'COMPLETE':g+' GAP'+(g>1?'S':'')}</span></div>
      <div class="chainfields">${SIX_Q.map(q=>`<input class="${n.fields[q]?'':'empty'}" placeholder="${q}" value="${esc(n.fields[q]||'')}" onchange="S.chain[${i}].fields['${q}']=this.value;save();renderChain()">`).join('')}</div></div>`;
  }).join('')+`<div class="tip"><b>Chain Rule</b>A missing answer is a visible gap — and the gap is your next question. Work the gaps in order; the break point is where the leverage lives.</div>`;
}
