import {conversationParams,conversationResult} from './conversation.mjs';
import {hostCapabilities,readHostInterface} from './host-interface.mjs';
import {confirmationParams} from './hosted.mjs';
import {queryInput,queryResult} from './query.mjs';
import {randomUUID} from 'node:crypto';
import {KloudyError} from './client.mjs';
import {actionInput,hostingParams,connectionParams,stableIntentKey} from './product-actions.mjs';
const fail=(code,message)=>{throw new KloudyError(code,message);};
export class HttpkClient {
 constructor({endpoint,token,state={},save=async()=>{},mode='autonomous',fetcher=fetch,host}){
  let u;try{u=new URL(endpoint);}catch{}
  if(!u||u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))fail('invalid_origin','Use an HTTPS or loopback HTTPK endpoint.');
  if(typeof token!=='string'||!token||/[\r\n]/.test(token))fail('connection_unavailable','A scoped user connection is required.');
  this.capabilities=hostCapabilities(host);this.hostInterface=readHostInterface(state.hostInterface??undefined);this.endpoint=u.href;this.token=token;this.state=state;this.save=save;this.mode=mode;this.fetcher=fetcher;
 }
 async rpc(method,params={}){
  const body=JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method,params});if(Buffer.byteLength(body)>8192)fail('too_large','HTTPK request exceeds the engine limit.');
  let response;try{response=await this.fetcher(this.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{authorization:'Bearer '+this.token,'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18',...(this.state.sessionId?{'mcp-session-id':this.state.sessionId}:{})},body});}catch{fail('engine_unavailable','No retry was made. Check the same selection receipt before repeating an action.');}
  let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>524288)fail('invalid_response','Engine response too large.');chunks.push(chunk);}
  let json;try{json=JSON.parse(Buffer.concat(chunks).toString());}catch{fail('invalid_response','The endpoint did not return MCP JSON.');}
  if(!response.ok||json.error)fail('httpk_request_failed','The engine rejected this request. No retry or approval was fabricated.');
  return json.result;
 }
 async session(){if(this.state.sessionId&&this.mode!=='auto'&&this.state.interactionMode!==this.mode)fail('mode_not_supported','Saved session mode does not match this client.');if(!this.state.sessionId){const opened=await this.rpc('initialize',{protocolVersion:'2025-06-18',clientInfo:{name:'kloudy-open',version:'0.3.15'},capabilities:this.capabilities});const negotiated=readHostInterface(opened.host_interface);if(typeof opened.session_id!=='string'||!['autonomous','confirm'].includes(opened.interaction_mode)||(this.mode!=='auto'&&opened.interaction_mode!==this.mode))fail('mode_not_supported','Credential surface does not match this client mode.');this.hostInterface=negotiated;this.state.hostInterface=negotiated;this.state.sessionId=opened.session_id;this.state.interactionMode=opened.interaction_mode;await this.save(this.state);}return this.state.sessionId;}
 async negotiateHost(){
  await this.session();
  const result=await this.rpc('initialize',{protocolVersion:'2025-06-18',clientInfo:{name:'kloudy-open',version:'0.3.15'},capabilities:this.capabilities});
  if(result.session_id!==this.state.sessionId||result.interaction_mode!==this.state.interactionMode)fail('host_session_changed','Host presentation negotiation changed the session. Reconnect explicitly.');
  this.hostInterface=readHostInterface(result.host_interface);this.state.hostInterface=this.hostInterface;await this.save(this.state);
  return {host_interface:this.hostInterface,authorization_changed:false};
 }
 async introduce(project_context){await this.session();const result=await this.rpc('kloudy/intent',{idempotency_key:randomUUID(),input:{type:'text',text:'Kloudy',project_context}});if(result.state!=='greeting'||result.greeting?.version!=='bbe.attach.v1')fail('invalid_response','Expected the engine attach greeting.');return result.greeting;}
 async query(need,options={}){const input=queryInput(need,options);await this.session();return queryResult(await this.rpc('kloudy/query',input),input.limit);}
 async conversation(operation,input){const params=conversationParams(operation,input);await this.session();return conversationResult(await this.rpc('kloudy/conversation/'+operation,params),params,operation);}
 async wallet({operation='balance',amount_usd}={}){
  if(!['balance','top_up'].includes(operation)||operation==='balance'&&amount_usd!==undefined||operation==='top_up'&&(typeof amount_usd!=='string'||!/^\d{1,6}(?:\.\d{1,2})?$/.test(amount_usd)||Number(amount_usd)<=0))fail('invalid_input','Use wallet balance or top_up with a positive decimal amount_usd string.');
  await this.session();const result=await this.rpc('kloudy/wallet',{operation,...(operation==='top_up'?{amount_usd}:{})});
  if(result?.version!=='bbe.wallet/1'||!['quote_only','provider_not_connected'].includes(result.state)||result.payment_started!==false||result.funds_held_by_engine!==false||result.amount_due!=null)fail('invalid_response','Expected a non-payable engine wallet preview. No payment was approved.');
  return result;
 }
 async ask(goal,{candidates=[]}={}){
  if(typeof goal!=='string'||!goal.trim()||[...goal].length>500)fail('invalid_input','Use a goal of 1–500 characters.');
  if(candidates.length)fail('unsupported_discovery','The hosted Notes development adapter does not accept external discovery candidates.');
  return this.selectInput({type:'text',text:goal});
 }
 async action(action,inputs,{idempotencyKey=randomUUID()}={}){return this.selectInput(actionInput(action,inputs),stableIntentKey(idempotencyKey));}
 async walletConnection(chain){const params=connectionParams(chain);await this.session();return this.rpc('kloudy/wallet/connection',params);}
 async hosting({budgetUsdMicros}={}){const params=hostingParams(budgetUsdMicros);await this.session();return this.rpc('kloudy/hosting',params);}
 async selectInput(input,idempotencyKey=randomUUID()){
  await this.session();if(this.state.receiptSelection){const current=await this.status();if(!['completed','failed','cancelled','ready','unavailable','greeting'].includes(current.state))fail('pending_request','Finish the active action first.');}
  const choice=await this.rpc('kloudy/intent',{idempotency_key:idempotencyKey,input});
  if(!Array.isArray(choice.tools)||choice.tools.length>1)fail('invalid_response','Expected at most one engine-selected tool.');
  this.state.selection=choice.tools.length?{id:choice.selection_id,tool:choice.tools[0],arguments:choice.arguments}:null;await this.save(this.state);
  return {schema:'kloudy.toolbox/1',sessionId:this.state.sessionId,selection_id:choice.selection_id,toolbox:{status:choice.tools.length?'ready':'empty',tools:choice.tools,reason:choice.reason||null,measurements:{definitionsEmitted:choice.tools.length}},arguments:choice.arguments,...(choice.greeting?{greeting:choice.greeting}:{})};
 }
 async assemble(selectionIds){
  if(!Array.isArray(selectionIds)||!selectionIds.length||selectionIds.length>16||new Set(selectionIds).size!==selectionIds.length||selectionIds.some(id=>typeof id!=='string'||!id||id.length>128))fail('invalid_input','Choose 1–16 distinct selection IDs returned by this engine session.');
  await this.session();const result=await this.rpc('tools/list',{_meta:{selection_ids:selectionIds}});
  if(!Array.isArray(result.tools)||result.tools.length>16||!Array.isArray(result._meta?.selections)||result._meta.selections.length!==selectionIds.length)fail('invalid_response','Expected the engine-selected tools and exact selection metadata.');
  return {schema:'kloudy.toolbox/1',sessionId:this.state.sessionId,toolbox:{status:result.tools.length?'ready':'empty',tools:result.tools,measurements:{definitionsEmitted:result.tools.length}},selections:result._meta.selections};
 }
 async call(name,inputs,{selectionId}={}){await this.session();const selected=this.state.selection;if(!selectionId&&(!selected||selected.tool.name!==name))fail('not_selected','Ask for this tool first.');const id=selectionId||selected.id;if(typeof id!=='string'||!id||id.length>128)fail('invalid_input','Use an exact engine selection ID.');this.state.receiptSelection=id;await this.save(this.state);const response=await this.rpc('tools/call',{name,arguments:inputs,_meta:{selection_id:id}});if(selected?.id===id)this.state.selection=null;await this.save(this.state);return response.structuredContent;}
 async status(){if(!this.state.receiptSelection)return {state:'idle',mode:this.mode};await this.session();return this.rpc('kloudy/receipt',{selection_id:this.state.receiptSelection});}
 async confirm({selectionId,token,revision,source,decision}){if(this.mode!=='confirm'&&!(this.mode==='auto'&&this.state.interactionMode==='confirm'))fail('autonomous_only','This client does not offer an approval gate.');const params=confirmationParams({selection_id:selectionId||this.state.receiptSelection,token,revision,source,decision});await this.session();return this.rpc('kloudy/confirm',params);}
 async decide(decision,revision){if(!this.state.receiptSelection)fail('no_request','No action is pending.');if(decision==='cancel')return this.rpc('kloudy/cancel',{selection_id:this.state.receiptSelection});if(decision==='approve'&&this.mode==='confirm')return this.confirm({revision,decision:'approve',source:'tap'});fail('autonomous_only','The CLI does not offer a second approval gate.');}
}
