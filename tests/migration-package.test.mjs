import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLocalMigrationPackage} from '../src/features/journals/migration-package.js';
const state={version:1,mode:'local',employees:[{id:'e1',name:'同仁'}],projects:[],categories:['其他'],journals:[{id:'j1',date:'2026-11-26',employeeId:'e1',tasks:[{id:'t1',category:'其他',hours:1}]}]};
const storage=(s=state,a=[])=>({getItem:key=>key==='workpulse:v1'?(s?JSON.stringify(s):null):JSON.stringify(a)});
test('migration captures all saved dates and excludes salary and unknown attendance fields',()=>{
 const pack=buildLocalMigrationPackage(storage(state,[{id:'a1',employeeId:'e1',date:'2026-12-01',workedMinutes:480,monthlyWage:50000,overtimePay:700,token:'secret'}]));
 assert.equal(pack.counts.journals,1);assert.equal(pack.counts.attendance,1);assert.deepEqual(pack.months,['2026-11','2026-12']);assert.equal(pack.notImported,true);
 assert.equal(pack.attendance[0].monthlyWage,undefined);assert.equal(pack.attendance[0].token,undefined);
});
test('migration never invents demo data and marks missing employees and duplicate records',()=>{
 assert.throws(()=>buildLocalMigrationPackage(storage(null)),/沒有已儲存/);
 const row={employeeId:'missing',date:'2026-11-26'};
 const pack=buildLocalMigrationPackage(storage(null,[row,row]));
 assert.equal(pack.counts.journals,0);assert.equal(pack.warnings.length,3);
 assert.throws(()=>buildLocalMigrationPackage(storage({...state,mode:'cloud'})),/本機資料/);
 assert.throws(()=>buildLocalMigrationPackage(storage(state,[{employeeId:'e1',date:'2026-02-30'}])),/無效日期/);
});
