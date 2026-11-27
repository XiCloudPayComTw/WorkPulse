import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHmac,randomUUID} from 'node:crypto';
const source=readFileSync(new URL('../apps-script/shared/Core.gs',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../apps-script/shared/SharedAccess.gs',import.meta.url),'utf8');
function harness(){
 let now=Date.UTC(2026,10,27),locked=false,effective='owner@example.com';
 const props={WORKPULSE_ACCESS_MODE:'shared-code',WORKPULSE_SHEET_ID:'synthetic',WORKPULSE_ADMIN_EMAIL:'owner@example.com',WORKPULSE_ALLOWED_DOMAIN:'example.com',WORKPULSE_SHARED_ACCESS_CODE:'fixture-code-not-a-secret-123',WORKPULSE_SESSION_SIGNING_KEY:'fixture-signing-key-not-a-secret-12345678901234567890'};
 const scope={WP_PORTAL_KIND:'unified',Date:class extends Date{static now(){return now;}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=v;}})},Session:{getEffectiveUser:()=>({getEmail:()=>effective}),getActiveUser:()=>({getEmail:()=>''})},LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){assert.equal(locked,true);locked=false;}})},Utilities:{getUuid:randomUUID,computeHmacSha256Signature:(value,key)=>createHmac('sha256',key).update(value).digest(),base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url')}};
 vm.createContext(scope);vm.runInContext(source,scope);
 return {scope,props,advance:ms=>{now+=ms;},asEffective:v=>{effective=v;},isLocked:()=>locked};
}
test('signed expiring sessions never grant owner identity',()=>{
 const h=harness(),s=h.scope.wpCodeSessionIssue_(h.props.WORKPULSE_SHARED_ACCESS_CODE),v=h.scope.wpCodeSessionVerify_(s.token);
 assert.match(v.actor,/^shared:[a-f0-9]{32}$/);assert.equal(v.expiresAt,s.expiresAt);assert.equal(h.isLocked(),false);
 assert.ok(!s.token.includes(h.props.WORKPULSE_SHARED_ACCESS_CODE));assert.ok(!s.token.includes(h.props.WORKPULSE_SESSION_SIGNING_KEY));
 assert.throws(()=>h.scope.wpPrimaryOwnerAssert_());
});
test('reject invalid, altered, expired and future-expiry sessions',()=>{
 const h=harness(),s=h.scope.wpCodeSessionIssue_(h.props.WORKPULSE_SHARED_ACCESS_CODE);
 for(const value of [null,'',{},s.token+'x',s.token.replace(/.$/,c=>c==='A'?'B':'A'),s.token.replace(/\d{13}/,'9999999999999')])assert.throws(()=>h.scope.wpCodeSessionVerify_(value));
 h.advance(30*24*60*60*1000);assert.throws(()=>h.scope.wpCodeSessionVerify_(s.token));
});
test('rotating either secret invalidates earlier sessions',()=>{
 for(const key of ['WORKPULSE_SHARED_ACCESS_CODE','WORKPULSE_SESSION_SIGNING_KEY']){
  const h=harness(),s=h.scope.wpCodeSessionIssue_(h.props.WORKPULSE_SHARED_ACCESS_CODE);
  h.props[key]+='x';assert.throws(()=>h.scope.wpCodeSessionVerify_(s.token));
 }
});
test('failed attempts are globally bounded and expire after five minutes',()=>{
 const h=harness();
 for(let i=0;i<10;i++)assert.throws(()=>h.scope.wpCodeSessionIssue_('wrong'),/不正確/);
 assert.throws(()=>h.scope.wpCodeSessionIssue_(h.props.WORKPULSE_SHARED_ACCESS_CODE),/次數過多/);
 assert.equal(h.isLocked(),false);h.advance(5*60*1000);
 assert.ok(h.scope.wpCodeSessionIssue_(h.props.WORKPULSE_SHARED_ACCESS_CODE).token);
});
test('fail closed for wrong execution identity, weak secrets, corrupt rate state, non-unified or wrong mode',()=>{
 for(const change of [h=>h.asEffective('other@example.com'),h=>{h.props.WORKPULSE_SHARED_ACCESS_CODE='1234';},h=>{delete h.props.WORKPULSE_SESSION_SIGNING_KEY;},h=>{h.props.WORKPULSE_CODE_FAILURE_WINDOW='broken';},h=>{h.scope.WP_PORTAL_KIND='public';},h=>{h.props.WORKPULSE_ACCESS_MODE='domain';}]){
  const h=harness();change(h);assert.throws(()=>h.scope.wpCodeSessionIssue_(h.props.WORKPULSE_SHARED_ACCESS_CODE));assert.equal(h.isLocked(),false);
 }
});
test('existing public guard still rejects shared-code; deployment remains domain-only',()=>{
 const h=harness();assert.throws(()=>h.scope.wpFieldMode_(),/domain/);
 h.props.WORKPULSE_ACCESS_MODE='domain';assert.equal(h.scope.wpFieldMode_(),'domain');assert.throws(()=>h.scope.wpFieldAccess_(),/Google/);
});
