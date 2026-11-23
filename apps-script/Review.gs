/**
 * WorkPulse v0.6.0 — review workflow. Server-side authorization is mandatory.
 * This file runs inside the same Apps Script project as Code.gs.
 */
function wpReviewConfig_(book) {
  var meta=wpRows_(wpSheet_(book,'Meta'));
  var flag=meta.find(function(r){return r.key==='reviewEnabled';});
  var revision=meta.find(function(r){return r.key==='reviewSettingsRevision';});
  return {enabled:!!flag && String(flag.value).toLowerCase()==='true',revision:revision?Number(revision.value)||1:1};
}
function wpReviewEvents_(book) {
  return wpRows_(wpSheet_(book,'Reviews'));
}
function wpReviewMap_(book) {
  var result={};
  wpReviewEvents_(book).forEach(function(row){result[String(row.journalId)]=row;});
  return result;
}
function wpReviewPublic_(row) {
  if(!row)return {status:'draft',revision:0,actorEmail:'',comment:'',updatedAt:''};
  return {status:String(row.status),revision:Number(row.journalRevision)||0,actorEmail:String(row.actorEmail),
    comment:wpPlainText_(row.comment),updatedAt:String(row.createdAt)};
}
function wpReviewStatus_(book,journalId) {
  var latest=wpReviewMap_(book)[String(journalId)];
  return latest?String(latest.status):'draft';
}
function wpReviewRequest_(payload) {
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('審核資料格式錯誤');
  var id=String(payload.journalId||'').trim();
  var requestId=String(payload.requestId||'').trim();
  var revision=Number(payload.expectedRevision);
  if(!/^[a-zA-Z0-9-]{1,120}$/.test(id))throw Error('日誌識別碼無效');
  if(!/^[a-zA-Z0-9-]{12,120}$/.test(requestId))throw Error('請求識別碼無效');
  if(!Number.isSafeInteger(revision)||revision<=0)throw Error('日誌版本無效');
  return {journalId:id,requestId:requestId,expectedRevision:revision};
}
function wpReviewTarget_(ctx,id) {
  var record=wpRows_(wpSheet_(ctx.book,'Journals')).find(function(j){return String(j.journalId)===id;});
  if(!record)throw Error('找不到指定的日誌');
  var target=ctx.visible.find(function(e){return e.employeeId===record.employeeId;});
  if(!target)throw Error('沒有權限查看此日誌');
  return {journal:record,target:target};
}
function wpReviewDuplicate_(ctx,input,desired) {
  var event=wpReviewEvents_(ctx.book).find(function(r){return r.requestId===input.requestId && r.actorEmail===ctx.actor.email;});
  if(!event)return null;
  if(String(event.journalId)!==input.journalId||String(event.status)!==desired)
    throw Error('請求識別碼已用於另一項操作');
  return {ok:true,deduplicated:true,review:wpReviewPublic_(event)};
}
function wpReviewWrite_(ctx,journal,status,comment,requestId) {
  var now=new Date().toISOString(),revision=Number(journal.revision);
  var row=[Utilities.getUuid(),journal.journalId,revision,status,ctx.actor.email,comment,requestId,now];
  wpSheet_(ctx.book,'Reviews').appendRow(row);
  wpSheet_(ctx.book,'Audit').appendRow([Utilities.getUuid(),now,ctx.actor.email,'review.'+status,journal.journalId,revision,requestId]);
  SpreadsheetApp.flush();
  return wpReviewPublic_({status:status,journalRevision:revision,actorEmail:ctx.actor.email,comment:comment,createdAt:now});
}
/** Owner submits a saved, current journal revision for review. */
function wpReviewSubmit(payload) {
  var input=wpReviewRequest_(payload);
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    var ctx=wpContext_();
    if(!wpReviewConfig_(ctx.book).enabled)throw Error('公司尚未啟用主管審核');
    var duplicate=wpReviewDuplicate_(ctx,input,'submitted');if(duplicate)return duplicate;
    var target=wpReviewTarget_(ctx,input.journalId),j=target.journal;
    if(ctx.actor.employeeId!==j.employeeId||!target.target.active)throw Error('只有日誌本人能提交審核');
    if(Number(j.revision)!==input.expectedRevision)throw Error('CONFLICT:日誌版本已更新，請重新載入');
    var last=wpReviewStatus_(ctx.book,j.journalId);
    if(['submitted','approved'].indexOf(last)>=0)throw Error('日誌已送審或通過，不能重複提交');
    return {ok:true,deduplicated:false,review:wpReviewWrite_(ctx,j,'submitted','',input.requestId),
      journal:wpFindRecord_(ctx,j)};
  } finally {lock.releaseLock();}
}
/** Manager: members in same department. Admin: everyone except self. */
function wpReviewDecision(payload) {
  var input=wpReviewRequest_(payload);
  var decision=String(payload.decision||'');
  if(['approved','returned'].indexOf(decision)<0)throw Error('無效的審核動作');
  var reason=wpText_(payload.reason,500);
  if(decision==='returned'&&reason.replace(/^'/,'').trim().length<3)throw Error('退回時請填寫至少 3 個字元的原因');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    var ctx=wpContext_();
    if(!wpReviewConfig_(ctx.book).enabled)throw Error('公司尚未啟用主管審核');
    var duplicate=wpReviewDuplicate_(ctx,input,decision);if(duplicate)return duplicate;
    var target=wpReviewTarget_(ctx,input.journalId),j=target.journal;
    if(['manager','admin'].indexOf(ctx.actor.role)<0 || j.employeeId===ctx.actor.employeeId ||
       !target.target.active)throw Error('無權審核自己或其他未授權員工的日誌');
    if(Number(j.revision)!==input.expectedRevision)throw Error('CONFLICT:日誌版本已變更，請重新整理');
    var last=wpReviewMap_(ctx.book)[j.journalId];
    if(!last||last.status!=='submitted'||Number(last.journalRevision)!==Number(j.revision))
      throw Error('此日誌並非最新待審核版本');
    return {ok:true,deduplicated:false,review:wpReviewWrite_(ctx,j,decision,reason,input.requestId),
      journal:wpFindRecord_(ctx,j)};
  }finally{lock.releaseLock();}
}
function wpReviewQueue(month) {
  var ctx=wpContext_(),m=wpMonth_(month);
  var config=wpReviewConfig_(ctx.book);
  if(['manager','admin'].indexOf(ctx.actor.role)<0)throw Error('只有主管或管理員能查看待審核清單');
  var records=wpMonthRecords_(ctx,m).filter(function(j){
    return j.employeeId!==ctx.actor.employeeId&&j.review.status==='submitted';
  });
  return {month:m,enabled:config.enabled,records:records,count:records.length};
}
function wpReviewHistory(journalId) {
  var ctx=wpContext_();
  var id=String(journalId||'').trim();
  var target=wpReviewTarget_(ctx,id);
  return {journalId:id,events:wpReviewEvents_(ctx.book).filter(function(e){return String(e.journalId)===id;})
     .map(wpReviewPublic_),revision:Number(target.journal.revision)};
}
function wpReviewSetEnabled(payload) {
  if(!payload||typeof payload!=='object'||typeof payload.enabled!=='boolean')throw Error('設定格式無效');
  var input=String(payload.requestId||'');
  var revision=Number(payload.expectedRevision);
  if(!/^[a-zA-Z0-9-]{12,120}$/.test(input)||!Number.isSafeInteger(revision)||revision<1)
    throw Error('設定請求或版本錯誤');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    var ctx=wpContext_();if(ctx.actor.role!=='admin')throw Error('只有管理員可修改審核設定');
    var history=wpRows_(wpSheet_(ctx.book,'Audit')).find(function(r){
      return r.actorEmail===ctx.actor.email&&r.requestId===input&&r.action==='review.setting';
    });
    if(history)return {ok:true,deduplicated:true,config:wpReviewConfig_(ctx.book)};
    var config=wpReviewConfig_(ctx.book);
    if(config.revision!==revision)throw Error('CONFLICT:設定已由其他管理員修改，請重新整理');
    if(!payload.enabled){
      var map=wpReviewMap_(ctx.book);
      if(Object.keys(map).some(function(id){return map[id].status==='submitted';}))
        throw Error('仍有待審核紀錄，請先完成審核才能關閉此功能');
    }
    var meta=wpSheet_(ctx.book,'Meta'),rows=wpRows_(meta);
    var enabled=rows.find(function(r){return r.key==='reviewEnabled';});
    var version=rows.find(function(r){return r.key==='reviewSettingsRevision';});
    if(!enabled||!version)throw Error('尚未完成 v4 設定遷移');
    meta.getRange(enabled.__row,2).setValues([[String(payload.enabled)]]);
    meta.getRange(version.__row,2).setValues([[String(config.revision+1)]]);
    wpSheet_(ctx.book,'Audit').appendRow([Utilities.getUuid(),new Date().toISOString(),ctx.actor.email,
       'review.setting','',config.revision+1,input]);
    SpreadsheetApp.flush();
    return {ok:true,deduplicated:false,config:wpReviewConfig_(ctx.book)};
  }finally{lock.releaseLock();}
}
/** Explicit schema v3 to v4 upgrade. Back up the spreadsheet first. */
function upgradeWorkPulseV4_(){
  var cfg=wpConfig_();
  var actor=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  if(actor!==cfg.adminEmail)throw Error('只有設定的管理員可以升級資料表');
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    var book=SpreadsheetApp.openById(cfg.sheetId),meta=wpSheet_(book,'Meta');
    var rows=wpRows_(meta),v=rows.find(function(r){return r.key==='schemaVersion';});
    if(!v)throw Error('缺少 schemaVersion，拒絕變更');
    if(String(v.value)==='4')return '已是 v4';
    if(String(v.value)!=='3')throw Error('僅能從 v3 升級到 v4；v2 請先執行舊版遷移');
    ['Employees','Departments','Projects','Journals','Tasks','Requests','Audit','Meta'].forEach(function(name){
      var sheet=wpSheet_(book,name),head=WP_HEADERS[name];
      if(JSON.stringify(sheet.getRange(1,1,1,head.length).getValues()[0])!==JSON.stringify(head))
        throw Error(name+' 表頭不符合 v3，已停止遷移');
    });
    var sheet=book.getSheetByName('Reviews');
    if(sheet&&sheet.getLastRow()>0 && JSON.stringify(sheet.getRange(1,1,1,WP_HEADERS.Reviews.length).getValues()[0])!==JSON.stringify(WP_HEADERS.Reviews))
      throw Error('Reviews 表格已有不相容資料，已停止遷移');
    if(!sheet)sheet=book.insertSheet('Reviews');
    if(sheet.getLastRow()===0){sheet.getRange(1,1,1,WP_HEADERS.Reviews.length).setValues([WP_HEADERS.Reviews]);sheet.setFrozenRows(1);}
    sheet.getRange(1,1,sheet.getMaxRows(),WP_HEADERS.Reviews.length).setNumberFormat('@');
    if(!rows.some(function(r){return r.key==='reviewEnabled';}))meta.appendRow(['reviewEnabled','false']);
    if(!rows.some(function(r){return r.key==='reviewSettingsRevision';}))meta.appendRow(['reviewSettingsRevision','1']);
    meta.getRange(v.__row,2).setValues([['4']]);
    SpreadsheetApp.flush();
    return 'v3→v4 升級完成，審核預設關閉。';
  }finally{lock.releaseLock();}
}
