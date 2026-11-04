import {conversationParams,conversationResult} from './conversation.mjs';
import {instrumentToolHandler} from './activity.mjs';
import {configuredModels} from './models.mjs';
import {actionInput,hostingParams,connectionParams,stableIntentKey} from './product-actions.mjs';
import {welcomeContent} from './welcome.mjs';
import {Approvals,approvalTool,approvalResource} from './approval.mjs';
import {approvalHTML} from './approval-ui.mjs';
import {getUiCapability,RESOURCE_MIME_TYPE} from '@modelcontextprotocol/ext-apps/server';
import {convertPage,convertPages} from './public.mjs';
import {localStrings} from './strings.mjs';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema,ListPromptsRequestSchema,GetPromptRequestSchema,ListResourcesRequestSchema,ReadResourceRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {fileURLToPath} from 'node:url';
import {introduce,isAttachIntent,ideGuidance} from './introduce.mjs';
import {withConnection} from './connection.mjs';
const gateway={name:'kloudy',description:'Use this whenever the user mentions Kloudy, or asks to find, route, or call any MCP tool or SDK. For Kloudy or /kloudy alone, use introduce to welcome this project; an attached host does not need another install question. Select one tool through the same engine. Autonomous by default; the IDE permission system controls tool calls and the engine enforces authorization.',inputSchema:{type:'object',properties:{operation:{type:'string',enum:['conversation','host_interface','models_list','action','wallet_connection','hosting','wallet','introduce','decline','convert','yield_list','query','ask','assemble','call','status','cancel','strings_list','strings_save','strings_call','strings_use','strings_keep','strings_remove','strings_prune']},conversation_operation:{type:'string',enum:['read','append','sync']},conversation:{type:'object'},action:{type:'string',enum:['chain.head','wallet.prepare','bww.fetch','bww.publish']},inputs:{type:'object'},idempotency_key:{type:'string',maxLength:128},chain:{type:'string',maxLength:100},budget_usd_micros:{type:'integer',minimum:1,maximum:1000000000000},wallet_operation:{type:'string',enum:['balance','top_up']},amount_usd:{type:'string'},goal:{type:'string'},scope:{type:'object'},limit:{type:'integer',minimum:1,maximum:5},url:{type:'string'},urls:{type:'array',minItems:1,maxItems:8,items:{type:'string'}},resolution:{type:'string',enum:['compact','standard']},string_name:{type:'string'},choices:{type:'array',maxItems:16,items:{type:'object',properties:{source:{type:'string'},kind:{type:'string',enum:['mcp','sdk','cli']},goal:{type:'string'}},required:['source','kind','goal'],additionalProperties:false}},selection_ids:{type:'array',items:{type:'string'},minItems:1,maxItems:16,uniqueItems:true},selection_id:{type:'string'},name:{type:'string'},arguments:{type:'object'},candidates:{type:'array',maxItems:16,items:{type:'object'}},lane:{type:'string',enum:['non_medical','medical']}},additionalProperties:false}};
export function createMcpServer({useClient,greet=introduce,strings=localStrings,models=configuredModels,onActivity}){
  const server=new Server({name:'kloudy',version:'0.3.15'},{capabilities:{tools:{listChanged:true},prompts:{},resources:{}},instructions:'When the user says Kloudy or /kloudy, use operation introduce. Return the current project greeting. Do not repeatedly ask to install an already attached tool. Respect a no answer and the host permission ceiling. '+Object.values(ideGuidance).join(' ')});
  const approvals=new Approvals(),hasUI=()=>getUiCapability(server.getClientCapabilities())?.mimeTypes?.includes(RESOURCE_MIME_TYPE);
  server.setRequestHandler(ListResourcesRequestSchema,async()=>({resources:hasUI()?[{uri:approvalResource,name:'Kloudy action approval',mimeType:RESOURCE_MIME_TYPE}]:[]}));
  server.setRequestHandler(ReadResourceRequestSchema,async request=>{if(!hasUI()||request.params.uri!==approvalResource)throw Error('Unsupported UI resource');return {contents:[{uri:approvalResource,mimeType:RESOURCE_MIME_TYPE,text:approvalHTML,_meta:{ui:{csp:{connectDomains:[],resourceDomains:[]}}}}]};});
  async function projectRoot(){try{const roots=await server.listRoots();if(roots.roots?.[0]?.uri?.startsWith('file:'))return fileURLToPath(roots.roots[0].uri);}catch{}return process.env.CLAUDE_PROJECT_DIR||process.cwd();}
  async function greeting(decision){let project=process.env.CLAUDE_PROJECT_DIR||process.cwd();try{const roots=await server.listRoots();if(roots.roots?.[0]?.uri?.startsWith('file:'))project=fileURLToPath(roots.roots[0].uri);}catch{}return greet({project,decision,hostAttached:true});}
  server.setRequestHandler(ListPromptsRequestSchema,async()=>({prompts:[{name:'kloudy',description:'Welcome the current project to Kloudy and explain how to use it.'}]}));
  server.setRequestHandler(GetPromptRequestSchema,async request=>{if(request.params.name!=='kloudy')throw Error('Unknown prompt');const result=await greeting();return {description:'Ask for Kloudy',messages:[{role:'assistant',content:welcomeContent(result)[0]}]};});
  server.setRequestHandler(ListToolsRequestSchema,async()=>{
    let selected;try{selected=await useClient(client=>client.state.selection?.tool);}catch{}
    const meta=hasUI()?{_meta:{ui:{resourceUri:approvalResource}}}:{};return {tools:[{...gateway,...meta},...(selected?[{...selected,name:'selected_'+selected.name,...meta}]:[]),...(hasUI()?[approvalTool]:[])]};
  });
  server.setRequestHandler(CallToolRequestSchema,instrumentToolHandler(async request=>{
    try{
      const supplied=request.params.arguments||{};
      if(request.params.name==='kloudy'&&supplied.operation==='models_list'){if(Object.keys(supplied).length!==1)throw Error('Model discovery uses host configuration only');const result=await models().list();return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}

      if(request.params.name==='kloudy'&&['convert','yield_list'].includes(supplied.operation)){const result=await (supplied.operation==='convert'?convertPage(supplied.url,{resolution:supplied.resolution}):convertPages(supplied.urls,{resolution:supplied.resolution}));return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}
      if(request.params.name==='kloudy_approval'){if(!hasUI())throw Error('This host has no inline approval UI');const result=await approvals.decide(supplied,useClient);return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}
      if(request.params.name==='kloudy'&&supplied.operation?.startsWith('strings_')){const store=strings({project:await projectRoot(),mode:'auto'}),op=supplied.operation.slice(8);let result;
       if(op==='save')result=await store.save(supplied.string_name,supplied.choices);
       else if(op==='call'){result=await store.call(supplied.string_name,supplied.name,supplied.arguments,{selectionId:supplied.selection_id});if(result?.state==='awaiting_approval'){const saved=(await store.list()).find(s=>s.name===supplied.string_name),route=saved?.activeRoutes?.find(r=>r.name===supplied.name&&(!supplied.selection_id||r.selection_id===supplied.selection_id));if(!route)throw Error('Selected route unavailable');return approvals.present(result,route.selection_id,work=>store.connect(route.source,route.kind,work));}}
       else if(op==='list')result=await store.list();
       else if(op==='use'){result=await store.use(supplied.string_name);}
       else if(['keep','remove'].includes(op))result=await store[op](supplied.string_name);
       else if(op==='prune')result=await store.prune();else throw Error('Unsupported strings operation');
       return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:Array.isArray(result)?{strings:result}:result};}

      if(request.params.name==='kloudy'&&(!supplied.operation||supplied.operation==='introduce'||supplied.operation==='decline'||supplied.operation==='ask'&&isAttachIntent(supplied.goal))){const result=await greeting(supplied.operation==='decline'?'no':undefined);return {content:welcomeContent(result),structuredContent:result};}
      const result=await useClient(async client=>{
        const input=request.params.arguments||{};
        if(request.params.name.startsWith('selected_'))return client.call(request.params.name.slice(9),input);
        if(request.params.name!=='kloudy')throw new Error('Unknown tool');
        if(input.operation==='conversation'){if(!client.conversation)throw Error('Conversation sync requires a scoped HTTPK connection');return client.conversation(input.conversation_operation,input.conversation);}
        if(input.operation==='host_interface')return client.negotiateHost();
        if(input.operation==='action')return client.action(input.action,input.inputs,{idempotencyKey:input.idempotency_key});
        if(input.operation==='wallet_connection')return client.walletConnection(input.chain);
        if(input.operation==='hosting')return client.hosting({budgetUsdMicros:input.budget_usd_micros});
        if(input.operation==='wallet'){if(!client.wallet)throw Error('Wallet previews require HTTPK');return client.wallet({operation:input.wallet_operation||'balance',amount_usd:input.amount_usd});}
        if(input.operation==='query'){if(!client.query)throw Error('Query needs an HTTPK connection');return client.query(input.goal,{scope:input.scope,limit:input.limit});}
        if(input.operation==='ask')return client.ask(input.goal,{candidates:input.candidates||[],lane:input.lane||'non_medical'});
        if(input.operation==='assemble'){if(!client.assemble)throw Error('Assembly requires an HTTPK connection');return client.assemble(input.selection_ids);}
        if(input.operation==='call'){if(!client.assemble||!input.selection_id)throw Error('Exact HTTPK selection required');return client.call(input.name,input.arguments,{selectionId:input.selection_id});}
        if(input.operation==='status')return client.status();
        if(input.operation==='cancel')return client.decide('cancel');
        throw new Error('Unsupported operation');
      });
      // Prompt the host to fetch the newly selected singular tool, not a server dump.
      server.sendToolListChanged().catch(()=>{});
      if(result?.state==='awaiting_approval')return approvals.present(result,result.selection_id);
      return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};
    }catch(error){return {isError:true,content:[{type:'text',text:JSON.stringify({error:error.code||'request_failed',message:error.code?error.message:'The tool request could not be completed.'})}]};}
  },onActivity));
  return server;
}
export async function serveMcp(connection){const server=createMcpServer({useClient:work=>withConnection(connection,work,{mode:'auto'}),greet:options=>introduce({...options,connection})});await server.connect(new StdioServerTransport());return server;}
