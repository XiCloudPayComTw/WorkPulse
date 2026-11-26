/** Local-only list operations. Cloud changes require owner-verified APIs. */
function normalizedName(name,max,kind){
 const value=String(name??'').trim();
 if(!value)throw Error('請輸入'+kind+'名稱');
 if(value.length>max)throw Error(kind+'名稱最多 '+max+' 個字');
 return value;
}
function uniqueName(values,target,id,kind){
 const candidate=target.toLocaleLowerCase('zh-TW');
 if(values.some(({id:other,name})=>id!==other&&String(name).toLocaleLowerCase('zh-TW')===candidate))
  throw Error(kind+'名稱已存在');
}
export function renameLocalEmployee(store,id,name){
 const target=normalizedName(name,80,'人員');
 const record=store.employees.find(row=>row.id===id);
 if(!record)throw Error('找不到指定人員');
 uniqueName(store.employees,target,id,'人員');
 return {...store,employees:store.employees.map(row=>row.id===id?{...row,name:target}:row)};
}
/** Legacy local journal tasks contain a string project key rather than an ID.
 * A project rename must rekey both the list and existing local tasks to preserve
 * grouping and filtering. Employee records use immutable employee IDs.
 */
export function renameLocalProject(store,previous,name){
 const target=normalizedName(name,100,'專案');
 const current=String(previous??'');
 if(!store.projects.includes(current))throw Error('找不到指定專案');
 if(store.projects.some(value=>value!==current&&value.toLocaleLowerCase('zh-TW')===target.toLocaleLowerCase('zh-TW')))
  throw Error('專案名稱已存在');
 return {...store,
  projects:store.projects.map(value=>value===current?target:value),
  journals:store.journals.map(journal=>({
   ...journal,tasks:journal.tasks.map(task=>task.project===current?{...task,project:target}:task)
  }))
 };
}
