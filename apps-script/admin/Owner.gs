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
  var preflight=workPulseInitializationCheck();
  if(!preflight.canInitialize)throw Error('初始化已停止：'+preflight.checks.filter(function(c){return c.required&&!c.ok;}).map(function(c){return c.detail;}).join('；'));
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
 var control=wsBook_(),index=wpMonthIndex_(control);
 if(new Set(Object.values(index)).size!==Object.keys(index).length||Object.values(index).indexOf(cfg.sheetId)>=0)throw Error('月份索引異常，停止備份');
 var source=target==='control'?control:wpMonthFile_(control,target,false);
 if(!source)throw Error('沒有該月份資料，不建立空白備份');
 var file=DriveApp.getFileById(source.getId());
 wpBackupAssertPrivate_(file,cfg.adminEmail);
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
  
  keys.forEach(function(m){if(index[m]===cfg.sheetId)throw Error('月份索引指向控制表');});
  return keys.length+' 個月份索引（未逐檔核對）';
 });
 check('backupFolder',function(){
  var id=String(props.getProperty('WORKPULSE_BACKUP_FOLDER_ID')||'').trim();
  if(wpUnified_()&&!id)return '手動備份模式：尚未指定獨立備份資料夾；可由 Drive 手動建立副本，仍須實測';
  if(!id||id===cfg.folderId)throw Error('尚未設定獨立私人備份資料夾');
  wpBackupAssertPrivate_(DriveApp.getFolderById(id),cfg.adminEmail);return '私人備份資料夾權限初步通過';
 });
 check('backupRegistration',function(){
  var uid=String(props.getProperty('WORKPULSE_BACKUP_TRIGGER_UID')||'');if(!uid&&wpUnified_())return '手動備份模式：未啟用自動排程，須人工完成備份與還原驗收';if(!uid)throw Error('尚未登記每日備份觸發器');
  var triggers=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='wpDailyBackup_';});
  if(triggers.length!==1||String(triggers[0].getUniqueId())!==uid)throw Error('實際可見的備份觸發器與登記不符，請至 Apps Script 核對');
  var result=JSON.parse(props.getProperty('WORKPULSE_BACKUP_LAST_RUN')||'null'),age=result?Date.now()-Date.parse(result.completedAt):NaN;
  if(!result||!result.ok||!Number.isFinite(age)||age<0||age>48*3600000)throw Error('未有最近 48 小時成功的備份結果');
  return '觸發器識別及最近一次成功紀錄通過，仍須核對排程時間及實際副本';
 });
 return {readOnly:true,backupMode:wpUnified_()&&!props.getProperty('WORKPULSE_BACKUP_TRIGGER_UID')?'manual':'scheduled',configurationPassed:checks.every(function(x){return x.ok;}),productionVerified:false,checks:checks,pausedAt:control?wpFieldPause_(control):'',checkedAt:new Date().toISOString()};
}


/** Read-only, bounded verification of indexed live monthly workbooks.
 * Run from the private editor. Optional start month via Script Properties for older batches.
 * A successful result is not a restore test or an ACL/atomicity guarantee.
 */
