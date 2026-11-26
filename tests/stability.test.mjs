import test from 'node:test';
import assert from 'node:assert/strict';
import {NAV,viewFromHash,visibleNavigation,renderNavigationButton} from '../src/app/navigation.js';
import {validateReportPeriod,applyReportPeriod} from '../src/features/reports/periods.js';
import {cloudEnabled,cloudCall} from '../src/services/cloud.js';

test('routes parse deep links consistently and do not grant admin privileges',()=>{
 assert.equal(viewFromHash('#/attendance'),'attendance');
 assert.equal(viewFromHash('#history'),'history');
 assert.equal(viewFromHash('#/nonexistent'),'overview');
 assert.deepEqual(NAV.map(r=>r.id),['overview','attendance','entry','history','insights','settings','team']);
 assert.equal(visibleNavigation(false,null).some(r=>r.id==='team'),false);
 assert.equal(visibleNavigation(true,'staff').some(r=>r.id==='settings'),false);
 assert.equal(visibleNavigation(true,'staff').some(r=>r.id==='team'),false);
 assert.equal(visibleNavigation(true,'admin').some(r=>r.id==='team'),true);
 assert.match(renderNavigationButton(NAV[1],'attendance'),/aria-current="page"/);
 assert.match(renderNavigationButton(NAV[1],'overview'),/aria-current="false"/);
});
test('report date validation catches nonexistent, reversed and overlong ranges',()=>{
 assert.equal(validateReportPeriod({startDate:'2024-02-29',endDate:'2024-03-01'}),'');
 assert.match(validateReportPeriod({startDate:'2025-02-29',endDate:'2025-03-01'}),/正確/);
 assert.match(validateReportPeriod({startDate:'2026-11-30',endDate:'2026-11-01'}),/由早到晚/);
 assert.match(validateReportPeriod({startDate:'2025-01-01',endDate:'2026-02-01'}),/366/);
});
test('report period shortcuts preserve unrelated filters and respect leap years',()=>{
 const filters={employeeId:'E1',category:'設計',startDate:'',endDate:''};
 applyReportPeriod(filters,'previous','2024-03-07');
 assert.deepEqual([filters.startDate,filters.endDate],['2024-02-01','2024-02-29']);
 assert.equal(filters.employeeId,'E1');
 applyReportPeriod(filters,'month','2026-11-26');
 assert.deepEqual([filters.startDate,filters.endDate],['2026-11-01','2026-11-26']);
 applyReportPeriod(filters,'quarter','2026-11-26');
 assert.equal(filters.endDate,'2026-11-26');
 assert.equal(filters.employeeId,'E1');
});
test('cloud request allowlist denies unknown endpoints',async()=>{
 const previous=globalThis.google;
 try{
  globalThis.google={script:{run:{}}};
  assert.equal(cloudEnabled(),true);
  await assert.rejects(cloudCall('wpOwnerDangerousQuery',{secret:true}),/未知/);
  await assert.rejects(cloudCall('wpAttendanceLoad',{}, {timeoutMs:0}),/逾時設定/);
 }finally{if(previous===undefined)delete globalThis.google;else globalThis.google=previous;}
});
test('cloud requests surface success and backend failures without stale handlers',async()=>{
 const previous=globalThis.google;
 try{
  const requests=[];
  globalThis.google={script:{run:{
   withSuccessHandler(fn){this.ok=fn;return this;},
   withFailureHandler(fn){this.fail=fn;return this;},
   wpAttendanceLoad(arg){requests.push(arg);this.ok({rows:[],expectedDays:20});},
   wpSharedBootstrap(){this.fail({message:'無權限存取公司 Drive'});}
  }}};
  assert.deepEqual(await cloudCall('wpAttendanceLoad',{employeeId:'E1',month:'2026-11'}),{rows:[],expectedDays:20});
  assert.deepEqual(requests,[{employeeId:'E1',month:'2026-11'}]);
  await assert.rejects(cloudCall('wpSharedBootstrap','2026-11'),/無權限/);
 }finally{if(previous===undefined)delete globalThis.google;else globalThis.google=previous;}
});
test('unresponsive read shows a timeout and late responses cannot re-settle it',async()=>{
 const previous=globalThis.google;
 try{
  let ok;
  globalThis.google={script:{run:{
   withSuccessHandler(fn){ok=fn;return this;},
   withFailureHandler(){return this;},
   wpAttendanceLoad(){}
  }}};
  const call=cloudCall('wpAttendanceLoad',{employeeId:'E1'}, {timeoutMs:12});
  await assert.rejects(call,/連線逾時/);
  assert.doesNotThrow(()=>ok({rows:[{date:'2026-11-01'}]}));
 }finally{if(previous===undefined)delete globalThis.google;else globalThis.google=previous;}
});
test('write requests are not retried automatically after an uncertain timeout',async()=>{
 const previous=globalThis.google;
 try{
  let calls=0;
  globalThis.google={script:{run:{
   withSuccessHandler(){return this;},
   withFailureHandler(){return this;},
   wpAttendanceSave(){calls++;}
  }}};
  await assert.rejects(cloudCall('wpAttendanceSave',{requestId:'test'}, {timeoutMs:10}),/連線逾時/);
  assert.equal(calls,1);
 }finally{if(previous===undefined)delete globalThis.google;else globalThis.google=previous;}
});
