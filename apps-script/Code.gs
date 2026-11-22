/**
 * WorkPulse v0.2.0 — Google Apps Script back-end.
 * Deploy as an HTMLService web app. This file is intentionally unbundled and
 * contains no hard-coded spreadsheet ID, domain, email, password or token.
 *
 * Script properties required before setupWorkPulse_() is run manually:
 * WORKPULSE_SHEET_ID, WORKPULSE_ALLOWED_DOMAIN, WORKPULSE_ADMIN_EMAIL.
 */
var WP_SCHEMA = '2';
var WP_HEADERS = {
  Employees:['employeeId','email','name','role','departmentId','active'],
  Projects:['projectId','name','active'],
  Journals:['journalId','date','employeeId','revision','updatedAt','updatedBy','requestId','note','tomorrow'],
  Tasks:['taskId','journalId','revision','position','project','category','title','description','result','status','hours'],
  Requests:['requestId','actorEmail','journalId','revision','createdAt'],
  Audit:['auditId','occurredAt','actorEmail','action','journalId','revision','requestId'],
  Meta:['key','value']
};
var WP_CATEGORIES = ['前端開發','展店設計','現場勘查','行政／會議','其他'];
var WP_STATUS = ['done','doing','blocked'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('WorkPulse — 工作日誌')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}

/** Run ONLY from the Apps Script editor after setting Script Properties. */
function setupWorkPulse_() {
  var cfg = wpConfig_();
  var active = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (active !== cfg.adminEmail) throw Error('只允許設定的管理員在 Apps Script 編輯器執行初始化。');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var book = SpreadsheetApp.openById(cfg.sheetId);
    Object.keys(WP_HEADERS).forEach(function(name) {
      var sheet = book.getSheetByName(name) || book.insertSheet(name);
      var headers = WP_HEADERS[name];
      if (sheet.getLastRow() === 0) {
        sheet.getRange(1,1,1,headers.length).setValues([headers]);
        sheet.setFrozenRows(1);
        sheet.getRange(1,1,1,headers.length).setFontWeight('bold');
      } else {
        var actual = sheet.getRange(1,1,1,headers.length).getValues()[0];
        if (JSON.stringify(actual) !== JSON.stringify(headers)) throw Error(name + ' 欄位結構不一致，為避免覆寫資料已停止初始化。');
      }
      // Sheets interprets formula-looking strings even in appendRow.
      sheet.getRange(1,1,sheet.getMaxRows(),headers.length).setNumberFormat('@');
    });
    var meta = wpSheet_(book,'Meta');
    if (!wpRows_(meta).some(function(r){return r.key==='schemaVersion';})) meta.appendRow(['schemaVersion',WP_SCHEMA]);
    var employees = wpSheet_(book,'Employees');
    if (!wpRows_(employees).some(function(r){return String(r.email).toLowerCase()===cfg.adminEmail;})) {
      employees.appendRow(['admin-'+Utilities.getUuid(),cfg.adminEmail,'系統管理員','admin','',true]);
    }
    var projects = wpSheet_(book,'Projects');
    if (!wpRows_(projects).length) projects.appendRow([Utilities.getUuid(),'一般專案',true]);
    SpreadsheetApp.flush();
    return '初始化完成。請在 Employees 加入員工信箱與部門，並限制試算表共用權限。';
  } finally {lock.releaseLock();}
}

