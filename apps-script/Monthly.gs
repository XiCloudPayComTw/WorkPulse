/**
 * WorkPulse v0.8 — monthly Google Sheets storage.
 * A private control workbook stores employee roster, project options and MonthIndex.
 * Each YYYY-MM lives in a separate native Google spreadsheet owned by the administrator.
 * All creation / migration functions run ONLY in the private owner Apps Script project.
 */
function wpController_(){
  var book=SpreadsheetApp.openById(wpConfig_().sheetId);
  var meta=wpRows_(wpSheet_(book,'Meta'));
  if(!meta.some(function(r){return r.key==='schemaVersion'&&String(r.value)==='4';}))
    throw Error('控制試算表尚未初始化為 v4');
  if(!meta.some(function(r){return r.key==='monthlyStorage'&&String(r.value)==='enabled';}))
    throw Error('尚未啟用分月儲存；請先在管理員入口執行初始化或備份遷移');
  wpSheet_(book,'MonthIndex');
  return book;
}
function wpMonthIndex_(control){
  var rows=wpRows_(wpSheet_(control,'MonthIndex')),found={};
  rows.forEach(function(row){
    var m=wpMonth_(row.month),id=String(row.spreadsheetId||'');
    if(found[m]||!id)throw Error('月份索引有重複或空白 ID：'+m);
    found[m]=id;
  });
  return found;
}
function wpMonthFolder_(){
  var cfg=wpConfig_();
  if(!cfg.folderId)throw Error('未設定 WORKPULSE_FOLDER_ID；請由管理員執行初始化');
  var folder=DriveApp.getFolderById(cfg.folderId);
  if(String(folder.getOwner().getEmail()||'').toLowerCase()!==cfg.adminEmail)
    throw Error('WorkPulse 資料夾不屬於指定公司管理者帳號');
  return folder;
}
function wpInitializeSheet_(book,name){
  var headers=WP_HEADERS[name],sheet=book.getSheetByName(name);
  if(!headers)throw Error('未知分頁 '+name);
  if(!sheet){
    var existing=book.getSheets();
    if(existing.length===1&&existing[0].getLastRow()===0&&
        !Object.keys(WP_HEADERS).some(function(k){return k===existing[0].getName();})){
      sheet=existing[0];sheet.setName(name);
    }else sheet=book.insertSheet(name);
  }
  if(sheet.getLastRow()===0){
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,headers.length).setFontWeight('bold');
  }else{
    var actual=sheet.getRange(1,1,1,headers.length).getValues()[0];
    if(JSON.stringify(actual)!==JSON.stringify(headers))
      throw Error(name+' 表頭不符合預期，為避免覆寫已停止操作');
  }
  sheet.getRange(1,1,sheet.getMaxRows(),headers.length).setNumberFormat('@');
  return sheet;
}
function wpInitializeMonth_(book,month){
  var m=wpMonth_(month);
  ['Journals','Tasks','Requests','Audit','Meta'].forEach(function(n){wpInitializeSheet_(book,n);});
  var meta=wpSheet_(book,'Meta'),items=wpRows_(meta);
  var version=items.find(function(r){return r.key==='schemaVersion';});
  var tagged=items.find(function(r){return r.key==='month';});
  if(version&&String(version.value)!=='month-1')throw Error('月份文件版本不相容');
  if(tagged&&String(tagged.value)!==m)throw Error('月份文件標籤與索引不一致');
  if(!version)meta.appendRow(['schemaVersion','month-1']);
  if(!tagged)meta.appendRow(['month',m]);
  return book;
}
function wpMonthFile_(control,month,create){
  var m=wpMonth_(month),found=wpMonthIndex_(control),id=found[m];
  if(id){
    var book=SpreadsheetApp.openById(id);
    var meta=wpRows_(wpSheet_(book,'Meta'));
    if(!meta.some(function(r){return r.key==='schemaVersion'&&String(r.value)==='month-1';})||
       !meta.some(function(r){return r.key==='month'&&String(r.value)===m;}))
      throw Error('月份文件內容與索引不符：'+m);
    return book;
  }
  if(!create)return null;
  // All create calls must hold LockService.getScriptLock().
  var folder=wpMonthFolder_(),title='WorkPulse_'+m,matching=folder.getFilesByName(title);
  var files=[];while(matching.hasNext())files.push(matching.next());
  if(files.length>1)throw Error('資料夾存在多份未索引的同月文件，請先人工確認：'+m);
  var file,book;
  if(files.length===1){
    file=files[0];
    if(String(file.getOwner().getEmail()||'').toLowerCase()!==wpConfig_().adminEmail)
      throw Error('發現非公司管理者持有的同名月份文件');
    book=SpreadsheetApp.openById(file.getId());
  }else{
    book=SpreadsheetApp.create(title);
    file=DriveApp.getFileById(book.getId());
    if(String(file.getOwner().getEmail()||'').toLowerCase()!==wpConfig_().adminEmail)
      throw Error('新建試算表不屬於指定公司管理者帳號');
    file.moveTo(folder);
  }
  wpInitializeMonth_(book,m);
  wpSheet_(control,'MonthIndex').appendRow([m,book.getId(),new Date().toISOString()]);
  SpreadsheetApp.flush();
  return book;
}
function wpMonthRange_(start,end){
  var a=wpDate_(start),b=wpDate_(end);
  var months=[],current=new Date(a.slice(0,7)+'-01T00:00:00Z');
  var last=b.slice(0,7);
  for(var i=0;i<13;i++){
    var m=current.toISOString().slice(0,7);
    if(m>last)break;
    months.push(m);
    current.setUTCMonth(current.getUTCMonth()+1);
  }
  if(months.length===13&&months[12]<last)throw Error('查詢日期跨度過長');
  return months;
}
function wpEnsureControllerSheets_(control){
  ['Employees','Departments','Projects','Journals','Tasks','Requests','Audit','Reviews','Meta','MonthIndex']
    .forEach(function(name){
      // Old version Review data is retained for historical audit only.
      if(!WP_HEADERS[name]){
        WP_HEADERS[name]=['reviewId','journalId','journalRevision','status','actorEmail','comment','requestId','createdAt'];
      }
      wpInitializeSheet_(control,name);
    });
}
function wpEnableMonthly_(control){
  var meta=wpSheet_(control,'Meta'),rows=wpRows_(meta);
  var old=rows.find(function(r){return r.key==='monthlyStorage';});
  if(old)meta.getRange(old.__row,2).setValues([['enabled']]);
  else meta.appendRow(['monthlyStorage','enabled']);
  SpreadsheetApp.flush();
}
function wpPrivateSetupMonthly_(){
  var cfg=wpOwnerAssert_(),lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    var control=SpreadsheetApp.openById(cfg.sheetId);
    var owner=DriveApp.getFileById(cfg.sheetId).getOwner().getEmail();
    if(String(owner||'').toLowerCase()!==cfg.adminEmail)
      throw Error('控制試算表的擁有者不是公司管理者');
    wpEnsureControllerSheets_(control);
    var meta=wpSheet_(control,'Meta'),rows=wpRows_(meta);
    var schema=rows.find(function(r){return r.key==='schemaVersion';});
    if(schema&&String(schema.value)!=='4')throw Error('控制表版本不相容');
    if(!schema)meta.appendRow(['schemaVersion','4']);
    var props=PropertiesService.getScriptProperties();
    if(!cfg.folderId){
      var folder=DriveApp.createFolder('WorkPulse');
      if(String(folder.getOwner().getEmail()).toLowerCase()!==cfg.adminEmail)
        throw Error('無法確認公司雲端資料夾擁有者');
      props.setProperty('WORKPULSE_FOLDER_ID',folder.getId());
    }
    wpMonthFolder_();
    var employees=wpSheet_(control,'Employees');
    if(!wpRows_(employees).some(function(e){return String(e.email).toLowerCase()===cfg.adminEmail;}))
      employees.appendRow(['admin-'+Utilities.getUuid(),cfg.adminEmail,'系統管理員','admin','',true,1,new Date().toISOString(),cfg.adminEmail]);
    if(!wpRows_(wpSheet_(control,'Projects')).length)
      wpSheet_(control,'Projects').appendRow([Utilities.getUuid(),'一般專案',true,1,new Date().toISOString(),cfg.adminEmail]);
    if(wpRows_(wpSheet_(control,'Journals')).length>0 &&
       !wpRows_(meta).some(function(e){return e.key==='monthlyStorage'&&e.value==='enabled';}))
      throw Error('控制表已有舊工作日誌！請先備份，並使用 wpPrivateMigrateLegacyMonthly_() 遷移。');
    wpEnableMonthly_(control);
    return {ok:true,folderId:PropertiesService.getScriptProperties().getProperty('WORKPULSE_FOLDER_ID'),
      controlId:control.getId()};
  }finally{lock.releaseLock();}
}
function wpCopyLegacy_(source,target,name,records){
  var sheet=wpSheet_(target,name),headers=WP_HEADERS[name],idKey=headers[0];
  var known={};wpRows_(sheet).forEach(function(row){known[String(row[idKey])]=true;});
  records.forEach(function(row){
    var id=String(row[idKey]);
    if(!id||known[id])return;
    sheet.appendRow(headers.map(function(h){return row[h];}));
    known[id]=true;
  });
}
function wpPrivateMigrateLegacyMonthly_(){
  wpOwnerAssert_();
  var backupId=String(PropertiesService.getScriptProperties().getProperty('WORKPULSE_BACKUP_SHEET_ID')||'');
  var cfg=wpConfig_();
  if(!backupId||backupId===cfg.sheetId)throw Error('請先備份並設定不同的 WORKPULSE_BACKUP_SHEET_ID');
  var backup=SpreadsheetApp.openById(backupId);
  if(!backup.getSheetByName('Journals'))throw Error('備份不是有效的舊工作日誌');
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    var control=SpreadsheetApp.openById(cfg.sheetId);
    wpEnsureControllerSheets_(control);
    if(wpRows_(wpSheet_(control,'Meta')).some(function(r){return r.key==='monthlyStorage'&&r.value==='enabled';}))
      return {ok:true,alreadyMigrated:true};
    wpMonthFolder_();
    var journals=wpRows_(wpSheet_(control,'Journals'));
    var tasks=wpRows_(wpSheet_(control,'Tasks'));
    var requests=wpRows_(wpSheet_(control,'Requests'));
    var audit=wpRows_(wpSheet_(control,'Audit'));
    var groups={};
    journals.forEach(function(row){
      var m=wpDate_(row.date).slice(0,7);
      if(!groups[m])groups[m]={journals:[],ids:{}};
      groups[m].journals.push(row);groups[m].ids[String(row.journalId)]=true;
    });
    Object.keys(groups).sort().forEach(function(m){
      var target=wpMonthFile_(control,m,true),group=groups[m];
      wpCopyLegacy_(control,target,'Journals',group.journals);
      wpCopyLegacy_(control,target,'Tasks',tasks.filter(function(row){return !!group.ids[String(row.journalId)];}));
      wpCopyLegacy_(control,target,'Requests',requests.filter(function(row){return !!group.ids[String(row.journalId)];}));
      wpCopyLegacy_(control,target,'Audit',audit.filter(function(row){return !!group.ids[String(row.journalId)];}));
    });
    SpreadsheetApp.flush();
    // Legacy data is deliberately retained in the control workbook as an archive.
    wpEnableMonthly_(control);
    return {ok:true,months:Object.keys(groups).sort(),legacyJournals:journals.length};
  }finally{lock.releaseLock();}
}