function workPulseVerifyMonthFiles(){
 var cfg=wpPrimaryOwnerAssert_(),control=wsBook_(),index=wpMonthIndex_(control);
 var from=String(PropertiesService.getScriptProperties().getProperty('WORKPULSE_VERIFY_FROM_MONTH')||'').trim();
 if(from)wpMonth_(from);
 var all=Object.keys(index).sort().reverse(),months=all.filter(function(m){return !from||m<=from;}).slice(0,12);
 var expected=['Journals','Tasks','Requests','Audit','Meta','Attendance'];
 var results=months.map(function(month){
  try{
   if(index[month]===cfg.sheetId||all.filter(function(m){return index[m]===index[month];}).length!==1)throw Error('索引指向控制表或重複月份文件');
   wpBackupAssertPrivate_(DriveApp.getFileById(index[month]),cfg.adminEmail);
   var book=wpMonthFile_(control,month,false),sheets=book.getSheets();
   if(sheets.length!==expected.length)throw Error('月份工作表數量不符');
   var counts={};
   expected.forEach(function(name){
    var s=wpSheet_(book,name);
    if(JSON.stringify(s.getRange(1,1,1,WP_HEADERS[name].length).getValues()[0])!==JSON.stringify(WP_HEADERS[name]))throw Error(name+' 表頭不符');
    counts[name]=Math.max(0,s.getLastRow()-1);
   });
   return {month:month,ok:true,counts:counts};
  }catch(e){return {month:month,ok:false,error:String(e.message||e).slice(0,240)};}
 });
 var older=months.length?all.filter(function(m){return m<months[months.length-1];}):[];
 return {readOnly:true,productionVerified:false,checkedAt:new Date().toISOString(),totalIndexed:all.length,checked:results.length,
  ok:results.every(function(x){return x.ok;}),nextFromMonth:older[0]||'',results:results};
}


/** Primary-owner-only migration dry run; accepts record keys, never journal content. */
function wpOwnerMigrationPreflight(input){
 wpPrimaryOwnerAssert_();
 if(!input||typeof input!=='object'||Array.isArray(input)||!Array.isArray(input.keys)||input.keys.length<1||input.keys.length>500)
  throw Error('預檢每次須提供 1 至 500 筆識別資料');
 var month=wpMonth_(input.month),control=wsBook_(),people=new Set(wsPeople_(control,false).map(function(p){return p.id;}));
 var seen=new Set(),keys=input.keys.map(function(k){
  if(!k||Object.keys(k).some(function(n){return ['kind','date','employeeId'].indexOf(n)<0;})||
   ['journal','attendance'].indexOf(k.kind)<0||typeof k.employeeId!=='string'||!people.has(k.employeeId))
   throw Error('預檢只接受有效人員、日期及紀錄類型');
  var date=wpDate_(k.date);if(date.slice(0,7)!==month)throw Error('預檢須為同月份');
  var key=k.kind+'|'+k.employeeId+'|'+date;if(seen.has(key))throw Error('同人同日重複預檢項目');seen.add(key);
  return {kind:k.kind,date:date,employeeId:k.employeeId,key:key};
 });
 var book=wpMonthFile_(control,month,false),active=new Set(),deletedKeys=new Set();
 if(book){
  var deleted=wsDeleted_(book);
  wpRows_(wpSheet_(book,'Journals')).forEach(function(j){
   var key='journal|'+String(j.employeeId)+'|'+String(j.date);
   if(deleted[String(j.journalId)])deletedKeys.add(key);else active.add(key);
  });
  wpRows_(wpSheet_(book,'Attendance')).forEach(function(j){active.add('attendance|'+String(j.employeeId)+'|'+String(j.date));});
 }
 return {readOnly:true,month:month,checkedAt:new Date().toISOString(),results:keys.map(function(k){
  return {kind:k.kind,date:k.date,employeeId:k.employeeId,status:active.has(k.key)?'exists':deletedKeys.has(k.key)?'deleted-history':'not-found'};
 })};
}


