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
 const addEmployee=(id,mail,role='staff',dept='team-a',active=true)=>sheets.get('Employees').appendRow([id,mail,mail.split('@')[0],role,dept,active,1,'2026-11-22T00:00:00Z','admin@example.com']);
 const addProject=name=>sheets.get('Projects').appendRow([`p-${seq++}`,name,true,1,'2026-11-22T00:00:00Z','admin@example.com']);
 const submission=(employeeId='emp-a',expectedRevision=0,requestId='request-unique-0001')=>({
  date:'2026-11-22',employeeId,requestId,expectedRevision,note:'備註',tomorrow:'明天',
  tasks:[{title:'第一項任務',project:'WorkPulse',category:'前端開發',description:'今日內容',result:'完成',status:'done',hours:2.5}]
 });
 scope.setupWorkPulse_();
 sheets.get('Departments').appendRow(['team-a','設計與開發',true,1,'2026-11-22T00:00:00Z','admin@example.com']);
 sheets.get('Departments').appendRow(['team-b','門市營運',true,1,'2026-11-22T00:00:00Z','admin@example.com']);
 addEmployee('emp-a','alice@example.com');addEmployee('emp-b','bob@example.com','staff','team-b');
 addEmployee('emp-c','carol@example.com','manager','team-a');
 addEmployee('emp-d','dan@example.com','staff','team-a');
 addProject('WorkPulse');
 return {scope,sheets,props,as,submission,addEmployee,addProject};
}

