import {cloudEnabled,cloudCall} from '../../services/cloud.js';
import {fieldSave} from '../../services/field-recovery.js';
import {saveAttendanceDraft,readAttendanceDraft,clearAttendanceDraft} from './attendance-draft.js';
import {currentMonth,localISODate,uid} from '../../shared/utils.js';
import {validateAttendanceDraft,DAY_TYPES} from './attendance.js';
import {attendancePlannedDay,previousAttendanceTimes,attendanceMonthDates} from './calendar.js';
const KEY='workpulse-attendance-v1';
export const attendanceState={month:currentMonth(),employeeId:'',date:localISODate(),rows:[],
  draft:null,phase:'idle',error:'',saving:false,requestId:null,expectedDays:null,
  temporarySalary:'',adminConfig:null,configSaving:false,configRequest:null,dirty:false,draftStored:true,schedule:{days:{},revision:0},scheduleDirty:false,scheduleSaving:false,scheduleRequest:null};
export function newAttendanceDraft(date=attendanceState.date,source=null){
 return {date,employeeId:attendanceState.employeeId,dayType:source?.dayType||attendancePlannedDay(date,attendanceState.schedule.days),
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
/** Read anonymous demo attendance across months. Salary is never part of the result. */
export function readLocalAttendanceRange(employeeId,startDate,endDate){
 return localRows().filter(r=>r.employeeId===employeeId&&r.date>=startDate&&r.date<=endDate)
  .map(({overtimePay,monthlyWage,...r})=>r);
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
 attendanceState.requestId=null;attendanceState.dirty=false;attendanceState.draftStored=true;
 if(cloudEnabled()){const saved=readAttendanceDraft(attendanceState.employeeId,date);if(saved){attendanceState.draft=saved;attendanceState.dirty=true;}}
}
export function discardAttendanceDraft(){const a=attendanceState;clearAttendanceDraft(a.employeeId,a.date);attendanceSelectDate(a.date);}
let attendanceLoadSequence=0;
/**
 * Always apply only the latest response. This prevents a slow cloud request for
 * the previous month/person from leaving stale data after a newer selection.
 */
export async function loadAttendance(people,admin=false,month=attendanceState.month,employeeId=attendanceState.employeeId){
 const seq=++attendanceLoadSequence;
 if(!people?.length){
  clearTemporarySalary();
  attendanceState.month=month;attendanceState.phase='ready';
  attendanceState.employeeId='';attendanceState.rows=[];
  attendanceState.expectedDays=null;attendanceState.adminConfig=null;attendanceState.schedule={days:{},revision:0};attendanceState.scheduleDirty=false;
  attendanceState.draft=null;attendanceState.error='';
  return true;
 }
 if(!people.some(p=>p.id===employeeId))employeeId=people[0].id;
 if(attendanceState.employeeId!==employeeId||attendanceState.month!==month)clearTemporarySalary();
 attendanceState.month=month;
 attendanceState.employeeId=employeeId;
 attendanceState.phase='loading';attendanceState.error='';
 try{
  let rows,expectedDays=null,adminConfig=null,schedule={days:{},revision:0};
  if(cloudEnabled()){
   const data=await cloudCall('wpAttendanceLoad',{month,employeeId});
   if(seq!==attendanceLoadSequence)return false;
   rows=Array.isArray(data.rows)?data.rows:[];
   expectedDays=data.expectedDays??null;
   schedule=data.schedule||schedule;
   if(admin)adminConfig=await cloudCall('wpOwnerAttendanceConfig',{month,employeeId});
  }else{
   rows=localRows().filter(r=>r.employeeId===employeeId&&r.date.startsWith(month));
  }
  if(seq!==attendanceLoadSequence)return false;
  attendanceState.rows=rows;
  attendanceState.expectedDays=expectedDays;
  attendanceState.adminConfig=adminConfig;
  attendanceState.schedule=schedule;attendanceState.scheduleDirty=false;attendanceState.scheduleRequest=null;
  const requested=attendanceState.date.startsWith(month)?attendanceState.date:month+'-01';
  attendanceSelectDate(requested);
  attendanceState.phase='ready';
  return true;
 }catch(error){
  if(seq!==attendanceLoadSequence)return false;
  attendanceState.phase='error';
  attendanceState.error=error?.message||'讀取出勤資料失敗';
  return false;
 }
}
export function updateAttendance(field,value){
 const a=attendanceState;
 if(a.saving||!a.draft||!['dayType','startTime','endTime','breakMinutes','leaveType','leaveMinutes','notes'].includes(field))return;
 a.draft[field]=['breakMinutes','leaveMinutes'].includes(field)?Number(value):value;
 if(field==='leaveType'&&value==='none')a.draft.leaveMinutes=0;
 a.requestId=null;a.dirty=true;
 if(cloudEnabled())a.draftStored=saveAttendanceDraft(a.draft);
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
  if(cloudEnabled()){a.draftStored=saveAttendanceDraft(a.draft);result=await fieldSave('wpAttendanceSave',request);}
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
  const sameDraft=a.employeeId===request.employeeId&&a.date===request.date&&a.requestId===request.requestId;
  if(cloudEnabled()&&sameDraft)clearAttendanceDraft(request.employeeId,request.date);
  if(a.employeeId!==request.employeeId||a.month!==request.date.slice(0,7))return result;
  const index=a.rows.findIndex(r=>r.date===result.row.date);
  if(index>=0)a.rows[index]=result.row;else a.rows.push(result.row);
  a.rows.sort((x,y)=>x.date.localeCompare(y.date));
  if(sameDraft){a.requestId=null;a.dirty=false;a.draftStored=true;a.draft=newAttendanceDraft(result.row.date,result.row);}
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

export function copyPreviousAttendance(){
 const a=attendanceState;if(a.saving||!a.draft)return false;
 const times=previousAttendanceTimes(a.rows,a.date,a.employeeId);if(!times)return false;
 for(const [field,value] of Object.entries(times))updateAttendance(field,value);
 return true;
}
export function updateAttendanceSchedule(date,day){
 const a=attendanceState;
 if(!a.adminConfig||a.scheduleSaving||!attendanceMonthDates(a.month).includes(date))return false;
 if(day!==''&&!Object.hasOwn(DAY_TYPES,day))return false;
 const days={...a.schedule.days};if(day==='')delete days[date];else days[date]=day;
 a.schedule={...a.schedule,days};a.scheduleDirty=true;a.scheduleRequest=null;return true;
}
export async function saveAttendanceSchedule(){
 const a=attendanceState;
 if(!cloudEnabled()||!a.adminConfig||a.scheduleSaving)throw Error('僅私人管理員可儲存班表');
 a.scheduleSaving=true;a.scheduleRequest=a.scheduleRequest||uid();
 const employeeId=a.employeeId,month=a.month,requestId=a.scheduleRequest;
 try{
  const result=await cloudCall('wpOwnerSaveAttendanceSchedule',{employeeId,month,requestId,expectedRevision:a.schedule.revision,days:a.schedule.days});
  if(!result?.ok||!result.schedule)throw Error('班表未確認儲存');
  if(a.employeeId===employeeId&&a.month===month&&a.scheduleRequest===requestId){a.schedule=result.schedule;a.scheduleDirty=false;a.scheduleRequest=null;}
  return result;
 }finally{a.scheduleSaving=false;}
}
