import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildPwa,workPulseIcon} from '../scripts/build-pwa.mjs';
import {pwaMarkup} from '../src/app/pwa-ui.js';
test('static build emits relative manifest, PNG icons and exact integrity allowlist',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wp-pwa-'));
 try{
  await mkdir(join(dir,'src'));await mkdir(join(dir,'styles'));
  await Promise.all([writeFile(join(dir,'index.html'),'<head><!-- WORKPULSE_PWA_BUILD --></head>'),writeFile(join(dir,'src','app.js'),'const a=1;'),writeFile(join(dir,'styles','index.css'),'body{}'),writeFile(join(dir,'private.json'),'do-not-cache')]);
  const result=await buildPwa(dir),manifest=JSON.parse(await readFile(join(dir,'manifest.webmanifest'),'utf8')),worker=await readFile(join(dir,'sw.js'),'utf8');
  assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./#/overview');assert.equal(manifest.display,'standalone');
  assert.ok(!result.paths.includes('private.json'));assert.ok(!result.paths.includes('sw.js'));
  assert.ok(worker.includes(createHash('sha256').update('const a=1;').digest('hex')));
  assert.match(worker,/request.method!=='GET'/);assert.match(worker,/url.search/);assert.match(worker,/url.hash=''/);assert.match(worker,/crypto.subtle.digest/);
  assert.doesNotMatch(worker,/self\.skipWaiting\s*\(/);
  for(const icon of manifest.icons){const png=await readFile(join(dir,icon.src));assert.equal(png.readUInt32BE(16),Number(icon.sizes.split('x')[0]));}
  assert.match(await readFile(join(dir,'index.html'),'utf8'),/workpulse-pwa-build/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('icon dimensions and GAS shortcut guidance do not advertise offline startup',()=>{
 assert.equal(workPulseIcon(180).readUInt32BE(20),180);
 assert.equal(pwaMarkup(false),'');assert.match(pwaMarkup(true),/不提供離線啟動/);assert.doesNotMatch(pwaMarkup(true),/data-action="pwa-install"/);
});
