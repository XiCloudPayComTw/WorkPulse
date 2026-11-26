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
    wsRequireOwner_();var control=wsBook_();wpRequireMaintenanceWindow_(control,Date.now());var book=wpMonthFile_(control,date.slice(0,7),false);
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
 var props=PropertiesService.getScriptProperties(),lastRun=null;
 try{lastRun=JSON.parse(props.getProperty('WORKPULSE_BACKUP_LAST_RUN')||'null');}catch(e){}
 return {month:month,exists:!!book,pausedAt:wpFieldPause_(control),accessMode:wpFieldMode_(),schedule:{configured:!!props.getProperty('WORKPULSE_BACKUP_TRIGGER_UID'),lastRun:lastRun},auditCount:rows.length,audit:rows.slice(0,100),deletedCount:deleted.length,
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
 wpPrimaryOwnerAssert_();return wpBackupWorkbook_(input,false);
}
function wpBackupActor_(scheduled){
 if(!scheduled)return wpPrimaryOwnerAssert_();
 var cfg=wpConfig_();
 if(String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase()!==cfg.adminEmail)throw Error('排程必須由資料持有帳號執行');
 return cfg;
}
function wpBackupWorkbook_(input,scheduled){
 var cfg=wpBackupActor_(scheduled);
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
  wpBackupActor_(scheduled);wpBackupAssertPrivate_(folder,cfg.adminEmail);
  var before=wpBackupContent_(source);
  var title='WorkPulse_Backup_'+target+'_'+request,matching=folder.getFilesByName(title),copy,duplicate=false;
  if(matching.hasNext()){copy=matching.next();duplicate=true;if(matching.hasNext())throw Error('備份名稱重複，請人工核對');}
  else{SpreadsheetApp.flush();copy=file.makeCopy(title,folder);}
  wpBackupAssertPrivate_(copy,cfg.adminEmail);
  var copied=SpreadsheetApp.openById(copy.getId()),shape=wpBackupShape_(copied);
  if(!shape.length||before!==wpBackupContent_(copied)||before!==wpBackupContent_(source))throw Error('來源與副本內容不同或來源已變動，請人工核對，不可視為已驗證備份');
  return {ok:true,deduplicated:duplicate,target:target,backupId:copy.getId(),name:title,sheets:shape};
 }finally{lock.releaseLock();}
}


/** Compare stored cell values, including headers. Bound work to avoid script timeouts.
 * This checks content, not formatting, permissions, formulas or atomicity.
 */
