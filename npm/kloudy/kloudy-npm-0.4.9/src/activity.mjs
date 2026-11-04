// Public host adapter: operation state only. Never emits arguments, receipts or secrets.
const METHODS=new Set(['conversation','negotiateHost','action','walletConnection','hosting','wallet','introduce','ask','query','assemble','call','status','confirm','decide']);
export function observeClient(client,onActivity){
 if(!client||typeof onActivity!=='function')throw TypeError('Provide a Kloudy client and activity listener.');
 let active=0,sequence=0;
 const emit=(state,operation)=>{try{onActivity(Object.freeze({schema:'kloudy.activity/1',source:'kloudy',sequence:++sequence,state,operation}));}catch{/* A display listener cannot break or retry an engine action. */}};
 return new Proxy(client,{get(target,key){const value=Reflect.get(target,key);if(typeof value!=='function')return value;if(!METHODS.has(key))return value.bind(target);return async(...args)=>{active++;emit('thinking',key);try{const result=await value.apply(target,args);active--;const state=result?.state;emit(active?'thinking':state==='awaiting_approval'?'waiting':['queued','running'].includes(state)?'thinking':state==='failed'?'error':'idle',key);return result;}catch(error){active--;emit(active?'thinking':'error',key);throw error;}};}});
}

// A compatible IDE can mount this in its own status surface. This does not inject UI
// into arbitrary IDEs or claim that MCP alone owns a host's status bar.
export function mountStatusIndicator(root){
 const doc=root.ownerDocument,wrap=doc.createElement('span'),label=doc.createElement('span'),orb=doc.createElement('span');
 wrap.className='kloudy-indicator';wrap.setAttribute('role','status');wrap.setAttribute('aria-label','Kloudy ready');label.textContent='Kloudy';label.className='kloudy-indicator-label';orb.className='kloudy-indicator-orb';orb.setAttribute('aria-hidden','true');wrap.append(label,orb);root.append(wrap);wrap.dataset.state='idle';
 return {update(event){if(event?.schema!=='kloudy.activity/1'||event.source!=='kloudy'||!['idle','thinking','waiting','error','listening','speaking'].includes(event.state))return;wrap.dataset.state=event.state;wrap.setAttribute('aria-label','Kloudy '+({idle:'ready',thinking:'working',waiting:'needs approval',error:'could not finish',listening:'listening through your device',speaking:'speaking through your device'}[event.state]));},dispose(){wrap.remove();}};
}

// Covers every actual MCP tool call, including public reads and model discovery.
export function instrumentToolHandler(handler,onActivity=()=>{}){
 let active=0,sequence=0;
 const emit=state=>{try{onActivity({schema:'kloudy.activity/1',source:'kloudy',sequence:++sequence,state,operation:'tool_call'});}catch{}};
 return async request=>{active++;emit('thinking');let state='error';try{const result=await handler(request);state=result?.isError?'error':result?._meta?.kloudyApproval?'waiting':['queued','running'].includes(result?.structuredContent?.state)?'thinking':'idle';return result;}finally{active--;emit(active?'thinking':state);}};
}
