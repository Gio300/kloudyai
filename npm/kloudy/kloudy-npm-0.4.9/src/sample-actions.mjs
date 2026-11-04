// These controllers require a trusted account/engine adapter. Never feed model output as an invoice.
const id=v=>typeof v==='string'&&/^[\w:.-]{1,128}$/.test(v);
const minor=v=>Number.isSafeInteger(v)&&v>=0&&v<=100000000;
const same=(a,b)=>a?.accountRef===b?.accountRef&&a?.projectId===b?.projectId&&a?.grantId===b?.grantId;
export function validateBill(b,binding,now=Date.now()){
 if(!binding||!['accountRef','projectId','grantId'].every(k=>id(binding[k])))throw Error('Verify your project before paying.');
 if(!b||!same(b,binding)||!['due','paid','paused'].includes(b.state)||!id(b.billId)||!id(b.revision)||b.currency!=='usd'||!minor(b.totalMinor)||!Number.isFinite(b.expiresAt)||b.expiresAt<=now||b.expiresAt>now+900000||!Array.isArray(b.lines)||b.lines.length>20||!b.lines.every(l=>typeof l.label==='string'&&l.label.length<=120&&minor(l.amountMinor))||b.lines.reduce((n,l)=>n+l.amountMinor,0)!==b.totalMinor)throw Error('Refresh this bill before paying.');
 return structuredClone(b);
}
export class BillApproval{
 constructor({adapter,binding,now=Date.now,key=()=>globalThis.crypto.randomUUID()}){this.adapter=adapter;this.binding=structuredClone(binding);this.now=now;this.key=key;this.generation=0;this.bill=null;this.pending=null;this.approvalKey=null;}
 reset(){this.generation++;this.bill=null;this.approvalKey=null;}
 async read(billId){if(!id(billId))throw Error('Invalid bill');this.reset();const generation=this.generation;const b=validateBill(await this.adapter.readBill(billId),this.binding,this.now());if(generation!==this.generation||b.billId!==billId)throw Error('Bill changed.');this.bill=b;this.approvalKey=this.key();return b;}
 async pay({approvedBillId,approvedRevision}={}){
  if(this.pending)return this.pending;
  const b=validateBill(this.bill,this.binding,this.now());
  if(b.state!=='due'&&b.state!=='paused'||approvedBillId!==b.billId||approvedRevision!==b.revision)throw Error('Approve the current bill before paying.');
  const generation=this.generation,key=this.approvalKey;
  this.pending=(async()=>{const current=await this.adapter.binding();if(!same(current,this.binding)||current.connected!==true)throw Error('Project authorization changed.');if(generation!==this.generation)throw Error('Bill changed.');validateBill(b,this.binding,this.now());
   const result=await this.adapter.payBill({billId:b.billId,revision:b.revision,totalMinor:b.totalMinor,currency:b.currency,idempotencyKey:key});
   if(generation!==this.generation)throw Error('Payment status needs a fresh receipt.');
   if(result?.state!=='paid'||!same(result,this.binding)||result.billId!==b.billId||result.revision!==b.revision||result.totalMinor!==b.totalMinor||result.currency!==b.currency||!id(result.receiptId))throw Error('Payment is not confirmed. Check the receipt before retrying.');
   this.bill={...b,state:'paid'};return result;
  })().finally(()=>{this.pending=null;});return this.pending;
 }
}
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
export function billCardMarkup(b,binding,{now=Date.now(),busy=false}={}){b=validateBill(b,binding,now);return `<section class="sample-card"><header>Kloudy Sample card · Wallet</header><h1>${b.state==='paid'?'Payment received':'Your bill is ready'}</h1><p class="bill-amount">${amount(b.totalMinor)}</p>${b.state==='paid'?'':`<button class="sample-primary" data-bill-pay ${busy?'disabled':''}>Pay ${amount(b.totalMinor)}</button><p class="sample-note">Only this bill. Your balance is never charged without your approval.</p>`}<details><summary>Cost breakdown</summary><dl>${b.lines.map(l=>`<dt>${e(l.label)}</dt><dd>${amount(l.amountMinor)}</dd>`).join('')}</dl></details>${b.state==='paid'?'':'<a href="https://kloudy.ai/?view=wallet">Add money to wallet</a><p class="sample-note">Adding money does not pay this bill. Return here to approve it.</p>'}</section>`;}
export function attachmentCardMarkup(name){return `<section class="sample-card"><header>Kloudy Sample card</header><h1>Where should this tool stay?</h1><p>${e(String(name).slice(0,160))}</p><div class="sample-options"><button data-attachment="project">This project</button><button data-attachment="account">All my projects</button></div><p class="sample-note">The engine must confirm the link. Permissions remain scoped and revocable; no permanent grant or payment is created.</p></section>`;}
export function clarificationCardMarkup(question,choices){if(typeof question!=='string'||question.length>160||!Array.isArray(choices)||choices.length<2||choices.length>4||choices.some(c=>!id(c.id)||typeof c.label!=='string'||c.label.length>60)||new Set(choices.map(c=>c.id)).size!==choices.length)throw Error('Invalid clarification');return `<section class="sample-card"><header>Kloudy Sample card</header><h1>${e(question)}</h1><div class="sample-options">${choices.map(c=>`<button data-clarify="${e(c.id)}">${e(c.label)}</button>`).join('')}</div></section>`;}
