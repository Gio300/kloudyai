import {HttpkClient} from './httpk.mjs';
import {observeClient} from './activity.mjs';
import {readFile,writeFile,rename,mkdir,rmdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {KloudyClient,KloudyError,httpTransport} from './client.mjs';

export async function withConnection(file,work,{mode='autonomous',onActivity}={}){
  file||=resolve(homedir(),'.kloudy','connection.json');
  let c;try{c=JSON.parse(await readFile(file,'utf8'));}catch{throw new KloudyError('connection_unavailable','The scoped connection file is unavailable.');}
  const transport=c.endpoint?null:httpTransport({origin:c.origin,token:c.access_token});
  const owner=createHash('sha256').update((c.endpoint||c.origin)+'\n'+(c.client_id||c.access_token)).digest('hex');
  const stateFile=resolve(dirname(file),'kloudy-open-session-'+owner.slice(0,24)+'.json'),lock=stateFile+'.lock';
  try{await mkdir(lock,{mode:0o700});}catch{throw new KloudyError('connection_busy','Another Kloudy client owns this session. Retry after it exits; stale lock recovery is documented.');}
  try{
    let state={owner};try{const saved=JSON.parse(await readFile(stateFile,'utf8'));if(saved.owner===owner)state=saved;}catch(error){if(error.code!=='ENOENT')throw new KloudyError('invalid_state','Saved session could not be read.');
      // Reuse only the matching legacy checkpoint; never overwrite another source.
      try{const legacy=JSON.parse(await readFile(resolve(dirname(file),'kloudy-open-session.json'),'utf8'));if(legacy.owner===owner)state=legacy;}catch(legacyError){if(legacyError.code!=='ENOENT')throw new KloudyError('invalid_state','Legacy session could not be read.');}
    }
    const save=async value=>{const temp=stateFile+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value),{mode:0o600,flag:'wx'});await rename(temp,stateFile);};
    const client=c.endpoint?new HttpkClient({endpoint:c.endpoint,token:c.access_token,state,save,mode}):new KloudyClient({transport,state,save,mode:mode==='auto'?'autonomous':mode});
    return await work(onActivity?observeClient(client,onActivity):client);
  }finally{await rmdir(lock);}
}
