import test from 'node:test';
import assert from 'node:assert/strict';
import { demoState, emptyState, validateState, saveJournal, journalFor, monthStats, csvExport, STORAGE_KEY, writeState, readState } from '../src/features/journals/data.js';
import { localISODate, shiftDate, esc, csvSafe } from '../src/shared/utils.js';
const example={date:'2026-11-22',employeeId:'me',note:'檢查結果',tomorrow:'持續測試',tasks:[{title:'首頁版型',category:'前端開發',project:'WorkPulse',description:'完成互動',result:'版型檔',status:'done',hours:2.5},{title:'施工現場確認',category:'現場勘查',project:'',description:'現場圖面',result:'',status:'doing',hours:1.5}]};

test('local calendar dates do not depend on UTC timezone formatting',()=>{
  assert.equal(localISODate(new Date(2026,10,22)),'2026-11-22');
  assert.equal(shiftDate('2026-11-01',-1),'2026-10-31');
});
test('date/person uniquely identify a journal and updates replace the daily entry',()=>{
  const first=saveJournal(emptyState(),example);
  const second=saveJournal(first,{...example,note:'新備註',tasks:[{...example.tasks[0],title:'新名稱'}]});
  assert.equal(second.journals.length,1);
  assert.equal(journalFor(second,'2026-11-22','me').note,'新備註');
  assert.equal(second.journals[0].tasks[0].title,'新名稱');
});
test('month statistics handle categories and completion status',()=>{
  const stats=monthStats(saveJournal(emptyState(),example),'2026-11');
  assert.deepEqual([stats.count,stats.hours,stats.completed,stats.pending,stats.days,stats.rate],[2,4,1,1,1,50]);
  assert.equal(stats.byCategory.find(x=>x.name==='前端開發').hours,2.5);
});
test('invalid days and more than 24 hours are rejected',()=>{
  assert.throws(()=>saveJournal(emptyState(),{...example,tasks:[]}),/至少需要/);
  assert.throws(()=>saveJournal(emptyState(),{...example,tasks:[{...example.tasks[0],hours:25}]}),/24 小時/);
});
test('backup validation and storage round-trip',()=>{
  const memory = new Map();const storage={setItem:(k,v)=>memory.set(k,v),getItem:(k)=>memory.get(k)};
  const data=saveJournal(emptyState(),example);
  writeState(data,storage);
  assert.ok(memory.has(STORAGE_KEY));
  assert.equal(readState(storage).journals.length,1);
  assert.throws(()=>validateState({version:0,employees:[],projects:[],journals:[]}),/格式/);
});
test('CSV export neutralizes spreadsheet formula injection and quotes content',()=>{
  const data=saveJournal(emptyState(),{...example,tasks:[{...example.tasks[0],title:'=HYPERLINK("evil")'}]});
  const csv=csvExport(data);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.equal(csvSafe('+1'),"\"'+1\"");
});
test('HTML escapes untrusted imported fields',()=>{
  assert.equal(esc('<script>"&'), '&lt;script&gt;&quot;&amp;');
  const demo=demoState('2026-11-22');
  assert.equal(demo.journals.length,3);
});
