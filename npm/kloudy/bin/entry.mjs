#!/usr/bin/env node
import {readFileSync} from 'node:fs';
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
import {createInterface} from 'node:readline/promises';
import {installEditors} from '../src/editor-install.mjs';
import {askRemote,serveRemote} from '../src/remote.mjs';
const args=process.argv.slice(2);
try{
 if(!args.length||args[0]==='install'&&args.length===1){
  console.log('Kloudy · Add to your editor\nFree public discovery. Account actions require an authorized Kloudy key.');
  let rl;
  const confirm=async({client,path,authenticated})=>{if(!process.stdin.isTTY){console.log(`${client}: skipped — run in an interactive terminal to approve ${path}`);return false;}rl??=createInterface({input:process.stdin,output:process.stdout});return /^(y|yes)$/i.test((await rl.question(`Add Kloudy to ${client}? ${path}${authenticated?' (stores your key)':''} [y/N] `)).trim());};
  let results;try{results=await installEditors({confirm,key:process.env.KLOUDY_MCP_TOKEN,onResult:r=>console.log(`${r.client}: ${r.state}`)});}finally{rl?.close();}
  if(!results.length)console.log('No supported editor configuration found. Open https://kloudy.ai/install for setup help.');
  else console.log('Existing servers were preserved. Restart configured clients to connect.');
  if(results.some(r=>r.state==='unchanged_error'))process.exitCode=1;
 }else if(args[0]==='mcp'&&args.length===1){await serveRemote();}
 else if(args[0]==='--version'){console.log(version);}
 else if(['--help','help'].includes(args[0]))console.log('npx kloudy                 Add to detected editors (asks before each write)\nnpx kloudy <question>      Ask the public Kloudy MCP endpoint\nnpx kloudy mcp             Remote MCP over local stdio\nnpx kloudy bots list|search <words>|get|probe <id>|sync|works|broken <id> [--api URL]  Deployable bots catalog\nnpx kloudy legacy <args>   Existing SDK/engine CLI commands\n\nFree discovery needs no key. For authorized account actions set KLOUDY_MCP_TOKEN privately; never put a key in command arguments. Node 20.19+ required.');
 else if(args[0]==='bots'){const {botsCommand}=await import('../src/bots.mjs');try{await botsCommand(args.slice(1));}catch(e){process.stderr.write('kloudy bots: '+(e.message||e)+'\n');process.exitCode=1;}}
 else if(args[0]==='legacy'){process.argv.splice(2,1);await import('./kloudy.mjs');}
 else{if(args[0]?.startsWith('--'))throw Error('Unknown option');const result=await askRemote(args.join(' '));for(const c of result.content||[])if(c.type==='text')process.stdout.write((process.env.KLOUDY_MCP_TOKEN?c.text.replaceAll(process.env.KLOUDY_MCP_TOKEN,'[redacted]'):c.text)+'\n');if(result.isError)process.exitCode=1;}
}catch{process.stderr.write('Kloudy could not complete the request. Check your connection or authorized key. No action was retried. Run npx kloudy --help.\n');process.exitCode=1;}
