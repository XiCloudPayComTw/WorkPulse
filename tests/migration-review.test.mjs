import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectMigrationPackage,planMigrationKeys} from '../src/features/admin/migration-review.js';
const pack={format:'workpulse-local-migration-v1',notImported:true,employees:[{id:'a',name:'甲'},{id:'b',name:'乙'}],journals:[{id:'j1',employeeId:'a',date:'2026-11-01',note:'private'},{id:'j2',employeeId:'b',date:'2026-11-01'},{id:'demo-1',employeeId:'a',date:'2026-11-02'}],attendance:[{employeeId:'a',date:'2026-11-01'}]};
test('preflight strips full records and requires explicit mappings',()=>{
 const data=inspectMigrationPackage(pack);assert.equal(data.rows[0].note,undefined);
 const empty=planMigrationKeys(data,{},'2026-11',[{id:'e'}]);assert.equal(empty.items.length,0);
 const plan=planMigrationKeys(data,{a:'e',b:'e'},'2026-11',[{id:'e'}]);
 assert.deepEqual(plan.items,[{kind:'attendance',employeeId:'e',date:'2026-11-01'}]);assert.equal(plan.blocked.length,3);
});
test('preflight rejects invalid dates and duplicate source employee IDs',()=>{
 assert.throws(()=>inspectMigrationPackage({...pack,attendance:[{employeeId:'a',date:'2026-02-30'}]}),/日期/);
 assert.throws(()=>inspectMigrationPackage({...pack,employees:[pack.employees[0],pack.employees[0]]}),/重複/);
});