/** First-run diagnostic. No spreadsheet, folder, trigger or property is created or modified. */
function workPulseInitializationCheck(){
 var props=PropertiesService.getScriptProperties(),email=String(props.getProperty('WORKPULSE_ADMIN_EMAIL')||'').trim().toLowerCase(),
 domain=String(props.getProperty('WORKPULSE_ALLOWED_DOMAIN')||'').trim().toLowerCase().replace(/^@/,''),
 operator=String(props.getProperty('WORKPULSE_OPERATOR_EMAIL')||'').trim().toLowerCase(),
 active=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase(),effective=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
 if(!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)||! /^[^\s@]+@[^\s@]+$/.test(email)||!email.endsWith('@'+domain)||active!==email||effective!==email)
  throw Error('請先設定有效公司網域與管理員，並使用指定資料持有帳號執行');
 var checks=[],folderId=String(props.getProperty('WORKPULSE_FOLDER_ID')||'').trim(),sheetId=String(props.getProperty('WORKPULSE_SHEET_ID')||'').trim(),
 backupId=String(props.getProperty('WORKPULSE_BACKUP_FOLDER_ID')||'').trim(),scope=String(props.getProperty('WORKPULSE_OFFLINE_SCOPE')||'');
 function check(key,required,fn){try{checks.push({key:key,required:required,ok:true,detail:fn()});}catch(e){checks.push({key:key,required:required,ok:false,detail:String(e.message||e).slice(0,240)});}}
 check('operator',true,function(){if(wpUnified_()&&operator)throw Error('單一入口僅主資料持有者管理，請勿設定 WORKPULSE_OPERATOR_EMAIL');if(operator&&(!/^[^\s@]+@[^\s@]+$/.test(operator)||!operator.endsWith('@'+domain)))throw Error('維護帳號須屬公司網域');return operator?'已設定維護帳號':'未設定選用維護帳號';});
 check('accessMode',true,function(){wpFieldMode_();return '存取模式格式有效';});
 check('domainMode',false,function(){if(wpFieldMode_()!=='domain')throw Error('正式部署前須設定 domain 並驗證登入');return '已設定 domain，仍須實際驗證';});
 check('dataFolder',true,function(){if(!folderId)return '尚未設定，初始化將建立新資料夾';wpBackupAssertPrivate_(DriveApp.getFolderById(folderId),email);return '既有資料夾持有者與私人權限初步通過';});
 check('control',true,function(){
  if(!sheetId)return '尚未設定，初始化將建立新控制表';
  wpBackupAssertPrivate_(DriveApp.getFileById(sheetId),email);
  var book=SpreadsheetApp.openById(sheetId),allowed=['Employees','Departments','Projects','Journals','Tasks','Requests','Audit','Reviews','Meta','MonthIndex','AttendanceSettings'];
  book.getSheets().forEach(function(s){
   var name=s.getName();if(!s.getLastRow())return;
   if(allowed.indexOf(name)<0)throw Error('控制表含非預期且非空白分頁：'+name);
   if(JSON.stringify(s.getRange(1,1,1,WP_HEADERS[name].length).getValues()[0])!==JSON.stringify(WP_HEADERS[name]))throw Error(name+' 表頭不符，初始化前請先備份及核對');
  });
  var meta=book.getSheetByName('Meta'),rows=meta&&meta.getLastRow()?wpRows_(meta):[];
  var schema=rows.filter(function(x){return x.key==='schemaVersion';}),enabled=rows.filter(function(x){return x.key==='monthlyStorage';});
  if(schema.length>1||enabled.length>1||schema.length&&String(schema[0].value)!=='4')throw Error('控制表版本或 Meta 設定不相容');
  var journals=book.getSheetByName('Journals');
  if(journals&&journals.getLastRow()>1&&!(enabled.length&&enabled[0].value==='enabled'))throw Error('控制表已有舊日誌，須先備份並依舊資料遷移程序處理');
  return '既有控制表權限及非空白分頁結構初步通過';
 });
 check('backupFolder',!!backupId,function(){
  if(!backupId)throw Error('尚未設定獨立私人備份資料夾；正式上線前必須完成');
  if(backupId===folderId)throw Error('備份與日常資料夾不可相同');
  wpBackupAssertPrivate_(DriveApp.getFolderById(backupId),email);return '備份資料夾權限初步通過';
 });
 check('offlineScope',true,function(){if(scope&&!/^[A-Za-z0-9_-]{16,80}$/.test(scope))throw Error('離線範圍必須為 16–80 位英數、底線或連字號');return scope?'已設定，須確認與其他環境不同':'未啟用選用持久暫存範圍';});
 return {readOnly:true,canInitialize:checks.every(function(x){return !x.required||x.ok;}),productionVerified:false,checks:checks,checkedAt:new Date().toISOString()};
}


