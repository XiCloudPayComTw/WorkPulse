/** v0.25 unified-only shared-code authentication and self-service endpoints. */
function wpCodeConfig_(){
 var p=PropertiesService.getScriptProperties();
 if(!wpUnified_()||p.getProperty('WORKPULSE_ACCESS_MODE')!=='shared-code')throw Error('公司存取碼模式未啟用');
 var cfg=wpConfig_(),effective=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
 if(effective!==cfg.adminEmail)throw Error('雲端執行身分不符公司授權');
 var code=String(p.getProperty('WORKPULSE_SHARED_ACCESS_CODE')||''),key=String(p.getProperty('WORKPULSE_SESSION_SIGNING_KEY')||'');
 if(!/^[A-Za-z0-9_-]{24,128}$/.test(code)||!/^[A-Za-z0-9_-]{43,128}$/.test(key)||code===key)
  throw Error('公司存取碼尚未安全設定');
 return {props:p,code:code,key:key};
}
function wpCodeHmac_(value,key){
 return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(value,key)).replace(/=+$/,'');
}
function wpCodeEqual_(a,b){
 var diff=a.length^b.length,n=Math.max(a.length,b.length);
 for(var i=0;i<n;i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
 return diff===0;
}
function wpCodeSignature_(body,cfg){
 // Rotating either secret revokes all previous sessions.
 return wpCodeHmac_('workpulse:shared-session:'+body+':'+cfg.code,cfg.key);
}
function wpCodeSessionIssue_(candidate){
 var lock=LockService.getScriptLock();lock.waitLock(5000);
 try{
  var cfg=wpCodeConfig_(),now=Date.now(),windowMs=5*60*1000,limit=10;
  var raw=cfg.props.getProperty('WORKPULSE_CODE_FAILURE_WINDOW'),record;
  try{record=raw?JSON.parse(raw):{start:now,count:0};}
  catch(e){throw Error('存取碼安全設定異常，請聯絡管理員');}
  if(!record||!Number.isSafeInteger(record.start)||record.start<0||record.start>now||
     !Number.isSafeInteger(record.count)||record.count<0||record.count>limit)
   throw Error('存取碼安全設定異常，請聯絡管理員');
  if(now-record.start>=windowMs)record={start:now,count:0};
  if(record.count>=limit)throw Error('存取碼嘗試次數過多，請稍後再試');
  var value=typeof candidate==='string'&&candidate.length<=128?candidate:'';
  if(!wpCodeEqual_(wpCodeHmac_('candidate:'+value,cfg.key),wpCodeHmac_('candidate:'+cfg.code,cfg.key))){
   record.count++;
   cfg.props.setProperty('WORKPULSE_CODE_FAILURE_WINDOW',JSON.stringify(record));
   throw Error('公司存取碼不正確');
  }
  var exp=now+30*24*60*60*1000,nonce=Utilities.getUuid().replace(/-/g,'').toLowerCase();
  if(!/^[a-f0-9]{32}$/.test(nonce))throw Error('無法建立安全工作階段');
  var body='v1.'+exp+'.'+nonce;
  return {token:body+'.'+wpCodeSignature_(body,cfg),expiresAt:exp};
 }finally{lock.releaseLock();}
}
function wpCodeSessionVerify_(token){
 var cfg=wpCodeConfig_();
 var match=typeof token==='string'&&token.length<=128?token.match(/^v1\.(\d{13})\.([a-f0-9]{32})\.([A-Za-z0-9_-]{43})$/):null;
 var now=Date.now();
 if(!match||Number(match[1])<=now||Number(match[1])>now+30*24*60*60*1000||
    !wpCodeEqual_(match[3],wpCodeSignature_('v1.'+match[1]+'.'+match[2],cfg)))
  throw Error('公司存取工作階段無效或已到期，請重新輸入存取碼');
 // Audit correlation only, not an employee identity or owner credential.
 return {actor:'shared:'+match[2],expiresAt:Number(match[1])};
}

/** Returns no company data, secrets, token or email. */
function wpAccessStatus(){
 if(!wpUnified_())throw Error('僅支援單一入口');
 var mode=wpFieldMode_(),cfg=wpSharedExecution_();
 var owner=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase()===cfg.adminEmail;
 if(mode==='domain')wpFieldAccess_();
 return {mode:mode,owner:owner};
}
function wpAccessUnlock(code){
 return wpCodeSessionIssue_(code);
}
function wpSelfName_(value){
 if(typeof value!=='string'||value.length>160||/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value))throw Error('姓名格式無效');
 var name=value.normalize('NFKC').trim().replace(/\s+/g,' ');
 if(!name||name.length>80||/^[=+\-@']/.test(name))throw Error('姓名格式無效');
 return name;
}
/** Ordinary active person only. Request-derived server ID allows retry after a partial write. */
function wpSelfCreateEmployee(input,token){
 if(wpFieldMode_()!=='shared-code')throw Error('自助新增人員尚未啟用');
 var actor=wpCodeSessionVerify_(token).actor;
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(function(k){return k!=='name'&&k!=='requestId';}))throw Error('自助新增資料無效');
 var name=wpSelfName_(input.name),request=String(input.requestId||'');
 if(!/^[A-Za-z0-9_-]{12,120}$/.test(request))throw Error('請求識別碼無效');
 var id='self-'+Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,'workpulse:self:'+request,Utilities.Charset.UTF_8)).replace(/=+$/,'');
 var lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  actor=wpCodeSessionVerify_(token).actor;
  var book=wsBook_();wpFieldWriteGuard_(book,token);
  var sheet=wpSheet_(book,'Employees'),rows=wpRows_(sheet),audit=wpSheet_(book,'Audit');
  var saved=rows.find(function(r){return String(r.employeeId)===id;});
  var old=wpRows_(audit).find(function(r){return r.action==='employee.self-created'&&String(r.requestId)===request;});
  if(old&&!saved)throw Error('先前新增人員紀錄不完整，請聯絡管理員');
  if(saved){
   if(String(saved.role)!=='staff'||!wpActive_(saved.active)||wpPlainText_(saved.name)!==name)throw Error('請求識別碼已被使用或人員已變更');
   if(old&&String(old.journalId)!=='employee:'+id)throw Error('請求識別碼已被使用');
   if(!old){
    if(Number(saved.revision)!==1||!/^shared:[a-f0-9]{32}$/.test(String(saved.updatedBy)))throw Error('先前新增人員紀錄異常');
    audit.appendRow([Utilities.getUuid(),new Date().toISOString(),String(saved.updatedBy),'employee.self-created','employee:'+id,1,request]);
    SpreadsheetApp.flush();
   }
   return {ok:true,deduplicated:true,person:{id:id,name:name}};
  }
  if(rows.filter(function(r){return String(r.role)!=='admin';}).length>=200)throw Error('人員數量已達上限，請聯絡管理員');
  if(rows.some(function(r){return wpPlainText_(r.name).normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase()===name.toLocaleLowerCase();}))throw Error('姓名已存在，請選擇既有人員或聯絡管理員');
  var now=new Date().toISOString();
  sheet.appendRow([id,'',name,'staff','',true,1,now,actor]);
  audit.appendRow([Utilities.getUuid(),now,actor,'employee.self-created','employee:'+id,1,request]);
  SpreadsheetApp.flush();
  return {ok:true,deduplicated:false,person:{id:id,name:name}};
 }finally{lock.releaseLock();}
}
