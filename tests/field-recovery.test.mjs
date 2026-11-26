import test from 'node:test';
import assert from 'node:assert/strict';
import {stageFieldPending,readFieldPending,removeFieldPending,fieldSave,retryFieldPending} from '../src/services/field-recovery.js';
import {saveAttendanceDraft,readAttendanceDraft,clearAttendanceDraft} from '../src/features/attendance/attendance-draft.js';
const db=()=>{const rows=new Map();return {getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k)};};
const payload=(extra={})=>({employeeId:'e1',date:'2026-11-26',expectedRevision:2,requestId:'request_12345678',dayType:'workday',startTime:'08:00',endTime:'17:00',...extra});
test('pending attendance is isolated and no salary fields survive',()=>{
 globalThis.sessionStorage=db();try{
 const a=payload({monthlyWage:50000,overtimePay:1000});stageFieldPending('wpAttendanceSave',a);
 assert.equal(readFieldPending()[0].payload.monthlyWage,undefined);assert.equal(readFieldPending()[0].payload.overtimePay,undefined);
 assert.throws(()=>stageFieldPending('wpAttendanceSave',payload({requestId:'request_99999999',startTime:'09:00'})),/待同步/);
 stageFieldPending('wpAttendanceSave',payload({employeeId:'e2',requestId:'request_22222222'}));assert.equal(readFieldPending().length,2);
 removeFieldPending(a.requestId);assert.equal(readFieldPending()[0].payload.employeeId,'e2');
 }finally{delete globalThis.sessionStorage;}
});
test('attendance drafts retain revision, not salary, and isolate person/date',()=>{
 const s=db(),d={...payload(),revision:2,monthlyWage:30000,notes:'現場'};
 assert.equal(saveAttendanceDraft(d,s),true);assert.equal(readAttendanceDraft('e1',d.date,s).revision,2);
 assert.equal(readAttendanceDraft('e1',d.date,s).monthlyWage,undefined);assert.equal(readAttendanceDraft('e2',d.date,s),null);
 assert.equal(readAttendanceDraft('e1','2026-11-25',s),null);clearAttendanceDraft('e1',d.date,s);assert.equal(readAttendanceDraft('e1',d.date,s),null);
});
test('explicit retry reuses original payload, clears only after acknowledgement',async()=>{
 globalThis.sessionStorage=db();const calls=[];
 globalThis.google={script:{run:{withSuccessHandler(fn){this.ok=fn;return this;},withFailureHandler(fn){this.fail=fn;return this;},wpAttendanceSave(arg){calls.push(arg);if(calls.length===1)this.fail({message:'network interrupted'});else this.ok({ok:true,row:{employeeId:arg.employeeId,date:arg.date,revision:3}});}}}};
 try{await assert.rejects(fieldSave('wpAttendanceSave',payload()),/network/);assert.equal(calls.length,1);assert.equal(readFieldPending().length,1);
 await assert.rejects(retryFieldPending(payload().requestId,'e2'),/找不到/);await retryFieldPending(payload().requestId,'e1');
 assert.deepEqual(calls[0],calls[1]);assert.equal(readFieldPending().length,0);}finally{delete globalThis.google;delete globalThis.sessionStorage;}
});
test('known conflict is retained, and never replayed automatically',async()=>{
 globalThis.sessionStorage=db();let calls=0;
 globalThis.google={script:{run:{withSuccessHandler(){return this;},withFailureHandler(fn){this.fail=fn;return this;},wpAttendanceSave(){calls++;this.fail({message:'CONFLICT: newer revision'});}}}};
 try{await assert.rejects(fieldSave('wpAttendanceSave',payload()),/CONFLICT/);assert.equal(readFieldPending()[0].status,'conflict');
 await assert.rejects(retryFieldPending(payload().requestId,'e1'),/版本衝突/);assert.equal(calls,1);}finally{delete globalThis.google;delete globalThis.sessionStorage;}
});