function wpBootstrap(month) {
  var ctx = wpContext_();
  var m = wpMonth_(month);
  return {
    store:{version:1,mode:'cloud',employees:ctx.visible.map(function(e){return {id:e.employeeId,name:e.name};}),
      projects:ctx.projects.map(function(p){return p.name;}),journals:wpMonthRecords_(ctx,m)},
    month:m, user:{id:ctx.actor.employeeId,email:ctx.actor.email,name:ctx.actor.name,
      role:ctx.actor.role,departmentId:ctx.actor.departmentId,
      canWriteIds:ctx.visible.filter(function(e){return wpCanWrite_(ctx.actor,e);}).map(function(e){return e.employeeId;})}
  };
}
function wpLoadMonth(month) {
  var ctx = wpContext_();
  var m = wpMonth_(month);
  return {month:m,journals:wpMonthRecords_(ctx,m)};
}
function wpSaveJournal(payload) {
  var ctx = wpContext_();
  var input = wpValidateInput_(payload,ctx);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Auth and permission rechecked after lock; do not trust a stale allowlist.
    ctx = wpContext_();
    input = wpValidateInput_(payload,ctx);
    var book=ctx.book;
    var journalSheet=wpSheet_(book,'Journals');
    var requestRows=wpRows_(wpSheet_(book,'Requests'));
    var previousRequest=requestRows.find(function(r){return r.requestId===input.requestId && r.actorEmail===ctx.actor.email;});
    if (previousRequest) {
      var already=wpRows_(journalSheet).find(function(r){return r.journalId===previousRequest.journalId;});
      return {ok:true,deduplicated:true,journal:already?wpFindRecord_(ctx,already):null,requestId:input.requestId};
    }
    var rows=wpRows_(journalSheet);
    var existing=rows.find(function(r){return r.date===input.date && r.employeeId===input.employeeId;});
    if (existing && existing.requestId===input.requestId) {
      return {ok:true,deduplicated:true,journal:wpFindRecord_(ctx,existing),requestId:input.requestId};
    }
    var revision=existing?Number(existing.revision)||0:0;
    if (revision!==input.expectedRevision) {
      throw Error('CONFLICT:此日誌已被其他操作更新，請重新整理後再編輯，避免覆蓋他人資料。');
    }
    var journalId=existing?existing.journalId:Utilities.getUuid();
    var next=revision+1;
    var now=new Date().toISOString();
    var tasks=wpSheet_(book,'Tasks');
    // Append-only revisions: incomplete writes do not delete previous work.
    input.tasks.forEach(function(t,i){
      tasks.appendRow([t.id || Utilities.getUuid(),journalId,next,i,t.project,t.category,t.title,t.description,t.result,t.status,t.hours]);
    });
    var updated=[journalId,input.date,input.employeeId,next,now,ctx.actor.email,input.requestId,input.note,input.tomorrow];
    if (existing) journalSheet.getRange(existing.__row,1,1,updated.length).setValues([updated]);
    else journalSheet.appendRow(updated);
    wpSheet_(book,'Requests').appendRow([input.requestId,ctx.actor.email,journalId,next,now]);
    wpSheet_(book,'Audit').appendRow([Utilities.getUuid(),now,ctx.actor.email,existing?'update':'create',journalId,next,input.requestId]);
    SpreadsheetApp.flush();
    return {ok:true,deduplicated:false,requestId:input.requestId,journal:{
      id:journalId,date:input.date,employeeId:input.employeeId,revision:next,updatedAt:now,
      note:input.note,tomorrow:input.tomorrow,tasks:input.tasks
    }};
  } finally {lock.releaseLock();}
}