/** Read-only, one indexed month, owner only. No record content or identifiers in result. */
function wpOwnerMonthIntegrity(input){
 var cfg=wpPrimaryOwnerAssert_(),month=wpMonth_(input&&input.month),control=wsBook_(),index=wpMonthIndex_(control);
 var id=index[month],checkedAt=new Date().toISOString();
 if(!id)return {readOnly:true,productionVerified:false,month:month,status:'not-found',checkedAt:checkedAt,counts:{},issues:[]};
 if(id===cfg.sheetId||Object.values(index).filter(function(x){return x===id;}).length!==1)throw Error('月份索引異常，停止檢查');
 wpBackupAssertPrivate_(DriveApp.getFileById(id),cfg.adminEmail);
 var book=wpMonthFile_(control,month,false),names=['Journals','Tasks','Requests','Audit','Meta','Attendance'],data={},cells=0;
 if(book.getSheets().length!==names.length)throw Error('月份工作表數量不符');
 names.forEach(function(n){var s=wpSheet_(book,n),headers=WP_HEADERS[n],rows=s.getLastRow();
  cells+=rows*headers.length;if(cells>250000)throw Error('本月超過 250000 儲存格核對上限，須人工檢查');
  if(JSON.stringify(s.getRange(1,1,1,headers.length).getValues()[0])!==JSON.stringify(headers))throw Error(n+' 表頭不符');
  data[n]=wpRows_(s);
 });
 var people=new Set(wpRows_(wpSheet_(control,'Employees')).map(function(x){return String(x.employeeId);}));
 var issues=new Map(),journals=new Map(),attendance=new Map(),active=new Set(),attKeys=new Set(),tasks=new Map(),requests=new Map(),deleted=new Set();
 function issue(code,sheet,row){var a=issues.get(code);if(!a){a={code:code,count:0,examples:[]};issues.set(code,a);}a.count++;if(a.examples.length<5)a.examples.push({sheet:sheet,row:row});}
 function rev(x){var n=Number(x);return Number.isSafeInteger(n)&&n>=1?n:0;}
 function validDate(x){try{return wpDate_(x).slice(0,7)===month;}catch(e){return false;}}
 function key(a,b){return JSON.stringify([String(a),String(b)]);}
 data.Audit.forEach(function(x){if(x.action==='journal.deleted')deleted.add(String(x.journalId));});
 function addRecords(rows,map,idKey,keys,sheet,isJournal){
  rows.forEach(function(x){
   var id=String(x[idKey]||''),r=rev(x.revision),person=String(x.employeeId||''),k=key(person,x.date);
   if(!id||map.has(id))issue('record-id',sheet,x.__row);else map.set(id,x);
   if(!r)issue('record-revision',sheet,x.__row);
   if(!validDate(x.date))issue('record-date',sheet,x.__row);
   if(!people.has(person))issue('unknown-employee',sheet,x.__row);
   if(!isJournal||!deleted.has(id)){if(keys.has(k))issue('duplicate-person-date',sheet,x.__row);keys.add(k);}
  });
 }
 addRecords(data.Journals,journals,'journalId',active,'Journals',true);
 addRecords(data.Attendance,attendance,'attendanceId',attKeys,'Attendance',false);
 data.Tasks.forEach(function(x){
  var j=journals.get(String(x.journalId)),r=rev(x.revision),position=Number(x.position),k=key(x.journalId,r);
  if(!j||!r||r>rev(j.revision)){issue('task-reference','Tasks',x.__row);return;}
  var g=tasks.get(k);if(!g){g=new Set();tasks.set(k,g);}
  if(x.position===''||!Number.isInteger(position)||position<0||position>=100||g.has(position))issue('task-position','Tasks',x.__row);
  else g.add(position);
 });
 data.Journals.forEach(function(j){
  var g=tasks.get(key(j.journalId,rev(j.revision)));
  if(!g||!g.size||Array.from(g).some(function(n){return n>=g.size;}))issue('current-tasks','Journals',j.__row);
 });
 data.Requests.forEach(function(x){
  var id=String(x.requestId||''),actor=String(x.actorEmail||''),isAttendance=actor.indexOf('attendance:')===0,
   target=(isAttendance?attendance:journals).get(String(x.journalId));
  if(!id||requests.has(id))issue('request-id','Requests',x.__row);else requests.set(id,x);
  if(!target||!rev(x.revision)||rev(x.revision)>rev(target.revision)||actor!==(isAttendance?'attendance:':'selected:')+String(target.employeeId))issue('request-reference','Requests',x.__row);
 });
 function latest(rows,idKey,prefix,sheet){
  rows.forEach(function(x){
   var request=requests.get(String(x.requestId||''));
   if(!request||String(request.journalId)!==String(x[idKey])||rev(request.revision)!==rev(x.revision)||String(request.actorEmail)!==prefix+String(x.employeeId))issue('current-request',sheet,x.__row);
  });
 }
 latest(data.Journals,'journalId','selected:','Journals');latest(data.Attendance,'attendanceId','attendance:','Attendance');
 data.Audit.forEach(function(x){if(x.action==='journal.deleted'&&!journals.has(String(x.journalId)))issue('deleted-reference','Audit',x.__row);});
 var counts={journals:data.Journals.length,deletedJournals:data.Journals.filter(function(x){return deleted.has(String(x.journalId));}).length,tasks:data.Tasks.length,attendance:data.Attendance.length,requests:data.Requests.length,audit:data.Audit.length};
 return {readOnly:true,productionVerified:false,month:month,status:issues.size?'issues':'passed',checkedAt:checkedAt,counts:counts,issues:Array.from(issues.values())};
}

