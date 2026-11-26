import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfflineVault,offlineScopeKey} from '../src/services/offline-vault.js';
const memory=()=>{const rows=new Map();return {getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k)};};
function setup(){
 const saved=new Map(),locks=new Set(),prefs=memory();
 let fail=false;
 const vault=(session=memory())=>createOfflineVault({session:()=>session,preferences:()=>prefs,open:async()=>({close(){}}),
 acquire:async key=>{if(locks.has(key))return null;locks.add(key);return ()=>locks.delete(key);},
 tx:async(db,mode,key,value)=>{if(mode==='get')return saved.has(key)?structuredClone(saved.get(key)):undefined;if(fail)throw Error('disk failed');if(mode==='delete')saved.delete(key);else saved.set(key,structuredClone(value));},signal(){}});
 return {vault,saved,locks,prefs,fail:v=>fail=v};
}
const key='workpulse:field-recovery:v1',draft='workpulse:attendance-draft:v1:e1:2026-11-26';
test('verified deployment scope excludes guest/admin and separates accounts',()=>{
 assert.equal(offlineScopeKey({email:'',role:'guest'},'company_offline_2026'),'');
 assert.equal(offlineScopeKey({email:'a@example.com',role:'admin'},'company_offline_2026'),'');
 assert.notEqual(offlineScopeKey({email:'a@example.com'},'company_offline_2026'),offlineScopeKey({email:'b@example.com'},'company_offline_2026'));
});
test('opt-in survives new session, locks same scope, clears only explicit persistent copy',async()=>{
 const h=setup(),a=h.vault();await a.configure('a');a.storage().setItem(key,'original');
 assert.equal(h.saved.size,0);assert.equal(await a.enable(),true);
 a.storage().setItem(draft,'draft');assert.equal(await a.flush(),true);
 const b=h.vault();await b.configure('a');assert.equal(b.status().phase,'locked');assert.equal(b.storage().getItem(key),null);
 await a.configure('');const c=h.vault();await c.configure('a');assert.equal(c.storage().getItem(key),'original');assert.equal(c.storage().getItem(draft),'draft');
 assert.equal(await c.disable(),true);assert.equal(c.storage().getItem(key),'original');assert.equal(h.saved.size,0);
});
test('failed disk write retains session, refuses confirmed durability and supports explicit clear',async()=>{
 const h=setup(),a=h.vault();await a.configure('a');await a.enable();h.fail(true);
 a.storage().setItem(key,'pending');assert.equal(await a.flush(),false);assert.equal(a.storage().getItem(key),'pending');assert.equal(a.status().phase,'error');
 h.fail(false);assert.equal(await a.disable(),true);assert.equal(a.storage().getItem(key),'pending');
});
test('divergent session is not silently merged and unknown keys are rejected',async()=>{
 const h=setup(),a=h.vault();await a.configure('a');await a.enable();a.storage().setItem(key,'saved');await a.flush();await a.configure('');
 const b=h.vault();await b.configure('b');assert.throws(()=>b.storage().setItem('salary','secret'),/不允許/);
 const session=memory();session.setItem('workpulse:offline:v1:a',JSON.stringify({[key]:'different'}));
 const c=h.vault(session);await c.configure('a');assert.equal(c.status().phase,'error');assert.equal(c.storage().getItem(key),'different');assert.equal(h.saved.get('a')[key],'saved');
});

test('vault transitions reject synchronous changes before activation completes',async()=>{
 const h=setup(),a=h.vault();await a.configure('a');const enabling=a.enable();
 assert.throws(()=>a.storage().setItem(key,'during open'),/設定正在變更/);
 assert.equal(await a.flush(),false);assert.equal(await enabling,true);
 assert.equal(a.storage().getItem(key),null);await a.disable();
});
