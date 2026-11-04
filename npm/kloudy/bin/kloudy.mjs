#!/usr/bin/env node
import {configuredModels} from '../src/models.mjs';
import {terminalStatus} from '../src/terminal-status.mjs';
import {readFile} from 'node:fs/promises';
import {withConnection} from '../src/connection.mjs';
import {serveMcp} from '../src/mcp.mjs';
import {createWrapper} from '../src/wrap.mjs';
import {install} from '../src/install.mjs';
import {introduce,isAttachIntent} from '../src/introduce.mjs';
import {readPublicPage,readCard,convertPage} from '../src/public.mjs';
import {localStrings} from '../src/strings.mjs';
import {createStarter} from '../src/starter.mjs';
const indicator=terminalStatus();
const args=process.argv.slice(2),command=args.shift()||'introduce';
function option(name){const index=args.indexOf('--'+name);if(index<0)return null;if(index===args.length-1||args[index+1].startsWith('--'))throw new Error('Option value required');const value=args[index+1];args.splice(index,2);return value;}
const output=value=>process.stdout.write(JSON.stringify(value,null,2)+'\n');
try{
 if(args.includes('--mode')||args.includes('--revision')||command==='approve')throw new Error('CLI is autonomous-only');
 const connection=option('connection')||process.env.KLOUDY_CONNECTION;
 const project=option('project')||process.cwd(),decision=option('decision');
 if(command==='help'||command==='--help'){
  console.log('Ask for Kloudy. One CLI, one MCP, tools appear when needed.\n\nkloudy models list [--endpoint URL] [--key-env NAME]\nkloudy models run NAME --prompt-file FILE [--max-tokens 128] [--allow-provider-charge]\nkloudy init my-app\nkloudy read https://example.com\nkloudy card /world\nkloudy convert https://example.com\nkloudy query "need" --connection FILE\nkloudy ask "goal" --connection FILE [--candidates FILE]\nkloudy assemble --selections FILE --connection FILE\nkloudy call NAME --inputs FILE [--selection ID] --connection FILE\nkloudy action chain.head --inputs FILE --connection FILE [--idempotency-key KEY]\nkloudy wallet-connect ethereum --connection FILE\nkloudy hosting [--budget-micros 100000000] --connection FILE\nkloudy wallet balance --connection FILE\nkloudy wallet top_up --amount 10.00 --connection FILE\nkloudy conversation read|append|sync --inputs FILE --connection FILE\nkloudy host --connection FILE\nkloudy status --connection FILE\nkloudy cancel --connection FILE\nkloudy mcp --connection FILE\nkloudy introduce [--project DIR] [--decision yes|no]\nkloudy install [--ide cursor|claude|vscode|codex] [--url HTTPS_URL] [--token-env NAME] [--connection FILE]\nkloudy wrap --config FILE [--port 8796]\nkloudy strings save NAME --selections FILE\nkloudy strings use NAME\nkloudy strings call NAME --tool ALIAS --inputs FILE\nkloudy strings list|prune\nkloudy strings keep|remove NAME\nkloudy login\n\nRegister with email + short 2FA through the Core account service. Existing engine connections remain usable. Hosted registration is not supplied by this client package.');
 }else if(command==='models'){
  const action=args.shift(),endpoint=option('endpoint'),keyEnv=option('key-env'),file=option('prompt-file'),max=option('max-tokens');
  const allow=args.includes('--allow-provider-charge');if(allow)args.splice(args.indexOf('--allow-provider-charge'),1);
  const client=configuredModels({...process.env,...(endpoint?{KLOUDY_MODEL_ENDPOINT:endpoint}:{}),...(keyEnv?{KLOUDY_MODEL_KEY_ENV:keyEnv}:{})});
  if(action==='list'&&!args.length&&!file&&!max&&!allow)output(await client.list());
  else if(action==='run'&&args.length===1&&file&&(!max||/^[1-9]\d{0,3}$/.test(max)))output(await client.complete({model:args[0],prompt:await readFile(file,'utf8'),maxTokens:max?Number(max):128,allowProviderCharge:allow}));
  else throw Error('Invalid models arguments');
 }else if(['init','read','card','convert'].includes(command)){const resolution=option('resolution')||'compact';if(args.length!==1||args[0].startsWith('--'))throw Error('One argument required');output(command==='init'?await createStarter(args[0]):command==='read'?await readPublicPage(args[0]):command==='convert'?await convertPage(args[0],{resolution}):await readCard(args[0]));}
 else if(command==='introduce'||isAttachIntent(command)||(command==='ask'&&isAttachIntent(args.join(' ')))){if(decision&&!['yes','no'].includes(decision))throw Error('Choose yes or no');if(decision==='yes')output(await install({ide:option('ide')||'auto',connection,url:option('url')||undefined,tokenEnv:option('token-env')||undefined}));else output(await introduce({project,decision,connection}));}
 else if(command==='install'){option('project');output(await install({ide:option('ide')||'auto',connection,url:option('url')||undefined,tokenEnv:option('token-env')||undefined}));}
 else if(command==='mcp'){await serveMcp(connection);}
 else if(command==='wrap'){
  const file=option('config'),port=Number(option('port')||8796);if(!file||!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('Invalid wrapper options');
  const config=JSON.parse(await readFile(file,'utf8'));const token=process.env.KLOUDY_WRAP_TOKEN;
  const server=createWrapper({...config,token});server.listen(port,'127.0.0.1',()=>process.stderr.write('Kloudy local HTTPK wrapper listening.\n'));
 }else if(command==='strings'){
  const action=args.shift(),name=args.shift(),file=option('selections'),tool=option('tool'),inputs=option('inputs'),selectionId=option('selection'),store=localStrings({project});
  if(args.length)throw Error('Unexpected strings arguments');
  if(action==='save'){if(!file)throw Error('Selections file required');output(await store.save(name,JSON.parse(await readFile(file,'utf8'))));}
  else if(action==='list')output(await store.list());
  else if(action==='use'){output(await store.use(name));}
  else if(action==='call'){if(!inputs||!tool)throw Error('Tool and inputs required');output(await store.call(name,tool,JSON.parse(await readFile(inputs,'utf8')),{selectionId}));}
  else if(action==='keep')output(await store.keep(name));
  else if(action==='remove')output(await store.remove(name));
  else if(action==='prune')output(await store.prune());
  else throw Error('Unknown strings action');
 }else if(command==='login'){
  output({status:'registration_unavailable',message:'Ask for Kloudy. Email + short 2FA, then a session cookie/tag or OAuth, belongs to the Core account service. No registration endpoint is published yet. No email or code was collected.',url:'https://kloudy.ai/connect'});process.exitCode=3;
 }else{
  const walletAmount=option('amount'),budgetMicros=option('budget-micros'),idempotencyKey=option('idempotency-key');
  const candidatesFile=option('candidates'),inputsFile=option('inputs'),selectionsFile=option('selections'),selectionId=option('selection'),lane=option('lane')||'non_medical';
  if(args.some(x=>x.startsWith('--')))throw new Error('Unknown option');
  const result=await withConnection(connection,async client=>{
   if(command==='conversation'){if(!client.conversation||args.length!==1||!inputsFile)throw Error('Use conversation read|append|sync --inputs FILE with a scoped connection');return client.conversation(args[0],JSON.parse(await readFile(inputsFile,'utf8')));}
   if(command==='action'){if(!client.action||args.length!==1||!inputsFile)throw Error('Action name and inputs file required');return client.action(args[0],JSON.parse(await readFile(inputsFile,'utf8')),{idempotencyKey:idempotencyKey??undefined});}
   if(command==='wallet-connect'){if(!client.walletConnection||args.length!==1)throw Error('Chain required');return client.walletConnection(args[0]);}
   if(command==='hosting'){if(!client.hosting||args.length||budgetMicros!==null&&!/^[1-9]\d*$/.test(budgetMicros))throw Error('Use an integer USD-micros budget');return client.hosting({budgetUsdMicros:budgetMicros===null?undefined:Number(budgetMicros)});}
   if(command==='wallet'){if(!client.wallet||args.length!==1)throw Error('HTTPK wallet operation required');return client.wallet({operation:args[0],amount_usd:walletAmount??undefined});}
   if(command==='query'){if(!client.query)throw Error('Query needs an HTTPK connection');return client.query(args.join(' '));}
   if(command==='ask'){const supplied=candidatesFile?JSON.parse(await readFile(candidatesFile,'utf8')):[];return client.ask(args.join(' '),{candidates:Array.isArray(supplied)?supplied:supplied.candidates,lane});}
   if(command==='assemble'){if(!client.assemble||!selectionsFile)throw Error('HTTPK connection and selections file required');return client.assemble(JSON.parse(await readFile(selectionsFile,'utf8')));}
   if(command==='call'){if(args.length!==1||!inputsFile)throw new Error('Tool and inputs file required');if(selectionId&&!client.assemble)throw Error('Explicit selection requires HTTPK');return client.call(args[0],JSON.parse(await readFile(inputsFile,'utf8')),{selectionId});}
   if(command==='host'){if(args.length||!client.negotiateHost)throw Error('HTTPK host required');return client.negotiateHost();}
   if(command==='status')return client.status();
   if(command==='cancel')return client.decide('cancel');
   throw new Error('Unknown command');
  },{onActivity:event=>indicator.update(event)});output(result);
 }
}catch(error){output({error:error.code||'invalid_request',message:error.code?error.message:'The request could not be completed. Run kloudy help.'});process.exitCode=1;}finally{indicator.dispose();}
