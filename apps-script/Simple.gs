/**
 * v0.7.0: shared-name journals + verified-owner administration.
 * All ordinary visitors can read/edit records by selecting a name.
 * Never infer administrator rights from the selected name or browser state.
 */
function wsBook_(){
  var cfg=wpConfig_(),book=SpreadsheetApp.openById(cfg.sheetId);
  if(!wpRows_(wpSheet_(book,'Meta')).some(function(r){return r.key==='schemaVersion'&&String(r.value)==='4';}))
    throw Error('Google Sheets 結構需要 v4，請先備份並完成初始化／遷移');
  return book;
}
function wsPeople_(book,includeInactive){
  return wpRows_(wpSheet_(book,'Employees')).filter(function(r){
    return String(r.role)!=='admin'&&(includeInactive||wpActive_(r.active));
  }).map(function(r){return {id:String(r.employeeId),name:wpPlainText_(r.name),
    active:wpActive_(r.active),revision:Number(r.revision)||0};});
}
function wsDeleted_(book){
  var result={};wpRows_(wpSheet_(book,'Audit')).forEach(function(r){
    if(String(r.action)==='journal.deleted')result[String(r.journalId)]=true;
  });return result;
}
function wsRecord_(j,tasks){
  return {id:String(j.journalId),date:String(j.date),employeeId:String(j.employeeId),
    revision:Number(j.revision)||0,updatedAt:String(j.updatedAt),
    note:wpPlainText_(j.note),tomorrow:wpPlainText_(j.tomorrow),
    tasks:tasks.filter(function(t){return String(t.journalId)===String(j.journalId)&&Number(t.revision)===Number(j.revision);})
      .sort(function(a,b){return Number(a.position)-Number(b.position);})
      .map(function(t){return {id:String(t.taskId),project:wpPlainText_(t.project),
        category:String(t.category),title:wpPlainText_(t.title),description:wpPlainText_(t.description),
        result:wpPlainText_(t.result),status:String(t.status),hours:Number(t.hours)||0};})};
}
function wsMonth_(book,month){
  var m=wpMonth_(month),deleted=wsDeleted_(book);
  var rows=wpRows_(wpSheet_(book,'Journals')).filter(function(j){
    return String(j.date).slice(0,7)===m&&!deleted[String(j.journalId)];
  });
  if(rows.length>1500)throw Error('月份日誌過多，請縮小範圍');
  var tasks=wpRows_(wpSheet_(book,'Tasks'));
  return rows.map(function(j){return wsRecord_(j,tasks);});
}
function wpSharedBootstrap(month){
  var book=wsBook_(),m=wpMonth_(month),people=wsPeople_(book,false);
  return {month:m,store:{version:1,mode:'cloud',
    employees:people.map(function(p){return {id:p.id,name:p.name};}),
    projects:wpRows_(wpSheet_(book,'Projects')).filter(function(p){return wpActive_(p.active);})
      .map(function(p){return wpPlainText_(p.name);}),journals:wsMonth_(book,m)},
    user:{id:'guest',name:'共用填寫',role:'guest',email:'',
      canWriteIds:people.map(function(p){return p.id;})}};
}
function wpSharedLoadMonth(month){var book=wsBook_();return {month:wpMonth_(month),journals:wsMonth_(book,month)};}
function wsValidated_(input,book){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('工作資料格式無效');
  var employeeId=String(input.employeeId||'');
  if(!wsPeople_(book,false).some(function(p){return p.id===employeeId;}))
    throw Error('請選擇有效的使用者');
  var date=wpDate_(input.date),requestId=String(input.requestId||'');
  var revision=Number(input.expectedRevision);
  if(!/^[a-zA-Z0-9_-]{12,120}$/.test(requestId)||!Number.isSafeInteger(revision)||revision<0)
    throw Error('儲存請求或版本無效');
  if(!Array.isArray(input.tasks)||input.tasks.length<1||input.tasks.length>100)
    throw Error('每天必須包含 1 至 100 個工作項目');
  var projects=wpRows_(wpSheet_(book,'Projects')).filter(function(p){return wpActive_(p.active);})
    .map(function(p){return wpPlainText_(p.name);});
  var tasks=input.tasks.map(function(t){
    if(!t||typeof t!=='object')throw Error('工作項目格式無效');
    var title=wpText_(t.title,160),project=wpText_(t.project,100),category=String(t.category||'');
    var status=String(t.status||''),hours=Number(t.hours);
    if(!title)throw Error('工作名稱不可空白');
    if(project&&projects.indexOf(project)<0)throw Error('專案尚未建立');
    if(WP_CATEGORIES.indexOf(category)<0||WP_STATUS.indexOf(status)<0||!isFinite(hours)||hours<0||hours>24)
      throw Error('分類、狀態或投入工時無效');
    return {id:Utilities.getUuid(),title:title,project:project,category:category,status:status,hours:hours,
      description:wpText_(t.description,2000),result:wpText_(t.result,1000)};
  });
  if(tasks.reduce(function(a,t){return a+t.hours;},0)>24)throw Error('每日總工時不可超過 24');
  return {date:date,employeeId:employeeId,requestId:requestId,expectedRevision:revision,
    tasks:tasks,note:wpText_(input.note,2000),tomorrow:wpText_(input.tomorrow,2000)};
}
function wpSharedSaveJournal(payload){
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    var book=wsBook_(),p=wsValidated_(payload,book),deleted=wsDeleted_(book);
    var sheet=wpSheet_(book,'Journals'),rows=wpRows_(sheet),allRequests=wpRows_(wpSheet_(book,'Requests'));
    var previous=allRequests.find(function(r){return String(r.requestId)===p.requestId;});
    if(previous){
      if(String(previous.actorEmail)!=='selected:'+p.employeeId)throw Error('請求識別碼已被使用');
      var item=rows.find(function(j){return String(j.journalId)===String(previous.journalId);});
      if(!item||deleted[String(item.journalId)])throw Error('原紀錄已刪除');
      return {ok:true,deduplicated:true,journal:wsRecord_(item,wpRows_(wpSheet_(book,'Tasks')))};
    }
    var existing=rows.find(function(j){
      return String(j.date)===p.date&&String(j.employeeId)===p.employeeId&&!deleted[String(j.journalId)];
    }),revision=existing?Number(existing.revision)||0:0;
    if(revision!==p.expectedRevision)throw Error('CONFLICT:同一天的內容已更新，請重新載入');
    var journalId=existing?String(existing.journalId):Utilities.getUuid(),next=revision+1,now=new Date().toISOString();
    var taskSheet=wpSheet_(book,'Tasks');
    p.tasks.forEach(function(t,i){taskSheet.appendRow([t.id,journalId,next,i,t.project,t.category,t.title,t.description,t.result,t.status,t.hours]);});
    var values=[journalId,p.date,p.employeeId,next,now,'selected:'+p.employeeId,p.requestId,p.note,p.tomorrow];
    if(existing)sheet.getRange(existing.__row,1,1,values.length).setValues([values]);else sheet.appendRow(values);
    wpSheet_(book,'Requests').appendRow([p.requestId,'selected:'+p.employeeId,journalId,next,now]);
    wpSheet_(book,'Audit').appendRow([Utilities.getUuid(),now,'selected:'+p.employeeId,
      existing?'journal.updated':'journal.created',journalId,next,p.requestId]);
    SpreadsheetApp.flush();
    return {ok:true,deduplicated:false,journal:wsRecord_(
      {journalId:journalId,date:p.date,employeeId:p.employeeId,revision:next,updatedAt:now,note:p.note,tomorrow:p.tomorrow},
      p.tasks.map(function(t,i){return {taskId:t.id,journalId:journalId,revision:next,position:i,
        project:t.project,category:t.category,title:t.title,description:t.description,result:t.result,
        status:t.status,hours:t.hours};}))};
  }finally{lock.releaseLock();}
}
function wpSharedQueryReport(criteria){
  var book=wsBook_();
  if(!criteria||typeof criteria!=='object')throw Error('報表條件無效');
  var start=wpDate_(criteria.startDate),end=wpDate_(criteria.endDate);
  var span=(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000;
  if(span<0||span>365)throw Error('報表查詢不能超過 366 天');
  var employeeId=String(criteria.employeeId||'all'),project=String(criteria.project||'all'),
      category=String(criteria.category||'all'),status=String(criteria.status||'all');
  var people=wsPeople_(book,true),ids={};people.forEach(function(p){ids[p.id]=true;});
  if(employeeId!=='all'&&!ids[employeeId])throw Error('找不到選取的使用者');
  if(project.length>100||WP_CATEGORIES.indexOf(category)<0&&category!=='all'
    ||WP_STATUS.indexOf(status)<0&&status!=='all')throw Error('報表篩選格式錯誤');
  var deleted=wsDeleted_(book),tasks=wpRows_(wpSheet_(book,'Tasks'));
  var journals=wpRows_(wpSheet_(book,'Journals')).filter(function(j){
    return String(j.date)>=start&&String(j.date)<=end&&!deleted[String(j.journalId)]&&
      !!ids[String(j.employeeId)]&&(employeeId==='all'||String(j.employeeId)===employeeId);
  });
  if(journals.length>1500)throw Error('報表資料量超過單次上限');
  var count=0;journals=journals.map(function(j){
    var entry=wsRecord_(j,tasks);
    entry.tasks=entry.tasks.filter(function(t){return (project==='all'||t.project===project)&&
      (category==='all'||t.category===category)&&(status==='all'||t.status===status);});
    count+=entry.tasks.length;return entry;
  }).filter(function(j){return j.tasks.length;});
  if(count>10000)throw Error('工作明細數量超過單次上限');
  return {from:start,to:end,scope:'shared',employees:people.map(function(p){return {
    id:p.id,name:p.name,departmentId:''};}),departments:[],
    projects:wpRows_(wpSheet_(book,'Projects')).filter(function(p){return wpActive_(p.active);})
      .map(function(p){return wpPlainText_(p.name);}),journals:journals,generatedAt:new Date().toISOString()};
}
