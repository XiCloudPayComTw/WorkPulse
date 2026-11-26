import test from 'node:test';
import assert from 'node:assert/strict';
import {deploymentCheckState,renderDeploymentCheck,loadDeploymentCheck,integrityState,loadMonthIntegrity,renderMonthIntegrity} from '../src/features/admin/admin.js';
test('private deployment readiness renders only verified diagnostics, escapes messages and never claims production',async()=>{
 const old=globalThis.google;
 try{
  let answer={readOnly:true,configurationPassed:false,productionVerified:false,checks:[{key:'backupFolder',ok:false,detail:'<unsafe>'}]};
  globalThis.google={script:{run:{withSuccessHandler(fn){this.ok=fn;return this;},withFailureHandler(){return this;},workPulseDeploymentCheck(){this.ok(answer);}}}};
  await loadDeploymentCheck();const html=renderDeploymentCheck();
  assert.match(html,/獨立備份資料夾 · 待處理/);assert.match(html,/&lt;unsafe&gt;/);assert.match(html,/仍不代表正式上線/);
  answer={...answer,productionVerified:true};await loadDeploymentCheck();assert.equal(deploymentCheckState.data,null);assert.match(renderDeploymentCheck(),/回應格式異常/);
 }finally{if(old===undefined)delete globalThis.google;else globalThis.google=old;Object.assign(deploymentCheckState,{busy:false,data:null,error:''});}
});

test('month integrity UI distinguishes missing files from successful checks',async()=>{
 const old=globalThis.google;
 try{
  globalThis.google={script:{run:{withSuccessHandler(fn){this.ok=fn;return this;},withFailureHandler(){return this;},wpOwnerMonthIntegrity(input){this.ok({readOnly:true,productionVerified:false,month:input.month,status:'not-found',counts:{},issues:[]});}}}};
  await loadMonthIntegrity('2026-11');assert.match(renderMonthIntegrity('2026-11'),/尚無月份檔案（未驗收）/);
 }finally{if(old===undefined)delete globalThis.google;else globalThis.google=old;Object.assign(integrityState,{busy:false,data:null,error:'',month:''});}
});
