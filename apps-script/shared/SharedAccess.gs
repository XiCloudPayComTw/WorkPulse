/** v0.25.1 shared-code: manager-owned roster and signed fixed-person sessions. */
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
 return wpCodeHmac_('workpulse:fixed-person-session:'+body+':'+cfg.code,cfg.key);
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
  var exp=now+5*60*1000,nonce=Utilities.getUuid().replace(/-/g,'').toLowerCase();
  if(!/^[a-f0-9]{32}$/.test(nonce))throw Error('無法建立安全工作階段');
  var body='v1.'+exp+'.'+nonce;
  return {token:body+'.'+wpCodeSignature_(body,cfg),expiresAt:exp};
 }finally{lock.releaseLock();}
}
function wpCodeSessionVerify_(token){
 var cfg=wpCodeConfig_(),parts=typeof token==='string'&&token.length<=512?token.split('.'):[];
 var bound=parts[0]==='v2',now=Date.now(),exp=Number(parts[1]),signature=parts[parts.length-1],id='';
 if((bound?parts.length!==5:parts[0]!=='v1'||parts.length!==4)||!/^\d{13}$/.test(parts[1]||'')||
    !/^[a-f0-9]{32}$/.test(parts[2]||'')||!/^[A-Za-z0-9_-]{43}$/.test(signature||'')||
    exp<=now||exp>now+(bound?30*24*60*60*1000:5*60*1000)||
    !wpCodeEqual_(signature,wpCodeSignature_(parts.slice(0,-1).join('.'),cfg)))
  throw Error('公司存取工作階段無效或已到期，請重新輸入存取碼');
 if(bound){
  try{id=decodeURIComponent(parts[3]);}catch(e){throw Error('公司存取工作階段無效或已到期，請重新輸入存取碼');}
  if(!id||id.length>120)throw Error('公司存取工作階段無效或已到期，請重新輸入存取碼');
 }
 return {actor:'shared:'+parts[2],expiresAt:exp,personId:id,nonce:parts[2]};
}
function wpFixedPerson_(token,control){
 if(wpFieldMode_()!=='shared-code'||!token)return '';
 var session=wpCodeSessionVerify_(token);
 if(!session.personId)throw Error('請先確認固定操作人員');
 if(control&&!wsPeople_(control,false).some(function(p){return p.id===session.personId;}))
  throw Error('固定操作人員已停用，請聯絡管理員');
 return session.personId;
}
function wpFixedTarget_(token,control,id){
 var fixed=wpFixedPerson_(token,control);
 if(fixed&&fixed!==String(id||''))throw Error('只能操作固定人員的資料');
 return fixed;
}
/** Returns no company data, secrets, token or email. */
function wpAccessStatus(){
 if(!wpUnified_())throw Error('僅支援單一入口');
 var mode=wpFieldMode_(),cfg=wpSharedExecution_();
 var owner=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase()===cfg.adminEmail;
 if(mode==='domain')wpFieldAccess_();
 if(mode==='shared-code'){
  wpCodeConfig_();
  // Opaque database namespace, not an authorization credential or raw Drive ID.
  var scope=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,'workpulse:browser:'+cfg.sheetId,Utilities.Charset.UTF_8)).replace(/=+$/,'');
  return {mode:mode,owner:owner,scope:scope};
 }
 return {mode:mode,owner:owner};
}
function wpAccessUnlock(code){
 var grant=wpCodeSessionIssue_(code);
 // Only active employee names/IDs are returned before selection; never journals or attendance.
 return {token:grant.token,expiresAt:grant.expiresAt,people:wsPeople_(wsBook_(),false).map(function(p){return {id:p.id,name:p.name};})};
}
function wpAccessBind(id,token){
 var grant=wpCodeSessionVerify_(token);
 if(grant.personId)throw Error('固定操作人員不能切換');
 if(typeof id!=='string'||!id||id.length>120)throw Error('請選擇有效的人員');
 var lock=LockService.getScriptLock();lock.waitLock(5000);
 try{
  grant=wpCodeSessionVerify_(token);
  var cfg=wpCodeConfig_(),control=wsBook_(),person=wsPeople_(control,false).find(function(p){return p.id===id;});
  if(!person)throw Error('固定操作人員不存在或已停用，請聯絡管理員');
  // A short-lived grant can only be bound once. Expired entries are pruned under the same lock.
  var key='WORKPULSE_FIXED_GRANTS',raw=cfg.props.getProperty(key),records=raw?JSON.parse(raw):{},now=Date.now();
  if(!records||typeof records!=='object'||Array.isArray(records))throw Error('固定人員驗證設定異常');
  Object.keys(records).forEach(function(k){if(!records[k]||records[k].until<=now)delete records[k];});
  var previous=records[grant.nonce];
  if(previous&&previous.personId!==id)throw Error('固定操作人員不能切換');
  if(!previous){
   if(Object.keys(records).length>=40)throw Error('目前登入人數較多，請稍後再試');
   previous={personId:id,until:grant.expiresAt,expiresAt:now+30*24*60*60*1000};records[grant.nonce]=previous;
   cfg.props.setProperty(key,JSON.stringify(records));
  }
  var body='v2.'+previous.expiresAt+'.'+grant.nonce+'.'+encodeURIComponent(id).replace(/\./g,'%2E');
  return {token:body+'.'+wpCodeSignature_(body,cfg),expiresAt:previous.expiresAt};
 }finally{lock.releaseLock();}
}
