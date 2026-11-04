// User-owned compute adapter. No provider provisioning, routing or vault lives here.
import {KloudyError} from './client.mjs';
const fail=(code,message)=>{throw new KloudyError(code,message);};
const modelName=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:/@+-]{0,199}$/.test(value);
export class ModelClient {
 constructor({endpoint='http://127.0.0.1:11434/v1',resolveKey=async()=>null,fetcher=fetch,timeoutMs=90000}={}){
  let url;try{url=new URL(endpoint);}catch{}
  const local=url&&['127.0.0.1','[::1]','localhost'].includes(url.hostname);
  if(!url||url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&local))fail('invalid_model_endpoint','Use your HTTPS model endpoint or local Ollama endpoint without credentials in the URL.');
  if(typeof resolveKey!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)fail('invalid_model_config','Invalid model client configuration.');
  this.endpoint=url.href.replace(/\/$/,'');this.local=local;this.ollama=local&&url.port==='11434'&&url.pathname.replace(/\/$/,'')==='/v1';this.resolveKey=resolveKey;this.fetcher=fetcher;this.timeoutMs=timeoutMs;
 }
 async request(path,body){
  let key;try{key=await this.resolveKey();}catch{fail('model_key_unavailable','The host key resolver is unavailable.');}
  if(key!=null&&(typeof key!=='string'||!key||key.length>8192||/[\r\n]/.test(key)))fail('model_key_unavailable','The configured model credential is unavailable.');
  if(!this.local&&!key)fail('model_key_unavailable','Connect your own gateway credential through your host’s protected key resolver.');
  try{
   const target=path==='/api/tags'&&this.ollama?new URL('/api/tags',this.endpoint).href:this.endpoint+path;
   const response=await this.fetcher(target,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(this.timeoutMs),headers:{accept:'application/json',...(key?{authorization:'Bearer '+key}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   if(!response.ok)fail(response.status===401||response.status===403?'model_authorization_required':'model_unavailable','Your model endpoint rejected the request. Nothing was retried.');
   if(!response.headers.get('content-type')?.includes('application/json'))fail('invalid_model_response','Expected a JSON model response.');
   const reader=response.body.getReader();let size=0,chunks=[];
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576)fail('model_response_limit','Model response exceeds the limit.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   let result;try{result=JSON.parse(new TextDecoder().decode(bytes));}catch{fail('invalid_model_response','Expected a valid JSON model response.');}
   // An upstream error/body must not echo a gateway secret into a tool result.
   if(key&&JSON.stringify(result).includes(key))fail('invalid_model_response','Model response contained protected connection data.');
   return result;
  }catch(error){if(error instanceof KloudyError)throw error;fail('model_unavailable','Your model endpoint is unavailable. Nothing was retried.');}
 }
 async list(){
  const response=await this.request('/models');
  if(!Array.isArray(response?.data)||response.data.length>512||response.data.some(x=>!modelName(x?.id)))fail('invalid_model_catalog','The model endpoint returned an invalid catalog.');
  return {schema:'kloudy.models/1',state:'reachable',compute:this.local?'local_endpoint':'user_provider',provider_bill:'user',inference_verified:false,models:[...new Set(response.data.map(x=>x.id))].slice(0,128).map(id=>({id,status:'advertised'})),truncated:new Set(response.data.map(x=>x.id)).size>128};
 }
 async complete({model,prompt,maxTokens=128,allowProviderCharge=false}={}){
  if(!modelName(model)||typeof prompt!=='string'||!prompt.trim()||prompt.length>16000||!Number.isInteger(maxTokens)||maxTokens<1||maxTokens>4096||typeof allowProviderCharge!=='boolean')fail('invalid_model_request','Supply a model, bounded prompt and token limit.');
  if(!this.ollama&&!allowProviderCharge)fail('provider_charge_approval_required','Explicit authorization is required before using a provider through this endpoint.');
  const catalog=await this.list();if(!catalog.models.some(x=>x.id===model))fail('model_not_available','That model is not advertised by your endpoint.');
  if(this.ollama&&!allowProviderCharge){
   const tags=await this.request('/api/tags');
   const installed=tags?.models?.find(x=>x.name===model||x.model===model);
   if(!installed||!Number.isSafeInteger(installed.size)||installed.size<=0||installed.remote_host||installed.remote_model||/:cloud(?:$|[-:])/.test(model))fail('provider_charge_approval_required','This model is not verified as locally installed. Review its provider cost before running it.');
  }
  const result=await this.request('/chat/completions',{model,messages:[{role:'user',content:prompt}],max_tokens:maxTokens,stream:false});
  const text=result?.choices?.[0]?.message?.content;
  if(typeof text!=='string'||!text.trim()||text.length>32000)fail('invalid_model_response','The model did not return a bounded text answer.');
  return {schema:'kloudy.model-result/1',model,text,compute:catalog.compute,provider_bill:'user',usage:result.usage&&['prompt_tokens','completion_tokens','total_tokens'].every(k=>Number.isSafeInteger(result.usage[k])&&result.usage[k]>=0)?Object.fromEntries(['prompt_tokens','completion_tokens','total_tokens'].map(k=>[k,result.usage[k]])):null};
 }
}
export function configuredModels(env=process.env){
 const name=env.KLOUDY_MODEL_KEY_ENV;
 if(name&&!/^[A-Z][A-Z0-9_]{0,99}$/.test(name))fail('invalid_model_config','Use a credential environment reference, never the key itself.');
 return new ModelClient({endpoint:env.KLOUDY_MODEL_ENDPOINT||undefined,resolveKey:async()=>name?env[name]??null:null});
}
