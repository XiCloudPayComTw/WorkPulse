import {execFileSync} from 'node:child_process';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';

export async function gasBrowserSmoke(browser,root,port){
 execFileSync(process.execPath,['scripts/build-gas.mjs'],{cwd:root,stdio:'inherit',timeout:30000});
 const html=await readFile(join(root,'dist-gas/unified/Index.html'),'utf8');
 const file='workpulse-gas-smoke-'+process.pid+'.html';
 const path=join(root,file);
 const mock=role=>'<script>window.__wpCalls=[];window.google={script:{run:{withSuccessHandler(fn){this.ok=fn;return this},withFailureHandler(fn){this.bad=fn;return this},wpAccessStatus(){window.__wpCalls.push("status");this.ok({mode:"domain",owner:roleId==="admin"})},wpSharedBootstrap(month){window.__wpCalls.push("shared");this.ok({month,offlineScope:"",store:{version:1,mode:"cloud",employees:[{id:"person",name:"測試人員"}],projects:[],categories:["其他"],journals:[]},user:{id:roleId,name:"測試",role:roleId,email:"tester@example.com",canWriteIds:["person"]}})},wpOwnerBootstrap(){window.__wpCalls.push("owner");this.ok({employees:[],projects:[]})}}}};var roleId='+JSON.stringify(role)+';</script>';
 try{
  for(const role of ['admin','guest','missing','corrupt']){
   let input=role==='missing'?html:html.replace('<head>','<head>'+mock(role==='corrupt'?'guest':role));
   if(role==='corrupt')input=input.replace(/var chunks=\[[\s\S]*?\];/,'var chunks=["Y29uc3QgPSA7"];');
   const encoded=Buffer.from(input,'utf8').toString('base64');
   const harness='<!doctype html><html><body><iframe id="target" sandbox="allow-scripts allow-same-origin"></iframe><output id="result">pending</output><script>'+
    'var f=document.getElementById("target");var d=f.contentDocument;d.open();d.write(new TextDecoder().decode(Uint8Array.from(atob('+JSON.stringify(encoded)+'),c=>c.charCodeAt(0))));d.close();'+
    'setTimeout(function(){var w=f.contentWindow;var doc=f.contentDocument;var good=doc.querySelector(".shell .sync-banner.ready")?.textContent.includes("Google Sheets 已連線");var admin=!!doc.querySelector("[data-view=team]");var failure=!!doc.querySelector("#wp-gas-boot-error");var calls=(w.__wpCalls||[]).join(",");document.getElementById("result").textContent=JSON.stringify({good:!!good,admin,failure,calls,local:doc.querySelector(".shell .wp-storage-banner strong")?.textContent.trim()==="本機展示版"});},1000);</script></body></html>';
   await writeFile(path,harness);
   const dom=execFileSync(browser,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-extensions','--virtual-time-budget=5000','--dump-dom','http://127.0.0.1:'+port+'/'+file],{cwd:root,encoding:'utf8',timeout:25000,maxBuffer:15*1024*1024,stdio:['ignore','pipe','pipe']});
   const match=dom.match(/<output id="result">([^<]+)<\/output>/);
   assert.ok(match,'GAS boot probe not rendered: '+role);
   const actual=JSON.parse(match[1].replace(/&quot;/g,'"'));
   const success=role==='admin'||role==='guest';
   assert.deepEqual(actual,{good:success,admin:role==='admin',failure:!success,calls:role==='admin'?'status,shared,owner':role==='guest'?'status,shared':'',local:false},'GAS boot '+role);
   console.log('PASS GAS document.write sandbox boot: '+role);
  }

  // Exercise actual packaged HTML, not an isolated mock of the frontend.
  const scope='s'.repeat(43),expiresAt=Date.now()+86400000,token='v1.'+expiresAt+'.'+'a'.repeat(32)+'.'+'B'.repeat(43);
  for(const scenario of ['fresh','remembered','revoked']){
   const sharedMock='<script>window.__wpCalls=[];window.confirm=()=>true;var people=[{id:"one",name:"第一人員"},{id:"two",name:"第二人員"}];var credential='+JSON.stringify({token,expiresAt})+';window.google={script:{run:{withSuccessHandler(fn){this.ok=fn;return this},withFailureHandler(fn){this.bad=fn;return this},wpAccessStatus(){window.__wpCalls.push("status");this.ok({mode:"shared-code",owner:false,scope:'+JSON.stringify(scope)+'})},wpAccessUnlock(code){window.__wpCalls.push("unlock");if(code!=="test-code")return this.bad({message:"公司存取碼不正確"});this.ok(credential)},wpSharedBootstrap(month,t){window.__wpCalls.push("shared");if(t!==credential.token||'+JSON.stringify(scenario==='revoked')+')return this.bad({message:"公司存取工作階段無效或已到期，請重新輸入存取碼"});this.ok({month,offlineScope:"",store:{version:1,mode:"cloud",employees:people,projects:[],categories:["其他"],journals:[]},user:{id:"guest",name:"測試",role:"guest",email:"",canWriteIds:people.map(p=>p.id)}})},wpSelfCreateEmployee(p,t){window.__wpCalls.push("create");if(t!==credential.token||p.name!=="新測試員工"||!p.requestId)return this.bad({message:"invalid"});people.push({id:"three",name:p.name});this.ok({ok:true,person:people[2]})}}}};</script>';
   const input=html.replace('<head>','<head>'+sharedMock);
   const prefix='workpulse:shared-access:v1:'+scope+':';
   const seed=scenario==='fresh'?'': 'localStorage.setItem('+JSON.stringify(prefix+'session:credential')+','+JSON.stringify(JSON.stringify({token,expiresAt}))+');localStorage.setItem('+JSON.stringify(prefix+'person:workpulse:selected-person:v1')+',"two");';
   const harness='<!doctype html><html><body><iframe id="target" sandbox="allow-scripts allow-same-origin"></iframe><output id="result">pending</output><script>'+seed+
    'var f=document.getElementById("target"),d=f.contentDocument,w=f.contentWindow;d.open();d.write(new TextDecoder().decode(Uint8Array.from(atob('+JSON.stringify(Buffer.from(input,'utf8').toString('base64'))+'),c=>c.charCodeAt(0))));d.close();'+
    'var errors=[];function check(x,m){if(!x)errors.push(m)}function q(s){return d.querySelector(s)}function submit(id,input,value){var e=q(input);if(!e){errors.push("missing "+input);return;}e.value=value;q(id).dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));}function later(fn){setTimeout(fn,120)}function finish(){document.getElementById("result").textContent=JSON.stringify({errors,calls:w.__wpCalls||[]})}'+
    'later(function(){'+(scenario==='fresh'?
     'check(q("#wp-company-code"),"initial gate");check(w.__wpCalls.join(",")==="status","no preauth RPC");check(!q(".nav-list"),"no preauth nav");submit("#wp-access-unlock","#wp-company-code","wrong");later(function(){check(q(".wp-access-error"),"wrong code refused");submit("#wp-access-unlock","#wp-company-code","test-code");later(function(){check(q("#wp-existing-person")?.value==="","explicit first choice");check(!q(".nav-list"),"no nav before person");submit("#wp-access-person","#wp-existing-person","two");later(function(){check(q(".wp-person-trigger")?.getAttribute("aria-label").includes("第二人員"),"chosen name");check(!q("[data-view=team]"),"no admin");q("[data-action=access-add-person]")?.click();later(function(){submit("#wp-access-create","#wp-new-person","新測試員工");later(function(){check(q(".wp-person-trigger")?.getAttribute("aria-label").includes("新測試員工"),"created selected");check(localStorage.getItem('+JSON.stringify(prefix+'person:workpulse:selected-person:v1')+')==="three","person remembered");check(!localStorage.getItem('+JSON.stringify(prefix+'session:credential')+')?.includes("test-code"),"no code stored");q("[data-action=access-lock]")?.click();later(function(){check(q("#wp-company-code"),"logged out");check(!q(".nav-list"),"no nav after logout");check(!localStorage.getItem('+JSON.stringify(prefix+'session:credential')+'),"credential removed");finish();});});});});});});'
     :scenario==='remembered'?'check(q(".wp-person-trigger")?.getAttribute("aria-label").includes("第二人員"),"remembered selected");check(!q("#wp-company-code"),"no repeated code");check(w.__wpCalls.join(",")==="status,shared","remembered RPC");finish();'
     :'check(q("#wp-company-code"),"revoked token locked");check(!q(".nav-list"),"no data after revocation");check(!localStorage.getItem('+JSON.stringify(prefix+'session:credential')+'),"revoked removed");finish();')+'});</script></body></html>';
   await writeFile(path,harness);
   const dom=execFileSync(browser,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-extensions','--virtual-time-budget=5000','--dump-dom','http://127.0.0.1:'+port+'/'+file],{cwd:root,encoding:'utf8',timeout:25000,maxBuffer:15*1024*1024,stdio:['ignore','pipe','pipe']});
   const match=dom.match(/<output id="result">([^<]+)<\/output>/);assert.ok(match,'shared access probe not rendered');
   const actual=JSON.parse(match[1].replace(/&quot;/g,'"'));
   assert.deepEqual(actual.errors,[],'GAS shared access '+scenario);
   assert.deepEqual(actual.calls,scenario==='fresh'?['status','unlock','unlock','shared','create','shared']:['status','shared']);
   console.log('PASS GAS shared access: '+scenario);
  }
 }finally{await rm(path,{force:true});}
}
