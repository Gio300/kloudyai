import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {KloudyError} from './client.mjs';
export const starterFiles={
 'kloudy.json':JSON.stringify({version:'kloudy.project/1',deploymentTarget:'bww',html:'provider-opt-in',publication:'requires-authorized-hosting'},null,2)+'\n',
 'package.json':JSON.stringify({name:'my-kloudy-app',version:'1.0.0',private:true,type:'module',engines:{node:'>=20.19.0'},scripts:{start:'node app.mjs',card:'node card.mjs',toolbox:'node toolbox.mjs'},dependencies:{'kloudy':'latest'}},null,2)+'\n',
 'app.mjs':`import {readPublicPage} from 'kloudy/public';
try {
 const page=await readPublicPage(process.argv[2]||'https://example.com');
 console.log(JSON.stringify({...page,body:page.body.slice(0,6000)},null,2));
} catch(error) { console.error(error.code+': '+error.message);process.exitCode=1; }
`,
 'card.mjs':`import {readCard} from 'kloudy/public';
try { console.log(JSON.stringify(await readCard(process.argv[2]||'/world'),null,2)); }
catch(error) { console.error(error.code+': '+error.message);process.exitCode=1; }
`,
 'toolbox.mjs':`import {withConnection} from 'kloudy/session';
// The native host/operator provides the existing scoped connection outside this project.
// This selects definitions only. It never calls a tool automatically.
try { const selected=await withConnection(process.env.KLOUDY_CONNECTION,client=>client.ask(process.argv[2]||'Find a tool to read my notes'));console.log(JSON.stringify(selected.toolbox,null,2)); }
catch(error) { console.error(error.code+': '+error.message);process.exitCode=1; }
`,
 '.gitignore':'node_modules/\n.env\n.env.*\n*connection*.json\n*session*.json\n',
 'README.md':`# Build with Kloudy

The default deployment target is the Bot Wide Web. kloudy.json records that choice; creating a starter does not publish anything or authorize hosting charges. HTML fragments are optional and controlled by the provider.\n\nNode.js 20+. Run npm install, then npm start. This reads https://example.com through Kloudy's public reader and prints source-attributed content. No account or model call is needed. Provider restrictions and shared rate limits apply.

- npm start -- https://example.com: read a public page; source HTML is data, never executed.
- npm run card -- /world: fetch the same bounded information card bots see.
- npm run toolbox: select a toolbox with an existing scoped connection. Keep KLOUDY_CONNECTION pointing to its private file outside this project. Missing/expired connections fail explicitly. This example never executes the selected tool.

Use npx -y kloudy@latest to attach the one MCP door to a supported IDE. Customer self-registration and permanent GlassBreak grants are not yet available. Do not place tokens in browser code, Git, screenshots or prompts. A catalog listing is not an executable provider integration.

The CLI, MCP and SDK share the engine's authorization boundary. https://kloudy.ai/build documents current availability and the next steps. The downloaded public adapter is Apache-2.0; it contains no private engine or vault implementation.
`
};
export async function createStarter(directory){
 if(typeof directory!=='string'||!directory.trim())throw new KloudyError('invalid_directory','Choose a new starter directory.');
 const target=resolve(directory);
 try{await mkdir(target,{mode:0o700});}catch(error){throw new KloudyError(error.code==='EEXIST'?'directory_exists':'directory_unavailable','Choose a new directory inside an existing parent. Existing files were not overwritten.');}
 for(const [name,content] of Object.entries(starterFiles))await writeFile(join(target,name),content,{flag:'wx',mode:0o600});
 return {status:'created',directory:target,files:Object.keys(starterFiles),next:['npm install','npm start','npm run card'],accountRequired:false,toolExecution:'Requires an existing scoped connection; never automatic in this starter.'};
}
