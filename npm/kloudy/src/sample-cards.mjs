// Portable, non-authorizing presentation contract. No credential or payment execution.
export const SAMPLE_VERSION='kloudy.sample/1';
export const SAMPLE_TITLE='Kloudy Sample card';
export const preferenceChoices={
 tools:[['open_source','Open source'],['paid','Paid tools'],['hybrid','Mix of both'],['free_then_paid','Free tier, then ask']],
 target:[['local','This device'],['www','World Wide Web'],['bww','Bot Wide Web'],['mixed','A mix']],
 delivery:[['silent','Quietly'],['paid','Paid tools only'],['all','Every tool']]
};
export const preferenceDefaults=()=>({tools:null,target:null,delivery:'silent'});
export function validPreferences(value){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===3&&Object.entries(preferenceChoices).every(([key,options])=>(key!=='delivery'&&value[key]===null)||options.some(([id])=>id===value[key]));}
export function preferenceQuestion(step,surface='site'){
 const external=['ide','chatbot','terminal'].includes(surface);
 return [
  {key:'tools',question:'Which tools do you prefer?',intro:external?'Kloudy gives your assistant tools to build your projects.':'Kloudy uses tools to build your projects.'},
  {key:'target',question:'Where will your projects run?',intro:'Choose where people will use your projects.'},
  {key:'delivery',question:'How much should Kloudy show?',intro:'Quietly is the default. You can ask for updates instead.'}
 ][step]||null;
}
export class SamplePreferences{
 constructor(value=preferenceDefaults()){if(!validPreferences(value))throw Error('Invalid preferences');this.value=structuredClone(value);this.step=0;}
 choose(id){const q=preferenceQuestion(this.step);if(!q||!preferenceChoices[q.key].some(([value])=>value===id))throw Error('Choose one of the offered options.');this.value[q.key]=id;this.step++;return this.value;}
 back(){this.step=Math.max(0,this.step-1);}
}
export const cardKinds=['preferences','clarify','tools','attachment','signin','approval','payment','exhaustion','receipt','recovery','analytics','conversion'];
export function shouldShowCard(kind,preferences=preferenceDefaults(),{paid=false,requested=false}={}){
 if(!cardKinds.includes(kind)||!validPreferences(preferences))return false;
 if(requested||['signin','approval','payment','exhaustion','recovery','clarify','attachment'].includes(kind))return true;
 if(kind==='tools')return preferences.delivery==='all'||(preferences.delivery==='paid'&&paid);
 return false;
}
export class SampleQueue{
 constructor(){this.current=null;this.waiting=[];this.seen=new Set();}
 offer(card,preferences,options){if(!card||!cardKinds.includes(card.kind)||typeof card.id!=='string'||card.id.length>160||this.seen.has(card.id)||!shouldShowCard(card.kind,preferences,options))return false;
  this.seen.add(card.id);if(this.seen.size>256)this.seen.delete(this.seen.values().next().value);
  const urgent=['payment','approval','exhaustion','recovery'].includes(card.kind);
  if(!this.current)this.current=card;else if(urgent&&!['payment','approval','exhaustion','recovery'].includes(this.current.kind)){this.waiting.unshift(this.current);this.current=card;}else this.waiting.push(card);
  this.waiting=this.waiting.slice(0,10);return true;
 }
 dismiss(){this.current=this.waiting.shift()||null;return this.current;}
 clear(){this.current=null;this.waiting=[];this.seen.clear();}
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function samplePreferencesMarkup(flow,{surface='site',notice=''}={}){
 const q=preferenceQuestion(flow.step,surface),complete=!q;
 return `<section class="sample-card" aria-label="${SAMPLE_TITLE}"><header><span class="sample-orb" aria-hidden="true"></span><span>${SAMPLE_TITLE}</span><small>${complete?'Ready':(flow.step+1)+' / 3'}</small></header><h1 tabindex="-1">${complete?'Your way to build.':esc(q.question)}</h1>${complete?'':`<p>${esc(q.intro)}</p>`}${complete?`<dl>${Object.entries(preferenceChoices).map(([key,options])=>`<dt>${esc({tools:'Tools',target:'Where',delivery:'Updates'}[key])}</dt><dd>${esc(options.find(([id])=>id===flow.value[key])?.[1]||'Ask when needed')}</dd>`).join('')}</dl><button class="sample-primary" data-sample-save>Save preferences</button>`:`<div class="sample-options">${preferenceChoices[q.key].map(([id,label])=>`<button data-sample-choice="${id}" aria-pressed="${flow.value[q.key]===id}">${esc(label)}</button>`).join('')}</div>`}<p class="sample-note">${q?.key==='tools'?'Open source describes the tools; hosting or compute may still cost money.':q?.key==='target'?'Bot Wide Web sites need hosting: your computer, your cloud, or a paid host.':'New costs always need your approval. Ask which tools are connected anytime.'}</p><details><summary>How this works</summary><p>Quietly means fewer updates, not permission to spend. Free tiers ending always prompt a choice. These preferences do not install tools or authorize a connection.</p></details><footer>${flow.step?'<button data-sample-back>Back</button>':''}<button data-sample-later>Not now</button></footer><p role="status" class="sample-status">${esc(notice)}</p></section>`;
}
export function conversionCardMarkup(){return `<section class="sample-card"><header>${SAMPLE_TITLE}</header><h1>Let bots reach your site.</h1><p>Publish a BWW card so compatible assistants can fetch the part a user needs.</p><a class="sample-primary" href="https://kloudy.ai/hosting">Choose hosting</a><details><summary>Benefits and costs</summary><p>A converted site can offer structured fragments instead of a full browser visit. Actual compute, water and cost savings depend on measured usage; no fixed savings are promised.</p><p>Bring your PC or cloud, or use a paid host. If your compute goes offline, your site becomes unavailable. Concierge and ad bots are optional paid services.</p></details></section>`;}