/** Editor-only workflow: compare two private, non-live monthly files selected by owner.
 * Never remaps MonthIndex, never opens a restore target for writes. */
function workPulseCompareRestoredMonth(){
 wpPrimaryOwnerAssert_();var props=PropertiesService.getScriptProperties();
 return wpOwnerCompareBackupCopies({month:props.getProperty('WORKPULSE_RESTORE_VERIFY_MONTH'),sourceId:props.getProperty('WORKPULSE_RESTORE_SOURCE_ID'),copyId:props.getProperty('WORKPULSE_RESTORE_COPY_ID')});
}
function wpOwnerCompareBackupCopies(input){
 var cfg=wpPrimaryOwnerAssert_(),control=wsBook_(),index=wpMonthIndex_(control);
 var month=wpMonth_(input&&input.month),a=String(input&&input.sourceId||'').trim(),b=String(input&&input.copyId||'').trim();
 var live=new Set([cfg.sheetId].concat(Object.values(index)));
 if(!a||!b||a===b||live.has(a)||live.has(b))throw Error('須指定兩份不同且不在正式索引中的私人月檔');
 function open(id){
  wpBackupAssertPrivate_(DriveApp.getFileById(id),cfg.adminEmail);
  var book=SpreadsheetApp.openById(id),names=['Journals','Tasks','Requests','Audit','Meta','Attendance'];
  if(book.getSheets().length!==names.length)throw Error('復原月檔分頁數量不符');
  names.forEach(function(n){var s=wpSheet_(book,n),h=WP_HEADERS[n];if(JSON.stringify(s.getRange(1,1,1,h.length).getValues()[0])!==JSON.stringify(h))throw Error('復原月檔表頭不符：'+n);});
  var meta=wpRows_(wpSheet_(book,'Meta'));
  if(meta.filter(function(x){return x.key==='month'&&String(x.value)===month;}).length!==1||meta.filter(function(x){return x.key==='schemaVersion'&&String(x.value)==='month-1';}).length!==1)throw Error('指定月份或版本不符');
  return book;
 }
 var source=open(a),copy=open(b),before=wpBackupContent_(source),actual=wpBackupContent_(copy),stable=before===wpBackupContent_(source)&&actual===wpBackupContent_(copy);
 return {readOnly:true,productionVerified:false,month:month,checkedAt:new Date().toISOString(),valuesMatch:stable&&before===actual,stableDuringCheck:stable,sourceRows:wpBackupShape_(source),copyRows:wpBackupShape_(copy)};
}


