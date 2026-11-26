import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

/** Run each simulated browser independently so module-level app state is fresh. */
function runCloudScenario(kind){
 const js=String.raw`
 const handlers={};
 const root={innerHTML:'',addEventListener(kind,callback){handlers[kind]=callback;}};
 const storage={getItem(){return null;},setItem(){},removeItem(){}};
 globalThis.localStorage=storage;globalThis.sessionStorage=storage;
 globalThis.location={hash:'#/overview'};
 globalThis.window={addEventListener(){},scrollTo(){},localStorage:storage,sessionStorage:storage};
 globalThis.document={querySelector:s=>s==='#app'?root:null,querySelectorAll:()=>[],
  addEventListener(){},createElement(){return {innerHTML:'',addEventListener(){}};}};
 globalThis.confirm=()=>true;globalThis.alert=()=>{};
 const requests=[];
 const runner={
  withSuccessHandler(fn){return {...this,success:fn};},
  withFailureHandler(fn){return {...this,failure:fn};},
  wpSharedBootstrap(month){requests.push({success:this.success,failure:this.failure,month});}
 };
 globalThis.google={script:{run:runner}};
 await import('./src/app.js');
 if(requests.length!==1)throw Error('Initial cloud request missing');
 const retry=()=>handlers.click({target:{closest:()=>({dataset:{action:'retry-cloud'}})}});
 if(process.env.SCENARIO==='fail-then-retry'){
  requests[0].failure({message:'公司 Drive 暫時無法連線'});
  await new Promise(resolve=>setImmediate(resolve));
  if(!root.innerHTML.includes('公司 Drive 暫時無法連線'))throw Error('Cloud failure not visible');
  retry();
  if(requests.length!==2)throw Error('Retry did not request bootstrap');
  requests[1].success({store:{employees:[{id:'new',name:'新員工'}],projects:[],journals:[]},
    user:{name:'新使用者',email:'new@example.test',role:'staff',canWriteIds:['new']}});
 }else{
  retry();
  if(requests.length!==2)throw Error('Second bootstrap not started');
  requests[1].success({store:{employees:[{id:'new',name:'新員工'}],projects:[],journals:[]},
    user:{name:'新使用者',email:'new@example.test',role:'staff',canWriteIds:['new']}});
  await new Promise(resolve=>setImmediate(resolve));
  requests[0].success({store:{employees:[{id:'old',name:'舊員工'}],projects:[],journals:[]},
    user:{name:'舊使用者',email:'old@example.test',role:'staff',canWriteIds:['old']}});
 }
 await new Promise(resolve=>setImmediate(resolve));
 if(!root.innerHTML.includes('new@example.test'))throw Error('Newest cloud request not rendered');
 if(root.innerHTML.includes('old@example.test'))throw Error('Stale cloud bootstrap overwrote current state');
 console.log('CLOUD_BOOT_RETRY_OK');
 `;
 const cwd=fileURLToPath(new URL('../',import.meta.url));
 return spawnSync(process.execPath,['--input-type=module','-e',js],{
  cwd,encoding:'utf8',timeout:12000,env:{...process.env,SCENARIO:kind}});
}
test('cloud bootstrap error renders retry button, next attempt recovers without refreshing',()=>{
 const result=runCloudScenario('fail-then-retry');
 assert.equal(result.status,0,result.stderr||result.stdout);
 assert.match(result.stdout,/CLOUD_BOOT_RETRY_OK/);
});
test('slower previous bootstrap cannot overwrite newer successful retry',()=>{
 const result=runCloudScenario('stale-response');
 assert.equal(result.status,0,result.stderr||result.stdout);
 assert.match(result.stdout,/CLOUD_BOOT_RETRY_OK/);
});