function wpBackupContent_(book){
 var cells=0,parts=[];
 book.getSheets().forEach(function(s){
  var headers=WP_HEADERS[s.getName()];
  if(!headers)throw Error('備份含未知工作表，請人工核對');
  var n=s.getLastRow();cells+=n*headers.length;
  if(cells>250000)throw Error('備份資料量超過自動核對上限，請人工備份');
  parts.push([s.getName(),n,n?s.getRange(1,1,n,headers.length).getValues():[]]);
 });
 parts.sort(function(a,b){return a[0].localeCompare(b[0]);});
 return JSON.stringify(parts);
}
/** Deleted journal recovery snapshot, never reactivates or writes a live record. */
function wpOwnerRecoveryPreview(input){
 wpOwnerAssert_();
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('復原查詢格式無效');
 var date=wpDate_(input.date),id=String(input.journalId||''),revision=Number(input.expectedRevision);
 if(!/^[a-zA-Z0-9_-]{1,120}$/.test(id)||!Number.isSafeInteger(revision)||revision<1)throw Error('復原識別碼或版本無效');
 var control=wsBook_(),book=wpMonthFile_(control,date.slice(0,7),false);
 if(!book)throw Error('找不到月份文件');
 var removed=wsDeleted_(book),rows=wpRows_(wpSheet_(book,'Journals'));
 var original=rows.find(function(j){return String(j.journalId)===id&&String(j.date)===date;});
 if(!original||!removed[id]||Number(original.revision)!==revision)throw Error('CONFLICT:已刪除紀錄狀態或版本已改變，請重新查詢');
 var collision=rows.some(function(j){return String(j.date)===date&&String(j.employeeId)===String(original.employeeId)&&!removed[String(j.journalId)];});
 return {format:'workpulse-recovery-v1',readOnly:true,generatedAt:new Date().toISOString(),activeCollision:collision,
  journal:wsRecord_(original,wpRows_(wpSheet_(book,'Tasks')))};
}
/** Only install from the private project's editor, signed in as primary owner. */
function workPulseInstallDailyBackup(){
 var cfg=wpPrimaryOwnerAssert_(),props=PropertiesService.getScriptProperties();
 var id=String(props.getProperty('WORKPULSE_BACKUP_FOLDER_ID')||'').trim();
 if(!id||id===cfg.folderId)throw Error('請先設定獨立私人備份資料夾');
 wpBackupAssertPrivate_(DriveApp.getFolderById(id),cfg.adminEmail);
 var existing=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='wpDailyBackup_';});
 if(existing.length>1)throw Error('備份排程重複，請在 Apps Script 觸發條件人工移除');
 var trigger=existing[0]||ScriptApp.newTrigger('wpDailyBackup_').timeBased().atHour(3).everyDays(1).inTimezone('Asia/Taipei').create();
 props.setProperty('WORKPULSE_BACKUP_TRIGGER_UID',trigger.getUniqueId());
 return {ok:true,installed:true,hourWindow:'03:00–04:00 Asia/Taipei'};
}
function workPulseRemoveDailyBackup(){
 wpPrimaryOwnerAssert_();
 ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='wpDailyBackup_';}).forEach(function(t){ScriptApp.deleteTrigger(t);});
 PropertiesService.getScriptProperties().setProperty('WORKPULSE_BACKUP_TRIGGER_UID','');
 return {ok:true,installed:false};
}
function wpBackupDay_(now){
 // Asia/Taipei is UTC+8 without DST.
 return new Date(now.getTime()+8*3600000).toISOString().slice(0,10);
}
function wpDailyBackup_(event){
 var cfg=wpBackupActor_(true),props=PropertiesService.getScriptProperties();
 var expected=String(props.getProperty('WORKPULSE_BACKUP_TRIGGER_UID')||'');
 if(!expected||String(event&&event.triggerUid||'')!==expected)throw Error('未驗證備份排程');
 var day=wpBackupDay_(new Date()),current=day.slice(0,7),priorDate=new Date(current+'-01T00:00:00Z');
 priorDate.setUTCMonth(priorDate.getUTCMonth()-1);
 var prior=priorDate.toISOString().slice(0,7),index=wpMonthIndex_(wsBook_()),targets=['control'];
 [current,prior].forEach(function(m){if(index[m])targets.push(m);});
 // Older months rotate one per day, since historical journals may still be edited.
 var older=Object.keys(index).filter(function(m){return m!==current&&m!==prior;}).sort();
 if(older.length)targets.push(older[Math.floor(Date.parse(day+'T00:00:00Z')/86400000)%older.length]);
 var results=[],failed=false;
 targets.forEach(function(target){
  try{wpBackupWorkbook_({target:target,requestId:'daily-'+day+'-'+target},true);results.push({target:target,ok:true});}
  catch(e){failed=true;results.push({target:target,ok:false,error:String(e.message||e).slice(0,200)});}
 });
 props.setProperty('WORKPULSE_BACKUP_LAST_RUN',JSON.stringify({day:day,completedAt:new Date().toISOString(),ok:!failed,results:results}));
 if(failed)throw Error('部分備份未通過驗證，請查看私人維護控制台及 Apps Script 執行紀錄');
 return {ok:true,results:results};
}


/** Editor-only operational workflow. Both upgraded portals consult shared controller Meta.
 * This is a pause barrier, not a cross-project transaction lock.
 */
