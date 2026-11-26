import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const serverFileNames={"Core.gs":"shared/Core.gs","Monthly.gs":"shared/Monthly.gs","Simple.gs":"journals/Simple.gs","Owner.gs":"admin/Owner.gs","OwnerProjects.gs":"admin/OwnerProjects.gs","OwnerCategories.gs":"admin/OwnerCategories.gs","Attendance.gs":"attendance/Attendance.gs","AttendanceSave.gs":"attendance/AttendanceSave.gs","AttendanceRange.gs":"attendance/AttendanceRange.gs","OwnerAttendance.gs":"admin/OwnerAttendance.gs","Code.gs":"legacy/Code.gs","Review.gs":"legacy/Review.gs"};
const read=n=>readFileSync(new URL('../apps-script/'+(serverFileNames[n]||n),import.meta.url),'utf8');
const source=['Core.gs','Monthly.gs','Simple.gs','Owner.gs','OwnerProjects.gs','OwnerCategories.gs','Attendance.gs','AttendanceSave.gs','OwnerAttendance.gs','AttendanceRange.gs'].map(read).join('\n');
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
    getOwner:()=>({getEmail:()=> 'admin@example.com'}),getSharingAccess:()=> 'private',getEditors:()=>[],getViewers:()=>[],moveTo:f=>{file.folder=f.getId();},makeCopy:(title,dest)=>{const b=makeBook(title);b.sheets=books.get(id).sheets.map(s=>{const clone=new Sheet(s.name);clone.rows=s.rows.map(r=>[...r]);return clone;});const copy=files.get(b.id);copy.moveTo(dest);return copy;}};
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
  DriveApp:{Access:{PRIVATE:'private'},getFileById:id=>files.get(id),getFolderById:id=>{if(!folders.has(id))throw Error('Missing folder');return folders.get(id);},
    createFolder:name=>{const id='folder-'+(counter++);
      const folder={getId:()=>id,getOwner:()=>({getEmail:()=> 'admin@example.com'}),getSharingAccess:()=> 'private',getEditors:()=>[],getViewers:()=>[],
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

test('attendance is stored in monthly Attendance sheet, with exact clock and break minutes',()=>{
 const h=harness();h.setup();const employee=h.employee();h.as('');
 const payload={date:'2026-11-25',employeeId:employee.id,dayType:'workday',
  startTime:'09:00',endTime:'20:00',breakMinutes:60,leaveType:'none',
  leaveMinutes:0,notes:'網站專案加班',expectedRevision:0,requestId:'att-save-00000001'};
 const first=h.scope.wpAttendanceSave(payload);
 assert.equal(first.row.workedMinutes,600);
 assert.equal(first.row.overtimeMinutes,120);
 assert.equal(first.row.overtimePay,undefined);
 assert.equal(h.scope.wpAttendanceSave(payload).deduplicated,true);
 assert.equal(h.scope.wpAttendanceLoad({month:'2026-11',employeeId:employee.id}).rows.length,1);
 assert.equal(h.scope.wpMonthIndex_(h.control)['2026-11']?.startsWith('file-'),true);
});
test('temporary wages never reach Sheets or attendance APIs; expected days can be configured',()=>{
 const h=harness();h.setup();const e=h.employee();h.as('');
 const config={employeeId:e.id,month:'2026-11',expectedDays:20,expectedRevision:0,
   requestId:'att-cfg-00000001'};
 assert.throws(()=>h.scope.wpOwnerSaveAttendanceConfig(config),/管理員/);
 h.as('admin@example.com');
 assert.throws(()=>h.scope.wpOwnerSaveAttendanceConfig({...config,monthlyWage:36000}),/禁止儲存/);
 const set=h.scope.wpOwnerSaveAttendanceConfig(config);
 assert.equal(set.ok,true);assert.equal(set.config.expectedDays,20);
 assert.equal(set.config.monthlyWage,undefined);
 const settings=h.control.getSheetByName('AttendanceSettings');
 assert.equal(settings.rows[1][2],'');
 h.as('');
 const form={date:'2026-11-25',employeeId:e.id,dayType:'workday',startTime:'09:00',
  endTime:'19:00',breakMinutes:60,leaveType:'none',leaveMinutes:0,
  notes:'加班',expectedRevision:0,requestId:'att-pay-00000001'};
 assert.throws(()=>h.scope.wpAttendanceSave({...form,monthlyWage:36000}),/禁止上傳/);
 assert.throws(()=>h.scope.wpAttendanceSave({...form,overtimePay:200}),/禁止上傳/);
 const saved=h.scope.wpAttendanceSave(form);
 assert.equal(saved.row.workedMinutes,540);
 assert.equal(saved.row.overtimeMinutes,60);
 assert.equal(saved.row.overtimePay,undefined);
 const loaded=h.scope.wpAttendanceLoad({month:'2026-11',employeeId:e.id});
 assert.equal(loaded.expectedDays,20);
 assert.equal(loaded.wageConfigured,undefined);
 assert.equal(loaded.monthlyWage,undefined);
 assert.equal(loaded.rows[0].overtimePay,undefined);
 const monthBook=h.books.get(h.scope.wpMonthIndex_(h.control)['2026-11']);
 assert.equal(monthBook.getSheetByName('Attendance').rows[1][11],'');
 // Historical sensitive cells, if any, are excluded from BOTH public and private APIs.
 settings.rows[1][2]=80000;
 monthBook.getSheetByName('Attendance').rows[1][11]=987654;
 assert.equal(h.scope.wpAttendanceLoad({month:'2026-11',employeeId:e.id}).rows[0].overtimePay,undefined);
 h.as('admin@example.com');
 assert.equal(h.scope.wpOwnerAttendanceConfig({month:'2026-11',employeeId:e.id}).monthlyWage,undefined);
});
test('attendance supports rest days, holiday premium and leave-only records',()=>{
 const h=harness();h.setup();const e=h.employee();
 h.scope.wpOwnerSaveAttendanceConfig({employeeId:e.id,month:'2026-11',
  expectedDays:20,expectedRevision:0,requestId:'att-cfg-00000002'});
 h.as('');
 const rest=h.scope.wpAttendanceSave({date:'2026-11-21',employeeId:e.id,dayType:'rest',
  startTime:'09:00',endTime:'15:00',breakMinutes:0,leaveType:'none',
  leaveMinutes:0,notes:'週末支援',expectedRevision:0,requestId:'att-rest-00000001'});
 assert.equal(rest.row.overtimePay,undefined);
 const holiday=h.scope.wpAttendanceSave({date:'2026-11-24',employeeId:e.id,dayType:'holiday',
  startTime:'09:00',endTime:'11:00',breakMinutes:0,leaveType:'none',
  leaveMinutes:0,notes:'國定假日',expectedRevision:0,requestId:'att-holiday-0001'});
 assert.equal(holiday.row.overtimePay,undefined);
 const leave=h.scope.wpAttendanceSave({date:'2026-11-25',employeeId:e.id,dayType:'workday',
  startTime:'',endTime:'',breakMinutes:0,leaveType:'annual',leaveMinutes:480,
  notes:'整日特休',expectedRevision:0,requestId:'att-leave-0000001'});
 assert.equal(leave.row.workedMinutes,0);
 assert.equal(leave.row.leaveMinutes,480);
 assert.equal(h.scope.wpAttendanceLoad({month:'2026-11',employeeId:e.id}).rows.length,3);
});
test('attendance version conflicts refuse stale overwrites and other employee data',()=>{
 const h=harness();h.setup();const e=h.employee();h.as('');
 const input={date:'2026-11-25',employeeId:e.id,dayType:'workday',startTime:'08:00',
  endTime:'17:00',breakMinutes:60,leaveType:'none',leaveMinutes:0,
  notes:'',expectedRevision:0,requestId:'att-conflict-00001'};
 h.scope.wpAttendanceSave(input);
 assert.throws(()=>h.scope.wpAttendanceSave({...input,requestId:'att-conflict-00002'}),/CONFLICT/);
 assert.throws(()=>h.scope.wpAttendanceSave({...input,employeeId:'invalid-employee',
  requestId:'att-invalid-00001'}),/有效的出勤人員/);
});

test('explicitly authorized company design operator can edit payroll settings but cannot initialize storage',()=>{
 const h=harness();h.setup();const p=h.employee();
 h.props.WORKPULSE_OPERATOR_EMAIL='design.dev@example.com';
 h.as('design.dev@example.com');h.effective('design.dev@example.com');
 const settings=h.scope.wpOwnerSaveAttendanceConfig({
  employeeId:p.id,month:'2026-11',expectedDays:22,
  expectedRevision:0,requestId:'operator-rate-00001'
 });
 assert.equal(settings.ok,true);
 assert.equal(h.scope.wpOwnerAttendanceConfig({employeeId:p.id,month:'2026-11'}).expectedDays,22);
 assert.throws(()=>h.scope.wpPrivateSetupMonthly_(),/公司資料持有帳號/);
 assert.throws(()=>h.scope.wpPrivateMigrateLegacyMonthly_(),/公司資料持有帳號/);
 h.as('intruder@example.com');h.effective('intruder@example.com');
 assert.throws(()=>h.scope.wpOwnerAttendanceConfig({employeeId:p.id,month:'2026-11'}),/管理帳號/);
});

test('payroll date range loads separate months without creating empty Sheets',()=>{
 const h=harness();h.setup();const e=h.employee();h.as('');
 const before=h.books.size;
 let empty=h.scope.wpAttendanceRange({employeeId:e.id,startDate:'2026-11-01',endDate:'2026-12-31'});
 assert.equal(empty.rows.length,0);
 assert.equal(h.books.size,before);
 for(const [date,key] of [['2026-11-26','range-payroll-001'],['2026-12-01','range-payroll-002']]){
  h.scope.wpAttendanceSave({date,employeeId:e.id,dayType:'workday',
   startTime:'09:00',endTime:'20:00',breakMinutes:60,leaveType:'none',
   leaveMinutes:0,notes:'跨月測試',expectedRevision:0,requestId:key+'0001'});
 }
 const result=h.scope.wpAttendanceRange({employeeId:e.id,startDate:'2026-11-25',endDate:'2026-12-02'});
 assert.equal(result.rows.length,2);
 assert.equal(result.rows[0].date,'2026-11-26');
 assert.equal(result.rows[1].date,'2026-12-01');
 assert.equal(result.rows[0].overtimePay,undefined);
 assert.equal(result.rows[0].monthlyWage,undefined);
 assert.equal(h.books.size,before+2);
});
test('payroll range rejects salary transport, invalid employees and oversized spans',()=>{
 const h=harness();h.setup();const e=h.employee();h.as('');
 const input={employeeId:e.id,startDate:'2026-11-01',endDate:'2026-11-30'};
 assert.throws(()=>h.scope.wpAttendanceRange({...input,monthlyWage:60000}),/不得傳送/);
 assert.throws(()=>h.scope.wpAttendanceRange({...input,overtimePay:10}),/不得傳送/);
 assert.throws(()=>h.scope.wpAttendanceRange({...input,employeeId:'fake-employee'}),/有效的出勤人員/);
 assert.throws(()=>h.scope.wpAttendanceRange({...input,endDate:'2028-12-31'}),/366/);
});

test('owner can rename a project without changing its id or saved historic journal text',()=>{
 const h=harness();h.setup();const e=h.employee();
 const oldProject=h.scope.wpOwnerBootstrap().projects.find(p=>p.name==='一般專案');
 assert.ok(oldProject);
 const record=h.entry(e);record.tasks[0].project='一般專案';
 h.as('');
 const saved=h.scope.wpSharedSaveJournal(record);
 assert.equal(saved.journal.tasks[0].project,'一般專案');
 h.as('admin@example.com');
 const input={id:oldProject.id,name:'營運設計',active:true,expectedRevision:oldProject.revision,
  requestId:'project-rename-00001'};
 const changed=h.scope.wpOwnerSaveProject(input);
 assert.equal(changed.ok,true);
 assert.equal(changed.projects.find(p=>p.id===oldProject.id).name,'營運設計');
 assert.equal(h.scope.wpOwnerSaveProject(input).deduplicated,true);
 assert.throws(()=>h.scope.wpOwnerSaveProject({...input,requestId:'project-stale-00001'}),/CONFLICT/);
 const audit=h.control.getSheetByName('Audit').rows;
 assert.ok(audit.some(row=>row[3]==='project.saved'));
 h.as('');
 const bootstrap=h.scope.wpSharedBootstrap('2026-11');
 assert.ok(bootstrap.store.projects.includes('營運設計'));
 assert.ok(!bootstrap.store.projects.includes('一般專案'));
 assert.equal(h.scope.wpSharedLoadMonth('2026-11').journals[0].tasks[0].project,'一般專案');
 const edited=h.entry(e,'2026-11',1,'previous-project-0001');
 edited.tasks[0].project='一般專案';
 assert.equal(h.scope.wpSharedSaveJournal(edited).journal.revision,2);
 const another=h.entry(e,'2026-11',0,'archived-project-0001');
 another.date='2026-11-24';another.tasks[0].project='一般專案';
 assert.throws(()=>h.scope.wpSharedSaveJournal(another),/專案尚未建立或已更名/);
});
test('project management is private, validates duplicates and supports new projects',()=>{
 const h=harness();h.setup();
 const payload={name:'專案 A',active:true,expectedRevision:0,requestId:'project-create-0001'};
 h.as('guest@example.com');
 assert.throws(()=>h.scope.wpOwnerSaveProject(payload),/管理員/);
 h.as('admin@example.com');
 const created=h.scope.wpOwnerSaveProject(payload);
 assert.equal(created.ok,true);
 assert.ok(created.projects.some(p=>p.name==='專案 A'));
 assert.throws(()=>h.scope.wpOwnerSaveProject({...payload,requestId:'project-create-0002'}),/重複/);
 const item=created.projects.find(p=>p.name==='專案 A');
 assert.equal(h.scope.wpOwnerSaveProject({id:item.id,name:'專案 A',active:false,
  expectedRevision:item.revision,requestId:'project-disable-0001'}).ok,true);
 assert.ok(!h.scope.wpSharedBootstrap('2026-11').store.projects.includes('專案 A'));
});

test('owner-managed work types are stored in controller Meta without altering monthly files',()=>{
 const h=harness();h.setup();
 h.as('');
 const initial=h.scope.wpSharedBootstrap('2026-11').store.categories;
 assert.ok(initial.includes('前端開發'));
 const update={categories:['現場施工','工程管理','前端開發'],expectedRevision:0,requestId:'category-save-00001'};
 assert.throws(()=>h.scope.wpOwnerSaveCategories(update),/管理員/);
 h.as('admin@example.com');
 const first=h.scope.wpOwnerSaveCategories(update);
 assert.equal(first.ok,true);assert.equal(first.revision,1);
 assert.equal(h.scope.wpOwnerSaveCategories(update).deduplicated,true);
 assert.throws(()=>h.scope.wpOwnerSaveCategories({...update,requestId:'category-stale-0001'}),/CONFLICT/);
 assert.throws(()=>h.scope.wpOwnerSaveCategories({categories:['相同','相同'],expectedRevision:1,requestId:'category-dupe-00001'}),/重複/);
 const meta=h.control.getSheetByName('Meta');
 assert.ok(meta.rows.some(row=>row[0]==='workCategories'));
 assert.equal(h.files.size,1);
 h.as('');
 assert.deepEqual(Array.from(h.scope.wpSharedBootstrap('2026-11').store.categories),update.categories);
});
test('renamed work type does not erase old journal and old type is only valid on original edits',()=>{
 const h=harness();h.setup();const worker=h.employee();
 h.as('');
 const first=h.scope.wpSharedSaveJournal(h.entry(worker));
 assert.equal(first.journal.tasks[0].category,'前端開發');
 h.as('admin@example.com');
 h.scope.wpOwnerSaveCategories({categories:['現場施工','設計整合'],expectedRevision:0,requestId:'category-rename-001'});
 h.as('');
 assert.equal(h.scope.wpSharedLoadMonth('2026-11').journals[0].tasks[0].category,'前端開發');
 const edit=h.entry(worker,'2026-11',1,'category-edit-00001');
 assert.equal(h.scope.wpSharedSaveJournal(edit).journal.revision,2);
 const fresh=h.entry(worker,'2026-11',0,'category-new-00001');
 fresh.date='2026-11-24';
 assert.throws(()=>h.scope.wpSharedSaveJournal(fresh),/分類、狀態或投入工時無效/);
 fresh.tasks[0].category='現場施工';
 assert.equal(h.scope.wpSharedSaveJournal(fresh).journal.tasks[0].category,'現場施工');
});

test('public source contains dynamic category reader but no owner category mutation',()=>{
 const shared=read('Core.gs'),simple=read('Simple.gs'),privileged=read('OwnerCategories.gs');
 assert.match(shared,/function wsCategories_/);
 assert.match(simple,/wsCategories_\(book\)/);
 assert.doesNotMatch(shared+'\n'+simple,/function wpOwnerSaveCategories/);
 assert.match(privileged,/function wpOwnerSaveCategories/);
});

test('schedule edits are private, revisioned, monthly and do not mutate attendance',()=>{
 const h=harness();h.setup();const e=h.employee();
 const input={employeeId:e.id,month:'2026-11',days:{'2026-11-23':'holiday'},expectedRevision:0,requestId:'schedule-00000001'};
 h.as('');assert.throws(()=>h.scope.wpOwnerSaveAttendanceSchedule(input),/管理員/);
 h.as('admin@example.com');const result=h.scope.wpOwnerSaveAttendanceSchedule(input);
 assert.equal(result.schedule.revision,1);assert.equal(h.scope.wpOwnerSaveAttendanceSchedule(input).deduplicated,true);
 assert.throws(()=>h.scope.wpOwnerSaveAttendanceSchedule({...input,requestId:'schedule-00000002'}),/CONFLICT/);
 assert.throws(()=>h.scope.wpOwnerSaveAttendanceSchedule({...input,days:{'2026-12-01':'rest'}}),/日期/);
 h.as('');const loaded=h.scope.wpAttendanceLoad({employeeId:e.id,month:'2026-11'});
 assert.equal(loaded.schedule.days['2026-11-23'],'holiday');assert.equal(loaded.rows.length,0);
 assert.equal(h.files.size,1);
});

test('attendance export range returns only read-only monthly schedule and no pay',()=>{
 const h=harness();h.setup();const e=h.employee();
 h.scope.wpOwnerSaveAttendanceSchedule({employeeId:e.id,month:'2026-11',days:{'2026-11-23':'holiday'},expectedRevision:0,requestId:'export-schedule-0001'});
 h.as('');const result=h.scope.wpAttendanceRange({employeeId:e.id,startDate:'2026-11-01',endDate:'2026-12-02'});
 assert.equal(result.scheduleByMonth['2026-11'].days['2026-11-23'],'holiday');assert.equal(result.scheduleByMonth['2026-12'].revision,0);assert.equal(result.rows.length,0);assert.equal(h.files.size,1);
});

test('maintenance is owner-only and lists soft-deleted journals',()=>{
 const h=harness();h.setup();const p=h.employee();h.as('');
 const row=h.scope.wpSharedSaveJournal(h.entry(p)).journal;
 assert.throws(()=>h.scope.wpOwnerMaintenance({month:'2026-11'}),/管理帳號/);
 h.as('admin@example.com');h.scope.wpOwnerDeleteJournal({journalId:row.id,date:row.date,expectedRevision:1,requestId:'maintenance-delete-001'});
 const data=h.scope.wpOwnerMaintenance({month:'2026-11'});
 assert.equal(data.deletedCount,1);assert.equal(data.deleted[0].id,row.id);
 assert.equal(h.scope.wpSharedLoadMonth('2026-11').journals.length,0);
});
test('backup rejects unverified account and missing private destination',()=>{
 const h=harness();h.setup();h.as('');
 assert.throws(()=>h.scope.wpOwnerBackupWorkbook({target:'control',requestId:'backup-test-001'}),/持有帳號/);
 h.as('admin@example.com');assert.throws(()=>h.scope.wpOwnerBackupWorkbook({target:'control',requestId:'backup-test-001'}),/備份資料夾/);
 assert.equal(h.files.size,1);
});

test('backup copies one workbook without modifying live index, retries same ID, rejects shared folder',()=>{
 const h=harness();h.setup();const p=h.employee();h.as('');
 const row=h.scope.wpSharedSaveJournal(h.entry(p)).journal;
 h.as('admin@example.com');const folder=h.scope.DriveApp.createFolder('Private backups');
 h.props.WORKPULSE_BACKUP_FOLDER_ID=folder.getId();
 const index=JSON.stringify(h.scope.wpMonthIndex_(h.control));
 const request={target:'2026-11',requestId:'backup-month-001'};
 const result=h.scope.wpOwnerBackupWorkbook(request);
 assert.equal(result.ok,true);assert.equal(result.sheets.length,6);
 assert.equal(h.files.size,3);assert.equal(JSON.stringify(h.scope.wpMonthIndex_(h.control)),index);
 assert.equal(h.scope.wpSharedLoadMonth('2026-11').journals[0].id,row.id);
 assert.equal(h.scope.wpOwnerBackupWorkbook(request).backupId,result.backupId);
 assert.equal(h.files.size,3);
 folder.getViewers=()=>[{getEmail:()=> 'other@example.com'}];
 assert.throws(()=>h.scope.wpOwnerBackupWorkbook({target:'control',requestId:'backup-control-001'}),/持有者專用/);
 assert.equal(h.files.size,3);
});

test('recovery preview is private, preserves deleted content, flags live collision, never writes',()=>{
 const h=harness();h.setup();const p=h.employee();h.as('');
 const original=h.scope.wpSharedSaveJournal(h.entry(p)).journal;
 h.as('admin@example.com');h.scope.wpOwnerDeleteJournal({journalId:original.id,date:original.date,expectedRevision:1,requestId:'recovery-delete-001'});
 h.as('');assert.throws(()=>h.scope.wpOwnerRecoveryPreview({journalId:original.id,date:original.date,expectedRevision:1}),/管理帳號/);
 const live=h.scope.wpSharedSaveJournal(h.entry(p,'2026-11',0,'recovery-new-001')).journal;
 h.as('admin@example.com');const result=h.scope.wpOwnerRecoveryPreview({journalId:original.id,date:original.date,expectedRevision:1});
 assert.equal(result.readOnly,true);assert.equal(result.activeCollision,true);assert.equal(result.journal.tasks[0].description,'內容');
 assert.equal(h.scope.wpSharedLoadMonth('2026-11').journals[0].id,live.id);
 assert.throws(()=>h.scope.wpOwnerRecoveryPreview({journalId:original.id,date:original.date,expectedRevision:2}),/CONFLICT/);
});
test('backup verification detects changed cell values even with equal row counts',()=>{
 const h=harness();h.setup();const folder=h.scope.DriveApp.createFolder('Private backups');
 h.props.WORKPULSE_BACKUP_FOLDER_ID=folder.getId();
 const request={target:'control',requestId:'backup-content-001'},result=h.scope.wpOwnerBackupWorkbook(request);
 h.books.get(result.backupId).getSheetByName('Meta').rows[1][1]='tampered';
 assert.throws(()=>h.scope.wpOwnerBackupWorkbook(request),/內容不同/);
});
test('daily backup requires registered trigger and effective owner, records successful run',()=>{
 const h=harness();h.setup();const folder=h.scope.DriveApp.createFolder('Private backups');
 h.props.WORKPULSE_BACKUP_FOLDER_ID=folder.getId();h.props.WORKPULSE_BACKUP_TRIGGER_UID='trigger-123';
 h.as('');assert.throws(()=>h.scope.wpDailyBackup_({triggerUid:'wrong'}),/未驗證/);
 h.effective('other@example.com');assert.throws(()=>h.scope.wpDailyBackup_({triggerUid:'trigger-123'}),/持有帳號/);
 h.effective('admin@example.com');const result=h.scope.wpDailyBackup_({triggerUid:'trigger-123'});
 assert.equal(result.ok,true);assert.equal(h.files.size,2);
 assert.equal(JSON.parse(h.props.WORKPULSE_BACKUP_LAST_RUN).ok,true);
 h.scope.wpDailyBackup_({triggerUid:'trigger-123'});assert.equal(h.files.size,2);
});

test('task index groups by journal and preserves revision filtering',()=>{
 const h=harness(),j={journalId:'a',date:'2026-11-01',employeeId:'e',revision:2};
 const tasks=[{journalId:'a',revision:1,title:'old'},{journalId:'a',revision:2,title:'new',position:1},{journalId:'b',revision:2,title:'other'}];
 const index=h.scope.wsTaskIndex_(tasks);assert.equal(index.get('a').length,2);
 const result=h.scope.wsRecord_(j,index.get('a'));assert.equal(result.tasks.length,1);assert.equal(result.tasks[0].title,'new');
});

test('domain mode denies unknown or outside users, accepts company account but selected name remains separate',()=>{
 const h=harness();h.setup();const p=h.employee();h.props.WORKPULSE_ACCESS_MODE='domain';
 h.as('');assert.throws(()=>h.scope.wpSharedBootstrap('2026-11'),/公司網域/);
 h.as('outside@elsewhere.com');assert.throws(()=>h.scope.wpSharedLoadMonth('2026-11'),/公司網域/);
 assert.throws(()=>h.scope.wpAttendanceLoad({employeeId:p.id,month:'2026-11'}),/公司網域/);
 assert.throws(()=>h.scope.wpAttendanceRange({employeeId:p.id,startDate:'2026-11-01',endDate:'2026-11-30'}),/公司網域/);
 h.as('colleague@example.com');assert.equal(h.scope.wpSharedBootstrap('2026-11').user.email,'colleague@example.com');
 h.scope.WP_PORTAL_KIND='admin';assert.throws(()=>h.scope.wpSharedSaveJournal(h.entry(p)),/員工入口/);
 h.scope.WP_PORTAL_KIND='public';assert.equal(h.scope.wpSharedSaveJournal(h.entry(p)).ok,true);
});
test('shared pause blocks field writes in both portals; domain delete requires maintenance window',()=>{
 const h=harness();h.setup();const p=h.employee();h.props.WORKPULSE_ACCESS_MODE='domain';
 const j=h.scope.wpSharedSaveJournal(h.entry(p)).journal;
 assert.throws(()=>h.scope.wpOwnerDeleteJournal({journalId:j.id,date:j.date,expectedRevision:1,requestId:'pause-delete-001'}),/停寫/);
 const first=h.scope.workPulsePauseFieldWrites();assert.equal(h.scope.workPulsePauseFieldWrites().pausedAt,first.pausedAt);
 assert.throws(()=>h.scope.wpSharedSaveJournal(h.entry(p,'2026-12',0,'paused-write-001')),/暫停正式儲存/);
 assert.throws(()=>h.scope.wpFieldWriteGuard_(h.control),/暫停正式儲存/);
 assert.throws(()=>h.scope.wpOwnerDeleteJournal({journalId:j.id,date:j.date,expectedRevision:1,requestId:'pause-delete-001'}),/停寫/);
 h.scope.wpRequireMaintenanceWindow_(h.control,Date.parse(first.pausedAt)+600001);
 assert.equal(h.scope.wpSharedLoadMonth('2026-11').journals.length,1);
 assert.equal(h.scope.workPulseResumeFieldWrites().pausedAt,'');
 assert.equal(h.scope.wpSharedSaveJournal(h.entry(p,'2026-12',0,'paused-write-001')).ok,true);
});
test('deployment check is read-only and never reports formal verification',()=>{
 const h=harness();h.setup();const before=h.files.size;
 const result=h.scope.workPulseDeploymentCheck();
 assert.equal(result.productionVerified,false);assert.equal(result.configurationPassed,false);
 assert.equal(result.checks.find(x=>x.key==='backupFolder').ok,false);assert.equal(h.files.size,before);
 h.as('');assert.throws(()=>h.scope.workPulseDeploymentCheck(),/持有帳號/);
});

test('month file verification detects malformed header and leaves source untouched',()=>{
 const h=harness();h.setup();const p=h.employee();
 h.scope.wpSharedSaveJournal(h.entry(p,'2026-11',0,'verify-month-001'));
 h.scope.wpSharedSaveJournal(h.entry(p,'2026-12',0,'verify-month-002'));
 const index=h.scope.wpMonthIndex_(h.control),before=h.files.size;
 const first=h.scope.workPulseVerifyMonthFiles();
 assert.equal(first.ok,true);assert.equal(first.checked,2);assert.equal(first.results[0].month,'2026-12');assert.equal(first.productionVerified,false);
 h.books.get(index['2026-11']).getSheetByName('Tasks').rows[0][0]='bad header';
 const broken=h.scope.workPulseVerifyMonthFiles();
 assert.equal(broken.ok,false);assert.match(broken.results[1].error,/表頭/);
 h.props.WORKPULSE_VERIFY_FROM_MONTH='2026-11';assert.equal(h.scope.workPulseVerifyMonthFiles().checked,1);
 assert.equal(h.files.size,before);h.as('');assert.throws(()=>h.scope.workPulseVerifyMonthFiles(),/持有帳號/);
});

test('migration preflight is owner-only, read-only and flags existing or deleted journals',()=>{
 const h=harness();h.setup();const p=h.employee();
 const row=h.scope.wpSharedSaveJournal(h.entry(p)).journal;
 const key={kind:'journal',date:row.date,employeeId:p.id},input={month:'2026-11',keys:[key,{...key,date:'2026-11-24'}]};
 const before=h.files.size;
 let result=h.scope.wpOwnerMigrationPreflight(input);
 assert.equal(result.results[0].status,'exists');assert.equal(result.results[1].status,'not-found');assert.equal(result.readOnly,true);
 assert.throws(()=>h.scope.wpOwnerMigrationPreflight({month:'2026-11',keys:[key,key]}),/重複/);
 assert.throws(()=>h.scope.wpOwnerMigrationPreflight({month:'2026-11',keys:[{...key,note:'secret'}]}),/只接受/);
 h.scope.wpOwnerDeleteJournal({journalId:row.id,date:row.date,expectedRevision:1,requestId:'migration-delete-001'});
 assert.equal(h.scope.wpOwnerMigrationPreflight(input).results[0].status,'deleted-history');
 assert.equal(h.scope.wpOwnerMigrationPreflight({month:'2026-12',keys:[{...key,date:'2026-12-01'}]}).results[0].status,'not-found');
 assert.equal(h.files.size,before);h.as('');assert.throws(()=>h.scope.wpOwnerMigrationPreflight(input),/持有帳號/);
});

test('offline scope is only advertised with verified domain identity and explicit deployment namespace',()=>{
 const h=harness();h.setup();h.employee();h.props.WORKPULSE_OFFLINE_SCOPE='company_offline_2026_v1';
 assert.equal(h.scope.wpSharedBootstrap('2026-11').offlineScope,'');
 h.props.WORKPULSE_ACCESS_MODE='domain';h.as('staff@example.com');
 assert.equal(h.scope.wpSharedBootstrap('2026-11').offlineScope,'company_offline_2026_v1');
 h.props.WORKPULSE_OFFLINE_SCOPE='short';assert.equal(h.scope.wpSharedBootstrap('2026-11').offlineScope,'');
});

test('initialization preflight is read-only before configuration and rejects non-owner',()=>{
 const h=harness();delete h.props.WORKPULSE_SHEET_ID;
 const before=JSON.stringify(h.props),files=h.files.size;
 const report=h.scope.workPulseInitializationCheck();
 assert.equal(report.readOnly,true);assert.equal(report.canInitialize,true);assert.equal(report.productionVerified,false);
 assert.equal(JSON.stringify(h.props),before);assert.equal(h.files.size,files);
 h.as('staff@example.com');assert.throws(()=>h.scope.workPulseInitializationCheck(),/持有帳號/);
});
test('first-run initialization blocks shared folder and malformed control before writes',()=>{
 const h=harness(),folder=h.scope.DriveApp.createFolder('shared');
 h.props.WORKPULSE_FOLDER_ID=folder.getId();folder.getEditors=()=>[{getEmail:()=> 'staff@example.com'}];
 assert.equal(h.scope.workPulseInitializationCheck().canInitialize,false);
 assert.throws(()=>h.scope.workPulseInitialize(),/初始化已停止/);
 assert.equal(h.control.getSheets().length,1);
 folder.getEditors=()=>[];h.control.getSheets()[0].appendRow(['unrelated content']);
 assert.throws(()=>h.scope.workPulseInitialize(),/非預期/);
 assert.equal(h.control.getSheets().length,1);assert.equal(h.files.size,1);
});
test('initialization remains idempotent for clean and existing workspaces',()=>{
 const h=harness(),first=h.scope.workPulseInitialize(),second=h.scope.workPulseInitialize();
 assert.equal(first.controlId,second.controlId);assert.equal(first.folderId,second.folderId);
 assert.equal(h.files.size,1);assert.equal(h.scope.workPulseInitializationCheck().canInitialize,true);
 h.props.WORKPULSE_BACKUP_FOLDER_ID=first.folderId;assert.equal(h.scope.workPulseInitializationCheck().canInitialize,false);
});
test('deployment check verifies real visible trigger UID and recent non-future success',()=>{
 const h=harness();h.setup();h.props.WORKPULSE_ACCESS_MODE='domain';
 h.props.WORKPULSE_BACKUP_FOLDER_ID=h.scope.DriveApp.createFolder('backup').getId();
 h.props.WORKPULSE_BACKUP_TRIGGER_UID='trigger-1';
 h.props.WORKPULSE_BACKUP_LAST_RUN=JSON.stringify({ok:true,completedAt:new Date().toISOString()});
 h.scope.ScriptApp={getProjectTriggers:()=>[]};
 const check=()=>h.scope.workPulseDeploymentCheck().checks.find(x=>x.key==='backupRegistration');
 assert.equal(check().ok,false);
 h.scope.ScriptApp.getProjectTriggers=()=>[{getHandlerFunction:()=> 'wpDailyBackup_',getUniqueId:()=> 'trigger-1'}];
 assert.equal(check().ok,true);assert.equal(h.scope.workPulseDeploymentCheck().productionVerified,false);
 h.props.WORKPULSE_BACKUP_LAST_RUN=JSON.stringify({ok:true,completedAt:new Date(Date.now()+3600000).toISOString()});
 assert.equal(check().ok,false);
});

test('clean first run creates one private control and folder and reuses both',()=>{
 const h=harness();delete h.props.WORKPULSE_SHEET_ID;
 const before=h.files.size,first=h.scope.workPulseInitialize(),again=h.scope.workPulseInitialize();
 assert.equal(h.files.size,before+1);assert.equal(first.controlId,again.controlId);assert.equal(first.folderId,again.folderId);
 assert.equal(h.scope.workPulseInitializationCheck().canInitialize,true);
});

test('monthly integrity checks revisions, duplicate date, missing tasks and orphan requests without writing',()=>{
 const h=harness();h.setup();const p=h.employee(),j=h.scope.wpSharedSaveJournal(h.entry(p)).journal;
 h.scope.wpSharedSaveJournal(h.entry(p,'2026-11',1,'second-revision-001'));
 const input={month:'2026-11'},book=h.books.get(h.scope.wpMonthIndex_(h.control)['2026-11']);
 assert.equal(h.scope.wpOwnerMonthIntegrity(input).status,'passed');
 assert.equal(h.scope.wpOwnerMonthIntegrity({month:'2026-12'}).status,'not-found');
 const tasks=book.getSheetByName('Tasks'),rows=book.getSheetByName('Journals');
 rows.appendRow(['duplicate',j.date,p.id,1,'','','missing','','']);
 tasks.appendRow(['bad-task','unknown',1,0,'','','','','','done',1]);
 const before=JSON.stringify(book.sheets.map(s=>s.rows)),result=h.scope.wpOwnerMonthIntegrity(input);
 assert.equal(result.status,'issues');for(const code of ['duplicate-person-date','current-tasks','current-request','task-reference'])assert.ok(result.issues.some(x=>x.code===code));
 assert.equal(JSON.stringify(book.sheets.map(s=>s.rows)),before);assert.equal(result.productionVerified,false);
 h.as('staff@example.com');assert.throws(()=>h.scope.wpOwnerMonthIntegrity(input),/持有帳號/);
});
test('restore comparison rejects live file IDs, distinguishes copied values and never modifies index',()=>{
 const h=harness();h.setup();const p=h.employee();h.scope.wpSharedSaveJournal(h.entry(p));
 const live=h.scope.wpMonthIndex_(h.control)['2026-11'],folder=h.scope.DriveApp.createFolder('restore');
 const a=h.files.get(live).makeCopy('backup',folder),b=a.makeCopy('restore',folder);
 Object.assign(h.props,{WORKPULSE_RESTORE_VERIFY_MONTH:'2026-11',WORKPULSE_RESTORE_SOURCE_ID:a.getId(),WORKPULSE_RESTORE_COPY_ID:b.getId()});
 assert.equal(h.scope.workPulseCompareRestoredMonth().valuesMatch,true);
 h.books.get(b.getId()).getSheetByName('Journals').rows[1][7]='different';
 assert.equal(h.scope.workPulseCompareRestoredMonth().valuesMatch,false);
 h.props.WORKPULSE_RESTORE_COPY_ID=live;assert.throws(()=>h.scope.workPulseCompareRestoredMonth(),/正式索引/);
 assert.equal(h.scope.wpMonthIndex_(h.control)['2026-11'],live);
});

test('integrity accepts attendance and a recreated same-date journal after logical deletion',()=>{
 const h=harness();h.setup();const p=h.employee(),j=h.scope.wpSharedSaveJournal(h.entry(p)).journal;
 h.scope.wpOwnerDeleteJournal({journalId:j.id,date:j.date,expectedRevision:1,requestId:'accept-delete-0001'});
 h.scope.wpSharedSaveJournal(h.entry(p,'2026-11',0,'accept-create-0001'));
 h.scope.wpAttendanceSave({date:j.date,employeeId:p.id,dayType:'workday',startTime:'09:00',endTime:'18:00',breakMinutes:60,leaveType:'none',leaveMinutes:0,notes:'',expectedRevision:0,requestId:'accept-att-0001'});
 const report=h.scope.wpOwnerMonthIntegrity({month:'2026-11'});assert.equal(report.status,'passed');assert.equal(report.counts.deletedJournals,1);assert.equal(report.counts.attendance,1);
});


test('unified portal fails closed, only verified primary owner can call any privileged RPC',()=>{
 const h=harness();h.setup();const p=h.employee();h.scope.WP_PORTAL_KIND='unified';
 const ownerMethods=['wpOwnerBootstrap','wpOwnerSaveEmployee','wpOwnerDeleteJournal','workPulseInitialize','workPulseMigrateLegacy','wpOwnerMaintenance','wpOwnerBackupWorkbook','wpOwnerRecoveryPreview','workPulseInstallDailyBackup','workPulseRemoveDailyBackup','workPulsePauseFieldWrites','workPulseResumeFieldWrites','workPulseDeploymentCheck','workPulseVerifyMonthFiles','wpOwnerMigrationPreflight','workPulseInitializationCheck','wpOwnerMonthIntegrity','workPulseCompareRestoredMonth','wpOwnerSaveCategories','wpOwnerSaveProject','wpOwnerAttendanceConfig','wpOwnerSaveAttendanceConfig','workPulseUpgradeAttendance','wpOwnerSaveAttendanceSchedule'];
 assert.throws(()=>h.scope.wpSharedBootstrap('2026-11'),/禁止匿名/);
 assert.throws(()=>h.scope.doGet(),/禁止匿名/);
 h.props.WORKPULSE_ACCESS_MODE='domain';
 const before=JSON.stringify([...h.books.values()].map(b=>b.sheets.map(s=>s.rows))),props=JSON.stringify(h.props);
 for(const email of ['','outsider@elsewhere.com','staff@example.com','operator@example.com']){
  h.as(email);
  for(const method of ownerMethods)assert.throws(()=>h.scope[method]({}),/持有帳號/,method+' '+email);
 }
 assert.equal(JSON.stringify([...h.books.values()].map(b=>b.sheets.map(s=>s.rows))),before);
 assert.equal(JSON.stringify(h.props),props);
 h.as('');assert.throws(()=>h.scope.wpSharedBootstrap('2026-11'),/公司網域/);
 h.as('outsider@elsewhere.com');assert.throws(()=>h.scope.wpSharedBootstrap('2026-11'),/公司網域/);
 h.as('staff@example.com');assert.equal(h.scope.wpSharedBootstrap('2026-11').user.role,'guest');
 assert.equal(h.scope.wpSharedSaveJournal(h.entry(p)).ok,true);
 h.as('admin@example.com');assert.equal(h.scope.wpSharedBootstrap('2026-11').user.role,'admin');
 assert.equal(h.scope.wpOwnerBootstrap().employees.length,1);
 assert.equal(h.scope.wpSharedSaveJournal(h.entry(p,'2026-12',0,'unified-owner-0001')).ok,true);
 h.effective('staff@example.com');assert.throws(()=>h.scope.wpSharedBootstrap('2026-11'),/持有者身分/);
});
test('unified manual backup configuration does not require installing trigger; invalid existing folder still fails',()=>{
 const h=harness();h.setup();h.scope.WP_PORTAL_KIND='unified';h.props.WORKPULSE_ACCESS_MODE='domain';
 const result=h.scope.workPulseDeploymentCheck();
 assert.equal(result.configurationPassed,true);assert.equal(result.productionVerified,false);assert.equal(result.backupMode,'manual');
 h.props.WORKPULSE_BACKUP_FOLDER_ID=h.props.WORKPULSE_FOLDER_ID;
 assert.equal(h.scope.workPulseDeploymentCheck().configurationPassed,false);
 h.props.WORKPULSE_OPERATOR_EMAIL='operator@example.com';assert.equal(h.scope.workPulseInitializationCheck().canInitialize,false);
});

test('unified read and write RPCs refuse anonymous and external callers even before touching payloads',()=>{
 const h=harness();h.setup();h.scope.WP_PORTAL_KIND='unified';h.props.WORKPULSE_ACCESS_MODE='domain';
 const methods=['doGet','wpSharedBootstrap','wpSharedLoadMonth','wpSharedSaveJournal','wpSharedQueryReport','wpAttendanceLoad','wpAttendanceSave','wpAttendanceRange'];
 for(const email of ['','external@elsewhere.com']){h.as(email);for(const method of methods)assert.throws(()=>h.scope[method]({}),/公司網域/,method);}
 h.as('admin@example.com');h.effective('external@elsewhere.com');for(const method of methods)assert.throws(()=>h.scope[method]({}),/持有者身分/,method);
});

test('unified legacy delegated operator is never promoted even when configured',()=>{
 const h=harness();h.setup();const person=h.employee();
 h.scope.WP_PORTAL_KIND='unified';h.props.WORKPULSE_ACCESS_MODE='domain';h.props.WORKPULSE_OPERATOR_EMAIL='operator@example.com';
 h.as('operator@example.com');assert.equal(h.scope.wpSharedBootstrap('2026-11').user.role,'guest');
 assert.throws(()=>h.scope.wpOwnerBootstrap(),/持有帳號/);
 h.effective('operator@example.com');assert.throws(()=>h.scope.wpSharedBootstrap('2026-11'),/持有者身分/);
 h.effective('admin@example.com');h.as('staff@example.com');
 const payload={date:'2026-11-23',employeeId:person.id,dayType:'workday',startTime:'09:00',endTime:'18:00',breakMinutes:60,leaveType:'none',leaveMinutes:0,notes:'',expectedRevision:0,requestId:'unified-attendance-01'};
 assert.equal(h.scope.wpAttendanceSave(payload).ok,true);
 h.as('admin@example.com');assert.equal(h.scope.wpAttendanceSave({...payload,date:'2026-11-24',requestId:'unified-attendance-02'}).ok,true);
});
