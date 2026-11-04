import {mkdir,readFile,writeFile,rename,rmdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {KloudyError} from './client.mjs';
import {homedir} from 'node:os';
import {withConnection} from './connection.mjs';
const fail=(code,message)=>{throw new KloudyError(code,message);};
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(value);
function selection(value){
 if(!value||Object.keys(value).some(k=>!['source','kind','goal'].includes(k))||!id(value.source)||!['mcp','sdk','cli'].includes(value.kind)||typeof value.goal!=='string'||!value.goal.trim()||value.goal.length>500)fail('invalid_selection','Use a source alias, mcp/sdk/cli kind, and a goal of 1–500 characters. Credentials and tool definitions do not belong in a saved string.');
 return {source:value.source,kind:value.kind,goal:value.goal.trim()};
}
// Durable intent references only. Engine-owned selections and schemas are refreshed
// at use time; this never replays a stale selection or invokes a provider action.
export class StringStore {
 constructor({file,project,connect,now=()=>Date.now()}){if(!file||!project||typeof connect!=='function')fail('invalid_store','A private store, project ID and connection resolver are required.');this.file=resolve(file);this.project=resolve(project);this.connect=connect;this.now=now;}
 async read(){try{const value=JSON.parse(await readFile(this.file,'utf8'));if(value.schema!=='kloudy.strings/1'||!Array.isArray(value.strings)||value.strings.length>100)throw Error();return value;}catch(error){if(error.code==='ENOENT')return {schema:'kloudy.strings/1',strings:[]};fail('invalid_store','The saved strings could not be read. No data was replaced.');}}
 async mutate(work){await mkdir(dirname(this.file),{recursive:true,mode:0o700});const lock=this.file+'.lock';try{await mkdir(lock,{mode:0o700});}catch{fail('store_busy','Another strings operation is running. Retry after it finishes.');}try{const value=await this.read(),result=await work(value);const temp=this.file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temp,this.file);return result;}finally{await rmdir(lock);}}
 async save(name,values){if(!id(name)||!Array.isArray(values)||!values.length||values.length>16)fail('invalid_string','Name the string and choose 1–16 source selections.');const choices=[...new Map(values.map(v=>{const s=selection(v);return[JSON.stringify(s),s];})).values()];return this.mutate(db=>{const old=db.strings.find(s=>s.project===this.project&&s.name===name);if(old)fail('already_saved','This string already exists. Remove it explicitly before replacing it.');if(db.strings.length>=100)fail('store_full','Remove an unused string first.');const value={id:randomUUID(),name,project:this.project,choices,createdAt:this.now(),lastUsedAt:null,retention:'temporary',status:'saved'};db.strings.push(value);return value;});}
 async list(){return (await this.read()).strings.filter(s=>s.project===this.project);}
 async remove(name){return this.mutate(db=>{const index=db.strings.findIndex(s=>s.project===this.project&&s.name===name);if(index<0)fail('not_found','No string with that name exists in this project.');db.strings.splice(index,1);return {name,status:'removed',providerCredentialsRevoked:false};});}
 async keep(name){return this.mutate(db=>{const entry=db.strings.find(s=>s.project===this.project&&s.name===name);if(!entry)fail('not_found','No string with that name exists in this project.');entry.retention='kept';return {...entry,grantStatus:'not_requested',notice:'Saved for reuse. Permanent provider access still requires the existing GlassBreak authorization path.'};});}
 async prune({idleDays=30}={}){if(!Number.isInteger(idleDays)||idleDays<1||idleDays>365)fail('invalid_retention','Use 1–365 idle days.');return this.mutate(db=>{const removed=[];db.strings=db.strings.filter(s=>{const dormant=s.project===this.project&&s.retention!=='kept'&&this.now()-(s.lastUsedAt??s.createdAt)>=idleDays*86400000;if(dormant)removed.push(s.name);return !dormant;});return {removed,providerCredentialsRevoked:false};});}
 async use(name){
  const entry=(await this.list()).find(s=>s.name===name);if(!entry)fail('not_found','No string with that name exists in this project.');
  const tools=[],routes=[],selections=[],seen=new Map();
  for(const raw of entry.choices){const choice=selection(raw);const selected=await this.connect(choice.source,choice.kind,client=>client.ask(choice.goal));const definitions=selected?.toolbox?.tools;if(!Array.isArray(definitions)||definitions.length!==1||!selected.selection_id||!selected.sessionId)fail('selection_unavailable','A saved choice is unavailable or needs renewed authorization. No action ran.');
   const tool=definitions[0];if(typeof tool.name!=='string'||!tool.name||tool.name.length>128)fail('invalid_response','The source returned an invalid selected tool.');
   const identity=choice.source+'\n'+tool.name;let alias=seen.get(identity);
   if(!alias){if(tools.length===8)fail('toolbox_limit','This string selects more than eight tools. Split it into smaller task-specific strings.');alias='s'+tools.length+'_'+tool.name.replace(/[^a-zA-Z0-9_-]/g,'_');seen.set(identity,alias);tools.push({...tool,name:alias});}
   const route={name:alias,source:choice.source,kind:choice.kind,tool:tool.name,selection_id:selected.selection_id,sessionId:selected.sessionId};routes.push(route);selections.push({...route,arguments:selected.arguments});
  }
  await this.mutate(db=>{const latest=db.strings.find(s=>s.project===this.project&&s.name===name);if(!latest||latest.id!==entry.id)fail('removed_during_use','This string was removed while selecting. Select again.');latest.lastUsedAt=this.now();latest.activeRoutes=routes;latest.status='saved';});
  return {schema:'kloudy.toolbox/1',name,project:this.project,toolbox:{status:'ready',tools,measurements:{definitionsEmitted:tools.length}},routes,selections,notice:'Selections are session-scoped. No provider action was executed; the engine rechecks permission at call time.'};
 }
 async call(name,tool,inputs,{selectionId}={}){
  const entry=(await this.list()).find(s=>s.name===name),matches=entry?.activeRoutes?.filter(r=>r.name===tool&&(!selectionId||r.selection_id===selectionId))||[];
  if(matches.length>1)fail('ambiguous_selection','This tool has several owned selections. Choose the exact selection ID from the returned routes.');const route=matches[0];
  if(!route)fail('not_selected','Use this string first, then choose one exact returned tool alias.');
  return this.connect(route.source,route.kind,async client=>{await client.session();if(client.state.sessionId!==route.sessionId)fail('stale_selection','The connection session changed. Use this string again before calling a tool.');return client.call(route.tool,inputs,{selectionId:route.selection_id});});
 }
}
export function localStrings({project=process.cwd(),home=homedir(),mode='autonomous'}={}){
 const directory=resolve(home,'.kloudy');
 return new StringStore({file:resolve(directory,'strings.json'),project,connect:async(alias,kind,work)=>{
  let sources;try{sources=JSON.parse(await readFile(resolve(directory,'sources.json'),'utf8'));}catch{fail('sources_unavailable','Configure trusted source aliases in ~/.kloudy/sources.json first.');}
  const source=Object.hasOwn(sources,alias)?sources[alias]:null;
  if(!source||source.kind!==kind||typeof source.connection!=='string'||!source.connection)fail('source_unavailable','This source alias is missing or has a different adapter kind.');
  return withConnection(resolve(directory,source.connection),work,{mode});
 }});
}
