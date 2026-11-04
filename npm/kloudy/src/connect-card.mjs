import {connectHTML,publicConnectHTML} from './connect-ui.mjs';

export const CONNECT_URI='ui://widget/kloudy-connect-v1.html';
export const connectResource={uri:CONNECT_URI,name:'Kloudy setup',description:'Show the Kloudy install step or sign-in availability.',mimeType:'text/html;profile=mcp-app'};
export const connectTool={
 name:'kloudy_connect_card',
 title:'Kloudy sign-in and install card',
 description:'Show sign-in availability or the one-step install card. First call find_mcp_tools with operation ask and a short setup request. If it returns kind account or connect, call this card once with the returned mode. Copying the command does not install anything or authorize private tools. Text-only hosts show the same instruction.',
 annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
 inputSchema:{type:'object',properties:{mode:{type:'string',enum:['signin','install'],description:'Use the mode returned by find_mcp_tools: signin for account sign-in, or install for editor setup.'}},required:['mode'],additionalProperties:false},
 _meta:{ui:{resourceUri:CONNECT_URI},'openai/outputTemplate':CONNECT_URI,'openai/toolInvocation/invoking':'Opening Kloudy setup…','openai/toolInvocation/invoked':'Kloudy setup'}
};
export function connectArguments(value){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&['signin','install'].includes(value.mode);}
export function connectResult(mode,{publicOnly=false}={}){
 const install=mode==='install';
 const message=install?'Choose Connect, then pick your app.':'GitHub sign-in coming soon. Find public tools today.';
 const actions=[install?{label:'Connect',url:'https://kloudy.ai/install'}:{label:'Find tools',url:'https://kloudy.ai/install#discover'}];
 return {content:[{type:'text',text:message+'\n\n'+actions.map(a=>`[${a.label}](${a.url})`).join('\n')}],structuredContent:{tier:'public',kind:install?'connect':'account',mode,items:[],message,...(install?{copyText:'npx kloudy'}:{}),actions,model_calls:0,executed:false}};
}
export function connectContents({publicOnly=false}={}){return {contents:[{uri:CONNECT_URI,mimeType:connectResource.mimeType,text:publicOnly?publicConnectHTML:connectHTML,_meta:{
 ui:{prefersBorder:true,domain:'https://kloudy.ai',csp:{connectDomains:[],resourceDomains:[]}},
 'openai/widgetDescription':'Kloudy sign-in and setup choices. No account is created and no tool is authorized by opening a link.',
 'openai/widgetPrefersBorder':true,'openai/widgetDomain':'https://kloudy.ai',
 'openai/widgetCSP':{connect_domains:[],resource_domains:[],redirect_domains:['https://kloudy.ai','https://cursor.com','https://code.visualstudio.com','https://windsurf.com','https://devin.ai','https://claude.com','https://claude.ai','https://chatgpt.com']}
 }}]};}
// Public UI metadata still requires credential validation when called with a credential.
export function connectMessage(method,params={}){
 if(!params||typeof params!=='object'||Array.isArray(params))return false;
 if(['resources/list','resources/templates/list'].includes(method))return Object.keys(params).length===0;
 if(method==='resources/read')return Object.keys(params).length===1&&params.uri===CONNECT_URI;
 return method==='tools/call'&&Object.keys(params).length===2&&params.name==='kloudy_connect_card'&&connectArguments(params.arguments);
}