/** Primary-owner only; list known targets, never creates a month or backup. */
function wpOwnerBackupPlan(){
 var cfg=wpPrimaryOwnerAssert_(),control=wsBook_(),index=wpMonthIndex_(control),
 id=String(PropertiesService.getScriptProperties().getProperty('WORKPULSE_BACKUP_FOLDER_ID')||'').trim();
 var months=Object.keys(index).sort();
 if(new Set(Object.values(index)).size!==months.length||months.some(function(m){return index[m]===cfg.sheetId;}))throw Error('月份索引異常，停止備份');
 if(id){if(id===cfg.folderId)throw Error('備份與日常資料夾不可相同');wpBackupAssertPrivate_(DriveApp.getFolderById(id),cfg.adminEmail);}
 return {readOnly:true,folderConfigured:!!id,targets:['control'].concat(months),pausedAt:wpFieldPause_(control),checkedAt:new Date().toISOString()};
}
/** Explicit owner action, idempotent when already configured. No sharing changes. */
function wpOwnerPrepareBackupFolder(){
 var cfg=wpPrimaryOwnerAssert_(),props=PropertiesService.getScriptProperties(),lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  var id=String(props.getProperty('WORKPULSE_BACKUP_FOLDER_ID')||'').trim(),folder,created=false;
  if(id){if(id===cfg.folderId)throw Error('備份與日常資料夾不可相同');folder=DriveApp.getFolderById(id);}
  else{folder=DriveApp.createFolder('WorkPulse_Backups');created=true;}
  wpBackupAssertPrivate_(folder,cfg.adminEmail);
  if(created)props.setProperty('WORKPULSE_BACKUP_FOLDER_ID',folder.getId());
  return {ok:true,created:created,folderConfigured:true};
 }finally{lock.releaseLock();}
}
/** Portable read-only values export; not an importable full-fidelity backup. */
function wpOwnerExportBackupJson(input){
 var cfg=wpPrimaryOwnerAssert_(),target=input&&input.target==='control'?'control':wpMonth_(input&&input.target),lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  var control=wsBook_(),index=wpMonthIndex_(control);
  if(new Set(Object.values(index)).size!==Object.keys(index).length||Object.values(index).indexOf(cfg.sheetId)>=0)throw Error('月份索引異常');
  var book=target==='control'?control:wpMonthFile_(control,target,false);
  if(!book)throw Error('該月沒有資料');
  wpBackupAssertPrivate_(DriveApp.getFileById(book.getId()),cfg.adminEmail);
  var parts=JSON.parse(wpBackupContent_(book)),redacted=0;
  var sheets=parts.map(function(p){
   var headers=WP_HEADERS[p[0]],rows=p[2];
   if(!rows.length||JSON.stringify(rows[0])!==JSON.stringify(headers))throw Error('資料表表頭不符：'+p[0]);
   var safe=rows.slice(1).map(function(row){return row.map(function(value,i){
    if(['monthlyWage','overtimePay'].indexOf(headers[i])>=0){if(value!==''&&value!=null)redacted++;return '';}
    // Dates become ISO strings through JSON serialization; preserve other scalar values.
    return value;
   });});
   return {name:p[0],headers:headers.slice(),rows:safe};
  });
  var out={format:'workpulse-values-v1',readOnly:true,restoreSupported:false,target:target,generatedAt:new Date().toISOString(),redactedSalaryCells:redacted,sheets:sheets};
  if(JSON.stringify(out).length>1500000)throw Error('JSON 資料量超過 150 萬字元，請使用 Drive 原始副本');
  return out;
 }finally{lock.releaseLock();}
}
