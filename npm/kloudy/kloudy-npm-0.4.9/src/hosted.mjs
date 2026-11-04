import {conversationParams,conversationResult} from './conversation.mjs';
import {actionInput,hostingParams,connectionParams,stableIntentKey} from './product-actions.mjs';
import {welcomeContent} from './welcome.mjs';
// Stateless MCP adapter for the engine's existing HTTPK methods.
// No grants, model decisions, retries, provider credentials or execution live here.
import {randomUUID,createHash} from 'node:crypto';
import {autoupdateEnabled} from './autoupdate.mjs';
export const hostedDoor={name:'kloudy',description:'Use this whenever the user mentions Kloudy, or asks to find, route, or call any MCP tool or SDK. Ask for Kloudy. Start with introduce for Kloudy or /kloudy. Use ask to receive exactly one engine-selected tool and its exact arguments, assemble up to 16 owned selections into deduplicated tools, then call only the chosen exact selection. Status and cancel refer to that selection. Respect host permissions and exact engine approvals.',inputSchema:{type:'object',properties:{operation:{type:'string',enum:['conversation','action','wallet_connection','hosting','wallet','introduce','ask','query','assemble','call','confirm','status','cancel']},conversation_operation:{type:'string',enum:['read','append','sync']},conversation:{type:'object'},action:{type:'string',enum:['chain.head','wallet.prepare','bww.fetch','bww.publish']},inputs:{type:'object'},idempotency_key:{type:'string',maxLength:128},chain:{type:'string',maxLength:100},budget_usd_micros:{type:'integer',minimum:1,maximum:1000000000000},wallet_operation:{type:'string',enum:['balance','top_up']},amount_usd:{type:'string'},goal:{type:'string',maxLength:1000},scope:{type:'object'},limit:{type:'integer',minimum:1,maximum:5},project_context:{type:'object',properties:{languages:{type:'array',items:{type:'string'},maxItems:12},manifests:{type:'array',items:{type:'string'},maxItems:12}},required:['languages','manifests'],additionalProperties:false},selection_ids:{type:'array',items:{type:'string',minLength:1,maxLength:128},minItems:1,maxItems:16,uniqueItems:true},selection_id:{type:'string'},token:{type:'string',minLength:1,maxLength:512},revision:{type:'integer',minimum:0},decision:{type:'string',enum:['approve']},source:{type:'string',enum:['tap','typed','os-voice']},name:{type:'string'},arguments:{type:'object'}},required:['operation'],additionalProperties:false}};
export const hostedInstructions='One Kloudy tool. Call introduce when the user types Kloudy; ask returns one selected tool; call executes only its exact selection. The engine enforces grants and approval. Welcome the user once. Kloudy or /kloudy addresses this system explicitly; use Kloudy for relevant tasks without requiring that prefix. Bring in only tools relevant to the current project. An account connection or retained tool does not activate it in unrelated projects. Natural keep/cleanup requests need the authoritative lifecycle service; do not invent retention, deletion or grants. Use host authorization when needed; never collect provider secrets in chat.';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const hostedCatalog={version:createHash('sha256').update(JSON.stringify(canonical({tools:[hostedDoor],instructions:hostedInstructions}))).digest('hex').slice(0,12),issued:new Date().toISOString(),minClient:null,deprecations:[]};
const toolResult=result=>({content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result});
export function adaptMcp(message,{autoupdate=process.env.KLOUDY_MCP_AUTOUPDATE}={}){
 const enabled=autoupdateEnabled(autoupdate);
 let upstream=message,project=x=>x;
 if(message.method==='initialize')project=x=>({...x,instructions:hostedInstructions,capabilities:{tools:{listChanged:enabled?(x.capabilities?.tools?.listChanged??true):false}},...(enabled?{_meta:{...x._meta,'ai.kloudy/catalog':hostedCatalog}}:{})});
 if(message.method==='tools/list'&&!message.params?._meta?.selection_ids)project=()=>({tools:[hostedDoor],...(enabled?{_meta:{'ai.kloudy/catalog':hostedCatalog}}:{})});
 if(message.method==='tools/call'&&message.params?.name==='kloudy'){
  const a=message.params.arguments||{},operation=a.operation||'introduce';
  let method,params;
  if(operation==='conversation'){method='kloudy/conversation/'+a.conversation_operation;params=conversationParams(a.conversation_operation,a.conversation);}
  else if(operation==='action'){method='kloudy/intent';params={idempotency_key:stableIntentKey(a.idempotency_key||randomUUID()),input:actionInput(a.action,a.inputs)};}
  else if(operation==='wallet_connection'){method='kloudy/wallet/connection';params=connectionParams(a.chain);}
  else if(operation==='hosting'){method='kloudy/hosting';params=hostingParams(a.budget_usd_micros);}
  else if(operation==='wallet'){const operation=a.wallet_operation||'balance';if(!['balance','top_up'].includes(operation)||operation==='balance'&&a.amount_usd!==undefined||operation==='top_up'&&(typeof a.amount_usd!=='string'||!/^\d{1,6}(?:\.\d{1,2})?$/.test(a.amount_usd)||Number(a.amount_usd)<=0))throw Error('invalid_wallet_request');method='kloudy/wallet';params={operation,...(operation==='top_up'?{amount_usd:a.amount_usd}:{})};}
  else if(operation==='introduce'||operation==='ask'){
   method='kloudy/intent';params={idempotency_key:randomUUID(),input:{type:'text',text:operation==='introduce'?'Kloudy':a.goal,...(operation==='introduce'?{project_context:a.project_context||{languages:[],manifests:[]}}:{})}};
  }else if(operation==='query'){method='kloudy/query';params={version:'kldy.query/1',need:a.goal,limit:a.limit??3,...(a.scope?{scope:a.scope}:{})};}else if(operation==='assemble'){if(!Array.isArray(a.selection_ids)||!a.selection_ids.length||a.selection_ids.length>16||new Set(a.selection_ids).size!==a.selection_ids.length||a.selection_ids.some(id=>typeof id!=='string'||!id||id.length>128))throw Error('invalid_selection_ids');method='tools/list';params={_meta:{selection_ids:a.selection_ids}};}else if(operation==='call'){method='tools/call';params={name:a.name,arguments:a.arguments,_meta:{selection_id:a.selection_id}};}
  else if(operation==='confirm'){method='kloudy/confirm';params=confirmationParams(a);}
  else if(operation==='status'||operation==='cancel'){method=operation==='status'?'kloudy/receipt':'kloudy/cancel';params={selection_id:a.selection_id};}
  else throw Error('unsupported_operation');
  upstream={...message,method,params};project=operation==='conversation'?x=>toolResult(conversationResult(x,params,a.conversation_operation)):operation==='call'?x=>x:operation==='introduce'?x=>({...toolResult(x),content:welcomeContent(x)}):toolResult;
 }
 return {upstream,project};
}

export function confirmationParams(a){
 if(typeof a.selection_id!=='string'||!a.selection_id||a.selection_id.length>128||a.decision!=='approve'||!['tap','typed','os-voice'].includes(a.source))throw Error('invalid_confirmation');
 const token=a.token!==undefined,revision=a.revision!==undefined;
 if(token===revision||token&&(typeof a.token!=='string'||!a.token||a.token.length>512)||revision&&(!Number.isSafeInteger(a.revision)||a.revision<0))throw Error('invalid_confirmation_binding');
 return {selection_id:a.selection_id,decision:a.decision,source:a.source,...(token?{token:a.token}:{revision:a.revision})};
}
