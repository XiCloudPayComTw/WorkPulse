/** Payroll settings are private to the admin Apps Script deployment. */
function wpOwnerAttendanceConfig(payload){
 wpOwnerAssert_();
 var m=wpMonth_(payload&&payload.month),book=wsBook_(),id=String(payload&&payload.employeeId||'');
 wpAttEmployee_(book,id);
 return wpAttConfig_(book,id,m);
}
function wpOwnerSaveAttendanceConfig(input){
 wpOwnerAssert_();
 if(!input||typeof input!=='object')throw Error('設定格式錯誤');
 var id=String(input.employeeId||''),month=wpMonth_(input.month);
 if(Object.prototype.hasOwnProperty.call(input,'monthlyWage'))throw Error('月薪只能於出勤頁面臨時計算，禁止儲存');
 var days=input.expectedDays==null||input.expectedDays===''?null:Number(input.expectedDays);
 var revision=Number(input.expectedRevision),request=String(input.requestId||'');
 if(days!==null&&(!Number.isInteger(days)||days<0||days>31))throw Error('預計工作天數無效');
 if(!Number.isSafeInteger(revision)||revision<0||!/^[\w-]{12,120}$/.test(request))throw Error('版本或請求識別碼無效');
 var lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  wpOwnerAssert_();var control=wsBook_();wpAttEmployee_(control,id);
  var sheet=wpInitializeSheet_(control,'AttendanceSettings'),rows=wpRows_(sheet);
  var previous=rows.find(function(r){return r.employeeId===id&&r.month===month;});
  var duplicate=rows.find(function(r){return r.requestId===request;});
  if(duplicate){if(duplicate.employeeId!==id||duplicate.month!==month)throw Error('請求識別碼重複');
   return {ok:true,deduplicated:true,config:wpAttConfig_(control,id,month)};}
  var oldRevision=previous?Number(previous.revision)||0:0;
  if(oldRevision!==revision)throw Error('CONFLICT:設定已被修改');
  var values=[id,month,'',days==null?'':days,
    oldRevision+1,new Date().toISOString(),request];
  if(previous)sheet.getRange(previous.__row,1,1,values.length).setValues([values]);else sheet.appendRow(values);
  SpreadsheetApp.flush();
  return {ok:true,deduplicated:false,config:wpAttConfig_(control,id,month)};
 }finally{lock.releaseLock();}
}
function workPulseUpgradeAttendance(){
 wpOwnerAssert_();wpInitializeSheet_(wsBook_(),'AttendanceSettings');
 return '已建立出勤設定表，既有月份將於首次寫入時建立 Attendance 分頁';
}
