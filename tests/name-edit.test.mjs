import test from 'node:test';
import assert from 'node:assert/strict';
import {renameLocalEmployee,renameLocalProject} from '../src/features/admin/rename.js';
import {renameTemplatesProject,readTemplates} from '../src/features/journals/quick-entry.js';
import {adminState,setAdminTab,editAdmin,updateAdminDraft,renderTeam} from '../src/features/admin/admin.js';
import {attendanceState} from '../src/features/attendance/attendance-state.js';

const original={
 version:1,mode:'local',employees:[{id:'E-1',name:'小明'},{id:'E-2',name:'小華'}],
 projects:['舊案場','行政'],
 journals:[{id:'J1',date:'2026-11-26',employeeId:'E-1',tasks:[
  {id:'T1',project:'舊案場',title:'平面配置',hours:2},
  {id:'T2',project:'行政',title:'會議',hours:1}
 ]}]
};
test('employee rename retains immutable employee ID and every historical journal relation',()=>{
 const next=renameLocalEmployee(original,'E-1','設計工程師');
 assert.equal(next.employees[0].id,'E-1');
 assert.equal(next.employees[0].name,'設計工程師');
 assert.equal(next.journals[0].employeeId,'E-1');
 assert.equal(original.employees[0].name,'小明');
 assert.throws(()=>renameLocalEmployee(original,'E-1',' 小華 '),/已存在/);
 assert.throws(()=>renameLocalEmployee(original,'missing','新人'),/找不到/);
 assert.throws(()=>renameLocalEmployee(original,'E-1',' '),/請輸入/);
});
test('project rename updates local historical task strings but preserves unrelated projects',()=>{
 const next=renameLocalProject(original,'舊案場','新案場');
 assert.deepEqual(next.projects,['新案場','行政']);
 assert.equal(next.journals[0].tasks[0].project,'新案場');
 assert.equal(next.journals[0].tasks[1].project,'行政');
 assert.equal(original.journals[0].tasks[0].project,'舊案場');
 assert.throws(()=>renameLocalProject(original,'舊案場','行政'),/已存在/);
 assert.throws(()=>renameLocalProject(original,'未知','新案場'),/找不到/);
});
test('saved local journal templates follow a project rename',()=>{
 const storage=new Map([['workpulse:v0.5:templates:local-device',JSON.stringify([
  {id:'1',title:'檢查設備',project:'舊案場',category:'展店設計',description:'內容'},
  {id:'2',title:'開發',project:'行政',category:'前端開發',description:''}
 ])]]);
 const adapter={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
 const renamed=renameTemplatesProject(adapter,'local-device','舊案場','新案場');
 assert.equal(renamed[0].project,'新案場');
 assert.equal(readTemplates(adapter,'local-device')[0].project,'新案場');
 assert.equal(readTemplates(adapter,'local-device')[1].project,'行政');
});
test('administrator can switch between people and project lists and rename draft',()=>{
 adminState.phase='ready';adminState.data={
  employees:[{id:'E-1',name:'小明',active:true,revision:2}],
  projects:[{id:'P-1',name:'舊案場',active:true,revision:3}]
 };
 setAdminTab('projects');
 let ui=renderTeam({role:'admin'});
 assert.match(ui,/專案清單/);
 assert.match(ui,/舊案場/);
 assert.match(ui,/data-kind="projects"/);
 editAdmin('projects','P-1');
 updateAdminDraft('name','更名新專案');
 assert.equal(adminState.draft.id,'P-1');
 assert.equal(adminState.draft.name,'更名新專案');
 ui=renderTeam({role:'admin'});
 assert.match(ui,/更名新專案/);
 setAdminTab('employees');
 assert.equal(adminState.draft,null);
 assert.match(renderTeam({role:'admin'}),/小明/);
 assert.doesNotMatch(renderTeam({role:'guest'}),/專案清單/);
});
test('attendance places payroll calculator directly above the compact labor-law section',async()=>{
 const oldDocument=globalThis.document,oldWindow=globalThis.window;
 try{
  globalThis.document={addEventListener(){}};
  globalThis.window={addEventListener(){}};
  const {renderAttendance}=await import('../src/features/attendance/attendance-ui.js');
  attendanceState.employeeId='E-1';attendanceState.month='2026-11';
  attendanceState.date='2026-11-26';attendanceState.rows=[];
  attendanceState.phase='ready';attendanceState.expectedDays=null;
  attendanceState.draft={date:'2026-11-26',employeeId:'E-1',dayType:'workday',startTime:'',
   endTime:'',breakMinutes:0,leaveType:'none',leaveMinutes:0,notes:'',revision:0};
  const html=renderAttendance([{id:'E-1',name:'小明'}],false);
  const table=html.indexOf('本月出勤明細'),salary=html.indexOf('薪資基準 · 即時計算');
  const law=html.indexOf('加班費計算公式（勞基法）');
  assert.ok(table>0&&salary>table&&law>salary);
  assert.match(html,/att-law-panel/);
  assert.match(html,/data-action="payroll-start"/);
 }finally{
  if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
  if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
 }
});
