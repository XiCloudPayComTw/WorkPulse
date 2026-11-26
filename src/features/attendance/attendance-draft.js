// Per-person, per-date, unsubmitted drafts. No wages or calculated pay.
import {offlineDraftStorage} from '../../services/offline-vault.js';
function wpAttDraftKey(id,date){return 'workpulse:attendance-draft:v1:'+encodeURIComponent(id)+':'+date;}
function wpAttDraftStorage(){try{return offlineDraftStorage();}catch{return null;}}
export function saveAttendanceDraft(d,storage=wpAttDraftStorage()){
 if(!d?.employeeId||!/^\d{4}-\d{2}-\d{2}$/.test(d.date||''))return false;
 const keys=['employeeId','date','revision','dayType','startTime','endTime','breakMinutes','leaveType','leaveMinutes','notes'];
 try{if(!storage)return false;storage.setItem(wpAttDraftKey(d.employeeId,d.date),JSON.stringify(Object.fromEntries(keys.map(k=>[k,d[k]]))));return true;}catch{return false;}
}
export function readAttendanceDraft(id,date,storage=wpAttDraftStorage()){
 try{const d=JSON.parse(storage?.getItem(wpAttDraftKey(id,date))||'null');
 if(!d||d.employeeId!==id||d.date!==date||!Number.isSafeInteger(d.revision)||d.revision<0)return null;
 return {employeeId:id,date,revision:d.revision,dayType:String(d.dayType||'workday'),startTime:String(d.startTime||''),endTime:String(d.endTime||''),breakMinutes:Number(d.breakMinutes)||0,leaveType:String(d.leaveType||'none'),leaveMinutes:Number(d.leaveMinutes)||0,notes:String(d.notes||'').slice(0,1000)};
 }catch{return null;}
}
export function clearAttendanceDraft(id,date,storage=wpAttDraftStorage()){try{storage?.removeItem(wpAttDraftKey(id,date));}catch{}}
