/* =====================================================================
   EXEC EVIDENCE — guided investigation + contemporaneous evidence system
   Principle: Guide → Execute → Capture → Timestamp → Link → Verify →
              Branch → Escalate → Reconcile → Report
   ===================================================================== */

/* ---------------- seeded protocol content ---------------- */
const CHAIN_TEMPLATE = ['Unit (former apartment)','Pre-Clearance Inspection','Assigned Crew','Loading / Handoff','Vehicle / Vendor','Storage / Safekeeping','Valuation / Decision','Final Destination'];
const SIX_Q = ['Who?','When?','Where?','Under whose authority?','What record proves it?','Next custodian?'];

const CLOCKS = {
  possession:{name:'Possession Clock',color:'#2f6fb2',steps:['Sheriff / internal possession','Possession entry (records)']},
  turnover:{name:'Turnover Clock',color:'#4caf50',steps:['Inspection','Turnover / work order opened','Personnel / vendor assigned','Unit entered & cleared','Completed / closed']},
  property:{name:'Property Clock',color:'#f28c28',steps:['Belongings encountered','Described / photo / inventory','Moved','Transported','Storage','Retrieval opportunity','Valuation','Final disposition']},
  notice:{name:'Notice Clock',color:'#7b4fa6',steps:['Property notice prepared','Service / mailing','Retrieval location identified','Claim deadline','Disposition date']}
};

