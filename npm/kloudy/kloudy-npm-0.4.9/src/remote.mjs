import {readFileSync} from 'node:fs';
const packageVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema,ListResourcesRequestSchema,ReadResourceRequestSchema,ListResourceTemplatesRequestSchema,ToolListChangedNotificationSchema,ResourceListChangedNotificationSchema} from '@modelcontextprotocol/sdk/types.js';
import {REMOTE} from './editor-install.mjs';
import {autoupdateEnabled} from './autoupdate.mjs';
import {chooserResponse,pendingChooserResponse,pendingChooserTool} from './chooser-link.mjs';
import {WebsiteSelectionReturn,websiteReturnTool} from './website-return.mjs';
const transports=new WeakMap();
// This proxy can relay Apps rendering, but cannot service sampling, roots or elicitation.
export function forwardedCapabilities(value={}){
 const ui=value.experimental?.['io.modelcontextprotocol/ui'];
 const mimeTypes=Array.isArray(ui?.mimeTypes)?ui.mimeTypes.filter(x=>x==='text/html;profile=mcp-app'):[];
 return mimeTypes.length?{experimental:{'io.modelcontextprotocol/ui':{mimeTypes:[...new Set(mimeTypes)]}}}:{};
}
export async function connectRemote({key=process.env.KLOUDY_MCP_TOKEN,fetcher=fetch,capabilities={}}={}){
 if(key!==undefined&&!/^\S{20,512}$/.test(key))throw Error('Invalid key');
 const client=new Client({name:'kloudy',version:packageVersion},{capabilities:forwardedCapabilities(capabilities)});
 const transport=new StreamableHTTPClientTransport(new URL(REMOTE),{requestInit:{headers:key?{Authorization:'Bearer '+key}:{},redirect:'error'},fetch:(url,options)=>fetcher(url,{...options,redirect:'error'}),reconnectionOptions:{maxRetries:0}});
 transports.set(client,transport);
 try{await client.connect(transport,{timeout:25000});return client;}catch(e){await client.close().catch(()=>{});throw e;}
}
export async function askRemote(question,options){
 if(typeof question!=='string'||!question.trim()||question.length>1000)throw Error('Use a question of 1–1000 characters');
 const client=await connectRemote(options);
 try{return await client.callTool({name:'kloudy',arguments:{operation:'ask',goal:question}},undefined,{timeout:25000});}finally{await client.close();}
}
export async function serveRemote(options={}){
 const connect=options.connect??connectRemote,enabled=autoupdateEnabled(options.autoupdate??process.env.KLOUDY_MCP_AUTOUPDATE);
 let remote=await connect({...options,capabilities:{}}),ready=Promise.resolve(),closed=false,reconnecting,pendingChooser,requestGoal;
 const attachment=options.websiteReturn??(options.connect?null:new WebsiteSelectionReturn());
 const upstream=remote.getServerCapabilities(),capabilities={};
 if(upstream.tools)capabilities.tools=enabled&&upstream.tools.listChanged?{listChanged:true}:{};
 if(upstream.resources)capabilities.resources=enabled&&upstream.resources.listChanged?{listChanged:true}:{};
 const server=new Server({name:'kloudy',version:packageVersion},{capabilities,instructions:'Use Kloudy for discovery and data-only visual setup choices. Call the card tool explicitly for its UI. Hosts without Apps use named choices, sources and local assembly instructions. Existing authorization remains required for account actions.'});
 function forward(client){
  if(capabilities.tools?.listChanged)client.setNotificationHandler(ToolListChangedNotificationSchema,()=>server.sendToolListChanged());
  if(capabilities.resources?.listChanged)client.setNotificationHandler(ResourceListChangedNotificationSchema,()=>server.sendResourceListChanged());
 }
 forward(remote);
 server.oninitialized=()=>{
  const actual=forwardedCapabilities(server.getClientCapabilities());
  if(!Object.keys(actual).length)return;
  ready=(async()=>{const next=await connect({...options,capabilities:actual});if(closed){await next.close();return;}const previous=remote;remote=next;forward(next);await previous.close();})();
  // Requests still receive negotiation errors; avoid an unhandled rejection before the first request.
  void ready.catch(()=>{});
 };
 const invoke=async(method,params)=>{
  await ready;const current=remote,run=client=>method==='callTool'?client.callTool(params,undefined,{timeout:25000}):client[method](params);
  try{return await run(current);}catch(error){
   // Preserve 0.4.5's opt-in recovery: only an established HTTP session's explicit 404 permits one retry.
   if(!enabled||error.code!==404||!transports.get(current)?.sessionId)throw error;
   if(remote===current){reconnecting??=(async()=>{const next=await connect({...options,capabilities:forwardedCapabilities(server.getClientCapabilities())});if(closed){await next.close();throw error;}remote=next;forward(next);await current.close().catch(()=>{});if(capabilities.tools?.listChanged)await server.sendToolListChanged();if(capabilities.resources?.listChanged)await server.sendResourceListChanged();})().finally(()=>{reconnecting=undefined;});await reconnecting;}
   return run(remote);
  }
 };
 if(capabilities.tools){
  server.setRequestHandler(ListToolsRequestSchema,async req=>{
   const result=await invoke('listTools',req.params);
   return {...result,tools:[...result.tools.map(tool=>tool.name==='show_visual_setup_choices'?{...tool,inputSchema:{...tool.inputSchema,properties:{...tool.inputSchema.properties,goal:{type:'string',minLength:1,maxLength:1000,description:'Presentation request retained in this MCP process; never sent as a credential or URL.'}}}}:tool),...(result.tools.some(t=>t.name===pendingChooserTool.name)?[]:[pendingChooserTool]),websiteReturnTool]};
  });
  server.setRequestHandler(CallToolRequestSchema,async req=>{
   if(req.params.name===websiteReturnTool.name){const args=req.params.arguments||{};if(Object.keys(args).some(k=>k!=='waitSeconds'))throw Error('Return lookup accepts a bounded wait only');const result=attachment?await attachment.receive(args):{state:'unavailable'};if(result.state?.startsWith('received')&&pendingChooser)pendingChooser={...pendingChooser,structuredContent:{...pendingChooser.structuredContent,authenticatedReturn:result}};return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}
   if(req.params.name===pendingChooserTool.name){if(Object.keys(req.params.arguments||{}).length)throw Error('Pending chooser lookup takes no identity or credential fields');return pendingChooserResponse(pendingChooser);}
   if(req.params.name!=='show_visual_setup_choices')return invoke('callTool',req.params);
   const argumentsValue={...(req.params.arguments||{})};
   let nextGoal=requestGoal;
   if(Object.hasOwn(argumentsValue,'goal')){if(typeof argumentsValue.goal!=='string'||!argumentsValue.goal.trim()||argumentsValue.goal.length>1000)throw Error('Use a presentation request of 1-1000 characters');nextGoal=argumentsValue.goal;delete argumentsValue.goal;}
   const result=await invoke('callTool',{...req.params,arguments:argumentsValue});
   const decorated=chooserResponse(result,{apps:!!forwardedCapabilities(server.getClientCapabilities()).experimental,goal:nextGoal});
   if(!decorated.isError&&nextGoal&&attachment){
    try{const link=await attachment.open(nextGoal),priorUrl=decorated.structuredContent.chooser.url;decorated.content=decorated.content.map(c=>c.type==='text'&&c.text.startsWith('Website chooser: ')?{...c,text:c.text.replace(priorUrl,link.chooserUrl)}:c);decorated.structuredContent.chooser={...decorated.structuredContent.chooser,url:link.chooserUrl,returnMethod:'paired-encrypted-website-selection'};decorated.content.push({type:'text',text:'Open '+link.chooserUrl+' in your signed-in account. Confirm the waiting IDE code '+link.pairCode+' and the existing project. Then return the selection; receive_website_selection waits on this same MCP connection. The locator grants no account authority.'});decorated.structuredContent.websiteReturn={...link,extensionRequired:false,engineAuthority:false};}
    catch{decorated.structuredContent.websiteReturn={available:false,manualManifestFallback:true};}
   }
   if(!decorated.isError){requestGoal=nextGoal;pendingChooser=decorated;}return decorated;
  });
 }
 // Resource delivery is independent of notification/autoupdate opt-in.
 if(capabilities.resources){
  server.setRequestHandler(ListResourcesRequestSchema,req=>invoke('listResources',req.params));
  server.setRequestHandler(ReadResourceRequestSchema,req=>invoke('readResource',req.params));
  server.setRequestHandler(ListResourceTemplatesRequestSchema,req=>invoke('listResourceTemplates',req.params));
 }
 server.onclose=()=>{closed=true;attachment?.close?.();void ready.catch(()=>{}).then(()=>remote.close());};
 await server.connect(options.transport??new StdioServerTransport());return server;
}
