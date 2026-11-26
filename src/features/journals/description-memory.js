/** Per employee, on this device only. Never sent to the cloud as suggestions. */
const WORK_DESCRIPTION_PREFIX='workpulse:description-memory:v1:';
function descriptionKey(employeeId){
 return WORK_DESCRIPTION_PREFIX+encodeURIComponent(String(employeeId||'').slice(0,120));
}
export function readDescriptionMemory(storage,employeeId){
 if(!employeeId)return [];
 try{
  const values=JSON.parse(storage?.getItem(descriptionKey(employeeId))||'[]');
  return Array.isArray(values)?values.filter(v=>typeof v==='string'&&v.trim())
    .map(v=>v.slice(0,2000)).slice(0,35):[];
 }catch{return [];}
}
export function rememberDescriptions(storage,employeeId,rows){
 if(!employeeId)return [];
 const incoming=(rows||[]).map(t=>String(t?.description||'').trim())
  .filter(v=>v.length>=3).map(v=>v.slice(0,2000));
 const result=[...new Set([...incoming,...readDescriptionMemory(storage,employeeId)])].slice(0,35);
 try{storage?.setItem(descriptionKey(employeeId),JSON.stringify(result));}catch{}
 return result;
}
export function descriptionSuggestions(storage,employeeId,query,journals=[],limit=6){
 const current=String(query||'').trim().toLocaleLowerCase();
 const max=Math.max(0,Math.min(12,Math.trunc(Number(limit)||0))),choices=[],seen=new Set();
 if(!max)return choices;
 function add(v){if(typeof v!=='string'||!v||v===query||seen.has(v)||current&&!v.toLocaleLowerCase().includes(current))return false;seen.add(v);choices.push(v);return choices.length>=max;}
 for(const v of readDescriptionMemory(storage,employeeId))if(add(v))return choices;
 for(const j of journals){if(j.employeeId!==employeeId)continue;for(const t of j.tasks||[])if(add(t.description))return choices;}
 return choices;
}
