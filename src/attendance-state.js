import {cloudEnabled,cloudCall} from './cloud.js';
import {currentMonth,localISODate,uid} from './utils.js';
import {validateAttendanceDraft} from './attendance.js';
const KEY='workpulse-attendance-v1';
export const attendanceState={month:currentMonth(),employeeId:'',date:localISODate(),rows:[],
  draft:null,phase:'idle',error:'',saving:false,requestId:null,expectedDays:null,
  temporarySalary:'',adminConfig:null,configSaving:false,configRequest:null,dirty:false};
export function newAttendanceDraft(date=attendanceState.date,source=null){
 return {date,employeeId:attendanceState.employeeId,dayType:source?.dayType||'workday',
   startTime:source?.startTime||'',endTime:source?.endTime||'',breakMinutes:source?.breakMinutes||0,
   leaveType:source?.leaveType||'none',leaveMinutes:source?.leaveMinutes||0,
   notes:source?.notes||'',revision:source?.revision||0};
}
function localRows(){
 try{
  const saved=localStorage.getItem(KEY)||'[]',rows=JSON.parse(saved);
  if(!Array.isArray(rows))return [];
  // Upgrade legacy demo records without retaining salary or calculated pay in storage.
  const clean=rows.map(({overtimePay,monthlyWage,...row})=>row);
  if(JSON.stringify(clean)!==saved)localStorage.setItem(KEY,JSON.stringify(clean));
  return clean;
 }catch{return [];}
}
export function updateTemporarySalary(value){
 // Memory-only. Never included in a draft, request, localStorage or Google Sheets.
 attendanceState.temporarySalary=String(value??'').slice(0,16);
}
export function clearTemporarySalary(){attendanceState.temporarySalary='';}
export function currentTemporaryWage(){
 const raw=attendanceState.temporarySalary;
 if(raw.trim()==='')return null;
 const value=Number(raw);
 return Number.isFinite(value)&&value>0&&value<=10000000?value:null;
}
export function attendanceSelectDate(date){
 attendanceState.date=date;
 attendanceState.draft=newAttendanceDraft(date,attendanceState.rows.find(r=>r.date===date));
 attendanceState.requestId=null;attendanceState.dirty=false;
}
export async function loadAttendance(people,admin=false,month=attendanceState.month,employeeId=attendanceState.employeeId){
 if(!people?.length){clearTemporarySalary();attendanceState.month=month;attendanceState.phase='ready';attendanceState.employeeId='';attendanceState.rows=[];return;}
 if(!people.some(p=>p.id===employeeId))employeeId=people[0].id;
 if(attendanceState.employeeId!==employeeId||attendanceState.month!==month)clearTemporarySalary();
 attendanceState.month=month;
 attendanceState.employeeId=employeeId;attendanceState.phase='loading';attendanceState.error='';
 try{
  if(cloudEnabled()){
   const data=await cloudCall('wpAttendanceLoad',{month,employeeId});
   attendanceState.rows=Array.isArray(data.rows)?data.rows:[];
   attendanceState.expectedDays=data.expectedDays;
   attendanceState.adminConfig=null;
   if(admin){
     attendanceState.adminConfig=await cloudCall('wpOwnerAttendanceConfig',{month,employeeId});
   }
  }else{
   attendanceState.rows=localRows().filter(r=>r.employeeId===employeeId&&r.date.startsWith(month));
   attendanceState.expectedDays=null;
   attendanceState.adminConfig=null;
  }
  const requested=attendanceState.date.startsWith(month)?attendanceState.date:month+'-01';
  attendanceState.date=requested;
  attendanceSelectDate(requested);
  attendanceState.phase='ready';
 }catch(error){attendanceState.phase='error';attendanceState.error=error.message||'讀取出勤資料失敗';}
}
export function updateAttendance(field,value){
 const a=attendanceState;
 if(!a.draft||!['dayType','startTime','endTime','breakMinutes','leaveType','leaveMinutes','notes'].includes(field))return;
 a.draft[field]=['breakMinutes','leaveMinutes'].includes(field)?Number(value):value;
 if(field==='leaveType'&&value==='none')a.draft.leaveMinutes=0;
 a.requestId=null;a.dirty=true;
}
export async function submitAttendance(){
 const a=attendanceState;
 if(a.saving||a.phase!=='ready'||!a.draft)throw Error('出勤表尚未準備完成');
 const data=validateAttendanceDraft(a.draft);
 if(!a.employeeId)throw Error('請先選擇人員');
 a.saving=true;a.requestId=a.requestId||uid();
 try{
  const request={...data,employeeId:a.employeeId,expectedRevision:a.draft.revision||0,requestId:a.requestId};
  let result;
  if(cloudEnabled())result=await cloudCall('wpAttendanceSave',request);
  else{
   const existing=localRows();
   const item={...request,id:existing.find(r=>r.date===data.date&&r.employeeId===a.employeeId)?.id||uid(),
     revision:request.expectedRevision+1,updatedAt:new Date().toISOString()};
   const index=existing.findIndex(r=>r.date===data.date&&r.employeeId===a.employeeId);
   if(index>=0)existing[index]=item;else existing.push(item);
   localStorage.setItem(KEY,JSON.stringify(existing));
   result={ok:true,row:item};
  }
  if(!result?.ok||!result.row)throw Error('雲端尚未確認儲存結果');
  const index=a.rows.findIndex(r=>r.date===result.row.date);
  if(index>=0)a.rows[index]=result.row;else a.rows.push(result.row);
  a.rows.sort((x,y)=>x.date.localeCompare(y.date));
  a.requestId=null;a.dirty=false;a.draft=newAttendanceDraft(result.row.date,result.row);
  return result;
 }finally{a.saving=false;}
}
export function updateAttendanceConfig(field,value){
 const a=attendanceState;
 if(!a.adminConfig)return;
 if(field==='expectedDays'){
   a.adminConfig.expectedDays=value===''?null:Number(value);
   a.configRequest=null;
 }
}
export async function saveAttendanceConfig(){
 const a=attendanceState;
 if(!cloudEnabled()||!a.adminConfig||a.configSaving)throw Error('僅能在私人管理員網站設定');
 a.configSaving=true;a.configRequest=a.configRequest||uid();
 try{
  const result=await cloudCall('wpOwnerSaveAttendanceConfig',{
    employeeId:a.employeeId,month:a.month,
    expectedDays:a.adminConfig.expectedDays,expectedRevision:a.adminConfig.revision||0,
    requestId:a.configRequest
  });
  if(!result?.ok)throw Error('設定未儲存');
  a.adminConfig=result.config;a.configRequest=null;a.expectedDays=result.config.expectedDays;
  return result;
 }finally{a.configSaving=false;}
}
