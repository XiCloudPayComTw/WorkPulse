// Export only saved local records, never cloud state, credentials or payroll.
import {STORAGE_KEY,validateState} from './data.js';
export function buildLocalMigrationPackage(storage,now=new Date()){
 if(!storage)throw Error('無法存取本機資料，未產生移轉封包');
 const raw=storage.getItem(STORAGE_KEY),attRaw=storage.getItem('workpulse-attendance-v1');
 const source=raw?JSON.parse(raw):null,attendance=attRaw?JSON.parse(attRaw):[];
 if(source&&source.mode!=='local')throw Error('僅可匯出已保存的本機資料');
 if(!Array.isArray(attendance)||attendance.length>100000)throw Error('本機出勤格式或數量異常');
 const state=source?validateState(source):{version:1,mode:'local',employees:[],projects:[],categories:[],journals:[]};
 if(source&&(state.employees.length!==source.employees.length||state.projects.length!==source.projects.length||state.journals.length!==source.journals.length))throw Error('本機資料格式異常，請先保留原始 JSON');
 if(!state.journals.length&&!attendance.length)throw Error('沒有已儲存的工作日誌或出勤可移轉');
 const warnings=[],ids=new Set(state.employees.map(e=>e.id)),keys=new Set(),months=new Set();
 function review(row,type){
  const date=String(row.date||''),parsed=new Date(date+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw Error('紀錄含無效日期');
  if(typeof row.employeeId!=='string'||!row.employeeId)throw Error('紀錄缺少人員識別');
  if(!ids.has(row.employeeId))warnings.push(type+' '+date+'：找不到對應本機人員 '+row.employeeId);
  const key=type+'|'+row.employeeId+'|'+date;
  if(keys.has(key))warnings.push(type+' '+date+'：同人同日重複，須人工核對');keys.add(key);months.add(date.slice(0,7));
 }
 state.journals.forEach(j=>{review(j,'工作日誌');if(/^demo-/.test(j.id))warnings.push('包含展示範例 '+j.id+'，請勿直接匯入正式資料');});
 const fields=['id','date','employeeId','dayType','startTime','endTime','breakMinutes','workedMinutes','overtimeMinutes','leaveType','leaveMinutes','notes','revision','updatedAt'];
 const rows=attendance.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('出勤紀錄格式異常');
  const clean=Object.fromEntries(fields.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]]));
  if(Object.values(clean).some(v=>typeof v!=='string'&&typeof v!=='number'))throw Error('出勤欄位格式異常');
  review(clean,'出勤');return clean;
 });
 return {format:'workpulse-local-migration-v1',generatedAt:now.toISOString(),source:'browser-local-storage',notImported:true,
  counts:{employees:state.employees.length,journals:state.journals.length,tasks:state.journals.reduce((n,j)=>n+j.tasks.length,0),attendance:rows.length},
  months:[...months].sort(),warnings,employees:state.employees,projects:state.projects,categories:state.categories,journals:state.journals,attendance:rows};
}
