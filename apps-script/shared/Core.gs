/**
 * WorkPulse v0.8 — shared minimal Apps Script backend.
 * Only public read/write endpoints are installed in the public deployment.
 * Legacy Code.gs, Review.gs and the administrator endpoints MUST NOT be deployed publicly.
 */
var WP_SCHEMA='4';
var WP_HEADERS={
  Employees:['employeeId','email','name','role','departmentId','active','revision','updatedAt','updatedBy'],
  Departments:['departmentId','name','active','revision','updatedAt','updatedBy'],
  Projects:['projectId','name','active','revision','updatedAt','updatedBy'],
  Journals:['journalId','date','employeeId','revision','updatedAt','updatedBy','requestId','note','tomorrow'],
  Tasks:['taskId','journalId','revision','position','project','category','title','description','result','status','hours'],
  Requests:['requestId','actorEmail','journalId','revision','createdAt'],
  Audit:['auditId','occurredAt','actorEmail','action','journalId','revision','requestId'],
  Reviews:['reviewId','journalId','journalRevision','status','actorEmail','comment','requestId','createdAt'],
  Meta:['key','value'],
  MonthIndex:['month','spreadsheetId','createdAt'],
  Attendance:['attendanceId','date','employeeId','dayType','startTime','endTime','breakMinutes','workedMinutes','overtimeMinutes','leaveType','leaveMinutes','overtimePay','notes','revision','updatedAt','requestId'],
  AttendanceSettings:['employeeId','month','monthlyWage','expectedDays','revision','updatedAt','requestId']
};
var WP_CATEGORIES=['前端開發','展店設計','現場勘查','行政／會議','其他'];
var WP_STATUS=['done','doing','blocked'];
function wpUnified_(){return typeof WP_PORTAL_KIND!=='undefined'&&WP_PORTAL_KIND==='unified';}
function doGet(){
  if(wpUnified_()){if(wpFieldMode_()==='shared-code')wpSharedExecution_();else wpFieldAccess_();}
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('WorkPulse — 工作日誌')
    .addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
}
function wpConfig_(){
  var props=PropertiesService.getScriptProperties();
  var sheetId=String(props.getProperty('WORKPULSE_SHEET_ID')||'').trim();
  var domain=String(props.getProperty('WORKPULSE_ALLOWED_DOMAIN')||'').trim().toLowerCase().replace(/^@/,'');
  var adminEmail=String(props.getProperty('WORKPULSE_ADMIN_EMAIL')||'').trim().toLowerCase();
  var folderId=String(props.getProperty('WORKPULSE_FOLDER_ID')||'').trim();
  var operatorEmail=String(props.getProperty('WORKPULSE_OPERATOR_EMAIL')||'').trim().toLowerCase();
  if(!sheetId||!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)||!adminEmail.endsWith('@'+domain)||operatorEmail&&!operatorEmail.endsWith('@'+domain))
    throw Error('尚未設定公司控制表、網域及管理員。');
  return {sheetId:sheetId,domain:domain,adminEmail:adminEmail,folderId:folderId,operatorEmail:operatorEmail};
}
function wpSheet_(book,name){
  var sheet=book.getSheetByName(name);
  if(!sheet)throw Error('找不到資料表 '+name+'，請由管理員完成初始化');
  return sheet;
}
function wpRows_(sheet){
  var rows=sheet.getLastRow();
  if(rows<2)return [];
  var headers=WP_HEADERS[sheet.getName()];
  if(!headers)throw Error('未知工作表 '+sheet.getName());
  return sheet.getRange(2,1,rows-1,headers.length).getValues().map(function(values,i){
    var item={__row:i+2};
    headers.forEach(function(name,k){item[name]=values[k];});
    return item;
  });
}
function wpMonth_(value){
  var month=String(value||'');
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('月份格式錯誤');
  return month;
}
function wpDate_(value){
  var date=String(value||'');
  if(!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date))throw Error('日期格式錯誤');
  var dt=new Date(date+'T00:00:00Z');
  if(isNaN(dt.getTime())||dt.toISOString().slice(0,10)!==date)throw Error('日期不存在');
  return date;
}
function wpText_(value,max){
  var txt=String(value==null?'':value).trim();
  if(txt.length>max)throw Error('內容超過 '+max+' 字元限制');
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(txt)?"'"+txt:txt;
}
function wpPlainText_(value){
  return String(value==null?'':value).replace(/^'(?=[=+\-@])/,'');
}
function wpActive_(value){return value===true||String(value).toLowerCase()==='true';}
function wpOwnerAssert_(){
  // Unified executes as the primary owner, never promote a delegated operator.
  if(wpUnified_())return wpPrimaryOwnerAssert_();
  var cfg=wpConfig_();
  var active=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  var effective=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
  if(!((active===cfg.adminEmail&&effective===cfg.adminEmail)||(cfg.operatorEmail&&active===cfg.operatorEmail&&effective===cfg.operatorEmail)))
    throw Error('管理員雙重身分驗證失敗：管理帳號未通過驗證或尚未獲公司管理者授權。');
  return cfg;
}

function wpPrimaryOwnerAssert_(){
 if(wpUnified_())wpFieldMode_();
 var cfg=wpConfig_();
 if(String(Session.getActiveUser().getEmail()||'').trim().toLowerCase()!==cfg.adminEmail||
    String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase()!==cfg.adminEmail)
  throw Error('首次建檔與資料遷移雙重身分驗證失敗：只能由公司資料持有帳號執行');
 return cfg;
}

/** Public read-only category access from Meta; writes require private owner deployment. */
/** Dynamic work types live in controller Meta, avoiding destructive schema migrations. */
function wsCategories_(book){
 var record=wpRows_(wpSheet_(book,'Meta')).find(function(row){return row.key==='workCategories';});
 if(!record||!record.value)return WP_CATEGORIES.slice();
 try{
  var values=JSON.parse(String(record.value));
  if(!Array.isArray(values)||!values.length||values.length>60||
    values.some(function(value){return typeof value!=='string'||!value.trim()||value.length>100;}))
   throw Error('工作類型設定格式無效');
  return values;
 }catch(error){throw Error('工作類型設定損毀，請由管理員檢查：'+error.message);}
}
function wsCategoryRevision_(book){
 var row=wpRows_(wpSheet_(book,'Meta')).find(function(item){return item.key==='workCategoriesRevision';});
 return row?Number(row.value)||0:0;
}


/** Production access is opt-in until the company verifies the actual Workspace deployment.
 * Domain membership is not employee identity: a verified colleague can still select another name.
 */
function wpFieldMode_(){
 var mode=String(PropertiesService.getScriptProperties().getProperty('WORKPULSE_ACCESS_MODE')||'legacy');
 if(wpUnified_()&&mode!=='domain'&&mode!=='shared-code')throw Error('單一入口必須設定 WORKPULSE_ACCESS_MODE=domain 或 shared-code，禁止匿名無驗證模式');
 if(mode!=='legacy'&&mode!=='domain'&&!(wpUnified_()&&mode==='shared-code'))throw Error('WORKPULSE_ACCESS_MODE 設定無效');
 return mode;
}
function wpSharedExecution_(){
 var cfg=wpConfig_();
 if(String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase()!==cfg.adminEmail)throw Error('單一入口必須以公司資料持有者身分執行');
 return cfg;
}
function wpFieldAccess_(token){
 var mode=wpFieldMode_();
 if(mode==='shared-code'){
  var cfg=wpSharedExecution_(),active=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  if((token===undefined||token===null||token==='')&&active===cfg.adminEmail)return active;
  var session=wpCodeSessionVerify_(token);
  if(!session.personId)throw Error('請先確認固定操作人員');
  return session.actor;
 }
 if(mode!=='domain')return '';
 var cfg=wpConfig_(),active=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase(),
 effective=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
 if(!active||!active.endsWith('@'+cfg.domain))throw Error('請使用公司網域 Google 帳號登入，無法驗證身分時停止存取');
 if(wpUnified_()&&effective!==cfg.adminEmail)throw Error('單一入口必須以公司資料持有者身分執行');
 if(effective!==cfg.adminEmail&&(!cfg.operatorEmail||effective!==cfg.operatorEmail))throw Error('雲端執行身分不符公司授權');
 return active;
}
function wpFieldPause_(control){
 var row=wpRows_(wpSheet_(control,'Meta')).find(function(x){return x.key==='fieldWritesPausedAt';});
 if(!row||!row.value)return '';
 var value=String(row.value);if(!Number.isFinite(Date.parse(value)))throw Error('停寫設定損毀，請管理員核對');
 return value;
}
function wpFieldWriteGuard_(control,token){
 wpFieldAccess_(token);
 if(wpFieldPause_(control))throw Error('維護中：工作日誌及出勤暫停正式儲存，請保留草稿，稍後手動重送');
 if(wpFieldMode_()==='domain'&&typeof WP_PORTAL_KIND!=='undefined'&&WP_PORTAL_KIND==='admin')
  throw Error('正式模式請使用員工入口儲存工作日誌及出勤，管理入口不接受日常寫入');
}
function wpRequireMaintenanceWindow_(control,now){
 if(wpFieldMode_()==='legacy')return;
 var paused=wpFieldPause_(control);
 if(!paused||now-Date.parse(paused)<10*60*1000)throw Error('正式模式刪除須先停寫至少 10 分鐘，並確認舊部署及進行中的寫入已停止');
}

/** Preserve old request actor format for integrity checks; anonymous audit label is not a verified person. */
function wpFieldAuditActor_(verified,selected){return /^shared:[a-f0-9]{32}$/.test(verified)?verified:selected;}
