import {DAY_TYPES} from './attendance.js';
export function attendanceMonthDates(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))return [];
 const [y,m]=month.split('-').map(Number);
 return Array.from({length:new Date(Date.UTC(y,m,0)).getUTCDate()},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
}
export function attendancePlannedDay(date,overrides={}){
 if(Object.hasOwn(overrides,date)&&Object.hasOwn(DAY_TYPES,overrides[date]))return overrides[date];
 const day=new Date(date+'T00:00:00Z').getUTCDay();
 return day===0?'weekly':day===6?'rest':'workday';
}
export function attendanceCalendar(month,rows,overrides={},today,selectedDate='',draft=null){
 const dates=attendanceMonthDates(month),byDate=new Map(rows.map(r=>[r.date,r]));
 return dates.map(date=>{
  const planned=attendancePlannedDay(date,overrides),row=byDate.get(date),future=date>today;
  const missing=!row&&!future&&date<today&&planned==='workday';
  const issues=[];
  if(row){
   const worked=Number(row.workedMinutes)||0,leave=Number(row.leaveMinutes)||0;
   if(row.dayType!==planned)issues.push('出勤日別與班表不同');
   if(Boolean(row.startTime)!==Boolean(row.endTime)||(!worked&&!leave))issues.push('紀錄不完整');
   if(worked>720||worked+leave>1440)issues.push('工時異常');
   if(planned==='workday'&&worked+leave<480)issues.push('未達八小時，請依實際班表核對');
   if(row.dayType==='weekly'&&worked>0)issues.push('例假出勤須人工核對');
  }
  if(date===selectedDate&&draft)issues.push('有未提交草稿');
  return {date,planned,row,missing,future,issues,selected:date===selectedDate,
   status:issues.length?'review':row?(Number(row.leaveMinutes)>0?'leave':'recorded'):missing?'missing':future?'future':planned==='workday'?'today':'off'};
 });
}
export function previousAttendanceTimes(rows,date,employeeId){
 const d=new Date(date+'T00:00:00Z');if(!Number.isFinite(d.getTime()))return null;
 d.setUTCDate(d.getUTCDate()-1);const previous=d.toISOString().slice(0,10);
 const row=rows.find(r=>r.date===previous&&r.employeeId===employeeId&&r.startTime&&r.endTime);
 return row?{startTime:row.startTime,endTime:row.endTime,breakMinutes:Number(row.breakMinutes)||0}:null;
}
