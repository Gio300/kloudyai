// `kloudy bots` — offline-first deployable-bots catalog.
//   kloudy bots list   [--status verified|untested|reported-broken] [--kind http|npx|uvx] [--device d] [--limit n] [--offset n] [--json]
//   kloudy bots search <words> [same flags]
//   kloudy bots get    <id> [--json]
//   kloudy bots sync                      download the full catalog to the local cache
//   kloudy bots works|broken <id>         tell Kloudy whether a bot worked for you (free, keyless, no personal data)
// Lookup order: bundled catalog (if this build ships one) -> ~/.cache/kloudy/deployable-bots.json.gz -> live API.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {homedir} from 'node:os';
import {join} from 'node:path';
const BASE=process.env.KLOUDY_BOTS_API||'https://kloudy.ai/api/deployable-bots';
const cacheDir=()=>process.env.KLOUDY_CACHE_DIR||join(process.env.XDG_CACHE_HOME||join(homedir(),'.cache'),'kloudy');
const cacheFile=()=>join(cacheDir(),'deployable-bots.json.gz');
const bundled=[new URL('./deployable-bots.json.gz',import.meta.url),new URL('../../deploy/deployable-bots.json.gz',import.meta.url)];
const words=s=>String(s||'').toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(w=>w.length>1);
function decode(buf){const d=JSON.parse(gunzipSync(buf));return d.bots.map(([id,name,kind,cls,endpoint,license,url,score,caps,targets,botboozle])=>({id,name,kind,cls,endpoint,license,url,score,caps,targets,botboozle})).filter(b=>b.cls!=='D');}
export function loadLocal(){
  for(const p of [cacheFile(),...bundled])try{if(existsSync(p))return {source:String(p),bots:decode(readFileSync(p))};}catch{}
  return null;
}
const TIER={A:0,C:1,B:2};
export function localSearch(bots,{q='',status,kind,device,limit=25,offset=0}={}){
  const terms=words(q);let pool=bots.map((b,i)=>({b,i,hits:terms.filter(t=>(b.name+' '+b.id+' '+b.caps.join(' ')).toLowerCase().includes(t)).length}));
  if(terms.length)pool=pool.filter(x=>x.hits);
  pool=pool.map(x=>({...x,status:x.b.cls==='A'?'verified':'untested'}));
  if(status)pool=pool.filter(x=>x.status===status);if(kind)pool=pool.filter(x=>x.b.kind===kind);if(device)pool=pool.filter(x=>x.b.targets.includes(device));
  pool.sort((x,y)=>TIER[x.b.cls]-TIER[y.b.cls]||y.hits-x.hits||y.b.score-x.b.score||x.i-y.i);
  return {matched:pool.length,offset,items:pool.slice(offset,offset+limit).map(({b,status})=>({id:b.id,name:b.name,kind:b.kind,status,endpoints:[b.kind==='http'?{type:'mcp-http',url:b.endpoint}:{type:'local-'+b.kind,command:b.endpoint}],free:true,needs_botboozle:!!b.botboozle,works_count:null,broken_count:null,license:b.license,source_url:b.url}))};
}
async function remote(path,init){const r=await fetch(BASE+path,{...init,signal:AbortSignal.timeout(8000)});const body=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(body.error||'HTTP '+r.status),{status:r.status});return body;}
function flags(args){const o={_:[]};for(let i=0;i<args.length;i++){const a=args[i];if(a.startsWith('--')){const k=a.slice(2);if(k==='json'||k==='offline')o[k]=true;else o[k]=args[++i];}else o._.push(a);}return o;}
const line=b=>`${b.status==='verified'?'✔':b.status==='reported-broken'?'✖':'·'} ${b.id}  [${b.kind}${b.works_count!=null?` +${b.works_count}/-${b.broken_count}`:''}]  ${b.endpoints[0].url||b.endpoints[0].command}`;
export async function botsCommand(args,{out=s=>console.log(s)}={}){
  const [sub='list',...rest]=args,o=flags(rest),limit=Number(o.limit||25),offset=Number(o.offset||0);
  const print=(r,src)=>{if(o.json)return out(JSON.stringify({...r,source:src},null,2));out(`${r.matched} bots (${src})`);for(const b of r.items)out(line(b));if(r.matched>offset+r.items.length)out(`more: --offset ${offset+r.items.length}`);};
  if(sub==='sync'){const r=await fetch(BASE+'/export',{signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error('Sync failed: HTTP '+r.status);
    const {gzipSync}=await import('node:zlib');const text=await r.text();mkdirSync(cacheDir(),{recursive:true});writeFileSync(cacheFile(),gzipSync(text));out(`cached ${decode(gzipSync(text)).length} bots at ${cacheFile()}`);return;}
  if(sub==='works'||sub==='broken'){const id=o._[0];if(!id)throw new Error(`Usage: kloudy bots ${sub} <id>`);
    const r=await remote('/feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,works:sub==='works'})});out(`thanks — recorded "${sub}" for ${r.id}`);return;}
  if(sub==='get'){const id=o._[0];if(!id)throw new Error('Usage: kloudy bots get <id>');
    if(!o.offline)try{const r=await remote('/'+encodeURIComponent(id));return out(JSON.stringify(r.bot,null,2));}catch(e){if(e.status===404)throw e;}
    const l=loadLocal();const hit=l&&localSearch(l.bots.filter(b=>b.id===id)).items[0];if(!hit)throw new Error('Unknown bot id (offline). Run `kloudy bots sync`.');return out(JSON.stringify(hit,null,2));}
  if(sub!=='list'&&sub!=='search')throw new Error('Usage: kloudy bots list|search|get|sync|works|broken');
  const q=sub==='search'?o._.join(' '):'';const query={q,status:o.status,kind:o.kind,device:o.device,limit,offset};
  const l=loadLocal();
  // Offline first: answer from bundled/cached data; the live API adds user-reported status when reachable and the cache is missing.
  if(l||o.offline){if(!l)throw new Error('No local catalog. Run `kloudy bots sync`.');return print(localSearch(l.bots,query),'local: '+l.source);}
  const p=new URLSearchParams(Object.entries({q,status:o.status,kind:o.kind,device:o.device,intent:o.intent,tier:o.tier,limit,offset}).filter(([,v])=>v!=null&&v!==''));
  return print(await remote('?'+p),'live');
}
