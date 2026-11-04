import catalog from './reply-templates.json' with {type:'json'};
// Plain text output only. Hosts must render as text, never trusted HTML.
export function renderReply(state,slots){
 const template=catalog.templates[Object.hasOwn(catalog.templates,state)?state:'unknown'];
 if(!slots||Array.isArray(slots)||Object.keys(slots).length!==1||typeof slots.action!=='string'||!slots.action.trim()||slots.action.length>160||/[\u0000-\u001f\u007f]/.test(slots.action))throw Error('invalid_reply_slots');
 return {version:catalog.version,status:template.status,text:template.text.replace('{action}',()=>slots.action)};
}
