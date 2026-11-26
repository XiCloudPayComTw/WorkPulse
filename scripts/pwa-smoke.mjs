import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,extname} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
// Real browser, real wall clock, subdirectory scope. Simulated unavailable origin.
export async function nativePwaSmoke(browser,root){
 const profile=await mkdtemp(join(tmpdir(),'workpulse-pwa-smoke-')),token=randomUUID();
 let child,timer,blocked=false,settle;
 const result=new Promise((resolve,reject)=>{settle={resolve,reject};});
 const probe=String.raw`<!doctype html><html><body><script>
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function wait(fn){for(let i=0;i<180;i++){if(fn())return;await sleep(100);}throw Error('wait timed out');}
 let step='online',outcome;
 (async()=>{try{
  const frame=document.createElement('iframe');frame.src='/WorkPulse/#/overview';document.body.append(frame);
  await wait(()=>frame.contentDocument?.querySelector('h1.page-title')?.textContent==='工作總覽');
  step='worker';await wait(()=>frame.contentWindow.navigator.serviceWorker.controller);
  const cachesApi=frame.contentWindow.caches,names=await cachesApi.keys(),name=names.find(x=>x.startsWith('workpulse-static:'));
  if(!name)throw Error('no static cache');
  const cache=await cachesApi.open(name);
  if(!(await cache.match(location.origin+'/WorkPulse/index.html')))throw Error('shell missing');
  if(!(await cache.match(location.origin+'/WorkPulse/src/app.js')))throw Error('module missing');
  step='unknown path';await frame.contentWindow.fetch('/WorkPulse/private.json');
  if(await cache.match(location.origin+'/WorkPulse/private.json'))throw Error('arbitrary request cached');
  step='offline';await fetch('/block/'+TOKEN);await new Promise(r=>{frame.onload=r;frame.src='/WorkPulse/index.html#/entry';});
  await wait(()=>frame.contentDocument?.querySelector('h1.page-title')?.textContent==='填寫工作日誌');
  if(!frame.contentDocument.querySelector('.wp-storage-banner')?.textContent.includes('尚未同步'))throw Error('local warning missing');
  if(!frame.contentDocument.querySelector('#entry-date'))throw Error('form unavailable');
  outcome='PASS';
 }catch(e){outcome='FAIL '+step+': '+e.message;}
 await fetch('/result/'+TOKEN+'?value='+encodeURIComponent(outcome));
 })();
 </script></body></html>`.replaceAll('TOKEN',JSON.stringify(token));
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/probe'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(probe);return;}
  if(url.pathname==='/block/'+token){blocked=true;res.writeHead(204);res.end();return;}
  if(url.pathname==='/result/'+token){res.writeHead(204);res.end();settle.resolve(url.searchParams.get('value'));return;}
  if(!url.pathname.startsWith('/WorkPulse/')){res.writeHead(404);res.end();return;}
  if(blocked){res.writeHead(503);res.end('simulated unavailable origin');return;}
  const file=url.pathname.slice('/WorkPulse/'.length)||'index.html';
  if(file==='private.json'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"synthetic":true}');return;}
  if(!/^[a-zA-Z0-9_./-]+$/.test(file)||file.split('/').includes('..')){res.writeHead(403);res.end();return;}
  try{const bytes=await readFile(join(root,'dist',file));res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end();}
 });
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  child=spawn(browser,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--disable-extensions','--user-data-dir='+profile,'http://127.0.0.1:'+server.address().port+'/probe'],{cwd:root,stdio:'ignore'});
  child.once('error',settle.reject);child.once('exit',()=>settle.reject(Error('PWA Chrome exited before result')));
  timer=setTimeout(()=>settle.reject(Error('PWA browser probe timed out')),60000);
  const outcome=await result;if(outcome!=='PASS')throw Error('PWA smoke failed: '+outcome);
  console.log('Native PWA subdirectory and unavailable-origin reload passed');
 }finally{
  clearTimeout(timer);if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(2000)]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
  server.closeAllConnections();await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
}
