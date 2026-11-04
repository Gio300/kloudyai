import {preferencesHTML} from './preferences-ui.mjs';
export const SAMPLE_URI='ui://widget/kloudy-sample-v1.html';
export const sampleTool={
 name:'show_tool_preferences_card',title:'Tool preferences card',
 description:'Show three short questions about preferred tool types, where projects run, and how tool updates appear. Use when the user wants to set or change these preferences. Displays choices only; does not install or run tools. Show once, not for every tool.',
 annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
 inputSchema:{type:'object',properties:{
  kind:{type:'string',enum:['preferences'],description:'Show the three tool-preference questions.'},
  surface:{type:'string',enum:['ide','chatbot','site'],default:'chatbot',description:'Where the card appears: an editor, a chatbot, or the Kloudy website. Changes wording only.'}
 },required:['kind'],additionalProperties:false},
 _meta:{ui:{resourceUri:SAMPLE_URI},'openai/outputTemplate':SAMPLE_URI}
};
export const sampleResource={uri:SAMPLE_URI,name:'Tool preferences card',description:'Three questions about tools, project location and updates.',mimeType:'text/html;profile=mcp-app'};
export function sampleArguments(a){return !!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).every(k=>['kind','surface'].includes(k))&&a.kind==='preferences'&&(a.surface===undefined||['ide','chatbot','site'].includes(a.surface));}
export function sampleMessage(method,params){return !!params&&typeof params==='object'&&!Array.isArray(params)&&(method==='resources/read'&&params.uri===SAMPLE_URI&&Object.keys(params).length===1||method==='tools/call'&&['show_tool_preferences_card','kloudy_sample_card'].includes(params.name)&&Object.keys(params).every(k=>['name','arguments'].includes(k))&&sampleArguments(params.arguments));}
export function sampleResult(kind='preferences',surface='chatbot'){
 if(!sampleArguments({kind,surface}))throw Error('Choose tool preferences.');
 const url='https://kloudy.ai/samples?frontdoor='+surface;
 return {content:[{type:'text',text:`Tool preferences card\n\n[Choose your tools, project location and updates](${url})\n\nThese choices do not install or run tools.`}],structuredContent:{version:'kloudy.sample/1',kind,surface,url,executed:false,authorizesSpending:false}};
}
export function sampleContents(){return {contents:[{uri:SAMPLE_URI,mimeType:sampleResource.mimeType,text:preferencesHTML,_meta:{ui:{prefersBorder:true,domain:'https://kloudy.ai',csp:{connectDomains:[],resourceDomains:[]}},'openai/widgetDescription':'Three short questions about tool preferences.','openai/widgetPrefersBorder':true,'openai/widgetCSP':{connect_domains:[],resource_domains:[]},'openai/widgetDomain':'https://kloudy.ai'}}]};}
