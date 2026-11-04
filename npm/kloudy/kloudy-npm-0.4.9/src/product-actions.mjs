// Product-side validation only. The single HTTPK remains the execution authority.
const bounded=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max;
const identifier=value=>bounded(value,80)&&/^[a-zA-Z0-9_.:-]+$/.test(value);
export function actionInput(action,inputs){
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))throw Error('invalid_action_input');
 const schemas={
  'chain.head':{chain:v=>bounded(v,80)},
  'wallet.prepare':{chain:v=>bounded(v,100),destination_chain:v=>bounded(v,100),sender:v=>bounded(v,100),recipient:v=>bounded(v,100),amount_atomic:v=>bounded(v,100)&&/^[1-9]\d*$/.test(v)},
  'bww.fetch':{project:identifier,fragment_ids:v=>Array.isArray(v)&&v.length>=1&&v.length<=8&&new Set(v).size===v.length&&v.every(identifier),allow_html:v=>typeof v==='boolean'},
  'bww.publish':{project:identifier,fragment_id:identifier,title:v=>bounded(v,120),text:v=>bounded(v,8000),html:v=>v===null||typeof v==='string'&&v.length<=12000,advertisement:v=>v===null||v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===2&&bounded(v.provider,80)&&bounded(v.text,500)}
 };
 const schema=schemas[action];
 if(!schema||Object.keys(inputs).length!==Object.keys(schema).length||!Object.entries(schema).every(([key,validate])=>Object.hasOwn(inputs,key)&&validate(inputs[key])))throw Error('invalid_action_input');
 return {type:'action',action,inputs};
}
export function hostingParams(budget){
 if(budget===undefined)return {};
 if(!Number.isSafeInteger(budget)||budget<=0||budget>1_000_000_000_000)throw Error('invalid_budget');
 return {budget_usd_micros:budget};
}
export function connectionParams(chain){if(!bounded(chain,100))throw Error('invalid_chain');return {chain};}
export function stableIntentKey(key){if(!bounded(key,128)||!/^[a-zA-Z0-9_.:-]+$/.test(key))throw Error('invalid_idempotency_key');return key;}
