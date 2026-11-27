import test from 'node:test';
import assert from 'node:assert/strict';
import {accessSessionValid,accessStorage,loadAccessSession,rememberAccessSession,forgetAccessSession} from '../src/services/access-session.js';
import {readSelectedPerson,writeSelectedPerson} from '../src/app/person.js';
import {cloudCall,setCloudCredential} from '../src/services/cloud.js';
import {offlineDraftStorage,setSharedTabStorage} from '../src/services/offline-vault.js';
function storage(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),m};}
const scope='a'.repeat(43),other='b'.repeat(43);
function credential(){const expiresAt=Date.now()+86400000;return {expiresAt,token:'v2.'+expiresAt+'.'+'c'.repeat(32)+'.two.'+'D'.repeat(43)};}
test('session remembers only valid token and expiry in the correct database namespace',()=>{
 const s=storage(),c=credential();assert.equal(rememberAccessSession(s,scope,{...c,code:'must-not-store'}),true);assert.deepEqual(loadAccessSession(s,scope),c);assert.equal(loadAccessSession(s,other),null);assert.ok(!JSON.stringify([...s.m]).includes('must-not-store'));assert.equal(loadAccessSession(s,scope,c.expiresAt),null);assert.equal(s.m.size,0);
});
test('invalid token, wrong expiry, corrupt JSON and unavailable storage fail closed',()=>{
 const s=storage(),c=credential();assert.equal(accessSessionValid({...c,expiresAt:c.expiresAt+1}),false);assert.equal(rememberAccessSession(s,scope,{token:'wrong',expiresAt:c.expiresAt}),false);assert.equal(rememberAccessSession(null,scope,c),false);accessStorage(s,scope,'session').setItem('credential','bad');assert.equal(loadAccessSession(s,scope),null);
});
test('selected person requires explicit first choice, survives reopening and is scoped',()=>{
 const s=storage(),people=[{id:'one'},{id:'two'}];const a=accessStorage(s,scope,'person'),b=accessStorage(s,other,'person');assert.equal(readSelectedPerson(a,people,{fallback:false}),'');writeSelectedPerson(a,'two');assert.equal(readSelectedPerson(a,people,{fallback:false}),'two');assert.equal(readSelectedPerson(b,people,{fallback:false}),'');assert.equal(readSelectedPerson(a,[people[0]],{fallback:false}),'');assert.equal(readSelectedPerson(b,people),'one');
});
test('forget session preserves scoped tab draft and person; no legacy draft access',()=>{
 const s=storage(),c=credential();rememberAccessSession(s,scope,c);accessStorage(s,scope,'tab').setItem('draft','work');accessStorage(s,scope,'person').setItem('person','two');s.setItem('draft','legacy');forgetAccessSession(s,scope);assert.equal(loadAccessSession(s,scope),null);try{setSharedTabStorage(true,accessStorage(s,scope,'tab'));assert.equal(offlineDraftStorage().getItem('draft'),'work');setSharedTabStorage(true,null);assert.equal(offlineDraftStorage(),null);}finally{setSharedTabStorage(false);}
 assert.equal(accessStorage(s,scope,'person').getItem('person'),'two');
});
test('cloud call passes session only to employee methods as separate argument, never privileged methods',async()=>{
 const old=globalThis.google,c=credential(),calls=[];
 const runner={withSuccessHandler(fn){this.ok=fn;return this;},withFailureHandler(fn){this.bad=fn;return this;}};
 for(const name of ['wpSharedBootstrap','wpAccessBind','wpOwnerBootstrap','wpAccessUnlock','wpAccessStatus'])runner[name]=function(...args){calls.push([name,args]);this.ok({ok:true});};
 globalThis.google={script:{run:runner}};
 try{setCloudCredential(c);const payload={name:'test',requestId:'request123456'};await cloudCall('wpSharedBootstrap','2026-11');await cloudCall('wpAccessBind',payload);await cloudCall('wpOwnerBootstrap');await cloudCall('wpAccessUnlock','code');await cloudCall('wpAccessStatus');assert.deepEqual(calls,[['wpSharedBootstrap',['2026-11',c.token]],['wpAccessBind',[payload,c.token]],['wpOwnerBootstrap',[undefined]],['wpAccessUnlock',['code']],['wpAccessStatus',[]]]);assert.ok(!JSON.stringify(payload).includes(c.token));}
 finally{setCloudCredential(null);if(old===undefined)delete globalThis.google;else globalThis.google=old;}
});
test('late read after logout does not deliver data; locally expired credential cannot send request',async()=>{
 const old=globalThis.google,c=credential();let success,calls=0;
 globalThis.google={script:{run:{withSuccessHandler(fn){success=fn;return this;},withFailureHandler(){return this;},wpSharedBootstrap(){calls++;}}}};
 try{setCloudCredential(c);const pending=cloudCall('wpSharedBootstrap','2026-11');setCloudCredential(null);success({secret:'data'});await assert.rejects(pending,/已變更/);setCloudCredential({...c,expiresAt:Date.now()-1});await assert.rejects(cloudCall('wpSharedBootstrap','2026-11'),/已到期/);assert.equal(calls,1);}
 finally{setCloudCredential(null);if(old===undefined)delete globalThis.google;else globalThis.google=old;}
});
