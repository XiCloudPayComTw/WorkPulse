/** Private company-owner project master data, never included in the public Apps Script deployment. */
function wsProjects_(book,includeInactive){
 return wpRows_(wpSheet_(book,'Projects')).filter(function(row){
  return includeInactive||wpActive_(row.active);
 }).map(function(row){return {
  id:String(row.projectId),name:wpPlainText_(row.name),
  active:wpActive_(row.active),revision:Number(row.revision)||0
 };});
}
function wpOwnerSaveProject(input){
 wsRequireOwner_();
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('專案資料格式無效');
 var name=wpText_(input.name,100),id=String(input.id||''),
  requestId=String(input.requestId||''),expected=Number(input.expectedRevision);
 if(!name||!/^[a-zA-Z0-9_-]{12,120}$/.test(requestId)||
    !Number.isSafeInteger(expected)||expected<0||
    typeof input.active!=='boolean'||(id&&!/^[a-zA-Z0-9_-]{1,120}$/.test(id)))
   throw Error('專案資料或版本無效');
 var lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  wsRequireOwner_();
  var book=wsBook_(),sheet=wpSheet_(book,'Projects'),rows=wpRows_(sheet);
  var history=wpRows_(wpSheet_(book,'Audit')).find(function(row){
   return row.action==='project.saved'&&String(row.requestId)===requestId;
  });
  if(history){
   if(id&&String(history.journalId)!=='project:'+id)throw Error('請求識別碼重複使用');
   return {ok:true,deduplicated:true,projects:wsProjects_(book,true)};
  }
  var existing=rows.find(function(row){return String(row.projectId)===id;});
  if(id&&!existing)throw Error('專案不存在');
  var nameKey=wpPlainText_(name).toLocaleLowerCase();
  if(rows.some(function(row){
    return String(row.projectId)!==id&&wpActive_(row.active)&&
     wpPlainText_(row.name).toLocaleLowerCase()===nameKey;
  }))throw Error('專案名稱重複');
  var revision=existing?Number(existing.revision)||0:0;
  if(revision!==expected)throw Error('CONFLICT:專案資料已更新，請重新整理');
  if(existing&&wpActive_(existing.active)&&!input.active&&
    rows.filter(function(row){return wpActive_(row.active);}).length<=1)
   throw Error('至少保留一個可選專案');
  var nextId=existing?id:Utilities.getUuid(),now=new Date().toISOString();
  var data=[nextId,name,input.active,revision+1,now,wpConfig_().adminEmail];
  if(existing)sheet.getRange(existing.__row,1,1,data.length).setValues([data]);
  else sheet.appendRow(data);
  wpSheet_(book,'Audit').appendRow([Utilities.getUuid(),now,wpConfig_().adminEmail,
    'project.saved','project:'+nextId,revision+1,requestId]);
  SpreadsheetApp.flush();
  return {ok:true,deduplicated:false,projects:wsProjects_(book,true)};
 }finally{lock.releaseLock();}
}
