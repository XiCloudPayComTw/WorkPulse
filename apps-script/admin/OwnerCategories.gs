/** Only administrator project includes this mutation. */
function wpOwnerSaveCategories(input){
 wsRequireOwner_();
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('工作類型設定無效');
 var requestId=String(input.requestId||''),expected=Number(input.expectedRevision),categories=input.categories;
 if(!/^[a-zA-Z0-9_-]{12,120}$/.test(requestId)||
    !Number.isSafeInteger(expected)||expected<0||
    !Array.isArray(categories)||!categories.length||categories.length>60)
  throw Error('工作類型請求格式無效');
 var unique={};
 var items=categories.map(function(value){
  if(typeof value!=='string')throw Error('工作類型名稱無效');
  var name=wpText_(value,100);
  if(!name||unique[wpPlainText_(name).toLocaleLowerCase()])throw Error('工作類型名稱不可空白或重複');
  unique[wpPlainText_(name).toLocaleLowerCase()]=true;
  return wpPlainText_(name);
 });
 var lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  wsRequireOwner_();
  var book=wsBook_(),audit=wpRows_(wpSheet_(book,'Audit'));
  var prior=audit.find(function(row){return row.action==='category.saved'&&String(row.requestId)===requestId;});
  if(prior)return {ok:true,deduplicated:true,categories:wsCategories_(book),revision:wsCategoryRevision_(book)};
  var revision=wsCategoryRevision_(book);
  if(expected!==revision)throw Error('CONFLICT:工作類型清單已被其他管理員修改');
  var meta=wpSheet_(book,'Meta'),rows=wpRows_(meta);
  function writeValue(key,value){
   var record=rows.find(function(row){return row.key===key;});
   if(record)meta.getRange(record.__row,1,1,2).setValues([[key,value]]);
   else meta.appendRow([key,value]);
  }
  writeValue('workCategories',JSON.stringify(items));
  writeValue('workCategoriesRevision',revision+1);
  var now=new Date().toISOString();
  wpSheet_(book,'Audit').appendRow([Utilities.getUuid(),now,wpConfig_().adminEmail,
    'category.saved','categories',revision+1,requestId]);
  SpreadsheetApp.flush();
  return {ok:true,deduplicated:false,categories:items,revision:revision+1};
 }finally{lock.releaseLock();}
}
