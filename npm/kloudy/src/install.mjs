import {readFile,writeFile,mkdir,rename,stat,copyFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {editorEntry} from './editor-install.mjs';
import {randomUUID} from 'node:crypto';
import {parse} from 'smol-toml';
import {KloudyError} from './client.mjs';
const slashText='When the user types Kloudy or /kloudy, call the kloudy MCP tool with operation introduce. Use the current project context supplied by the host, not another project’s checkpoint or conversation. Render its project-aware greeting and one installation/connect question. If the user declines, stay chat-only. Only run kloudy install after explicit consent, within the IDE permission ceiling. One user-level install covers projects. Use the engine-selected singular Toolbox tool for subsequent work; never print secrets or invent authorization.\n';
export function hostPaths(home=homedir(),platform=process.platform,appData=process.env.APPDATA){
 const code=platform==='win32'?join(appData||join(home,'AppData/Roaming'),'Code/User'):platform==='darwin'?join(home,'Library/Application Support/Code/User'):join(home,'.config/Code/User');
 return {cursor:{detect:join(home,'.cursor'),file:join(home,'.cursor/mcp.json'),key:'mcpServers',slash:join(home,'.cursor/commands/kloudy.md')},claude:{detect:join(home,'.claude'),file:join(home,'.claude.json'),key:'mcpServers',slash:join(home,'.claude/commands/kloudy.md')},vscode:{detect:code,file:join(code,'mcp.json'),key:'servers'},codex:{detect:join(home,'.codex'),file:join(home,'.codex/config.toml'),key:'mcp_servers',toml:true}};
}
async function text(path){try{return await readFile(path,'utf8');}catch(error){if(error.code==='ENOENT')return undefined;throw new KloudyError('config_unreadable','Existing IDE config could not be read; it was left unchanged.');}}
async function atomic(path,next,old){await mkdir(dirname(path),{recursive:true});if(await text(path)!==old)throw new KloudyError('config_changed','IDE configuration changed during installation. Retry without closing your IDE.');if(old!==undefined)await copyFile(path,path+'.kloudy-backup-'+randomUUID());const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,next,{mode:0o600,flag:'wx'});await rename(tmp,path);}
export async function install({ide='auto',connection,home=homedir(),platform=process.platform,appData=process.env.APPDATA,url,tokenEnv='KLOUDY_MCP_TOKEN'}={}){
 const hosts=hostPaths(home,platform,appData);if(ide!=='auto'&&!hosts[ide])throw new KloudyError('unsupported_ide','Use cursor, claude, vscode, codex or auto.');
 if(url){let u;try{u=new URL(url);}catch{}if(!u||u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(tokenEnv))throw new KloudyError('invalid_endpoint','Use an HTTPS MCP URL without credentials and an environment variable name.');}
 const results=[];
 for(const [name,host] of Object.entries(hosts)){
  if(ide!=='auto'&&ide!==name)continue;
  if(ide==='auto'){try{await stat(host.detect);}catch{try{await stat(host.file);}catch{continue;}}}
  const path=host.file,old=await text(path);let value;
  try{value=old===undefined?{}:host.toml?parse(old):JSON.parse(old);}catch{throw new KloudyError('config_unreadable','Existing IDE config could not be parsed; it was left unchanged.');}
  if(!value||typeof value!=='object'||Array.isArray(value)||value[host.key]&&(typeof value[host.key]!=='object'||Array.isArray(value[host.key])))throw new KloudyError('config_unreadable','Existing IDE config was left unchanged.');
  const entry=url?(name==='codex'?{url,bearer_token_env_var:tokenEnv}:{...(name==='cursor'?{}:{type:'http'}),url,headers:{Authorization:'Bearer ${'+(name==='claude'?'':'env:')+tokenEnv+'}'}}):connection?{...(['claude','vscode'].includes(name)?{type:'stdio'}:{}),command:'npx',args:['-y','kloudy@latest','legacy','mcp','--connection',resolve(connection)]}:editorEntry({...host,id:name==='claude'?'claude-code':name});
  const existing=value[host.key]?.kloudy;
  if(existing&&JSON.stringify(existing)!==JSON.stringify(entry)){results.push({ide:name,state:'existing_kloudy_preserved',scope:'user',path});continue;}
  let next;if(host.toml){next=old||'';if(!existing)next+='\n[mcp_servers.kloudy]\n'+Object.entries(entry).map(([k,v])=>k+' = '+JSON.stringify(v)).join('\n')+'\n';parse(next);}else{value[host.key]??={};value[host.key].kloudy=entry;next=JSON.stringify(value,null,2)+'\n';}
  if(old!==next)await atomic(path,next,old);
  if(host.slash){await mkdir(dirname(host.slash),{recursive:true});const prior=await text(host.slash);if(prior===undefined)await writeFile(host.slash,slashText,{flag:'wx',mode:0o600});}
  results.push({ide:name,state:old===next?'already_installed':'installed',scope:'user',path,transport:url||!connection?'streamable-http':'stdio'});
 }
 if(results.some(r=>r.state!=='existing_kloudy_preserved')){const record=join(home,'.kloudy/install.json'),old=await text(record);let saved={schema:'kloudy.user-install/1',scope:'user',ides:[]};if(old){try{saved=JSON.parse(old);}catch{throw new KloudyError('install_record_invalid','The user installation record needs repair; IDE configs were installed.');}}saved.ides=[...new Set([...(saved.ides||[]),...results.filter(r=>r.state!=='existing_kloudy_preserved').map(r=>r.ide)])].sort();const next=JSON.stringify(saved,null,2)+'\n';if(next!==old)await atomic(record,next,old);}
 return {product:'Kloudy',scope:'user',results,...(!results.length?{next:'Choose --ide cursor, claude, vscode or codex to create a user-level entry. No project files were changed.'}:{}),availability:url?'Configured remote entry. Verify the hosted endpoint and user grant before claiming attachment.':'Local MCP adapter installed for all projects. Hosted registration and remote execution still require the account/engine service.'};
}
