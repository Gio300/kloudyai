// Client contract for the existing encrypted engine store. No local transcript store.
const bad=()=>{throw Error('Invalid conversation contract. No sync or permission was inferred.');};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>{if(!plain(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))bad();};
const bounded=(v,max)=>typeof v==='string'&&v.trim().length>0&&[...v].length<=max;
const identifier=(v,max=80)=>typeof v==='string'&&new RegExp(`^[a-zA-Z0-9_.:-]{1,${max}}$`).test(v);
const integer=v=>Number.isSafeInteger(v)&&v>=0;
export const conversationOperations=['read','append','sync'];
export function conversationParams(operation,input){
 if(!conversationOperations.includes(operation))bad();
 const common=['project','conversation_id'];
 const keys=operation==='read'?common:[...common,'idempotency_key','expected_revision',...(operation==='sync'?['reason']:['title','user','assistant','decisions','built_artifacts'])];
 exact(input,keys);
 if(!identifier(input.project)||!identifier(input.conversation_id))bad();
 if(operation!=='read'&&(!identifier(input.idempotency_key,128)||!integer(input.expected_revision)))bad();
 if(operation==='sync'&&!['checkpoint','session_end','device_switch','before_sync','idle'].includes(input.reason))bad();
 if(operation==='append'){
  if(!bounded(input.title,120)||!bounded(input.user,1500)||!bounded(input.assistant,1500))bad();
  for(const key of ['decisions','built_artifacts'])if(!Array.isArray(input[key])||input[key].length>4||input[key].some(x=>!bounded(x,240)))bad();
 }
 // Engine canonical JSON escapes Unicode. Match its 7000-byte bound before sending.
 const encoded=JSON.stringify(input).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 if(new TextEncoder().encode(encoded).length>7000)bad();
 return structuredClone(input);
}
export function conversationResult(value,input,operation='read'){
 if(!plain(value)||value.project!==input.project||value.conversation_id!==input.conversation_id)bad();
 for(const key of ['revision','condensed_revision','pending_exchanges'])if(!integer(value[key]))bad();
 if(value.condensed_revision>value.revision||value.pending_exchanges>value.revision)bad();
 const cursor={conversation_id:value.conversation_id,project:value.project,revision:value.revision,condensed_revision:value.condensed_revision,pending_exchanges:value.pending_exchanges};
 // Duplicate command receipts intentionally omit cards. Read explicitly for fresh context.
 if(value.replayed===true){if(operation==='read')bad();return {...cursor,replayed:true,context_available:false};}
 if(value.raw_transcript_returned!==false||value.storage!=='engine_encrypted'||value.compute!=='engine_host'||typeof value.minimum_gate_met!=='boolean'||!plain(value.display)||value.display.render_as!=='plain_text'||!bounded(value.display.title,120)||!bounded(value.display.text,1000))bad();
 let deck=null;
 if(value.deck!==null){
  const d=value.deck;
  if(!plain(d)||d.version!=='sdf.conversation/1'||d.lossy!==true||d.method!=='bounded_extractive'||d.trusted_for_authorization!==false||d.through_revision!==value.condensed_revision||!Array.isArray(d.cards)||d.cards.length!==2)bad();
  const [subject,context]=d.cards;
  if(!plain(subject)||subject.type!=='subject'||subject.project!==input.project||!bounded(subject.title,120)||!plain(context)||context.type!=='context')bad();
  const points={};for(const key of ['user_main_points','assistant_main_points','decisions','built_artifacts']){
   if(!Array.isArray(context[key])||context[key].length>12||context[key].some(x=>!bounded(x,key==='built_artifacts'?240:360)))bad();
   points[key]=[...context[key]];
  }
  deck={version:d.version,lossy:true,method:d.method,trusted_for_authorization:false,through_revision:d.through_revision,cards:[{type:'subject',title:subject.title,project:subject.project},{type:'context',...points}]};
 }
 return {...cursor,deck,raw_transcript_returned:false,minimum_gate_met:value.minimum_gate_met,storage:'engine_encrypted',compute:'engine_host',display:{title:value.display.title,text:value.display.text,render_as:'plain_text'},...(operation==='read'?{}:{replayed:false})};
}
// Text only. Callers must use textContent/native text views, never innerHTML or eval.
export function conversationText(view){
 if(!view.deck)return view.context_available===false?'Command already recorded. Read the current conversation context.':view.display.text;
 const [subject,context]=view.deck.cards;
 return [subject.title,'Saved context (lossy summary; never authorization).',...context.user_main_points,...context.assistant_main_points,...context.decisions,...context.built_artifacts].join('\n');
}
