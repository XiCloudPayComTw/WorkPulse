/** Owner-only entry points. Include this file in the PRIVATE administrator Apps Script project only. */
function wsOwner_(){
  var email=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  return !!email&&email===wpConfig_().adminEmail;
}
function wsRequireOwner_(){wpOwnerAssert_();}
function wpOwnerBootstrap(){
  wsRequireOwner_();var book=wsBook_();return {employees:wsPeople_(book,true),projects:wsProjects_(book,true),
 categories:wsCategories_(book),categoryRevision:wsCategoryRevision_(book),owner:wpConfig_().adminEmail};
}
function wpOwnerSaveEmployee(payload){
  wsRequireOwner_();
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('使用者資料無效');
  var name=wpText_(payload.name,80),id=String(payload.id||''),requestId=String(payload.requestId||'');
  var expected=Number(payload.expectedRevision);
  if(!name||!/^[a-zA-Z0-9_-]{12,120}$/.test(requestId)
    ||!Number.isSafeInteger(expected)||expected<0||typeof payload.active!=='boolean'
    ||id&&!/^[a-zA-Z0-9_-]{1,120}$/.test(id))throw Error('使用者資料或版本無效');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    wsRequireOwner_();var book=wsBook_(),sheet=wpSheet_(book,'Employees'),rows=wpRows_(sheet);
    var old=wpRows_(wpSheet_(book,'Audit')).find(function(r){return r.action==='employee.saved'&&r.requestId===requestId;});
    if(old)return {ok:true,deduplicated:true,employees:wsPeople_(book,true)};
    var existing=rows.find(function(r){return String(r.employeeId)===id;});
    if(id&&!existing)throw Error('使用者不存在');
    if(existing&&existing.role==='admin')throw Error('不可修改管理員');
    if(rows.some(function(r){return wpActive_(r.active)&&String(r.role)!=='admin'&&String(r.employeeId)!==id&&
      wpPlainText_(r.name).trim().toLocaleLowerCase()===wpPlainText_(name).toLocaleLowerCase();}))
      throw Error('使用者姓名重複');
    var revision=existing?Number(existing.revision)||0:0;
    if(revision!==expected)throw Error('CONFLICT:使用者資料已更新');
    var activeCount=wsPeople_(book,false).length;
    if(existing&&wpActive_(existing.active)&&!payload.active&&activeCount<=1)
      throw Error('至少保留一位可填寫的使用者');
    var nextId=existing?id:Utilities.getUuid(),now=new Date().toISOString();
    var data=[nextId,existing?existing.email:'',name,'staff','',payload.active,revision+1,now,wpConfig_().adminEmail];
    if(existing)sheet.getRange(existing.__row,1,1,data.length).setValues([data]);else sheet.appendRow(data);
    wpSheet_(book,'Audit').appendRow([Utilities.getUuid(),now,wpConfig_().adminEmail,
      'employee.saved','employee:'+nextId,revision+1,requestId]);
    SpreadsheetApp.flush();
    return {ok:true,deduplicated:false,employees:wsPeople_(book,true)};
  }finally{lock.releaseLock();}
}
function wpOwnerDeleteJournal(payload){
  wsRequireOwner_();
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('刪除資料無效');
  var id=String(payload.journalId||''),date=wpDate_(payload.date),requestId=String(payload.requestId||''),revision=Number(payload.expectedRevision);
  if(!/^[a-zA-Z0-9_-]{1,120}$/.test(id)||!/^[a-zA-Z0-9_-]{12,120}$/.test(requestId)
    ||!Number.isSafeInteger(revision)||revision<1)throw Error('刪除請求或版本無效');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    wsRequireOwner_();var control=wsBook_(),book=wpMonthFile_(control,date.slice(0,7),false);
    if(!book)throw Error('找不到該月份試算表');
    var audit=wpRows_(wpSheet_(book,'Audit'));
    var prior=audit.find(function(r){return r.action==='journal.deleted'&&r.requestId===requestId;});
    if(prior){if(String(prior.journalId)!==id)throw Error('請求識別碼重複使用');
      return {ok:true,deduplicated:true,journalId:id};}
    if(wsDeleted_(book)[id])throw Error('此紀錄已刪除');
    var journal=wpRows_(wpSheet_(book,'Journals')).find(function(r){return String(r.journalId)===id;});
    if(!journal||String(journal.date)!==date)throw Error('找不到指定日期的工作日誌');
    if(Number(journal.revision)!==revision)throw Error('CONFLICT:內容已被修改，請重新整理');
    wpSheet_(book,'Audit').appendRow([Utilities.getUuid(),new Date().toISOString(),
      wpConfig_().adminEmail,'journal.deleted',id,revision,requestId]);SpreadsheetApp.flush();
    return {ok:true,deduplicated:false,journalId:id};
  }finally{lock.releaseLock();}
}

/**
 * Editor-visible entry points. These are shipped ONLY in the private admin project.
 * For initial setup, configure WORKPULSE_ADMIN_EMAIL and WORKPULSE_ALLOWED_DOMAIN first.
 */
function workPulseInitialize(){
  return wpPrivateCreateWorkspace_();
}
function workPulseMigrateLegacy(){
  return wpPrivateMigrateLegacyMonthly_();
}
