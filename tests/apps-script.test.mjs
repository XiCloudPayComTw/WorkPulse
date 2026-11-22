import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const backend=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');

function harness(){
 let email='admin@example.com', seq=1, locked=false;
 const sheets=new Map();
 const props={WORKPULSE_SHEET_ID:'fake-sheet-1',WORKPULSE_ALLOWED_DOMAIN:'example.com',WORKPULSE_ADMIN_EMAIL:'admin@example.com'};
 class Sheet {
  constructor(name){this.name=name;this.rows=[];}
  getName(){return this.name;}
  getLastRow(){return this.rows.length;}
  getMaxRows(){return 10000;}
  setFrozenRows(){}
  appendRow(values){this.rows.push([...values]);return this;}
  getRange(row,col,n=1,w=1){
   return {
    getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>this.rows[row-1+i]?.[col-1+j]??'')),
    setValues:(values)=>{for(let i=0;i<values.length;i++){const r=row-1+i;this.rows[r]=this.rows[r]??[];for(let j=0;j<values[i].length;j++)this.rows[r][col-1+j]=values[i][j];}return this;},
    setNumberFormat:()=>this,
    setFontWeight:()=>this
   };
  }
 }
 const book={getSheetByName:name=>sheets.get(name)||null,insertSheet:name=>{const s=new Sheet(name);sheets.set(name,s);return s;}};
 const scope={
  HtmlService:{createHtmlOutputFromFile:()=>({setTitle(){return this;},addMetaTag(){return this;}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},
  Session:{getActiveUser:()=>({getEmail:()=>email})},
  SpreadsheetApp:{openById:id=>{if(id!==props.WORKPULSE_SHEET_ID)throw Error('Bad sheet');return book;},flush(){}},
  LockService:{getScriptLock:()=>({waitLock:()=>{if(locked)throw Error('Already locked');locked=true;},releaseLock:()=>{locked=false;}})},
  Utilities:{getUuid:()=>`uuid-${seq++}`},
  console
 };
 vm.createContext(scope);vm.runInContext(backend,scope,{filename:'Code.gs'});
 const as=user=>{email=user;};
 const addEmployee=(id,mail,role='staff',dept='team-a',active=true)=>sheets.get('Employees').appendRow([id,mail,mail.split('@')[0],role,dept,active]);
 const addProject=name=>sheets.get('Projects').appendRow([`p-${seq++}`,name,true]);
 const submission=(employeeId='emp-a',expectedRevision=0,requestId='request-unique-0001')=>({
  date:'2026-11-22',employeeId,requestId,expectedRevision,note:'備註',tomorrow:'明天',
  tasks:[{title:'第一項任務',project:'WorkPulse',category:'前端開發',description:'今日內容',result:'完成',status:'done',hours:2.5}]
 });
 scope.setupWorkPulse_();
 addEmployee('emp-a','alice@example.com');addEmployee('emp-b','bob@example.com','staff','team-b');
 addEmployee('emp-c','carol@example.com','manager','team-a');
 addEmployee('emp-d','dan@example.com','staff','team-a');
 addProject('WorkPulse');
 return {scope,sheets,props,as,submission,addEmployee,addProject};
}

test('initialization creates normalized sheets and can run twice without duplicating admin',()=>{
 const h=harness();const rows=h.sheets.get('Employees').rows.length;
 h.scope.setupWorkPulse_();assert.equal(h.sheets.get('Employees').rows.length,rows);
 assert.equal(h.sheets.get('Meta').rows[1][1],'2');
 assert.deepEqual(h.sheets.get('Journals').rows[0].slice(0,4),['journalId','date','employeeId','revision']);
});
test('fail-closed authentication and cross-domain access',()=>{
 const h=harness();h.as('');assert.throws(()=>h.scope.wpBootstrap('2026-11'),/無法驗證/);
 h.as('bad@outside.com');assert.throws(()=>h.scope.wpBootstrap('2026-11'),/無法驗證/);
 h.as('unknown@example.com');assert.throws(()=>h.scope.wpBootstrap('2026-11'),/尚未獲得/);
 h.as('alice@example.com');assert.equal(h.scope.wpBootstrap('2026-11').user.id,'emp-a');
});
test('staff sees only self; manager only same department, administrator sees all',()=>{
 const h=harness();
 h.as('alice@example.com');assert.equal(h.scope.wpBootstrap('2026-11').store.employees.length,1);
 h.as('carol@example.com');const peers=h.scope.wpBootstrap('2026-11').store.employees.map(x=>x.id);
 assert.ok(peers.includes('emp-a'));assert.ok(peers.includes('emp-d'));assert.ok(!peers.includes('emp-b'));
 h.as('admin@example.com');assert.equal(h.scope.wpBootstrap('2026-11').store.employees.length,5);
});
test('cloud journal create, read, update with optimistic revision and write audit',()=>{
 const h=harness();h.as('alice@example.com');
 const first=h.scope.wpSaveJournal(h.submission());
 assert.equal(first.journal.revision,1);
 assert.equal(h.scope.wpBootstrap('2026-11').store.journals.length,1);
 const next=h.scope.wpSaveJournal({...h.submission('emp-a',1,'request-unique-0002'),note:'已修改',tasks:[{...h.submission().tasks[0],hours:3}]});
 assert.equal(next.journal.revision,2);
 assert.equal(h.scope.wpLoadMonth('2026-11').journals[0].tasks[0].hours,3);
 assert.equal(h.scope.wpLoadMonth('2026-11').journals[0].note,'已修改');
 assert.equal(h.sheets.get('Audit').rows.length,3);
 assert.equal(h.sheets.get('Tasks').rows.length,3);
});
test('duplicate request does not write twice, and conflict fails rather than overwrite',()=>{
 const h=harness();h.as('alice@example.com');
 h.scope.wpSaveJournal(h.submission());
 const duplicate=h.scope.wpSaveJournal(h.submission());
 assert.equal(duplicate.deduplicated,true);
 assert.equal(h.sheets.get('Requests').rows.length,2);
 assert.equal(h.sheets.get('Tasks').rows.length,2);
 assert.throws(()=>h.scope.wpSaveJournal(h.submission('emp-a',0,'request-unique-0003')),/CONFLICT/);
});
test('staff cannot impersonate other people, manager cannot edit others',()=>{
 const h=harness();h.as('alice@example.com');
 assert.throws(()=>h.scope.wpSaveJournal(h.submission('emp-b')),/沒有權限/);
 h.as('carol@example.com');assert.throws(()=>h.scope.wpSaveJournal(h.submission('emp-a')),/沒有權限/);
 h.as('admin@example.com');assert.equal(h.scope.wpSaveJournal(h.submission('emp-a')).journal.revision,1);
});
test('reject invalid month, nonexistent date, bad hours, fake category and unapproved project',()=>{
 const h=harness();h.as('alice@example.com');
 assert.throws(()=>h.scope.wpLoadMonth('2026-13'),/月份/);
 assert.throws(()=>h.scope.wpSaveJournal({...h.submission(),date:'2026-02-30'}),/日期不存在/);
 assert.throws(()=>h.scope.wpSaveJournal({...h.submission(),tasks:[{...h.submission().tasks[0],hours:25}]}),/工時/);
 assert.throws(()=>h.scope.wpSaveJournal({...h.submission(),tasks:[{...h.submission().tasks[0],category:'惡意分類'}]}),/分類/);
 assert.throws(()=>h.scope.wpSaveJournal({...h.submission(),tasks:[{...h.submission().tasks[0],project:'不在清單'}]}),/所屬專案/);
});
test('neutralize formulas before storing data, with readable round trip',()=>{
 const h=harness();h.as('alice@example.com');
 const input=h.submission();input.tasks[0].title='=HYPERLINK("https://example.com","bad")';input.note='-dangerous';
 h.scope.wpSaveJournal(input);
 const raw=h.sheets.get('Tasks').rows[1][6];
 assert.equal(raw[0],"'");
 const record=h.scope.wpLoadMonth('2026-11').journals[0];
 assert.equal(record.tasks[0].title,input.tasks[0].title);
 assert.equal(record.note,input.note);
});
test('month read requires permission and only returns the selected month',()=>{
 const h=harness();h.as('admin@example.com');
 h.scope.wpSaveJournal(h.submission('emp-a'));
 h.scope.wpSaveJournal({...h.submission('emp-b',0,'request-unique-0004'),date:'2026-12-01'});
 h.as('alice@example.com');
 assert.equal(h.scope.wpLoadMonth('2026-11').journals.length,1);
 assert.equal(h.scope.wpLoadMonth('2026-12').journals.length,0);
 h.as('bob@example.com');assert.equal(h.scope.wpLoadMonth('2026-12').journals.length,1);
});
