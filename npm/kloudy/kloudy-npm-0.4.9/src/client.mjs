import {randomUUID} from 'node:crypto';

export class KloudyError extends Error {
  constructor(code,message){super(message);this.code=code;}
}
const fail=(code,message)=>{throw new KloudyError(code,message);};
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const id=x=>{if(typeof x!=='string'||!/^[-\w]{1,128}$/.test(x))fail('invalid_id','Invalid engine identifier.');return encodeURIComponent(x);};
const terminal=x=>['completed','failed','cancelled'].includes(x);
export function httpTransport({origin,token,fetcher=fetch}){
  const url=new URL(origin);
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))))fail('invalid_origin','Use an HTTPS or loopback engine origin.');
  if(typeof token!=='string'||!token||/[\r\n]/.test(token))fail('registration_required','Ask for Kloudy and register before searching for tools.');
  return async(method,path,body)=>{
    let response;
    try{response=await fetcher(url.origin+'/v1/integrations'+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
    catch{fail('engine_unavailable','The engine is unavailable. No operation was retried.');}
    if(!response.ok)fail([401,403].includes(response.status)?'registration_required':response.status===409?'stale_state':response.status===429?'rate_limited':'engine_unavailable','The engine did not accept this request. Reconnect, refresh or finish pending work before retrying.');
    let size=0;const chunks=[];
    for await(const chunk of response.body){size+=chunk.length;if(size>524288)fail('invalid_response','The engine response exceeded its limit.');chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString());}catch{fail('invalid_response','Invalid engine response.');}
  };
}
export function projectToolbox(receipt){
  const n=receipt?.narrowing;
  if(!object(n)||!Array.isArray(n.shortlist)||n.shortlist.length>3)fail('invalid_response','Expected a bounded engine shortlist.');
  const box=n.toolbox,fn=box?.tool?.function;
  let tools=[];
  if(box?.status==='ready'){
    if(!fn||typeof fn.name!=='string'||!/^[-\w.]{1,100}$/.test(fn.name)||typeof fn.description!=='string'||fn.description.length>2000||fn.parameters?.type!=='object'||!object(fn.parameters.properties)||!n.shortlist.some(x=>x.index===box.candidate_index)||n.measurements?.definitions_emitted!==1)fail('invalid_response','Expected exactly one authorized tool definition.');
    const properties={};
    for(const [name,field] of Object.entries(fn.parameters.properties)){
      if(!/^\w{1,80}$/.test(name)||['__proto__','constructor','prototype'].includes(name)||field?.type!=='string')fail('unsupported_schema','This client supports the current engine string-input tools.');
      properties[name]={type:'string'};
      for(const key of ['minLength','maxLength'])if(field[key]!==undefined){if(!Number.isSafeInteger(field[key])||field[key]<0||field[key]>10000)fail('invalid_response','Invalid tool input bound.');properties[name][key]=field[key];}
    }
    if(Object.keys(properties).length>16)fail('invalid_response','Too many tool inputs.');
    const required=fn.parameters.required??[];
    if(!Array.isArray(required)||required.some(x=>!Object.hasOwn(properties,x)))fail('invalid_response','Invalid required inputs.');
    tools=[{name:fn.name,description:fn.description,inputSchema:{type:'object',properties,required,additionalProperties:false}}];
  }
  return {status:tools.length?'ready':'empty',tools,reason:tools.length?'One engine-selected tool.':String(box?.reason||'no_match').slice(0,100),measurements:{candidatesRead:n.measurements?.candidates_read??null,definitionsEmitted:tools.length}};
}
export class KloudyClient {
  constructor({transport,state={},save=async()=>{},mode='autonomous'}){if(typeof transport!=='function')fail('registration_required','Registration and a scoped engine connection are required.');if(!['autonomous','confirm'].includes(mode))fail('invalid_mode','Choose autonomous or confirm.');this.mode=mode;this.transport=transport;this.state=state;this.save=save;this.busy=false;}
  async exclusive(work){if(this.busy)fail('busy','Wait for the current operation.');this.busy=true;try{return await work();}finally{this.busy=false;}}
  async request(method,path,body,limit=4096){if(body&&Buffer.byteLength(JSON.stringify(body))>limit)fail('too_large','Request exceeds the engine limit.');return this.transport(method,path,body);}
  async session(){
    if(!this.state.sessionId){const opened=await this.request('POST','/sessions',{idempotency_key:randomUUID(),front_door:'kloudy'});id(opened.session_id);this.state.sessionId=opened.session_id;await this.save(this.state);}
    let current=await this.request('GET','/sessions/'+id(this.state.sessionId));
    if(current.state==='closed')fail('session_closed','This session is closed. Register or reconnect a fresh session.');
    if(!Number.isSafeInteger(current.revision)||current.revision<0)fail('invalid_response','Invalid engine session revision.');
    if(current.interaction_mode!==this.mode){
      await this.request('POST',`/sessions/${id(this.state.sessionId)}/mode`,{idempotency_key:randomUUID(),expected_revision:current.revision,mode:this.mode,source:'typed'});
      current=await this.request('GET','/sessions/'+id(this.state.sessionId));
      if(current.interaction_mode!==this.mode||!Number.isSafeInteger(current.revision)||current.revision<0)fail('mode_not_supported','The engine has not acknowledged this surface’s approval mode. No tool was invoked.');
    }
    return current;
  }
  async ask(goal,{candidates=[],lane='non_medical'}={}){return this.exclusive(async()=>{
    if(typeof goal!=='string'||!goal.trim()||[...goal].length>500||!['medical','non_medical'].includes(lane)||!Array.isArray(candidates)||candidates.length>16)fail('invalid_input','Use a goal of 1–500 characters and at most 16 public metadata candidates.');
    const current=await this.session();
    if(current.latest_request&&!terminal(current.latest_request.state))fail('pending_request','Finish or cancel the current action first.');
    this.state.selection=null;await this.save(this.state);
    if(!candidates.length){
      const receipt=await this.request('POST',`/sessions/${id(this.state.sessionId)}/route`,{idempotency_key:randomUUID(),expected_revision:current.revision,query:goal,lane,compare:false,profile:null,url:null,language:'en'});
      // An empty Toolbox never widens into a whole-server catalog.
      const result={schema:'kloudy.toolbox/1',sessionId:this.state.sessionId,toolbox:{status:'empty',tools:[],reason:'discovery_feed_required'},fallback:{kind:'source_card',available:false}};
      const destinations=receipt.routing?.view?.destinations;
      if(Array.isArray(destinations)&&destinations[0]){const d=destinations[0];try{const url=new URL(d.url);if(url.protocol==='https:'&&!url.username&&!url.password)result.fallback={kind:'source_card',available:true,title:String(d.title||'Source').slice(0,200),url:url.href};}catch{}}
      return result;
    }
    for(const c of candidates){if(!object(c)||Object.keys(c).some(k=>!['source_url','discovered_via','resource'].includes(k))||!['seo','geo'].includes(c.discovered_via)||!object(c.resource))fail('invalid_input','Use public KLDY/FHIR discovery metadata.');const u=new URL(c.source_url);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)fail('invalid_input','Metadata sources must be credential-free HTTPS identifiers.');}
    const key=randomUUID();
    const receipt=await this.request('POST',`/sessions/${id(this.state.sessionId)}/narrow`,{idempotency_key:key,expected_revision:current.revision,goal,lane,candidates},65536);
    const toolbox=projectToolbox(receipt);
    this.state.selection=toolbox.tools.length?{key,tool:toolbox.tools[0]}:null;await this.save(this.state);
    return {schema:'kloudy.toolbox/1',sessionId:this.state.sessionId,toolbox};
  });}
  async call(name,inputs){return this.exclusive(async()=>{
    const selected=this.state.selection;if(!selected||selected.tool.name!==name)fail('not_selected','Ask for Kloudy to select this tool first.');
    const schema=selected.tool.inputSchema;if(!object(inputs)||Object.keys(inputs).some(k=>!Object.hasOwn(schema.properties,k))||schema.required.some(k=>!Object.hasOwn(inputs,k)))fail('invalid_input','Use only the selected tool inputs.');
    for(const [k,v] of Object.entries(inputs)){const f=schema.properties[k];if(typeof v!=='string'||[...v].length<(f.minLength||0)||[...v].length>(f.maxLength??10000))fail('invalid_input','Invalid tool input.');}
    const current=await this.session();if(current.latest_request&&!terminal(current.latest_request.state))fail('pending_request','Finish the pending action first.');
    const receipt=await this.request('POST',`/sessions/${id(this.state.sessionId)}/escalate`,{idempotency_key:randomUUID(),expected_revision:current.revision,narrowing_key:selected.key,inputs});
    id(receipt.request_id);this.state.requestId=receipt.request_id;this.state.selection=null;await this.save(this.state);return this.status();
  });}
  async status(){if(!this.state.requestId)return {state:'idle',mode:this.mode,sessionId:this.state.sessionId||null};const receipt=await this.request('GET','/requests/'+id(this.state.requestId));return {...receipt,...(this.mode==='autonomous'&&receipt.state==='awaiting_approval'?{mode:'autonomous',blocked:{code:'engine_autonomy_not_supported',message:'The engine still requires a separate approval for this action. No approval was fabricated. Cancel or check the engine deployment.'}}:{})};}
  async decide(decision,revision){return this.exclusive(async()=>{
    if(!this.state.requestId)fail('no_request','No action is pending in this session.');
    if(decision==='approve'){if(this.mode!=='confirm')fail('autonomous_only','This client does not offer a second approval gate.');if(typeof revision!=='string'||!revision||revision.length>256)fail('approval_required','Read the exact action and supply its approval revision.');await this.request('POST',`/requests/${id(this.state.requestId)}/approve`,{revision,decision:'approve'});}
    else if(decision==='cancel')await this.request('POST',`/requests/${id(this.state.requestId)}/cancel`,{});
    else fail('invalid_input','Choose approve or cancel.');
    return this.status();
  });}
}