test('initialization creates normalized sheets and can run twice without duplicating admin',()=>{
 const h=harness();const rows=h.sheets.get('Employees').rows.length;
 h.scope.setupWorkPulse_();assert.equal(h.sheets.get('Employees').rows.length,rows);
 assert.equal(h.sheets.get('Meta').rows[1][1],'3');
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

const adminRequest=(kind,overrides={})=>({
 id:'',name:kind==='employees'?'新加入成員':'測試團隊',active:true,expectedRevision:0,
 requestId:`admin-${kind}-000000001`,
 ...(kind==='employees'?{email:'new@example.com',role:'staff',departmentId:'team-a'}:{}),
 ...overrides
});
test('only admin can read inactive employee roster or edit settings',()=>{
 const h=harness();h.as('alice@example.com');assert.throws(()=>h.scope.wpAdminBootstrap(),/權限/);
 assert.throws(()=>h.scope.wpAdminSaveProject(adminRequest('projects')),/權限/);
 h.as('carol@example.com');assert.throws(()=>h.scope.wpAdminBootstrap(),/權限/);
 h.as('admin@example.com');const data=h.scope.wpAdminBootstrap();
 assert.equal(data.employees.length,5);assert.equal(data.departments.length,2);
 assert.equal(data.schema,'3');
});
test('admin create/update employee, prevent conflict, preserve ID and audit',()=>{
 const h=harness();const p=adminRequest('employees');
 const first=h.scope.wpAdminSaveEmployee(p);
 assert.ok(first.ok);assert.equal(first.entity.revision,1);assert.equal(first.entity.email,'new@example.com');
 const savedId=first.entity.id;
 const second=h.scope.wpAdminSaveEmployee({...p,id:savedId,expectedRevision:1,role:'manager',requestId:'admin-employees-000000002'});
 assert.equal(second.entity.id,savedId);assert.equal(second.entity.role,'manager');assert.equal(second.entity.revision,2);
 assert.throws(()=>h.scope.wpAdminSaveEmployee({...p,id:savedId,expectedRevision:1,requestId:'admin-employees-000000003'}),/CONFLICT/);
 assert.equal(h.sheets.get('Audit').rows.filter(r=>String(r[3]).startsWith('Employees')).length,2);
 h.as('new@example.com');assert.equal(h.scope.wpBootstrap('2026-11').user.role,'manager');
});
test('admin request id is idempotent and duplicate names and emails rejected',()=>{
 const h=harness();const p=adminRequest('employees');const first=h.scope.wpAdminSaveEmployee(p);
 assert.equal(h.scope.wpAdminSaveEmployee(p).deduplicated,true);
 assert.equal(h.sheets.get('Employees').rows.filter(x=>x[1]==='new@example.com').length,1);
 assert.throws(()=>h.scope.wpAdminSaveEmployee({...p,requestId:'another-employee-00001',email:'alice@example.com'}),/已被使用/);
 assert.throws(()=>h.scope.wpAdminSaveEmployee({...p,requestId:'another-employee-00002',email:'other@outside.com'}),/公司網域/);
 assert.throws(()=>h.scope.wpAdminSaveEmployee({...p,requestId:'another-employee-00003',email:'fresh3@example.com',role:'manager',departmentId:''}),/指定部門/);
 assert.throws(()=>h.scope.wpAdminSaveEmployee({...p,requestId:'another-employee-00004',email:'fresh4@example.com',departmentId:'non-existent'}),/啟用中的部門/);
});
test('deactivation immediately removes account access without deleting journal history',()=>{
 const h=harness();h.as('admin@example.com');h.scope.wpSaveJournal(h.submission('emp-a'));
 const data=h.scope.wpAdminBootstrap();const alice=data.employees.find(e=>e.id==='emp-a');
 const result=h.scope.wpAdminSaveEmployee(adminRequest('employees',{...alice,active:false,expectedRevision:alice.revision,requestId:'deactivate-account-0001'}));
 assert.equal(result.entity.active,false);
 h.as('alice@example.com');assert.throws(()=>h.scope.wpBootstrap('2026-11'),/尚未獲得/);
 h.as('admin@example.com');const admin=h.scope.wpAdminBootstrap();assert.ok(admin.employees.find(x=>x.id==='emp-a'&&!x.active));
 assert.equal(h.sheets.get('Journals').rows.length,2);
 assert.equal(h.scope.wpLoadMonth('2026-11').journals.length,1);
 h.as('carol@example.com');assert.equal(h.scope.wpLoadMonth('2026-11').journals.length,1);
});
test('cannot disable or demote the current or initial administrator',()=>{
 const h=harness();const admin=h.scope.wpAdminBootstrap().employees.find(e=>e.email==='admin@example.com');
 assert.throws(()=>h.scope.wpAdminSaveEmployee(adminRequest('employees',{...admin,expectedRevision:admin.revision,active:false,requestId:'admin-disable-000001'})),/不可停用/);
 assert.throws(()=>h.scope.wpAdminSaveEmployee(adminRequest('employees',{...admin,expectedRevision:admin.revision,role:'staff',requestId:'admin-demote-000001'})),/不可停用/);
 assert.throws(()=>h.scope.wpAdminSaveEmployee(adminRequest('employees',{...admin,expectedRevision:admin.revision,email:'other@example.com',requestId:'admin-email-000001'})),/不可停用/);
});
test('department and project updates enforce active association, revision and name uniqueness',()=>{
 const h=harness();
 const dep=h.scope.wpAdminBootstrap().departments[0];
 assert.throws(()=>h.scope.wpAdminSaveDepartment(adminRequest('departments',{...dep,expectedRevision:dep.revision,active:false,requestId:'dept-disable-000001'})),/在職員工/);
 const added=h.scope.wpAdminSaveDepartment(adminRequest('departments',{name:'新團隊'}));
 assert.equal(added.entity.name,'新團隊');
 assert.throws(()=>h.scope.wpAdminSaveDepartment(adminRequest('departments',{name:'新團隊',requestId:'other-dept-000001'})),/已存在/);
 const proj=h.scope.wpAdminSaveProject(adminRequest('projects',{name:'清單專案'}));
 assert.equal(proj.entity.revision,1);
 const disabled=h.scope.wpAdminSaveProject(adminRequest('projects',{...proj.entity,expectedRevision:proj.entity.revision,active:false,requestId:'project-disable-0001'}));
 assert.equal(disabled.entity.active,false);
 assert.ok(!h.scope.wpBootstrap('2026-11').store.projects.includes('清單專案'));
});
test('explicit v2-to-v3 migration retains employee IDs and populates departments',()=>{
 const h=harness();
 for(const entry of [['Employees',6],['Projects',3]]){
  const sheet=h.sheets.get(entry[0]);for(const row of sheet.rows)row.splice(entry[1]);
 }
 h.sheets.delete('Departments');h.sheets.get('Meta').rows[1][1]='2';
 assert.throws(()=>h.scope.wpBootstrap('2026-11'),/版本不相容/);
 assert.match(h.scope.upgradeWorkPulseV3_(),/遷移完成/);
 assert.equal(h.sheets.get('Meta').rows[1][1],'3');
 assert.deepEqual(h.sheets.get('Departments').rows.slice(1).map(x=>x[0]).sort(),['team-a','team-b']);
 assert.equal(h.scope.wpBootstrap('2026-11').store.employees.length,5);
 assert.match(h.scope.upgradeWorkPulseV3_(),/已是 v3/);
 h.as('alice@example.com');assert.throws(()=>h.scope.upgradeWorkPulseV3_(),/管理員/);
});
