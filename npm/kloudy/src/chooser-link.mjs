// Public presentation adapter. URLs contain public template locators only, never
// a connection credential, authorization token, goal text or identity claim.
export const CHOOSER_URL='https://kloudy.ai/api/customer/visual-chooser/start';
export const pendingChooserTool={name:'show_pending_chooser_link',description:'Show the pending Kloudy card and its HTTPS website fallback again. The website verifies account sign-in; the link is not authorization. This does not run a tool, model, installation or payment.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}};
export function chooserResponse(result,{apps=false,goal}={}){
 if(!result||typeof result!=='object'||Array.isArray(result)||result.isError)return result;
 const data=result.structuredContent;if(!data||typeof data!=='object'||Array.isArray(data))return result;
 const option=typeof data.selectedOptionId==='string'&&/^[a-z0-9-]{1,80}$/.test(data.selectedOptionId)?data.selectedOptionId:null;
 const set=typeof data.choiceSetId==='string'&&/^visual-[a-f0-9]{1,64}$/.test(data.choiceSetId)?data.choiceSetId:null;
 const url=option&&set?CHOOSER_URL+'#choice='+encodeURIComponent(option)+'&set='+encodeURIComponent(set):CHOOSER_URL;
 const chooser={url,linkIsAuthorization:false,identityFromEmail:false,accountBindingVerified:false,returnMethod:'existing-authenticated-website-project-manifest',automaticIdeReturnVerified:false,...(set?{publicChoiceSetId:set}:{}),...(option?{publicOptionId:option}:{}),...(goal?{request:goal}:{})};
 const text='Website chooser: '+url+'\nOpen this HTTPS link if your host does not show the card. Complete account sign-in/2FA on the website before opening private project choices. Email is a lookup hint, not proof. The host controls card rendering, clickable links and browser launch. Account-bound automatic return is not established by this public template locator.';
 return {...result,content:[...(Array.isArray(result.content)?result.content:[]),{type:'text',text}],structuredContent:{...data,chooser},...(apps?{_meta:{...result._meta,ui:{...result._meta?.ui,resourceUri:'ui://widget/kloudy-visual-setup-v1.html'}}}:{})};
}
export function pendingChooserResponse(pending){
 return pending?structuredClone(pending):{content:[{type:'text',text:'No pending chooser is retained in this MCP process. Open '+CHOOSER_URL+' and sign in to recover your existing project. This link is not a bearer token or authorization.'}],structuredContent:{pending:false,chooser:{url:CHOOSER_URL,linkIsAuthorization:false,accountBindingVerified:false}}};
}