function wpSetFieldPause_(pause){
 wpPrimaryOwnerAssert_();var lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  wpPrimaryOwnerAssert_();var control=wsBook_(),sheet=wpSheet_(control,'Meta');
  var row=wpRows_(sheet).find(function(x){return x.key==='fieldWritesPausedAt';});
  var current=wpFieldPause_(control),next=pause?(current||new Date().toISOString()):'';
  if(next!==current){
   if(row)sheet.getRange(row.__row,2,1,1).setValues([[next]]);else sheet.appendRow(['fieldWritesPausedAt',next]);
   wpSheet_(control,'Audit').appendRow([Utilities.getUuid(),new Date().toISOString(),wpConfig_().adminEmail,pause?'maintenance.paused':'maintenance.resumed','fieldWrites',0,'']);
   SpreadsheetApp.flush();
  }
  return {ok:true,pausedAt:next};
 }finally{lock.releaseLock();}
}
function workPulsePauseFieldWrites(){return wpSetFieldPause_(true);}
function workPulseResumeFieldWrites(){return wpSetFieldPause_(false);}

/** Read-only configuration check. Does not create files, grant access, or declare production ready. */
function workPulseDeploymentCheck(){
 var cfg=wpPrimaryOwnerAssert_(),props=PropertiesService.getScriptProperties(),checks=[];
 function check(key,fn){try{var detail=fn();checks.push({key:key,ok:true,detail:String(detail||'通過')});}catch(e){checks.push({key:key,ok:false,detail:String(e.message||e).slice(0,240)});}}
 var control=null,index=null;
 check('domainMode',function(){if(wpFieldMode_()!=='domain')throw Error('正式員工入口建議使用 domain 模式；仍須以實際員工帳號驗證');return '已設定公司網域存取';});
 check('dataFolder',function(){wpBackupAssertPrivate_(wpMonthFolder_(),cfg.adminEmail);return '持有者私人資料夾';});
 check('controller',function(){control=wsBook_();wpBackupAssertPrivate_(DriveApp.getFileById(control.getId()),cfg.adminEmail);return '控制表版本與持有者通過';});
 check('headers',function(){
  if(!control)throw Error('控制表尚未驗證');
  ['Employees','Departments','Projects','Journals','Tasks','Requests','Audit','Reviews','Meta','MonthIndex','AttendanceSettings'].forEach(function(n){
   var s=wpSheet_(control,n);if(JSON.stringify(s.getRange(1,1,1,WP_HEADERS[n].length).getValues()[0])!==JSON.stringify(WP_HEADERS[n]))throw Error(n+' 表頭不符');
  });
  return '控制表表頭符合 schema';
 });
 check('monthIndex',function(){
  if(!control)throw Error('控制表尚未驗證');index=wpMonthIndex_(control);
  var keys=Object.keys(index);if(new Set(Object.values(index)).size!==keys.length)throw Error('多個月份指向同一份試算表');
  if(keys.length>120)throw Error('歷史月份超過單次檢查上限，請分批人工核對');
  keys.forEach(function(m){if(index[m]===cfg.sheetId)throw Error('月份索引指向控制表');});
  return keys.length+' 個月份索引（未逐檔核對）';
 });
 check('backupFolder',function(){
  var id=String(props.getProperty('WORKPULSE_BACKUP_FOLDER_ID')||'').trim();
  if(!id||id===cfg.folderId)throw Error('尚未設定獨立私人備份資料夾');
  wpBackupAssertPrivate_(DriveApp.getFolderById(id),cfg.adminEmail);return '私人備份資料夾權限初步通過';
 });
 check('backupRegistration',function(){
  if(!props.getProperty('WORKPULSE_BACKUP_TRIGGER_UID'))throw Error('尚未登記每日備份觸發器');
  var result=JSON.parse(props.getProperty('WORKPULSE_BACKUP_LAST_RUN')||'null');
  if(!result||!result.ok||!Number.isFinite(Date.parse(result.completedAt))||Date.now()-Date.parse(result.completedAt)>48*3600000)throw Error('未有最近 48 小時成功的備份結果');
  return '最近一次備份有成功紀錄，須核對實際觸發器與副本';
 });
 return {configurationPassed:checks.every(function(x){return x.ok;}),productionVerified:false,checks:checks,pausedAt:control?wpFieldPause_(control):'',checkedAt:new Date().toISOString()};
}
