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
  Meta:['key','value'],
  MonthIndex:['month','spreadsheetId','createdAt']
};
var WP_CATEGORIES=['前端開發','展店設計','現場勘查','行政／會議','其他'];
var WP_STATUS=['done','doing','blocked'];
function doGet(){
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('WorkPulse — 工作日誌')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}
function wpConfig_(){
  var props=PropertiesService.getScriptProperties();
  var sheetId=String(props.getProperty('WORKPULSE_SHEET_ID')||'').trim();
  var domain=String(props.getProperty('WORKPULSE_ALLOWED_DOMAIN')||'').trim().toLowerCase().replace(/^@/,'');
  var adminEmail=String(props.getProperty('WORKPULSE_ADMIN_EMAIL')||'').trim().toLowerCase();
  var folderId=String(props.getProperty('WORKPULSE_FOLDER_ID')||'').trim();
  if(!sheetId||!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)||!adminEmail.endsWith('@'+domain))
    throw Error('尚未設定公司控制表、網域及管理員。');
  return {sheetId:sheetId,domain:domain,adminEmail:adminEmail,folderId:folderId};
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
  var cfg=wpConfig_();
  var active=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  var effective=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
  if(active!==cfg.adminEmail||effective!==cfg.adminEmail)
    throw Error('管理員帳號未通過雙重身分驗證。請由公司帳號使用私人管理入口。');
  return cfg;
}
