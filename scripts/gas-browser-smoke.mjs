import {execFileSync} from 'node:child_process';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';

export async function gasBrowserSmoke(browser,root,port){
 execFileSync(process.execPath,['scripts/build-gas.mjs'],{cwd:root,stdio:'inherit',timeout:30000});
 const html=await readFile(join(root,'dist-gas/unified/Index.html'),'utf8');
 const file='workpulse-gas-smoke-'+process.pid+'.html';
 const path=join(root,file);
 const mock=role=>'<script>window.__wpCalls=[];window.google={script:{run:{withSuccessHandler(fn){this.ok=fn;return this},withFailureHandler(fn){this.bad=fn;return this},wpSharedBootstrap(month){window.__wpCalls.push("shared");this.ok({month,offlineScope:"",store:{version:1,mode:"cloud",employees:[{id:"person",name:"測試人員"}],projects:[],categories:["其他"],journals:[]},user:{id:roleId,name:"測試",role:roleId,email:"tester@example.com",canWriteIds:["person"]}})},wpOwnerBootstrap(){window.__wpCalls.push("owner");this.ok({employees:[],projects:[]})}}}};var roleId='+JSON.stringify(role)+';</script>';
 try{
  for(const role of ['admin','guest','missing','corrupt']){
   let input=role==='missing'?html:html.replace('<head>','<head>'+mock(role==='corrupt'?'guest':role));
   if(role==='corrupt')input=input.replace(/var chunks=\[[\s\S]*?\];/,'var chunks=["Y29uc3QgPSA7"];');
   const encoded=Buffer.from(input,'utf8').toString('base64');
   const harness='<!doctype html><html><body><iframe id="target" sandbox="allow-scripts allow-same-origin"></iframe><output id="result">pending</output><script>'+
    'var f=document.getElementById("target");var d=f.contentDocument;d.open();d.write(new TextDecoder().decode(Uint8Array.from(atob('+JSON.stringify(encoded)+'),c=>c.charCodeAt(0))));d.close();'+
    'setTimeout(function(){var w=f.contentWindow;var doc=f.contentDocument;var good=doc.querySelector(".shell")&&doc.body.textContent.includes("Google Sheets 已連線");var admin=!!doc.querySelector("[data-view=team]");var failure=!!doc.querySelector("#wp-gas-boot-error");var calls=(w.__wpCalls||[]).join(",");document.getElementById("result").textContent=JSON.stringify({good:!!good,admin,failure,calls,local:doc.body.textContent.includes("本機展示版")});},1000);</script></body></html>';
   await writeFile(path,harness);
   const dom=execFileSync(browser,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-extensions','--virtual-time-budget=5000','--dump-dom','http://127.0.0.1:'+port+'/'+file],{cwd:root,encoding:'utf8',timeout:25000,maxBuffer:15*1024*1024,stdio:['ignore','pipe','pipe']});
   const match=dom.match(/<output id="result">([^<]+)<\/output>/);
   assert.ok(match,'GAS boot probe not rendered: '+role);
   const actual=JSON.parse(match[1].replace(/&quot;/g,'"'));
   const success=role==='admin'||role==='guest';
   assert.deepEqual(actual,{good:success,admin:role==='admin',failure:!success,calls:role==='admin'?'shared,owner':role==='guest'?'shared':'',local:false},'GAS boot '+role);
   console.log('PASS GAS document.write sandbox boot: '+role);
  }
 }finally{await rm(path,{force:true});}
}
