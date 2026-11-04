import {validateSDF} from './sdf.mjs';
import {KloudyError} from './client.mjs';
const fail=(code,message)=>{throw new KloudyError(code,message);};
async function request(path,options,fetcher){
 let response;try{response=await fetcher('https://kloudy.ai'+path,{...options,redirect:'error',signal:AbortSignal.timeout(25000)});}catch{fail('public_unavailable','Kloudy public reading is unavailable. No account action was submitted.');}
 if(!response.ok)fail(response.status===429?'rate_limited':'public_unavailable','The public resource could not be read. Check the URL or try again later.');
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>2097152)fail('invalid_response','Public response exceeded its size limit.');chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString());}catch{fail('invalid_response','Expected a JSON public response.');}
}
export async function readPublicPage(address,{fetcher=fetch}={}){
 let url;try{url=new URL(address);}catch{}
 if(!url||!['https:','http:'].includes(url.protocol)||url.username||url.password||url.href.length>2048)fail('invalid_url','Use a public HTTP(S) URL without embedded credentials.');
 const result=await request('/api/read',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:url.href})},fetcher);
 let source;try{source=new URL(result.url);}catch{}
 if(!source||!['http:','https:'].includes(source.protocol)||source.username||source.password||typeof result.body!=='string'||typeof result.type!=='string')fail('invalid_response','Expected source-attributed public page content.');
 return {url:source.href,type:result.type,body:result.body,bytes:result.bytes??Buffer.byteLength(result.body)};
}
export async function readCard(path='/world',{fetcher=fetch}={}){
 if(typeof path!=='string'||!/^\/(?:[a-zA-Z0-9_-]|%20)*$/.test(path))fail('invalid_path','Use a Kloudy page path such as /world.');
 const card=await request('/cards/'+(path==='/'?'home':path.slice(1))+'.json',{headers:{accept:'application/json'}},fetcher);
 if(card?.interaction_mode!=='informational_only'||!Array.isArray(card.capabilities)||card.capabilities.length||typeof card.description!=='string'||card.description.length>5000||typeof card.name!=='string'||card.website!=='https://kloudy.ai'+path)fail('invalid_response','Expected an informational Kloudy card without execution permissions.');
 return card;
}
export async function convertPage(address,{fetcher=fetch,resolution="compact"}={}){
 let url;try{url=new URL(address);}catch{}
 if(!url||!['https:','http:'].includes(url.protocol)||url.username||url.password||url.href.length>2048)fail('invalid_url','Use a public HTTP(S) URL without embedded credentials.');
 if(!['compact','standard'].includes(resolution))fail('invalid_resolution','Choose compact or standard conversion.');
 const card=await request('/api/convert/sdf',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:url.href,resolution})},fetcher);
 if(!validateSDF(card).valid)fail('invalid_response','Expected a valid bounded SDF webpage card.');
 return card;
}
export async function convertPages(addresses,options={}){
 if(!Array.isArray(addresses)||!addresses.length||addresses.length>8||addresses.some(a=>typeof a!=='string'||a.length>2048))fail('invalid_input','Convert 1–8 public addresses at a time.');
 const cards=[],reports=[],seen=new Map();
 for(const address of addresses){let canonical;try{const url=new URL(address);url.hash='';canonical=url.username||url.password?'invalid-address':url.href;}catch{canonical=address;}
  if(seen.has(canonical)){reports.push({...seen.get(canonical),duplicate:true});continue;}
  let report;try{const card=await convertPage(address,options);cards.push(card);report={source:canonical,status:'converted',card_id:card.id};}catch(error){report={source:canonical,status:'unreadable',reason:error.code||'conversion_failed',message:error.code?error.message:'Conversion could not finish.'};}
  reports.push(report);seen.set(canonical,report);
 }
 return {schema:'kloudy.sdf.card-list/1',cards,reports,ranking:'none',model_calls:0};
}
