import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {gzipSync} from 'node:zlib';
test('kloudy bots uses the local cache offline, verified first',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kb-'));process.env.KLOUDY_CACHE_DIR=dir;
  writeFileSync(join(dir,'deployable-bots.json.gz'),gzipSync(JSON.stringify({bots:[['httpk:npm:a-weather','a-weather','npx','B','npx -y a-weather','MIT','',50,[],['desktop'],false],['httpk:mcp:x','x weather','http','A','https://x.example/mcp','MIT','',80,[],['web'],false],['d','d','npx','D','','','',0,[],[],false]]})));
  const {botsCommand}=await import('../packages/cli/bots.mjs');const out=[];
  await botsCommand(['search','weather','--json'],{out:s=>out.push(s)});const r=JSON.parse(out[0]);
  assert.deepEqual(r.items.map(x=>x.id),['httpk:mcp:x','httpk:npm:a-weather']);assert.equal(r.items[0].status,'verified');
  await assert.rejects(()=>botsCommand(['get','nope','--offline'],{out:()=>{}}));
});
