/** Attendance write endpoint. Separate file to keep public APIs auditable. */
function wpAttendanceSave(input,token){
 wpFieldAccess_(token);
 if(!input||typeof input!=='object')throw Error('出勤資料錯誤');
 if(Object.prototype.hasOwnProperty.call(input,'monthlyWage')||Object.prototype.hasOwnProperty.call(input,'overtimePay'))
  throw Error('薪資及試算金額只在本機 Excel 處理，禁止上傳');
 var id=String(input.employeeId||''),date=wpDate_(input.date),month=date.slice(0,7);
 var day=String(input.dayType||'workday'),leave=String(input.leaveType||'none');
 var request=String(input.requestId||''),revision=Number(input.expectedRevision);
 if(WP_ATTENDANCE_DAYS.indexOf(day)<0||WP_ATTENDANCE_LEAVES.indexOf(leave)<0)throw Error('日別或假別錯誤');
 if(!/^[a-zA-Z0-9_-]{12,120}$/.test(request)||!Number.isSafeInteger(revision)||revision<0)throw Error('版本或識別碼無效');
 var leaveMinutes=Number(input.leaveMinutes||0),pause=Number(input.breakMinutes||0);
 if(!Number.isInteger(leaveMinutes)||leaveMinutes<0||leaveMinutes>480||(leave==='none'&&leaveMinutes))throw Error('請假分鐘數無效');
 var worked=wpAttMinutes_(input),notes=wpText_(input.notes,1000);
 if(!worked&&!leaveMinutes)throw Error('請填寫出勤時間或請假');
 var lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  var verified=wpFieldAccess_(token),control=wsBook_();wpFieldWriteGuard_(control,token);wpFixedTarget_(token,control,id);wpAttEmployee_(control,id);
  var file=wpMonthFile_(control,month,true);wpInitializeSheet_(file,'Attendance');
  var sheet=wpSheet_(file,'Attendance'),rows=wpRows_(sheet);
  var oldRequest=wpRows_(wpSheet_(file,'Requests')).find(function(x){return x.requestId===request;});
  if(oldRequest){
   if(oldRequest.actorEmail!=='attendance:'+id)throw Error('請求識別碼已被使用');
   var duplicate=rows.find(function(x){return x.attendanceId===oldRequest.journalId;});
   if(!duplicate)throw Error('先前儲存紀錄不完整');
   return {ok:true,deduplicated:true,row:wpAttRecord_(duplicate)};
  }
  var existing=rows.find(function(x){return x.date===date&&x.employeeId===id;});
  var oldVersion=existing?Number(existing.revision)||0:0;
  if(oldVersion!==revision)throw Error('CONFLICT:出勤紀錄已被更新');
  var now=new Date().toISOString(),newId=existing?existing.attendanceId:Utilities.getUuid();
  var values=[newId,date,id,day,String(input.startTime||''),String(input.endTime||''),pause,worked,
   wpAttExtra_(day,worked),leave,leaveMinutes,'',notes,oldVersion+1,now,request];
  if(existing)sheet.getRange(existing.__row,1,1,values.length).setValues([values]);else sheet.appendRow(values);
  wpSheet_(file,'Requests').appendRow([request,'attendance:'+id,newId,oldVersion+1,now]);
  wpSheet_(file,'Audit').appendRow([Utilities.getUuid(),now,wpFieldAuditActor_(verified,'attendance:'+id),
   existing?'attendance.updated':'attendance.created',newId,oldVersion+1,request]);
  SpreadsheetApp.flush();
  var obj={};WP_HEADERS.Attendance.forEach(function(key,i){obj[key]=values[i];});
  return {ok:true,deduplicated:false,row:wpAttRecord_(obj)};
 }finally{lock.releaseLock();}
}
