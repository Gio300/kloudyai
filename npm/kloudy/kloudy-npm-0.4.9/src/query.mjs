import {KloudyError} from './client.mjs';
import {validateSDF} from './sdf.mjs';
const fail=message=>{throw new KloudyError('invalid_query',message);};
const engineBytes=value=>Buffer.byteLength(JSON.stringify(value).replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')));
export function queryInput(need,{scope,limit=3}={}){
 if(typeof need!=='string'||!need.trim()||need.length>1000||/[\x00-\x1f]/.test(need)||!Number.isInteger(limit)||limit<1||limit>5)fail('Use a need of 1–1000 characters and a result limit of 1–5.');
 if(scope!==undefined){if(!scope||typeof scope!=='object'||Array.isArray(scope)||Object.keys(scope).some(k=>!['sources','discovered_via','service_area'].includes(k)))fail('Use the documented discovery scope.');
  if(scope.sources!==undefined&&(!Array.isArray(scope.sources)||scope.sources.length>8||new Set(scope.sources).size!==scope.sources.length||scope.sources.some(s=>typeof s!=='string'||s.length>512||!safeURL(s))))fail('Scope sources must be up to eight distinct public URLs.');
  if(scope.discovered_via!==undefined&&(!Array.isArray(scope.discovered_via)||!scope.discovered_via.length||scope.discovered_via.length>2||new Set(scope.discovered_via).size!==scope.discovered_via.length||scope.discovered_via.some(s=>!['seo','geo'].includes(s))))fail('Discovery scope is seo and/or geo.');
  if(scope.service_area!==undefined&&(typeof scope.service_area!=='string'||!scope.service_area.trim()||scope.service_area.length>80||/[\x00-\x1f]/.test(scope.service_area)))fail('Use a service area of 1–80 characters.');
 }
 const input={version:'kldy.query/1',need,limit,...(scope?{scope}:{})};if(engineBytes(input)>2048)fail('The complete query must fit in 2 KiB.');return input;
}
function safeURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}}
export function queryResult(result,limit){
 if(!result||Object.keys(result).some(k=>!['version','query_sha256','state','matches','execution_started','permission_granted','next','measurements'].includes(k)))throw new KloudyError('invalid_response','Expected card references, not additional payloads.');
 const allowed=['card_id','title','source_url','content_sha256','score','provenance','expires_at'];
 if(result?.version!=='kldy.query/1'||!['matched','no_match'].includes(result.state)||!Array.isArray(result.matches)||result.matches.length>limit||result.execution_started!==false||result.permission_granted!==false||result.measurements?.definitions_emitted!==0||result.matches.some(m=>!m||Object.keys(m).some(k=>!allowed.includes(k))||typeof m.card_id!=='string'||typeof m.title!=='string'||!safeURL(m.source_url)||!/^[a-f0-9]{64}$/.test(m.content_sha256)||!Number.isFinite(m.expires_at)))throw new KloudyError('invalid_response','Expected bounded KLDY card references without tool definitions or permission.');
 return result;
}
export function sdfIndex(cards,{discoveredVia,ttlSeconds=3600,now=Date.now()/1000}={}){
 if(!Array.isArray(cards)||cards.length>64||!['seo','geo'].includes(discoveredVia)||!Number.isInteger(ttlSeconds)||ttlSeconds<1||ttlSeconds>86400)fail('Provide up to 64 validated cards, actual SEO/GEO provenance, and a lifetime of 1–86400 seconds.');
 const seen=new Set(),entries=[];
 for(const card of cards){if(!validateSDF(card).valid)fail('Every indexed card must pass SDF validation.');if(seen.has(card.id))continue;seen.add(card.id);const fetched=Date.parse(card.source.fetched_at)/1000,expires=Math.min(now+ttlSeconds,fetched+86400);if(expires<=now||fetched>now+300)fail('Refresh expired or future-dated source content before indexing.');
  entries.push({id:card.id,source_url:card.source.url,discovered_via:discoveredVia,title:card.source.title.slice(0,120),summary:card.summary.brief,tags:[],capability_ids:[],service_areas:[],content_sha256:card.provenance.content_hash.slice(7),expires_at:expires});
 }
 const envelope={version:'bbe.sdf-index/1',cards:entries};if(engineBytes(envelope)>65536)fail('Split this index into smaller batches; the engine limit is 64 KiB.');return envelope;
}
