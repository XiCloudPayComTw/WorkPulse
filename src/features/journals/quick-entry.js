// Small, per-browser writing helpers. The company cloud record is ALWAYS stored by Apps Script;
// this module only holds an unsubmitted draft / personal shortcuts in browser storage.
import { uid } from '../../shared/utils.js';

const DRAFT_PREFIX = 'workpulse:v0.5:draft:';
const TEMPLATE_PREFIX = 'workpulse:v0.5:templates:';
const TITLE_MAX = 160;
const safeKey = account => encodeURIComponent(String(account || 'local-device').slice(0,220));
const draftKey = account => DRAFT_PREFIX + safeKey(account);
const templateKey = account => TEMPLATE_PREFIX + safeKey(account);
const plain = (value, limit) => String(value ?? '').slice(0, limit);
const isDay = text => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(text));
const normalizeTask = task => ({
  id:plain(task?.id || uid(),120), project:plain(task?.project,100),
  category:plain(task?.category || '其他',100), title:plain(task?.title,TITLE_MAX),
  description:plain(task?.description,2000),result:plain(task?.result,1000),
  status:['done','doing','blocked'].includes(task?.status)?task.status:'doing',
  hours:Math.min(24,Math.max(0,Number(task?.hours)||0))
});
function quickDraftRows(storage,account){
 const raw=storage?.getItem(draftKey(account));if(!raw)return [];
 const p=JSON.parse(raw);
 if(p?.account!==String(account))throw Error('草稿帳號不符');
 if(p.version===2){if(!Array.isArray(p.rows)||p.rows.length>31)throw Error('草稿資料格式異常');return p.rows;}
 if(p.draft)return [{savedAt:p.savedAt,draft:p.draft}];
 throw Error('草稿資料格式異常');
}
function quickDraftValid(row,maxAgeMs){
 const d=row?.draft,age=Date.now()-row?.savedAt;
 return Number.isFinite(age)&&age>=-60000&&age<=maxAgeMs&&d&&isDay(d.date)&&typeof d.employeeId==='string'&&Array.isArray(d.tasks)&&d.tasks.length>0&&d.tasks.length<=100;
}
function quickDraftNormalize(d){
 return {date:d.date,employeeId:plain(d.employeeId,180),note:plain(d.note,2000),tomorrow:plain(d.tomorrow,2000),tasks:d.tasks.map(normalizeTask),editing:!!d.editing,revision:Number(d.revision)||0};
}
export function listQuickDrafts(storage,account,maxAgeMs=7*86400000,employeeId=''){
 try{return quickDraftRows(storage,account).filter(row=>quickDraftValid(row,maxAgeMs)&&(!employeeId||row.draft.employeeId===employeeId)).sort((a,b)=>b.savedAt-a.savedAt).map(row=>({date:row.draft.date,employeeId:row.draft.employeeId,savedAt:row.savedAt}));}catch{return [];}
}
export function readQuickDraft(storage,account,maxAgeMs=7*86400000,date='',employeeId=''){
 try{const row=quickDraftRows(storage,account).filter(x=>quickDraftValid(x,maxAgeMs)&&(!date||x.draft.date===date)&&(!employeeId||x.draft.employeeId===employeeId)).sort((a,b)=>b.savedAt-a.savedAt)[0];return row?quickDraftNormalize(row.draft):null;}catch{return null;}
}
export function saveQuickDraft(storage,account,draft){
 if(!storage||!draft||!isDay(draft.date)||typeof draft.employeeId!=='string'||!Array.isArray(draft.tasks)||!draft.tasks.length||draft.tasks.length>100)return false;
 try{
  const rows=quickDraftRows(storage,account).filter(row=>!(row.draft?.date===draft.date&&row.draft?.employeeId===draft.employeeId));
  if(rows.length>=31)return false; // Never silently evict other dates.
  rows.push({savedAt:Date.now(),draft:quickDraftNormalize(draft)});
  storage.setItem(draftKey(account),JSON.stringify({account:String(account),version:2,rows}));return true;
 }catch{return false;}
}
export function clearQuickDraft(storage,account,date='',employeeId=''){
 try{
  if(!date&&!employeeId){storage?.removeItem(draftKey(account));return true;}
  const rows=quickDraftRows(storage,account).filter(row=>!((!date||row.draft?.date===date)&&(!employeeId||row.draft?.employeeId===employeeId)));
  if(rows.length)storage?.setItem(draftKey(account),JSON.stringify({account:String(account),version:2,rows}));else storage?.removeItem(draftKey(account));return true;
 }catch{return false;}
}
export function readTemplates(storage,account){
 try{
  const rows=JSON.parse(storage?.getItem(templateKey(account))||'[]');if(!Array.isArray(rows))return [];
  return rows.slice(0,12).filter(r=>r&&typeof r.title==='string'&&r.title.trim()).map(r=>({id:plain(r.id,120),title:plain(r.title,TITLE_MAX),project:plain(r.project,100),category:plain(r.category,100),description:plain(r.description,2000)}));
 }catch{return [];}
}
export function addTemplate(storage,account,task){
 const title=plain(task?.title,TITLE_MAX).trim();if(!title)return {ok:false,reason:'請先填寫工作名稱'};
 const signatureOf=row=>JSON.stringify([plain(row.category||row.title,160).trim(),plain(row.project,100).trim(),plain(row.description,2000).trim()].map(x=>x.toLocaleLowerCase()));
 const rows=readTemplates(storage,account),signature=signatureOf({...task,title});
 if(rows.some(r=>signatureOf(r)===signature))return {ok:false,reason:'這個常用項目已存在'};
 const item={id:uid(),title,project:plain(task.project,100),category:plain(task.category,100),description:plain(task.description,2000)};
 try{storage?.setItem(templateKey(account),JSON.stringify([item,...rows].slice(0,10)));return {ok:true,item};}catch{return {ok:false,reason:'無法儲存常用項目'};}
}
export function removeTemplate(storage,account,id){
 const rows=readTemplates(storage,account).filter(r=>r.id!==id);
 try{storage?.setItem(templateKey(account),JSON.stringify(rows));return true;}catch{return false;}
}
/** Update saved local shortcuts to follow a local project rename. */
export function renameTemplatesProject(storage,account,oldName,newName){
 const rows=readTemplates(storage,account);
 const updated=rows.map(row=>row.project===oldName?{...row,project:newName}:row);
 try{
  if(rows.some(row=>row.project===oldName))
   storage?.setItem(templateKey(account),JSON.stringify(updated));
  return updated;
 }catch{
  return rows;
 }
}
export function renameTemplatesCategory(storage,account,oldName,newName){
 const values=readTemplates(storage,account);
 const changed=values.map(row=>row.category===oldName?{
  ...row,category:newName,title:row.title===oldName?newName:row.title
 }:row);
 try{if(values.some(row=>row.category===oldName))
  storage?.setItem(templateKey(account),JSON.stringify(changed));
 }catch{}
 return changed;
}
// Only reuse the work definition; never copy yesterday's completion status, result or logged hours.
export function newTaskFromTemplate(task){const row=normalizeTask(task);return {...row,id:uid(),result:'',status:'doing',hours:0};}
export function recentPriorJournal(journals,date,employeeId){
 return [...(journals||[])].filter(j=>j?.employeeId===employeeId&&isDay(j.date)&&j.date<date&&Array.isArray(j.tasks))
  .sort((a,b)=>b.date.localeCompare(a.date))[0]||null;
}
