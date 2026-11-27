/** v0.25 foundation: private helpers only; no public RPC or activation. */
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
