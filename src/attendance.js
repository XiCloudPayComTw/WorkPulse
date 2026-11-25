/** WorkPulse v0.9 — attendance calculations. Taiwan, standard 8h/40h regime.
 * Overtime pay is an ESTIMATE calculated locally from transient monthly wage / 240.
 * This does not infer company schedules, holiday transfers or flexible-hour arrangements.
 */
export const DAY_TYPES={workday:'一般工作日',rest:'休息日',holiday:'國定假日／特休出勤',weekly:'例假日（須人工核算）'};
export const LEAVE_TYPES={none:'無',annual:'特別休假',personal:'事假',sick:'病假',official:'公假',other:'其他'};
export const HOUR_FORMAT=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2});
export const TWD_FORMAT=new Intl.NumberFormat('zh-TW',{style:'currency',currency:'TWD',maximumFractionDigits:2});
const hour=mins=>Math.round(mins/60*100)/100;
export function minutesBetween(start,end,breakMinutes=0){
 if(!start&&!end)return 0;
 const re=/^([01]\d|2[0-3]):([0-5]\d)$/;
 const a=re.exec(start||''),b=re.exec(end||'');
 if(!a||!b)throw Error('上班、下班時間必須完整填寫');
 const first=Number(a[1])*60+Number(a[2]),last=Number(b[1])*60+Number(b[2]);
 const span=(last<=first?last+1440:last)-first;
 const pause=Number(breakMinutes);
 if(!Number.isInteger(pause)||pause<0||pause>span)throw Error('休息分鐘數超過上班時段');
 if(span>1440)throw Error('上班時段不可超過 24 小時');
 return span-pause;
}
export function overtimeMinutes(type,workedMinutes){
 const worked=Math.max(0,Number(workedMinutes)||0);
 return type==='workday'?Math.max(0,worked-480):worked;
}
export function payEstimate(type,workedMinutes,monthlyWage){
 const work=Math.max(0,Number(workedMinutes)||0),wage=Number(monthlyWage);
 if(!work)return 0;
 if(type==='weekly')return null; // statutory weekly day: emergency exceptions, compensatory rest
 if(!Number.isFinite(wage)||wage<=0)return null;
 const r=wage/240,ot=Math.max(0,work-480)/60,h=work/60;
 let pay=0;
 if(type==='workday')pay=r*(Math.min(2,ot)*4/3+Math.min(2,Math.max(0,ot-2))*5/3);
 else if(type==='rest')pay=r*(Math.min(2,h)*4/3+Math.min(6,Math.max(0,h-2))*5/3+Math.max(0,h-8)*8/3);
 else if(type==='holiday')pay=r*(8+Math.min(2,ot)*4/3+Math.min(2,Math.max(0,ot-2))*5/3);
 else throw Error('未知的出勤日別');
 return Math.round((pay+Number.EPSILON)*100)/100;
}
export function validateAttendanceDraft(data){
 const day=data?.dayType||'workday';
 if(!DAY_TYPES[day])throw Error('出勤日別無效');
 const leave=data?.leaveType||'none';
 if(!LEAVE_TYPES[leave])throw Error('請假種類無效');
 const pause=Number(data.breakMinutes||0),leaveMinutes=Number(data.leaveMinutes||0);
 if(!Number.isInteger(pause)||pause<0||pause>1440)throw Error('休息分鐘數無效');
 if(!Number.isInteger(leaveMinutes)||leaveMinutes<0||leaveMinutes>480)throw Error('請假分鐘數須為 0～480');
 if(leave==='none'&&leaveMinutes!==0)throw Error('請先選擇請假種類');
 const worked=minutesBetween(data.startTime,data.endTime,pause);
 if(worked>720)throw Error('單日實際工時超過 12 小時，請人工確認');
 return {...data,dayType:day,leaveType:leave,breakMinutes:pause,leaveMinutes,workedMinutes:worked,
   overtimeMinutes:overtimeMinutes(day,worked)};
}
export function weekdayLabel(date){
 const d=new Date(date+'T00:00:00Z');
 if(Number.isNaN(d.getTime()))return '—';
 return '日一二三四五六'[d.getUTCDay()];
}
export function weekdayCount(month){
 const [year,m]=month.split('-').map(Number),days=new Date(Date.UTC(year,m,0)).getUTCDate();
 let count=0;
 for(let i=1;i<=days;i++){const day=new Date(Date.UTC(year,m-1,i)).getUTCDay();if(day>=1&&day<=5)count++;}
 return count;
}
export function attendanceSummary(rows,month,expectedDays,temporaryMonthlyWage=null){
 const current=rows.filter(r=>r.date?.startsWith(month));
 const worked=current.reduce((s,r)=>s+(Number(r.workedMinutes)||0),0);
 const overtime=current.reduce((s,r)=>s+(Number(r.overtimeMinutes)||0),0);
 const leave=current.reduce((s,r)=>s+(Number(r.leaveMinutes)||0),0);
 const actualWorkedDays=current.filter(r=>Number(r.workedMinutes)>0).length;
 // Recalculate from entered wage only. Never use persisted attendance pay.
 const pays=current.map(row=>payEstimate(row.dayType||'workday',row.workedMinutes,temporaryMonthlyWage));
 const totalPay=pays.some(value=>value===null)?null:Math.round(pays.reduce((sum,value)=>sum+value,0)*100)/100;
 const expected=Number.isInteger(Number(expectedDays))&&expectedDays!==null&&expectedDays!==undefined?Number(expectedDays):weekdayCount(month);
 return {workedMinutes:worked,overtimeMinutes:overtime,leaveMinutes:leave,leaveDays:leave/480,
   workedDays:actualWorkedDays,expectedDays:expected,expectedIsEstimate:expectedDays==null,totalPay};
}
export const hoursLabel=mins=>HOUR_FORMAT.format(hour(mins))+' 小時';
