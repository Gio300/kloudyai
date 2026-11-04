import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import root from '../schemas/sdf-document-0.2.schema.json' with {type:'json'};
import profile from '../schemas/sdf-webpage-v1.schema.json' with {type:'json'};
const ajv=new Ajv({strict:false,allErrors:false});addFormats(ajv);ajv.addSchema(root);
const validate=ajv.compile(profile);
export function validateSDF(card){
 if(!validate(card))return {valid:false,error:'The card does not match the pinned SDF webpage schema.'};
 for(const value of [card.source.url,...card.links.map(l=>l.href)]){let url;try{url=new URL(value);}catch{return {valid:false,error:'Invalid source or link.'};}if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return {valid:false,error:'Unsafe source or link.'};}
 if(!/^[0-9a-f]{64}$/.test(card.provenance.content_hash.slice(7)))return {valid:false,error:'Missing content hash.'};
 return {valid:true,profile:'kloudy.sdf.webpage/1',upstream:'sdfprotocol/sdf@e4619ad0b951ced8542692c6b624cb86794cb863'};
}