const PROTOCOL = [
 {key:'A',role:'Property Manager / Site Supervisor',where:'Property management office · on-site, business hours',contact:'',
  objective:'Establish what triggered the turnover and where the belongings went.',
  briefing:'You are not there to argue. You are there to open the record: what was removed, when, by whom, and where it went.',
  script:'"I\'m a former resident of unit [__]. I\'m tracing where my personal property went and who handled it. I\'m not here to dispute — I need the record of where it went. Can you confirm in writing what was removed, when, by whom, and where it was taken?"',
  questions:['What triggered the turnover?','Date/time the unit was inspected?','Work order or YARDI entry number?','Who authorized the clearance? Which crew or vendor?','Where did the belongings go?','Was a property notice prepared? Service method?'],
  records:['Turnover authorization','Work order number','Notice of right to reclaim','Any inventory or photos taken'],
  reinforcement:'Same-day written confirmation · Preservation request · Escalate to leadership if no answer.',
  evidence:'Photograph anything they show you on screen or paper. Log exact wording of anything they refuse.',
  tips:['Ask only what this person personally observed.','Document the exact wording of a refusal.','Get every verbal answer confirmed in writing before you leave.']},
 {key:'B',role:'SRO Facilities / Maintenance Supervisor or Senior Facilities Manager',where:'Facilities office · property management HQ',contact:'',
  objective:'Get the work order trail: assignment, crew, completion, and who signed off.',
  briefing:'The supervisor connects the authorization to the workers. Your targets: work order number, crew names, completion sign-off, and any YARDI instruction about the property.',
  script:'"I\'m tracing a unit turnover from [date]. Can you give me the work order number and the crew or vendor assignment for that unit? I need who was assigned and who signed off completion — plus the YARDI entry number and who created it."',
  questions:['Work order number?','Crew / assignment and completion dates?','Assigned personnel? Supervisor of record?','Outside vendor used? Completion paperwork?','YARDI entry and instructions regarding property?'],
  records:['Work order(s)','Assignment sheets','Completion / sign-off proof','Vendor authorization'],
  reinforcement:'Written records request · Preservation notice on work-order files.',
  evidence:'If they open the work order on a screen, photograph the work order number and any names visible.',
  tips:['If they do not know, ask who would know — and log the referral.','Do not tell them what another worker already told you.']},
 {key:'C',role:'YARDI / Facilities Records Custodian or Facilities Service Clerk',where:'Records window · written records-request channel',contact:'',
  objective:'Obtain the complete digital audit trail for the unit.',
  briefing:'The custodian holds the system record. You want everything: entries, timestamps, creator history, attachments, linked vendor data. This is a written request — do it on paper or email, not verbally.',
  script:'"I\'m requesting the complete YARDI work-order history for unit [__] covering [date range]: all entries, timestamps, creator and modification history, attachments, and linked vendor records. Please confirm receipt in writing and identify the custodian of these records."',
  questions:['Historical unit activity with timestamps?','Creator / user / modification history?','Status and assignment changes?','Notes, attachments, inspections?','Linked work orders / vendor data?','Completion user and date?'],
  records:['Full YARDI audit for the unit','Attachments and inspection notes','Linked vendor records'],
  reinforcement:'Written records request · Preserve source records · Litigation hold · Request for Production if a case is pending.',
  evidence:'Keep the written request and any written confirmation. Screenshot portal confirmations.',
  tips:['If records cannot be released, identify the authorized records custodian and the formal request procedure.','A written "this record does not exist" is itself evidence — request it in writing.']},
 {key:'D',role:'Identified Facilities Technician / Maintenance / Janitorial / Security Worker',where:'On-site, in passing — brief, respectful, specific',contact:'',
  objective:'Personal-knowledge facts from the person who physically handled the property.',
  briefing:'Front-line workers know what they saw and did — not policy. Ask only about personal knowledge. One good routing answer ("the supervisor would know") is a win.',
  script:'"Quick question — were you on the crew that cleared unit [__] around [date]? I\'m just trying to find where the belongings went. Who assigned you to that unit?"',
  questions:['Did you work on this unit?','Who assigned you?','What did you personally see or do?','Where did you place the property?','Who received it next?'],
  records:['Their contemporaneous recollection — recorded in your log the same day'],
  reinforcement:'Identify supervisor / next custodian · Document contemporaneous recollection.',
  evidence:'Log their answers verbatim the same day, with time and location.',
  tips:['Ask only what this person personally observed.','Respect time pressure — short and specific.','If they say "I don\'t know," ask: "Who would know?"']},
 {key:'E',role:'Outside Vendor / Hauler / Cleaner / Storage / Disposal Company',where:'Identified via work order, invoice, or manifest',contact:'',
  objective:'Trace the property past the property line: pickup, transport, destination.',
  briefing:'The vendor is where the property left the building. Targets: work order or manifest number, pickup date, crew, destination, and any storage or disposal record.',
  script:'"I\'m tracing a pickup from [property], unit [__], around [date]. Do you have a work order or manifest under that address? I need the pickup date, crew, destination, and any storage or disposal record."',
  questions:['Work order / invoice number?','Pickup date? Assigned crew?','Items received? Vehicle / manifest number?','Destination / receiving party?','Storage / disposal / sale records?','Communications with the property?'],
  records:['Manifest or work order','Invoice','Storage records','Disposal / sale documentation'],
  reinforcement:'If records are needed in a civil case, a business-records subpoena (SUBP-010) may apply — with counsel or court self-help.',
  evidence:'Photograph any manifest or invoice they show you.',
  tips:['Vendors identify realized destination — keep asking "and then where?".','One destination name creates the next node.']},
 {key:'F',role:'Property Management Leadership / Administration',where:'Executive office · designated legal / records channel',contact:'',
  objective:'Formalize: designate the custodian, confirm preservation, get a written response.',
  briefing:'This is the escalation node. You are no longer asking — you are formally requesting, in writing, with a deadline.',
  script:'"My written records request of [date] regarding unit [__] has not been answered. I\'m asking your office to (1) designate the records custodian, (2) confirm all related records are preserved, and (3) provide a written response within [10] days."',
  questions:['Who is the designated records custodian?','What procedures apply to my records request?','Will you confirm preservation of all related records?','What are the next steps if records are not provided?'],
  records:['Written response from leadership','Preservation confirmation','Custodian designation'],
  reinforcement:'Formal preservation notice · Use designated legal channel · Escalate if necessary.',
  evidence:'Everything in writing from this point. Date-stamp every letter.',
  tips:['Document the exact wording of any refusal.','A refusal here creates a Refusal event — not an endpoint.']}
];