function wpConfig_() {
  var props=PropertiesService.getScriptProperties();
  var sheetId=String(props.getProperty('WORKPULSE_SHEET_ID')||'').trim();
  var domain=String(props.getProperty('WORKPULSE_ALLOWED_DOMAIN')||'').trim().toLowerCase().replace(/^@/,'');
  var adminEmail=String(props.getProperty('WORKPULSE_ADMIN_EMAIL')||'').trim().toLowerCase();
  if (!sheetId || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || !adminEmail.endsWith('@'+domain))
    throw Error('WorkPulse 尚未完成公司網域與試算表設定。請聯絡管理員。');
  return {sheetId:sheetId,domain:domain,adminEmail:adminEmail};
}
function wpContext_() {
  var cfg=wpConfig_();
  var email=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  if (!email || !email.endsWith('@'+cfg.domain))
    throw Error('無法驗證公司 Google Workspace 帳號。請使用組織帳號，並確認網域及部署模式。');
  var book=SpreadsheetApp.openById(cfg.sheetId);
  var meta=wpRows_(wpSheet_(book,'Meta'));
  if (!meta.some(function(r){return r.key==='schemaVersion'&&String(r.value)===WP_SCHEMA;}))
    throw Error('資料表尚未初始化或版本不相容，請聯絡管理員。');
  var users=wpRows_(wpSheet_(book,'Employees')).map(function(r){return {
    employeeId:String(r.employeeId),email:String(r.email).toLowerCase().trim(),name:String(r.name),
    role:String(r.role).toLowerCase(),departmentId:String(r.departmentId),active:wpActive_(r.active)
  };});
  var actor=users.find(function(u){return u.email===email && u.active;});
  if (!actor || ['staff','manager','admin'].indexOf(actor.role)<0) throw Error('此帳號尚未獲得 WorkPulse 使用權限。');
  var visible=users.filter(function(u){return wpCanRead_(actor,u);});
  var projects=wpRows_(wpSheet_(book,'Projects')).filter(function(p){return wpActive_(p.active);});
  return {book:book,actor:actor,visible:visible,projects:projects};
}
function wpActive_(v) { return v===true || String(v).toLowerCase()==='true'; }
function wpCanRead_(actor,target) {
  if (!target || !target.active) return false;
  if (actor.role==='admin') return true;
  if (actor.employeeId===target.employeeId) return true;
  return actor.role==='manager' && !!actor.departmentId && actor.departmentId===target.departmentId;
}
function wpCanWrite_(actor,target) {
  // In v0.2.0 only the owner or admin may modify a daily journal.
  return !!target && target.active && (actor.employeeId===target.employeeId || actor.role==='admin');
}
function wpMonth_(month) {
  var m=String(month||'');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw Error('月份格式錯誤');
  return m;
}
function wpDate_(value) {
  var s=String(value||'');
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(s)) throw Error('日期格式錯誤');
  var date=new Date(s+'T00:00:00Z');
  if (Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==s) throw Error('日期不存在');
  return s;
}
function wpText_(value,max) {
  var s=String(value==null?'':value).trim();
  if (s.length>max) throw Error('內容超過 '+max+' 字元限制');
  // Sheets interprets text beginning with '=' (or +, -, @) as a formula.
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(s)?"'"+s:s;
}
function wpPlainText_(value) {var s=String(value||'');return s.replace(/^'(?=[=+\-@])/,'');}
function wpValidateInput_(payload,ctx) {
  if (!payload || typeof payload!=='object' || Array.isArray(payload)) throw Error('資料格式錯誤');
  var employeeId=wpText_(payload.employeeId,120);
  var target=ctx.visible.find(function(e){return e.employeeId===employeeId;});
  if (!wpCanWrite_(ctx.actor,target)) throw Error('沒有權限替此員工提交日誌。');
  var date=wpDate_(payload.date);
  var requestId=String(payload.requestId||'');
  if (!/^[a-zA-Z0-9-]{12,120}$/.test(requestId)) throw Error('儲存請求識別碼無效');
  var expectedRevision=Number(payload.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision)||expectedRevision<0) throw Error('資料版本無效');
  if (!Array.isArray(payload.tasks)||!payload.tasks.length||payload.tasks.length>100) throw Error('每份日誌需包含 1 至 100 項工作');
  var tasks=payload.tasks.map(function(t){
    if (!t || typeof t!=='object') throw Error('工作項目格式錯誤');
    var title=wpText_(t.title,160);
    if (!title) throw Error('工作名稱不可空白');
    var category=wpText_(t.category,100);
    var status=wpText_(t.status,30);
    var hours=Number(t.hours);
    if (WP_CATEGORIES.indexOf(category)<0 || WP_STATUS.indexOf(status)<0 || !Number.isFinite(hours)||hours<0||hours>24)
      throw Error('工作分類、狀態或工時無效');
    var project=wpText_(t.project,100);
    if (project && !ctx.projects.some(function(p){return p.name===project;})) throw Error('工作所屬專案不在有效清單內');
    return {id:Utilities.getUuid(),project:project,category:category,title:title,
      description:wpText_(t.description,2000),result:wpText_(t.result,1000),status:status,hours:hours};
  });
  if (tasks.reduce(function(sum,t){return sum+t.hours;},0)>24) throw Error('每日累計工時不可超過 24 小時');
  return {date:date,employeeId:employeeId,requestId:requestId,expectedRevision:expectedRevision,tasks:tasks,
    note:wpText_(payload.note,2000),tomorrow:wpText_(payload.tomorrow,2000)};
}
function wpSheet_(book,name) {
  var s=book.getSheetByName(name);
  if (!s) throw Error('找不到資料表 '+name+'，請先完成初始化');
  return s;
}
function wpRows_(sheet) {
  var last=sheet.getLastRow();
  if (last<2) return [];
  var headers=WP_HEADERS[sheet.getName()];
  if (!headers) throw Error('未知工作表');
  var rows=sheet.getRange(2,1,last-1,headers.length).getValues();
  return rows.map(function(values,i){var obj={__row:i+2};headers.forEach(function(h,j){obj[h]=values[j];});return obj;});
}
function wpMonthRecords_(ctx,month) {
  var allowed={};ctx.visible.forEach(function(e){allowed[e.employeeId]=true;});
  var journals=wpRows_(wpSheet_(ctx.book,'Journals')).filter(function(j){return String(j.date).slice(0,7)===month&&allowed[j.employeeId];});
  if (journals.length>3000) throw Error('資料量過大，請縮小查詢範圍或升級資料庫');
  var taskList=wpRows_(wpSheet_(ctx.book,'Tasks'));
  return journals.map(function(j){return wpRecord_(j,taskList);});
}
function wpFindRecord_(ctx,journal) {
  if (!ctx.visible.some(function(e){return e.employeeId===journal.employeeId;})) throw Error('無權查看此紀錄');
  return wpRecord_(journal,wpRows_(wpSheet_(ctx.book,'Tasks')));
}
function wpRecord_(j,tasks) {
  return {id:String(j.journalId),date:String(j.date),employeeId:String(j.employeeId),
    revision:Number(j.revision)||0,note:wpPlainText_(j.note),tomorrow:wpPlainText_(j.tomorrow),
    updatedAt:String(j.updatedAt),tasks:tasks.filter(function(t){return t.journalId===j.journalId&&Number(t.revision)===Number(j.revision);})
     .sort(function(a,b){return Number(a.position)-Number(b.position);})
     .map(function(t){return {id:String(t.taskId),project:wpPlainText_(t.project),category:String(t.category),
       title:wpPlainText_(t.title),description:wpPlainText_(t.description),result:wpPlainText_(t.result),
       status:String(t.status),hours:Number(t.hours)||0};})};
}
