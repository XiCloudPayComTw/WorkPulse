// Opt-in, verified account + deployment scope. Only draft/request keys, never cached cloud history.
const WP_VAULT_DB='workpulse-offline-v1',WP_VAULT_PREFIX='workpulse:offline:v1:';
function wpVaultAllowed(key){return key==='workpulse:field-recovery:v1'||key.startsWith('workpulse:v0.5:draft:')||key.startsWith('workpulse:attendance-draft:v1:');}
function wpVaultSnapshot(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('離線封包格式異常');
 const pairs=Object.entries(value);
 if(pairs.length>250||pairs.some(([k,v])=>!wpVaultAllowed(k)||typeof v!=='string'||k.length>500)||JSON.stringify(value).length>4000000)throw Error('離線封包超過上限或格式異常');
 return Object.fromEntries(pairs);
}
function wpVaultSame(a,b){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&a[k]===b[k]);}
export function offlineScopeKey(user,scope){
 if(typeof scope!=='string'||!/^[A-Za-z0-9_-]{16,80}$/.test(scope)||typeof user?.email!=='string'||!/^[^\s@]+@[^\s@]+$/.test(user.email)||user.role==='admin')return '';
 return encodeURIComponent(JSON.stringify([scope,user.email.trim().toLowerCase()]));
}
function wpVaultSession(){try{return globalThis.sessionStorage||null;}catch{return null;}}
function wpVaultPreference(){try{return globalThis.localStorage||null;}catch{return null;}}
function wpVaultSignal(){if(typeof document!=='undefined'&&typeof document.dispatchEvent==='function'&&typeof Event==='function')document.dispatchEvent(new Event('workpulse:offline-vault'));}
function wpVaultOpen(){
 return new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(Error('此瀏覽器不支援 IndexedDB'));return;}
  let req,done=false;
  const timer=setTimeout(()=>finish(Error('離線資料庫開啟逾時')),5000);
  function finish(error,db){if(done){db?.close();return;}done=true;clearTimeout(timer);error?reject(error):resolve(db);}
  try{req=indexedDB.open(WP_VAULT_DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('scopes'))req.result.createObjectStore('scopes');};
   req.onsuccess=()=>finish(null,req.result);req.onerror=()=>finish(req.error||Error('離線資料庫開啟失敗'));req.onblocked=()=>finish(Error('離線資料庫被其他頁面占用'));
  }catch(e){finish(e);}
 });
}
async function wpVaultAcquire(scope){
 if(!globalThis.navigator?.locks?.request)throw Error('此瀏覽器無法安全鎖定跨分頁離線資料');
 return new Promise((resolve,reject)=>{
  navigator.locks.request('workpulse-vault:'+scope,{mode:'exclusive',ifAvailable:true},lock=>{
   if(!lock){resolve(null);return;}
   return new Promise(release=>resolve(release));
  }).catch(reject);
 });
}
function wpVaultTx(db,mode,scope,value){
 return new Promise((resolve,reject)=>{
  let tx,request,done=false;
  const timer=setTimeout(()=>{try{tx?.abort();}catch{}finish(Error('離線資料庫操作逾時'));},5000);
  function finish(error,result){if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(result);}
  try{
   tx=db.transaction('scopes',mode==='get'?'readonly':'readwrite');const store=tx.objectStore('scopes');
   request=mode==='get'?store.get(scope):mode==='delete'?store.delete(scope):store.put(value,scope);
   tx.oncomplete=()=>finish(null,request.result);
   tx.onerror=()=>finish(tx.error||Error('離線資料庫交易失敗'));
   tx.onabort=()=>finish(tx.error||Error('離線資料庫交易取消'));
  }catch(e){finish(e);}
 });
}
export function createOfflineVault({session=wpVaultSession,preferences=wpVaultPreference,open=wpVaultOpen,acquire=wpVaultAcquire,tx=wpVaultTx,signal=wpVaultSignal}={}){
 let scope='',data={},db=null,release=null,chain=Promise.resolve(true),failure='',sessionOk=true,pending=0,phase='unavailable',hasSession=false,busy=false;
 const key=()=>WP_VAULT_PREFIX+scope;
 const pref=()=>key()+':enabled';
 function status(){return {scope,phase,enabled:!!db,pending,failure,sessionOk,busy};}
 function emit(){signal(status());}
 function saveSession(){
  try{const s=session();if(!s)throw Error('no session');s.setItem(key(),JSON.stringify(data));sessionOk=true;hasSession=true;}
  catch{sessionOk=false;}
 }
 function write(){
  saveSession();
  if(!db){if(!sessionOk)throw Error('分頁暫存失敗');return;}
  const current=db,currentScope=scope,snapshot=wpVaultSnapshot(data);pending++;emit();
  chain=chain.then(async()=>{
   if(failure)return false;
   try{await tx(current,'put',currentScope,snapshot);return true;}
   catch(e){failure=e.message||'持久暫存失敗';phase='error';return false;}
  }).finally(()=>{pending--;emit();});
 }
 const adapter={
  getItem(k){if(!wpVaultAllowed(k))return null;return Object.hasOwn(data,k)?data[k]:null;},
  setItem(k,v){if(!wpVaultAllowed(k))throw Error('不允許持久保存此資料');const next=wpVaultSnapshot({...data,[k]:String(v)});data=next;write();},
  removeItem(k){if(!wpVaultAllowed(k))return;const next={...data};delete next[k];data=next;write();}
 };
 async function flush(){return db?Boolean(await chain)&&!failure:phase!=='error'||!preferences()?.getItem(pref());}
 function releaseDb(){db?.close();db=null;release?.();release=null;}
 async function enable(){
  if(!scope||busy||db)return false;
  busy=true;phase='opening';failure='';emit();
  try{
   release=await acquire(scope);if(!release){phase='locked';return false;}
   db=await open();const stored=await tx(db,'get',scope);
   if(stored!==undefined){
    const previous=wpVaultSnapshot(stored);
    if(hasSession&&!wpVaultSame(previous,data))throw Error('本分頁與持久副本內容不同，請先下載／核對，不會自動合併');
    data=previous;
   }else await tx(db,'put',scope,wpVaultSnapshot(data));
   const p=preferences();if(!p)throw Error('無法保存啟用設定');
   p.setItem(pref(),'1');saveSession();phase='enabled';return true;
  }catch(e){failure=e.message||'持久暫存無法開啟';phase='error';releaseDb();return false;}
  finally{busy=false;emit();}
 }
 async function configure(next){
  if(next===scope)return;
  if(busy)throw Error('離線資料庫正在操作');
  if(db){await chain;releaseDb();}
  scope=next||'';data={};hasSession=false;sessionOk=true;failure='';pending=0;chain=Promise.resolve(true);phase=scope?'off':'unavailable';
  if(!scope){emit();return;}
  try{const raw=session()?.getItem(key());if(raw!==null&&raw!==undefined){data=wpVaultSnapshot(JSON.parse(raw));hasSession=true;}}
  catch(e){failure='本分頁離線資料格式異常，請先保留原始資料';phase='error';emit();return;}
  let wanted=false;try{wanted=preferences()?.getItem(pref())==='1';}catch{}
  if(wanted)await enable();else emit();
 }
 async function disable(){
  if(!scope||busy)return false;
  busy=true;emit();
  try{
   if(db)await chain;
   else{release=await acquire(scope);if(!release)throw Error('其他分頁正在使用持久資料');db=await open();}
   await tx(db,'delete',scope);
   preferences()?.removeItem(pref());saveSession();releaseDb();failure='';phase='off';chain=Promise.resolve(true);return true;
  }catch(e){failure=e.message||'無法清除持久副本';phase='error';return false;}
  finally{busy=false;emit();}
 }
 return {status,configure,enable,disable,flush,storage:()=>scope?adapter:session(),snapshot:()=>wpVaultSnapshot(data)};
}
export const offlineVault=createOfflineVault();
export function offlineDraftStorage(){return offlineVault.storage();}
export function offlineVaultStatus(){return offlineVault.status();}
export async function flushOfflineVault(){return offlineVault.flush();}
