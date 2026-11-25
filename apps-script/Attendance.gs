/** v0.9 attendance API. Public methods: wpAttendanceLoad and wpAttendanceSave.
 * Rates and expected workdays are configured only by the private administrator app.
 */
var WP_ATTENDANCE_DAYS=['workday','rest','holiday','weekly'];
var WP_ATTENDANCE_LEAVES=['none','annual','personal','sick','official','other'];
function wpAttClock_(v){
  var s=String(v||'');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw Error('時間必須使用 HH:mm');
  return Number(s.slice(0,2))*60+Number(s.slice(3));
}
function wpAttMinutes_(data){
  var a=String(data.startTime||''),b=String(data.endTime||''),pause=Number(data.breakMinutes||0);
  if(!Number.isInteger(pause)||pause<0||pause>1440)throw Error('休息分鐘數無效');
  if(!a&&!b)return 0;
  if(!a||!b)throw Error('請完整填寫上班與下班時間');
  var start=wpAttClock_(a),end=wpAttClock_(b);
  var span=end<=start?end+1440-start:end-start;
  if(pause>span)throw Error('休息時間超過出勤時段');
  if(span-pause>720)throw Error('單日實際工時超過 12 小時，請人工核對');
  return span-pause;
}
function wpAttExtra_(day,worked){return day==='workday'?Math.max(0,worked-480):worked;}
function wpAttPay_(day,worked,wage){
  if(!worked)return 0;
  if(day==='weekly')return null;
  var amount=Number(wage);
  if(!isFinite(amount)||amount<=0)return null;
  var rate=amount/240,o=Math.max(0,worked-480)/60,h=worked/60,pay;
  if(day==='workday')pay=rate*(Math.min(2,o)*4/3+Math.min(2,Math.max(0,o-2))*5/3);
  else if(day==='rest')pay=rate*(Math.min(2,h)*4/3+Math.min(6,Math.max(0,h-2))*5/3+Math.max(0,h-8)*8/3);
  else if(day==='holiday')pay=rate*(8+Math.min(2,o)*4/3+Math.min(2,Math.max(0,o-2))*5/3);
  else throw Error('無效的出勤日別');
  return Math.round((pay+Number.EPSILON)*100)/100;
}
function wpAttConfig_(control,id,month){
  var sheet=control.getSheetByName('AttendanceSettings');
  if(!sheet)return {monthlyWage:null,expectedDays:null,revision:0};
  var r=wpRows_(sheet).find(function(x){return String(x.employeeId)===id&&String(x.month)===month;});
  if(!r)return {monthlyWage:null,expectedDays:null,revision:0};
  return {monthlyWage:r.monthlyWage===''?null:Number(r.monthlyWage),
    expectedDays:r.expectedDays===''?null:Number(r.expectedDays),revision:Number(r.revision)||0};
}
function wpAttRecord_(row){
  return {id:String(row.attendanceId),date:String(row.date),employeeId:String(row.employeeId),
    dayType:String(row.dayType),startTime:String(row.startTime||''),endTime:String(row.endTime||''),
    breakMinutes:Number(row.breakMinutes)||0,workedMinutes:Number(row.workedMinutes)||0,
    overtimeMinutes:Number(row.overtimeMinutes)||0,leaveType:String(row.leaveType||'none'),
    leaveMinutes:Number(row.leaveMinutes)||0,
    overtimePay:row.overtimePay===''||row.overtimePay==null?null:Number(row.overtimePay),
    notes:wpPlainText_(row.notes),revision:Number(row.revision)||0,updatedAt:String(row.updatedAt||'')};
}
function wpAttRows_(book,id){
  if(!book||!book.getSheetByName('Attendance'))return [];
  return wpRows_(wpSheet_(book,'Attendance')).filter(function(row){return String(row.employeeId)===id;})
    .sort(function(a,b){return String(a.date).localeCompare(String(b.date));}).map(wpAttRecord_);
}
function wpAttEmployee_(control,id){
  var person=wsPeople_(control,false).find(function(p){return p.id===id;});
  if(!person)throw Error('請選擇有效的出勤人員');
  return person;
}
function wpAttendanceLoad(payload){
  var m=wpMonth_(payload&&payload.month),control=wsBook_(),id=String(payload&&payload.employeeId||'');
  wpAttEmployee_(control,id);
  var file=wpMonthFile_(control,m,false),settings=wpAttConfig_(control,id,m);
  return {month:m,employeeId:id,rows:wpAttRows_(file,id),expectedDays:settings.expectedDays,
    wageConfigured:settings.monthlyWage!=null&&settings.monthlyWage>0};
}
