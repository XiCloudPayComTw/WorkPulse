import { CATEGORIES } from './data.js';
export function normalizeCategories(list){
 if(!Array.isArray(list))return [...CATEGORIES];
 const items=list.map(v=>String(v??'').trim()).filter(Boolean);
 if(!items.length||items.length>60||items.some(v=>v.length>100)||
    new Set(items.map(v=>v.toLocaleLowerCase('zh-TW'))).size!==items.length)
  throw Error('工作類型清單格式錯誤或名稱重複');
 return items;
}
export function addWorkCategory(list,name){
 const next=String(name||'').trim();
 if(!next||next.length>100)throw Error('工作類型名稱需為 1 至 100 字');
 return normalizeCategories([...normalizeCategories(list),next]);
}
export function renameWorkCategory(list,oldName,name){
 const target=String(name||'').trim();
 if(!target||target.length>100)throw Error('工作類型名稱需為 1 至 100 字');
 const current=normalizeCategories(list);
 if(!current.includes(oldName))throw Error('找不到要編輯的工作類型');
 return normalizeCategories(current.map(v=>v===oldName?target:v));
}

export function renameLocalWorkCategory(store,previous,target){
 const categories=renameWorkCategory(store.categories||CATEGORIES,previous,target);
 return {...store,categories,journals:store.journals.map(journal=>({
  ...journal,tasks:journal.tasks.map(task=>task.category===previous?{
   ...task,category:target,title:task.title===previous?target:task.title
  }:task)
 }))};
}
