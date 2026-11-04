import {Tiktoken} from 'js-tiktoken/lite';
import ranks from 'js-tiktoken/ranks/cl100k_base';
// A reproducible local reference encoding, not a claim about every model.
const tokenizer=new Tiktoken(ranks);
export const sdfTokens=card=>tokenizer.encode(JSON.stringify(card),[],[]).length;
export function compactSDF(card){
 const ext=card.extensions['x-kloudy'];
 ext.tokenizer='cl100k_base';ext.token_limit=750;
 while(sdfTokens(card)>750){
  ext.truncated=true;
  if(card.links.length){card.links.pop();continue;}
  if(card.sections.length>1){card.sections.pop();continue;}
  if(card.summary.key_points.length){card.summary.key_points.pop();continue;}
  const section=card.sections[0];
  if(section.summary.length>80){section.summary=shorter(section.summary);continue;}
  if(card.summary.brief.length>80){card.summary.brief=shorter(card.summary.brief);continue;}
  if(card.source.title.length>40){const title=shorter(card.source.title);card.source.title=title;card.metadata.title=title;card.type_data.headline=title;continue;}
  if(section.title.length>40){section.title=shorter(section.title);continue;}
  throw Error('Source attribution cannot fit the 750-token compact card. Use standard resolution.');
 }
 return card;
}
function shorter(text){const cut=Array.from(text).slice(0,Math.floor(Array.from(text).length*.75)).join('');return cut.replace(/\s+\S*$/,'')+'…';}
