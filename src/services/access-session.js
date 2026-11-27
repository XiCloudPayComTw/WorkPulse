// Bearer credentials are separate from drafts, URLs, employee records and request payloads.
const WP_ACCESS_PREFIX='workpulse:shared-access:v1:';
export function validAccessScope(scope){return typeof scope==='string'&&/^[A-Za-z0-9_-]{43}$/.test(scope);}
export function accessSessionValid(value,now=Date.now()){
 return !!value&&typeof value.token==='string'&&/^v2\.\d{13}\.[a-f0-9]{32}\.[^.]{1,360}\.[A-Za-z0-9_-]{43}$/.test(value.token)&&
 Number.isSafeInteger(value.expiresAt)&&Number(value.token.split('.')[1])===value.expiresAt&&value.expiresAt>now&&value.expiresAt<=now+30*86400000+60000;
}
export function accessStorage(storage,scope,kind){
 if(!storage||!validAccessScope(scope)||!['person','tab','session'].includes(kind))return null;
 const prefix=WP_ACCESS_PREFIX+scope+':'+kind+':';
 return {getItem:key=>storage.getItem(prefix+key),setItem:(key,value)=>storage.setItem(prefix+key,value),removeItem:key=>storage.removeItem(prefix+key)};
}
export function loadAccessSession(storage,scope,now=Date.now()){
 const s=accessStorage(storage,scope,'session');
 try{const raw=s?.getItem('credential');if(!raw)return null;const value=JSON.parse(raw);if(accessSessionValid(value,now))return {token:value.token,expiresAt:value.expiresAt};s.removeItem('credential');}catch{}
 return null;
}
export function rememberAccessSession(storage,scope,value){
 if(!accessSessionValid(value))return false;
 const s=accessStorage(storage,scope,'session');
 try{if(!s)return false;s.setItem('credential',JSON.stringify({token:value.token,expiresAt:value.expiresAt}));return true;}catch{return false;}
}
export function forgetAccessSession(storage,scope){
 try{const s=accessStorage(storage,scope,'session');if(!s)return false;s.removeItem('credential');return !s.getItem('credential');}catch{return false;}
}

export function validAccessGrant(value,now=Date.now()){
 return !!value&&typeof value.token==='string'&&/^v1\.\d{13}\.[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/.test(value.token)&&
 Number.isSafeInteger(value.expiresAt)&&Number(value.token.split('.')[1])===value.expiresAt&&value.expiresAt>now&&value.expiresAt<=now+360000&&
 Array.isArray(value.people)&&value.people.every(p=>typeof p.id==='string'&&p.id&&typeof p.name==='string');
}
