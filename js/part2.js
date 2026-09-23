/* ---------------- outcome / branch definitions ---------------- */
const OUTCOMES = {
  cooperative:{label:'✔ Cooperative',color:'green',why:'They answered or provided something. Capture it, confirm it in writing, and decide the next node.'},
  dontknow:{label:'✖ “I don’t know”',color:'orange',why:'Unknown is not an endpoint. Route upward: who would know?'},
  dept:{label:'➦ Another department',color:'blue',why:'Capture the exact routing: name, contact, location. This creates the next contact node.'},
  cannotrelease:{label:'🔒 Cannot release record',color:'purple',why:'Identify the authorized records custodian and the formal request procedure.'},
  disposed:{label:'▣ Property was disposed',color:'red',why:'Open the disposition branch. The type of disposition determines the questions and the statute.'},
  vendor:{label:'🚚 Vendor handled it',color:'teal',why:'Open the vendor-tracing workflow.'},
  norecord:{label:'∅ No record exists',color:'gold',why:'A verbal “no record” is worthless. Create a formal Record Nonexistence event — in writing.'},
  refusal:{label:'⛔ Refusal',color:'red',why:'Preserve exactly what was said, by whom, and present the escalation path.'},
  names:{label:'＋ Names mentioned',color:'navy',why:'One tap turns a mentioned name into a tracked person node.'}
};

const DISPOSITION_TYPES = ['Discarded (trash)','Sold (auction/sale)','Donated','Transferred','Stored','Retained (by employee/property)','Destroyed','Unknown'];

const LADDER = [
 {t:'Written records request',pre:'Any stage. No case required.',purpose:'Obtain records voluntarily.',target:'Records custodian',sought:'Work orders, notices, YARDI audit, vendor records',next:'If unanswered → preservation notice → formal demand'},
 {t:'Preservation notice',pre:'Any stage. No case required.',purpose:'Prevent destruction of records.',target:'Property management leadership',sought:'Written confirmation of preservation',next:'If ignored → formal demand; if case filed → discovery'},
 {t:'Formal demand',pre:'Before or without litigation.',purpose:'Create a documented refusal or compliance.',target:'Leadership / designated legal channel',sought:'Records or a written refusal',next:'Refusal → preserves the issue for litigation'},
 {t:'Interrogatories (Special)',pre:'Civil action pending + discovery available.',purpose:'Compel answers from parties under oath.',target:'Opposing party',sought:'Identification of individuals, facts, authorizations',next:'Insufficient answers → meet-and-confer → motion to compel'},
 {t:'Request for Production',pre:'Civil action pending.',purpose:'Compel documents and things.',target:'Opposing party',sought:'Records, photos, manifests, communications',next:'Non-production → motion to compel'},
 {t:'Request for Admission',pre:'Civil action pending.',purpose:'Lock down facts as admitted or disputed.',target:'Opposing party',sought:'Admissions: dates, custody, disposition',next:'Denial without evidence → trial issue preserved'},
 {t:'Business-records subpoena (SUBP-010)',pre:'Civil action pending. Non-party holder.',purpose:'Obtain records from non-parties (vendors, platforms).',target:'Vendor / records custodian (non-party)',sought:'Manifests, invoices, storage/disposal records',next:'Objection → motion to compel compliance'},
 {t:'Deposition subpoena / deposition',pre:'Civil action pending.',purpose:'Testimony under oath; lock in accounts.',target:'Individuals with personal knowledge',sought:'Who, when, authority, destination',next:'Contradictions → contradiction register entries'},
 {t:'Motion to compel',pre:'Civil action pending; prior attempt made.',purpose:'Judicial enforcement of discovery.',target:'The court',sought:'Order compelling production or answers',next:'Non-compliance → sanctions motions'}
];

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
function save(){localStorage.setItem(KEY,JSON.stringify(S));}
function load(){try{S=JSON.parse(localStorage.getItem(KEY))||defaultState();}catch(e){S=defaultState();}
  if(!S.clockEntries)S=defaultState();}
load();

const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTs=ts=>new Date(ts).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.style.display='block';clearTimeout(t._h);t._h=setTimeout(()=>t.style.display='none',2200);}

/* ---------------- ledger ---------------- */
const EV_COLORS={contact:'#2f6fb2',interview:'#1e9e8f',branch:'#f28c28',refusal:'#d2373c',record:'#4caf50',evidence:'#7b4fa6',escalation:'#8a6d3b',clock:'#2f6fb2',chain:'#1e9e8f',followup:'#f28c28',prop:'#5a6b80',annotation:'#8a6d3b',case:'#12325e',nonexist:'#d2373c',contradiction:'#d2373c'};
function logEvent(type,summary,ref){const e={id:uid(),ts:Date.now(),type,summary,ref:ref||''};S.events.push(e);save();return e;}

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
  if(pos&&pos!==S.clockDates.possession){S.clockDates.possession=pos;
    S.clockEntries.possession.push({id:uid(),label:'Possession date established (case setup)',date:pos,ts:Date.now(),src:''});
    logEvent('clock','Possession Clock started: '+pos);}
  if(dl&&dl!==S.clockDates.noticeDeadline){S.clockDates.noticeDeadline=dl;
    S.clockEntries.notice.push({id:uid(),label:'Claim deadline recorded (case setup)',date:dl,ts:Date.now(),src:''});
    logEvent('clock','Notice Clock deadline recorded: '+dl);}
  logEvent('case','Case set up: '+(S.meta.name||'operator')+' · '+(S.meta.property||'property'));
  save();closeSheet();renderDash();toast('Case frame saved');
}
const gv=id=>document.getElementById(id)?.value.trim()||'';

/* ---------------- modal ---------------- */
function openSheet(html,full){const m=document.getElementById('modal');document.getElementById('sheet').innerHTML=html;m.classList.add('on');}
function closeSheet(){document.getElementById('modal').classList.remove('on');}
document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeSheet();});
