import {payEstimate,weekdayLabel,DAY_TYPES,LEAVE_TYPES} from '../attendance/attendance.js';
import {localISODate} from '../../shared/utils.js';
import {attendancePlannedDay} from '../attendance/calendar.js';
const DAY_MS=86400000;
const DATE_RE=/^(\d{4})-(\d{2})-(\d{2})$/;
const round2=n=>Math.round((n+Number.EPSILON)*100)/100;
const iso=dt=>dt.toISOString().slice(0,10);
export function parsePayrollDate(value){
 const match=DATE_RE.exec(String(value||''));
 if(!match)throw Error('請輸入有效的日期（YYYY-MM-DD）');
 const [year,month,day]=match.slice(1).map(Number);
 const d=new Date(Date.UTC(year,month-1,day));
 if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)
  throw Error('日期不存在，請檢查年月日');
 return d;
}
/** Previous complete calendar month in the user's current local calendar.
 * JavaScript's Gregorian calendar automatically handles leap years; no network needed.
 */
export function previousCompletedMonth(today=new Date()){
 const localYear=today.getFullYear(),localMonth=today.getMonth();
 const first=new Date(localYear,localMonth-1,1,12);
 const last=new Date(localYear,localMonth,0,12);
 return {startDate:localISODate(first),endDate:localISODate(last)};
}
export function payrollPeriod(startDate,endDate,today=new Date()){
 const first=parsePayrollDate(startDate),last=parsePayrollDate(endDate);
 if(last<first)throw Error('結束日期不可早於開始日期');
 const days=Math.round((last-first)/DAY_MS)+1;
 if(days>366)throw Error('單次試算最多 366 天，請縮短日期範圍');
 if(last>parsePayrollDate(localISODate(today)))throw Error('不能試算未來尚未發生的出勤日期');
 return {startDate:iso(first),endDate:iso(last),days};
}
export function payrollDays(startDate,endDate){
 const {days}=payrollPeriod(startDate,endDate,new Date(9999,0,1));
 const start=parsePayrollDate(startDate).getTime();
 return Array.from({length:days},(_,i)=>iso(new Date(start+i*DAY_MS)));
}
function validateWage(value){
 const wage=Number(value);
 if(value===null||value===undefined||String(value).trim()===''||
    !Number.isFinite(wage)||wage<=0||wage>10000000)throw Error('請先輸入有效的月薪工資總額（NT$）');
 return wage;
}
/** No persistence and no salary sent to the server. The report object only exists
 * in the current browser tab until dismissed or a different employee is selected.
 */
export function buildPayrollReport({employeeId,employeeName,startDate,endDate,monthlyWage,rows,
 generatedAt=new Date(),today=new Date(),exportOnly=false,payDate='',scheduleByMonth={}}){
 const period=payrollPeriod(startDate,endDate,today),wage=exportOnly?null:validateWage(monthlyWage);
 if(payDate&&parsePayrollDate(payDate)<parsePayrollDate(endDate))throw Error('發薪日期不可早於結算結束日');
 const ids=new Map();
 for(const source of rows||[]){
  if(source.employeeId!==employeeId||source.date<startDate||source.date>endDate)continue;
  if(ids.has(source.date))throw Error('查詢資料有重複的同日出勤紀錄，請先排除：'+source.date);
  ids.set(source.date,source);
 }
 const days=payrollDays(startDate,endDate).map(date=>{
  const source=ids.get(date),weekday=weekdayLabel(date),planned=attendancePlannedDay(date,scheduleByMonth[date.slice(0,7)]?.days||{});
  if(!source)return {date,weekday,dayType:'',dayTypeLabel:'',startTime:'',endTime:'',
    breakMinutes:null,workedMinutes:null,overtimeMinutes:null,leaveType:'',leaveLabel:'',
    leaveMinutes:null,notes:'',revision:null,status:'未登記',pay:null,planned,issues:[]};
  const worked=Number(source.workedMinutes)||0,ot=Number(source.overtimeMinutes)||0;
  const leave=Number(source.leaveMinutes)||0,dayType=String(source.dayType||'workday');
  const issues=[];
  if(exportOnly){if(dayType!==planned)issues.push('日別與班表不符');if(!Object.hasOwn(DAY_TYPES,dayType)||worked<0||worked>720||ot<0||ot>worked||(!worked&&!leave)||Boolean(source.startTime)!==Boolean(source.endTime))issues.push('工時或紀錄異常');if(worked&&source.endTime<=source.startTime)issues.push('跨午夜需核對');if(dayType==='weekly'&&worked)issues.push('例假出勤需人工核算');if(dayType==='workday'&&worked+leave<480)issues.push('未達八小時，請核對');}
  const pay=exportOnly?null:payEstimate(dayType,worked,wage);
  return {date,weekday,dayType,dayTypeLabel:DAY_TYPES[dayType]||dayType,
    startTime:String(source.startTime||''),endTime:String(source.endTime||''),
    breakMinutes:Number(source.breakMinutes)||0,workedMinutes:worked,
    overtimeMinutes:ot,leaveType:String(source.leaveType||'none'),
    leaveLabel:leave?LEAVE_TYPES[source.leaveType]||String(source.leaveType||''): '',
    leaveMinutes:leave,notes:String(source.notes||''),revision:Number(source.revision)||0,
    status:(exportOnly?issues.length>0:pay===null)?'需人工核對':'已登記',pay,planned,issues};
 });
 const estimatedWorkingDays=days.filter(d=>d.planned==='workday').length;
 const missingWorkDays=days.filter(d=>d.status==='未登記'&&d.planned==='workday'&&d.date<localISODate(today)).length;
 const recorded=days.filter(d=>d.status!=='未登記'),missing=days.length-recorded.length;
 const manual=recorded.filter(d=>d.status==='需人工核對').length;
 const totalWorkMinutes=recorded.reduce((n,d)=>n+d.workedMinutes,0);
 const totalOvertimeMinutes=recorded.reduce((n,d)=>n+d.overtimeMinutes,0);
 const totalLeaveMinutes=recorded.reduce((n,d)=>n+d.leaveMinutes,0);
 const subtotal=round2(recorded.reduce((n,d)=>n+(d.pay??0),0));
 const generatedISO=generatedAt instanceof Date?generatedAt.toISOString():new Date(generatedAt).toISOString();
 return {
  employeeId,employeeName:String(employeeName||employeeId),...period,
  generatedAt:generatedISO,monthlyWage:wage,hourlyWage:exportOnly?null:wage/240,exportOnly,payDate,missingWorkDays,
  rows:days,recordedDays:recorded.length,missingDays:missing,manualReviewDays:manual,
  estimatedWorkingDays,expectedIsEstimate:true,
  workHours:round2(totalWorkMinutes/60),overtimeHours:round2(totalOvertimeMinutes/60),
  leaveHours:round2(totalLeaveMinutes/60),leaveDays:round2(totalLeaveMinutes/480),
  knownPaySubtotal:exportOnly?null:subtotal,totalPay:exportOnly||manual?null:subtotal,
  isPartialMonth:startDate.slice(0,7)===localISODate(today).slice(0,7)||
    endDate.slice(0,7)===localISODate(today).slice(0,7),
  hasUnrecordedDates:missing>0
 };
}

export function buildAttendanceExportReport(options){return buildPayrollReport({...options,monthlyWage:null,exportOnly:true});}
