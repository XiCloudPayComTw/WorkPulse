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


/** Private maintenance: metadata only, no writes. */
function wpOwnerMaintenance(input){
 wpOwnerAssert_();
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('查詢格式無效');
 var month=wpMonth_(input.month),control=wsBook_(),book=wpMonthFile_(control,month,false),people={};
 wsPeople_(control,true).forEach(function(p){people[p.id]=p.name;});
 var journals=book?wpRows_(wpSheet_(book,'Journals')):[],removed=book?wsDeleted_(book):{};
 var deleted=journals.filter(function(j){return removed[String(j.journalId)];});
 function auditRows(source,scope){
  return wpRows_(wpSheet_(source,'Audit')).filter(function(row){
   return scope!=='control'||String(row.occurredAt).slice(0,7)===month;
  }).map(function(row){return {scope:scope,occurredAt:String(row.occurredAt),actor:String(row.actorEmail),action:String(row.action),recordId:String(row.journalId),revision:Number(row.revision)||0};});
 }
 var rows=auditRows(control,'control').concat(book?auditRows(book,month):[]);
 rows.sort(function(a,b){return b.occurredAt.localeCompare(a.occurredAt);});
 deleted.sort(function(a,b){return String(b.date).localeCompare(String(a.date));});
 return {month:month,exists:!!book,auditCount:rows.length,audit:rows.slice(0,100),deletedCount:deleted.length,
  deleted:deleted.slice(0,100).map(function(j){return {id:String(j.journalId),date:String(j.date),employeeName:people[String(j.employeeId)]||String(j.employeeId),revision:Number(j.revision)||0};})};
}
/** Owner-only independent copy; not an atomic multi-file snapshot. */
function wpBackupAssertPrivate_(item,email){
 if(String(item.getOwner()?.getEmail()||'').toLowerCase()!==email||
    item.getSharingAccess()!==DriveApp.Access.PRIVATE||
    item.getEditors().some(function(u){return String(u.getEmail()).toLowerCase()!==email;})||
    item.getViewers().some(function(u){return String(u.getEmail()).toLowerCase()!==email;}))
   throw Error('備份目的地或檔案非資料持有者專用，已停止');
}
function wpBackupShape_(book){return book.getSheets().map(function(s){return {name:s.getName(),rows:s.getLastRow()};});}
function wpOwnerBackupWorkbook(input){
 var cfg=wpPrimaryOwnerAssert_();
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('備份格式無效');
 var target=input.target==='control'?'control':wpMonth_(input.target),request=String(input.requestId||'');
 if(!/^[a-zA-Z0-9_-]{12,120}$/.test(request))throw Error('備份識別碼無效');
 var id=String(PropertiesService.getScriptProperties().getProperty('WORKPULSE_BACKUP_FOLDER_ID')||'').trim();
 if(!id||id===cfg.folderId)throw Error('請設定獨立私人備份資料夾 WORKPULSE_BACKUP_FOLDER_ID');
 var folder=DriveApp.getFolderById(id);wpBackupAssertPrivate_(folder,cfg.adminEmail);
 var control=wsBook_(),source=target==='control'?control:wpMonthFile_(control,target,false);
 if(!source)throw Error('沒有該月份資料，不建立空白備份');
 var file=DriveApp.getFileById(source.getId());
 if(String(file.getOwner()?.getEmail()||'').toLowerCase()!==cfg.adminEmail)throw Error('來源檔案非指定持有者');
 var lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  wpPrimaryOwnerAssert_();wpBackupAssertPrivate_(folder,cfg.adminEmail);
  var title='WorkPulse_Backup_'+target+'_'+request,matching=folder.getFilesByName(title),copy,duplicate=false;
  if(matching.hasNext()){copy=matching.next();duplicate=true;if(matching.hasNext())throw Error('備份名稱重複，請人工核對');}
  else{SpreadsheetApp.flush();copy=file.makeCopy(title,folder);}
  wpBackupAssertPrivate_(copy,cfg.adminEmail);
  var shape=wpBackupShape_(SpreadsheetApp.openById(copy.getId()));
  if(!shape.length||JSON.stringify(shape)!==JSON.stringify(wpBackupShape_(source)))throw Error('來源與副本工作表／列數不同，請人工核對，不可視為已驗證備份');
  return {ok:true,deduplicated:duplicate,target:target,backupId:copy.getId(),name:title,sheets:shape};
 }finally{lock.releaseLock();}
}
