// Per-tab recovery. Never automatically replay writes, or change a saved request's revision.
import {cloudCall} from './cloud.js';
import {offlineDraftStorage,flushOfflineVault,offlineVaultStatus} from './offline-vault.js';
const WP_FIELD_QUEUE='workpulse:field-recovery:v1';
const WP_FIELD_METHODS=['wpSharedSaveJournal','wpAttendanceSave'];
const wpFieldBusy=new Set();
let wpFieldMemory=null;
function wpFieldStorage(){try{return offlineDraftStorage();}catch{return null;}}
export function resetFieldRecoveryMemory(){wpFieldMemory=null;}
function wpFieldSignal(){if(typeof document!=='undefined'&&typeof document.dispatchEvent==='function'&&typeof Event==='function')document.dispatchEvent(new Event('workpulse:field-recovery'));}
export function fieldOnline(){return typeof navigator==='undefined'||navigator.onLine!==false;}
function wpFieldPayload(method,p){
 if(!WP_FIELD_METHODS.includes(method)||!p||typeof p.employeeId!=='string'||!p.employeeId||
 !/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')||!/^[a-zA-Z0-9_-]{12,120}$/.test(p.requestId||'')||
 !Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<0)throw Error('待同步請求格式無效');
 const keys=method==='wpAttendanceSave'?['employeeId','date','requestId','expectedRevision','dayType','startTime','endTime','breakMinutes','leaveType','leaveMinutes','notes','workedMinutes','overtimeMinutes']:['employeeId','date','requestId','expectedRevision','note','tomorrow','tasks'];
 const data=Object.fromEntries(keys.filter(k=>Object.hasOwn(p,k)).map(k=>[k,p[k]]));
 if(method==='wpSharedSaveJournal'){
  if(!Array.isArray(data.tasks)||data.tasks.length<1||data.tasks.length>100)throw Error('工作內容格式無效');
  data.tasks=data.tasks.map(t=>Object.fromEntries(['id','project','category','title','description','result','status','hours'].filter(k=>Object.hasOwn(t,k)).map(k=>[k,t[k]])));
 }
 const json=JSON.stringify(data);if(json.length>700000)throw Error('單筆資料超過暫存上限');
 return JSON.parse(json);
}
export function readFieldPending(){
 if(wpFieldMemory!==null)return JSON.parse(JSON.stringify(wpFieldMemory));
 try{
  const rows=JSON.parse(wpFieldStorage()?.getItem(WP_FIELD_QUEUE)||'[]');
  return Array.isArray(rows)?rows.slice(0,30).flatMap(x=>{try{return [{method:x.method,payload:wpFieldPayload(x.method,x.payload),status:['conflict','offline'].includes(x.status)?x.status:'uncertain'}];}catch{return [];}}):[];
 }catch{return [];}
}
function wpFieldWrite(rows){
 try{const s=wpFieldStorage();if(!s)throw Error('storage unavailable');s.setItem(WP_FIELD_QUEUE,JSON.stringify(rows));wpFieldMemory=null;}
 catch{wpFieldMemory=rows;}
 wpFieldSignal();
}
export function fieldRecoveryDurable(){const v=offlineVaultStatus();return wpFieldMemory===null&&v.phase!=='error'&&(!v.enabled||v.pending===0);}
export function stageFieldPending(method,payload){
 const clean=wpFieldPayload(method,payload),rows=readFieldPending();
 const old=rows.find(x=>x.method===method&&x.payload.date===clean.date&&x.payload.employeeId===clean.employeeId);
 if(old){
  if(old.status==='conflict')throw Error('此筆有版本衝突，請先核對雲端，再移除舊待同步項目');
  if(JSON.stringify(old.payload)!==JSON.stringify(clean))throw Error('此人員與日期已有待同步資料，請先處理原始請求');
  return old;
 }
 if(rows.length>=30)throw Error('待同步已達 30 筆，請先處理既有資料');
 const entry={method,payload:clean,status:fieldOnline()?'uncertain':'offline'};wpFieldWrite([...rows,entry]);return entry;
}
export function fieldRecoveryBusy(id){return wpFieldBusy.has(id);}
export function removeFieldPending(id){
 if(wpFieldBusy.has(id))return false;
 wpFieldWrite(readFieldPending().filter(x=>x.payload.requestId!==id));return true;
}
function wpFieldStatus(id,status){wpFieldWrite(readFieldPending().map(x=>x.payload.requestId===id?{...x,status}:x));}
export async function fieldSave(method,payload){
 const entry=stageFieldPending(method,payload),id=entry.payload.requestId;
 if(wpFieldBusy.has(id))throw Error('此筆正在同步中');
 wpFieldBusy.add(id);
 try{
  wpFieldStatus(id,fieldOnline()?'uncertain':'offline');
  if(!await flushOfflineVault())throw Error('持久暫存未確認，尚未送出；請保存原始請求並核對離線設定');
  if(!fieldOnline())throw Error(fieldRecoveryDurable()?'目前離線，已暫存待同步；恢復網路後請手動重送':'目前離線且無法持久暫存，請保持頁面開啟');
  const result=await cloudCall(method,entry.payload);
  const row=method==='wpSharedSaveJournal'?result?.journal:result?.row;
  if(!result?.ok||!row||row.employeeId!==entry.payload.employeeId||row.date!==entry.payload.date)throw Error('雲端儲存結果尚未確認');
  wpFieldBusy.delete(id);removeFieldPending(id);await flushOfflineVault();return result;
 }catch(error){wpFieldStatus(id,String(error?.message||'').includes('CONFLICT:')?'conflict':!fieldOnline()?'offline':'uncertain');await flushOfflineVault();throw error;}
 finally{wpFieldBusy.delete(id);wpFieldSignal();}
}
export async function retryFieldPending(id,employeeId){
 const entry=readFieldPending().find(x=>x.payload.requestId===id&&x.payload.employeeId===employeeId);
 if(!entry)throw Error('找不到目前人員的待同步請求');
 return fieldSave(entry.method,entry.payload);
}
