import test from 'node:test';
import assert from 'node:assert/strict';
import {backupCenterState,startBackupBatch,continueBackupBatch,renderBackupCenter} from '../src/features/admin/backup-center.js';
test('all backup stops on unknown result, resumes same request ID and verifies final plan',async()=>{
 const old=globalThis.google,seen=[];let fail=true;
 const plan={readOnly:true,folderConfigured:true,targets:['control','2026-11','2026-12'],pausedAt:'2026-11-26T00:00:00Z'};
 try{
  globalThis.google={script:{run:{withSuccessHandler(fn){this.ok=fn;return this;},withFailureHandler(fn){this.fail=fn;return this;},wpOwnerBackupPlan(){this.ok(plan);},wpOwnerBackupWorkbook(input){seen.push({...input});if(input.target==='2026-11'&&fail){fail=false;this.fail({message:'timeout'});return;}this.ok({ok:true,target:input.target,name:'backup-'+input.target,sheets:[]});}}}};
  await startBackupBatch('all');assert.deepEqual(backupCenterState.job.items.map(x=>x.status),['done','unconfirmed','pending']);assert.equal(seen.length,2);
  await continueBackupBatch();assert.equal(seen[1].requestId,seen[2].requestId);assert.equal(seen[3].target,'2026-12');assert.equal(seen[0].requiredPausedAt,plan.pausedAt);
  assert.ok(backupCenterState.job.completedAt);assert.match(renderBackupCenter('2026-11'),/3 \/ 3 檔已確認/);
 }finally{if(old===undefined)delete globalThis.google;else globalThis.google=old;Object.assign(backupCenterState,{busy:false,plan:null,job:null,error:'',comparison:null,month:''});}
});
