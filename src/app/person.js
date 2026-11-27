const SELECTED_PERSON_KEY='workpulse:selected-person:v1';
export function resolvePerson(people,storedId){
 const list=Array.isArray(people)?people:[];
 return list.some(e=>e.id===storedId)?storedId:(list[0]?.id||'');
}
export function readSelectedPerson(storage,people,{fallback=true}={}){
 let id='';
 try{id=storage?.getItem(SELECTED_PERSON_KEY)||'';}catch{}
 return fallback?resolvePerson(people,id):(Array.isArray(people)&&people.some(e=>e.id===id)?id:'');
}
export function writeSelectedPerson(storage,id){
 try{storage?.setItem(SELECTED_PERSON_KEY,id);return true;}catch{return false;}
}
export function shortPersonName(name){
 const points=Array.from(String(name||''));
 return points.slice(-2).join('')||'人員';
}
export function isMobileViewport(){
 return typeof window!=='undefined'&&typeof window.matchMedia==='function'&&
  window.matchMedia('(max-width:900px)').matches;
}
