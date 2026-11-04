import {randomUUID} from 'node:crypto';
export const approvalResource='ui://kloudy/approval.html';
export const approvalTool={name:'kloudy_approval',description:'Submit the exact pending decision from the Kloudy approval view.',inputSchema:{type:'object',properties:{ticket:{type:'string'},decision:{type:'string',enum:['approve','cancel']}},required:['ticket','decision'],additionalProperties:false},_meta:{ui:{resourceUri:approvalResource,visibility:['app']}}};
export class Approvals {
 constructor({now=()=>Date.now()}={}){this.now=now;this.pending=new Map();}
 present(result,selectionId,connection){
  if(result?.state!=='awaiting_approval')return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};
  const a=result.approval,expires=Number(a?.expires_at)*1000,risk=a?.risk_tier??a?.risk;
  // Do not fabricate a token or let incomplete backend state create an approval.
  if(!a||typeof a.token!=='string'||!a.token||a.token.length>512||typeof risk!=='string'||!risk.trim()||risk.length>64||!(typeof a.summary==='string'||a.summary&&typeof a.summary==='object')||!selectionId||!Number.isFinite(expires)||expires<=this.now())return {isError:true,content:[{type:'text',text:'The exact approval is missing or expired. Refresh the engine request.'}]};
  for(const [id,p] of this.pending)if(p.expires<=this.now())this.pending.delete(id);
  if(this.pending.size>=32)throw Error('Too many pending approvals');
  const ticket=randomUUID();this.pending.set(ticket,{selectionId,token:a.token,expires,connection});
  const summary={state:result.state,summary:a.summary,risk_tier:a.risk_tier??a.risk,expires_at:a.expires_at,notice:'Approve or cancel using the inline Kloudy view. Hosts without MCP Apps must provide their own consent UI; no approval was submitted.'};
  return {content:[{type:'text',text:JSON.stringify(summary)}],structuredContent:summary,_meta:{kloudyApproval:{...summary,ticket},ui:{resourceUri:approvalResource}}};
 }
 async decide(input,useClient){
  if(!input||Object.keys(input).some(k=>!['ticket','decision'].includes(k))||!['approve','cancel'].includes(input.decision))throw Error('Invalid approval decision');
  const pending=this.pending.get(input.ticket);if(!pending||pending.expires<=this.now()){this.pending.delete(input.ticket);throw Error('Approval missing or expired');}
  // Consume before dispatch, including an ambiguous network failure. Never retry
  // a mutation silently; the host must inspect the engine receipt afterwards.
  this.pending.delete(input.ticket);
  return (pending.connection||useClient)(client=>input.decision==='approve'?client.confirm({selectionId:pending.selectionId,token:pending.token,decision:'approve',source:'tap'}):client.rpc('kloudy/cancel',{selection_id:pending.selectionId}));
 }
}
