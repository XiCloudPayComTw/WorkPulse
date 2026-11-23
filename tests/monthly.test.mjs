import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=n=>readFileSync(new URL('../apps-script/'+n,import.meta.url),'utf8');
const source=['Core.gs','Monthly.gs','Simple.gs','Owner.gs'].map(read).join('\n');
function harness(){
 let current='admin@example.com',effective='admin@example.com',counter=1,locked=false;
 const books=new Map(),files=new Map(),folders=new Map();
 const props={WORKPULSE_SHEET_ID:'control-1',WORKPULSE_ALLOWED_DOMAIN:'example.com',WORKPULSE_ADMIN_EMAIL:'admin@example.com'};
 class Sheet{
  constructor(name){this.name=name;this.rows=[];}
  getName(){return this.name;} setName(name){this.name=name;}
  getLastRow(){return this.rows.length;} getMaxRows(){return 500;}
  setFrozenRows(){} appendRow(row){this.rows.push([...row]);return this;}
  getRange(row,col,n=1,w=1){return {
    getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>this.rows[row+i-1]?.[col+j-1]??'')),
    setValues:values=>{values.forEach((v,i)=>{const z=row+i-1;this.rows[z]=this.rows[z]||[];
      v.forEach((cell,j)=>this.rows[z][col+j-1]=cell);});return this;},
    setNumberFormat:()=>this,setFontWeight:()=>this
  };}
 }
 class Book{
  constructor(id){this.id=id;this.sheets=[new Sheet('Sheet1')];}
  getId(){return this.id;} getSheets(){return this.sheets;}
  getSheetByName(name){return this.sheets.find(x=>x.name===name)||null;}
  insertSheet(name){const s=new Sheet(name);this.sheets.push(s);return s;}
 }
 function makeFile(id,name){
  const file={id,name,folder:'',getId:()=>id,getName:()=>name,
    getOwner:()=>({getEmail:()=> 'admin@example.com'}),moveTo:f=>{file.folder=f.getId();}};
  files.set(id,file);return file;
 }
 function makeBook(name,id){
  const key=id||'file-'+(counter++),b=new Book(key);
  books.set(key,b);makeFile(key,name);return b;
 }
 const control=makeBook('WorkPulse_Control',props.WORKPULSE_SHEET_ID);
 const scope={
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||'',setProperty:(k,v)=>{props[k]=v;}})},
  Session:{getActiveUser:()=>({getEmail:()=>current}),getEffectiveUser:()=>({getEmail:()=>effective})},
  SpreadsheetApp:{openById:id=>{if(!books.has(id))throw Error('Unknown spreadsheet');return books.get(id);},
    create:name=>makeBook(name),flush(){}},
  DriveApp:{getFileById:id=>files.get(id),getFolderById:id=>{if(!folders.has(id))throw Error('Missing folder');return folders.get(id);},
    createFolder:name=>{const id='folder-'+(counter++);
      const folder={getId:()=>id,getOwner:()=>({getEmail:()=> 'admin@example.com'}),
        getFilesByName:query=>{const items=Array.from(files.values()).filter(f=>f.folder===id&&f.name===query);
          let k=0;return {hasNext:()=>k<items.length,next:()=>items[k++]};}};
      folders.set(id,folder);return folder;}},
  LockService:{getScriptLock:()=>({waitLock:()=>{if(locked)throw Error('already locked');locked=true;},
    releaseLock:()=>{locked=false;}})},
  Utilities:{getUuid:()=> 'uuid-'+(counter++)},
  HtmlService:{createHtmlOutputFromFile:()=>({setTitle(){return this;},addMetaTag(){return this;}})},
  console
 };
 vm.createContext(scope);vm.runInContext(source,scope);
 const entry=(person,month='2026-11',version=0,key='shared-request-0001')=>({
  date:month+'-23',employeeId:person.id,expectedRevision:version,requestId:key,note:'備註',tomorrow:'後續',
  tasks:[{title:'網站功能開發',category:'前端開發',project:'',status:'done',hours:3,description:'內容',result:'完成'}]
 });
 return {scope,control,books,files,props,as:x=>current=x,effective:x=>effective=x,
  setup:()=>scope.wpPrivateSetupMonthly_(),
  employee:()=>scope.wpOwnerSaveEmployee({name:'小明',active:true,expectedRevision:0,requestId:'employee-add-00001'}).employees[0],
  entry,makeBook};
}
test('public bundle excludes privileged owner server functions',()=>{
 const builder=readFileSync(new URL('../scripts/build-gas.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(read('Simple.gs'),/function wpOwner/);
 assert.match(builder,/dist-gas\/public/);
 assert.match(builder,/dist-gas\/admin/);
 assert.doesNotMatch(builder,/readFile\('apps-script\/Code.gs'/);
});
test('private initialization creates company folder and MonthIndex, idempotently',()=>{
 const h=harness();const first=h.setup(),second=h.setup();
 assert.equal(first.folderId,second.folderId);
 assert.ok(h.control.getSheetByName('MonthIndex'));
 assert.equal(h.files.size,1);
});
test('reading an empty month does not create a file; saving creates one indexed workbook',()=>{
 const h=harness();h.setup();const person=h.employee();h.as('');
 assert.equal(h.scope.wpSharedLoadMonth('2026-11').journals.length,0);
 assert.equal(h.files.size,1);
 const first=h.scope.wpSharedSaveJournal(h.entry(person));
 assert.equal(first.journal.revision,1);
 assert.equal(h.files.size,2);
 assert.ok(h.scope.wpMonthIndex_(h.control)['2026-11']);
 assert.equal(h.scope.wpSharedLoadMonth('2026-11').journals.length,1);
 assert.equal(h.scope.wpSharedSaveJournal(h.entry(person)).deduplicated,true);
 assert.equal(h.files.size,2);
});
test('cross-month saves create separate Sheets and reports aggregate both months',()=>{
 const h=harness();h.setup();const p=h.employee();h.as('');
 h.scope.wpSharedSaveJournal(h.entry(p,'2026-11',0,'nov-write-0000001'));
 h.scope.wpSharedSaveJournal(h.entry(p,'2026-12',0,'dec-write-0000001'));
 const index=h.scope.wpMonthIndex_(h.control);
 assert.notEqual(index['2026-11'],index['2026-12']);
 assert.equal(h.scope.wpSharedLoadMonth('2026-12').journals.length,1);
 const result=h.scope.wpSharedQueryReport({startDate:'2026-11-01',endDate:'2026-12-31',
   employeeId:'all',project:'all',category:'all',status:'all'});
 assert.equal(result.journals.length,2);
});
test('owner deletes only by exact month and revision, anonymous cannot delete',()=>{
 const h=harness();h.setup();const p=h.employee();h.as('');
 const j=h.scope.wpSharedSaveJournal(h.entry(p)).journal;
 const request={journalId:j.id,date:j.date,expectedRevision:1,requestId:'delete-month-00001'};
 assert.throws(()=>h.scope.wpOwnerDeleteJournal(request),/管理員/);
 h.as('admin@example.com');
 assert.throws(()=>h.scope.wpOwnerDeleteJournal({...request,date:'2026-12-23'}),/月份試算表/);
 assert.equal(h.scope.wpOwnerDeleteJournal(request).ok,true);
 assert.equal(h.scope.wpOwnerDeleteJournal(request).deduplicated,true);
 assert.equal(h.scope.wpSharedLoadMonth('2026-11').journals.length,0);
});
test('owner identity must match both active and effective user',()=>{
 const h=harness();h.setup();h.effective('another@example.com');
 assert.throws(()=>h.scope.wpOwnerBootstrap(),/雙重身分驗證/);
 assert.throws(()=>h.scope.wpPrivateSetupMonthly_(),/雙重身分驗證/);
});
test('stale journal versions cannot silently overwrite monthly entries',()=>{
 const h=harness();h.setup();const p=h.employee();h.as('');
 h.scope.wpSharedSaveJournal(h.entry(p));
 assert.throws(()=>h.scope.wpSharedSaveJournal(h.entry(p,'2026-11',0,'stale-write-00001')),/CONFLICT/);
 assert.equal(h.scope.wpSharedLoadMonth('2026-11').journals.length,1);
});
test('old control workbook with journals requires explicit backup and migration',()=>{
 const h=harness();h.setup();const p=h.employee();
 h.control.getSheetByName('Meta').rows=h.control.getSheetByName('Meta').rows.filter(r=>r[0]!=='monthlyStorage');
 h.control.getSheetByName('Journals').appendRow(['legacy-id','2026-11-10',p.id,1,'2026-11-10T00:00Z','selected','original-request','note','next']);
 h.control.getSheetByName('Tasks').appendRow(['legacy-task','legacy-id',1,0,'','前端開發','舊資料','內容','成果','done',2]);
 assert.throws(()=>h.scope.wpPrivateSetupMonthly_(),/請先備份/);
 assert.throws(()=>h.scope.wpPrivateMigrateLegacyMonthly_(),/先備份/);
 const backup=h.makeBook('backup');const snapshot=backup.insertSheet('Journals');
 snapshot.appendRow(['journalId','date','employeeId','revision','updatedAt','updatedBy','requestId','note','tomorrow']);
 snapshot.appendRow([...h.control.getSheetByName('Journals').rows[1]]);
 h.props.WORKPULSE_BACKUP_SHEET_ID=backup.getId();
 const migrated=h.scope.wpPrivateMigrateLegacyMonthly_();
 assert.equal(migrated.legacyJournals,1);
 assert.equal(h.scope.wpSharedLoadMonth('2026-11').journals[0].id,'legacy-id');
 assert.equal(h.scope.wpPrivateMigrateLegacyMonthly_().alreadyMigrated,true);
});
test('malformed month metadata rejects queries instead of returning incorrect data',()=>{
 const h=harness();h.setup();const p=h.employee();h.as('');
 h.scope.wpSharedSaveJournal(h.entry(p));
 const book=h.books.get(h.scope.wpMonthIndex_(h.control)['2026-11']);
 const meta=book.getSheetByName('Meta').rows.find(r=>r[0]==='month');meta[1]='2026-10';
 assert.throws(()=>h.scope.wpSharedLoadMonth('2026-11'),/索引不符/);
});

test('private first-time bootstrap creates controller and folder only under configured company identity',()=>{
 const h=harness();
 delete h.props.WORKPULSE_SHEET_ID;
 const result=h.scope.wpPrivateCreateWorkspace_();
 assert.equal(result.ok,true);
 assert.ok(h.props.WORKPULSE_SHEET_ID.startsWith('file-'));
 assert.ok(h.props.WORKPULSE_FOLDER_ID.startsWith('folder-'));
 assert.equal(h.scope.wpPrivateCreateWorkspace_().controlId,h.props.WORKPULSE_SHEET_ID);
 h.as('guest@example.com');
 assert.throws(()=>h.scope.wpPrivateCreateWorkspace_(),/公司 Google 帳號/);
});
test('migrator refuses a backup that does not match the control workbook',()=>{
 const h=harness();h.setup();const p=h.employee();
 h.control.getSheetByName('Meta').rows=h.control.getSheetByName('Meta').rows.filter(r=>r[0]!=='monthlyStorage');
 h.control.getSheetByName('Journals').appendRow(['keep-this','2026-11-12',p.id,1,'now','selected','req','note','next']);
 const backup=h.makeBook('invalid-backup');
 backup.insertSheet('Journals').appendRow(['journalId','date','employeeId','revision','updatedAt','updatedBy','requestId','note','tomorrow']);
 h.props.WORKPULSE_BACKUP_SHEET_ID=backup.getId();
 assert.throws(()=>h.scope.wpPrivateMigrateLegacyMonthly_(),/備份與目前控制表/);
 assert.equal(h.scope.wpMonthIndex_(h.control)['2026-11'],undefined);
});
