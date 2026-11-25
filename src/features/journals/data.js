import { localISODate, shiftDate, currentMonth, uid, csvSafe } from '../../shared/utils.js';
export const STORAGE_KEY = 'workpulse:v1';
export const VERSION = 1;
export const STATUSES = { done:'已完成', doing:'進行中', blocked:'待處理' };
export const CATEGORIES = ['前端開發','展店設計','現場勘查','行政／會議','其他'];

const demoTasks = [
  { title:'調整工作日誌操作流程', category:'前端開發', description:'整理日期選取、動態新增項目與表單欄位。', result:'完成第一版互動規格', status:'done', hours:2.5 },
  { title:'確認設備與空間配置', category:'展店設計', description:'比對洗脫烘設備需求與現場動線。', result:'更新配置方向', status:'doing', hours:3 },
  { title:'專案例會與進度同步', category:'行政／會議', description:'同步本週開發與設計待辦。', result:'列出待確認事項', status:'done', hours:1 },
  { title:'製作響應式版面', category:'前端開發', description:'調整桌面與手機版的卡片佈局。', result:'完成版面草稿', status:'done', hours:4 },
  { title:'整理案場施工紀錄', category:'現場勘查', description:'彙整現場照片與尺寸資訊。', result:'施工待辦清單', status:'blocked', hours:2 },
  { title:'整理元件與色彩規範', category:'前端開發', description:'定義灰藍色階與浮凸陰影。', result:'視覺設計規範', status:'done', hours:3 }
];
function task(source) { return {id:uid(), ...source}; }
export function demoState(today = localISODate()) {
  return {
    version: VERSION, mode:'demo',
    employees:[{id:'me',name:'展示使用者'},{id:'design',name:'設計同仁'},{id:'dev',name:'開發同仁'}],
    projects:['WorkPulse','展店設計','網站維護','一般行政'],
    journals:[
      { id:'demo-1', date:today, employeeId:'me', note:'今日以內部系統規劃與案場確認為主。', tomorrow:'持續完善工作日誌介面。', updatedAt:`${today}T17:30:00`, tasks:demoTasks.slice(0,3).map(task) },
      { id:'demo-2', date:shiftDate(today,-1), employeeId:'me', note:'', tomorrow:'', updatedAt:`${today}T17:00:00`, tasks:demoTasks.slice(3,5).map(task) },
      { id:'demo-3', date:shiftDate(today,-4), employeeId:'design', note:'', tomorrow:'', updatedAt:`${today}T16:50:00`, tasks:[task(demoTasks[4]),task(demoTasks[5])] }
    ]
  };
}
export function emptyState() { return {version: VERSION, mode:'local', employees:[{id:'me',name:'我的帳號'}],projects:['一般專案'],journals:[]}; }
export function readState(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) return validateState(JSON.parse(raw));
  } catch (e) { console.warn('Unable to read local data', e); }
  return demoState();
}
export function writeState(state, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify({...state,mode:'local'}));
}
export function validateState(payload) {
  if (!payload || payload.version !== VERSION || !Array.isArray(payload.employees) || !Array.isArray(payload.projects) || !Array.isArray(payload.journals)) throw Error('檔案格式或版本不正確');
  if (payload.employees.length > 200 || payload.projects.length > 500 || payload.journals.length > 100000) throw Error('資料量超過限制');
  const employees = payload.employees.filter(e => typeof e.id === 'string' && typeof e.name === 'string' && e.id.length <= 120).map(e=>({id:e.id,name:e.name.slice(0,80)}));
  if (!employees.length) throw Error('必須保留至少一位人員');
  const projects = payload.projects.filter(x => typeof x === 'string').slice(0,500).map(x=>x.slice(0,100));
  const journals = payload.journals.map(j => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j.date) || typeof j.employeeId !== 'string' || !Array.isArray(j.tasks) || j.tasks.length > 100) throw Error('紀錄包含無效日期或工作內容');
    return {
      id:String(j.id || uid()).slice(0,120),date:j.date,employeeId:j.employeeId,
      note:String(j.note || '').slice(0,2000),tomorrow:String(j.tomorrow || '').slice(0,2000),updatedAt:String(j.updatedAt || ''),
      tasks:j.tasks.map(t => ({id:String(t.id || uid()).slice(0,120),title:String(t.title || '').slice(0,160),category:String(t.category || '其他').slice(0,100),description:String(t.description || '').slice(0,2000),result:String(t.result || '').slice(0,1000),status:STATUSES[t.status] ? t.status : 'doing',hours:Math.max(0,Math.min(24,Number(t.hours)||0)),project:String(t.project || '').slice(0,100)}))
    };
  });
  return {version: VERSION,mode:'local',employees,projects,journals};
}
export function saveJournal(state, entry) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) throw Error('請選擇有效的工作日期');
  if (!state.employees.some(x=>x.id===entry.employeeId)) throw Error('請選擇填寫人員');
  const clean = (entry.tasks || []).filter(t=>t.title.trim()).map(t=>({
    id:t.id || uid(),project:(t.project||'').trim().slice(0,100),title:t.title.trim().slice(0,160),
    category:CATEGORIES.includes(t.category)?t.category:'其他',description:(t.description||'').trim().slice(0,2000),result:(t.result||'').trim().slice(0,1000),
    status:STATUSES[t.status]?t.status:'doing',hours:Number(t.hours)||0
  }));
  if (!clean.length) throw Error('至少需要填寫一項工作名稱');
  if (clean.some(t=>t.hours<0||t.hours>24)||clean.reduce((sum,t)=>sum+t.hours,0)>24) throw Error('每日總工時不可超過 24 小時');
  const existing = state.journals.find(j=>j.date===entry.date && j.employeeId===entry.employeeId);
  const record = {id:existing?.id || uid(),date:entry.date,employeeId:entry.employeeId,note:(entry.note||'').trim().slice(0,2000),tomorrow:(entry.tomorrow||'').trim().slice(0,2000),tasks:clean,updatedAt:new Date().toISOString()};
  return {...state,journals:[...state.journals.filter(j=>!(j.date===record.date && j.employeeId===record.employeeId)),record]};
}
export function journalFor(state,date,employeeId) { return state.journals.find(j=>j.date===date && j.employeeId===employeeId); }
export function monthStats(state,month=currentMonth()) {
  const journals = state.journals.filter(j=>j.date.startsWith(month));
  const tasks = journals.flatMap(j=>j.tasks);
  const hours = tasks.reduce((sum,t)=>sum+(Number(t.hours)||0),0);
  const completed = tasks.filter(t=>t.status==='done').length;
  const pending = tasks.filter(t=>t.status!=='done').length;
  const days = new Set(journals.map(j=>j.date)).size;
  const byCategory = CATEGORIES.map(name => ({name,hours:tasks.filter(t=>t.category===name).reduce((a,t)=>a+(Number(t.hours)||0),0),count:tasks.filter(t=>t.category===name).length})).filter(i=>i.count);
  const byDay = [...new Set(journals.map(j=>j.date))].sort().map(date=>({date,count:journals.filter(j=>j.date===date).reduce((sum,j)=>sum+j.tasks.length,0),hours:journals.filter(j=>j.date===date).flatMap(j=>j.tasks).reduce((a,t)=>a+(Number(t.hours)||0),0)}));
  return {journals,tasks,count:tasks.length,hours,completed,pending,days,rate:tasks.length?Math.round(completed/tasks.length*100):0,byCategory,byDay};
}
export function csvExport(state) {
  const header = ['日期','員工','專案','工作類型','工作名稱','工作內容','成果','狀態','投入時數','當日備註','明日計畫'];
  const rows = state.journals.flatMap(j=>j.tasks.map(t=>[j.date,state.employees.find(e=>e.id===j.employeeId)?.name||'',t.project,t.category,t.title,t.description,t.result,STATUSES[t.status],t.hours,j.note,j.tomorrow]));
  return '\uFEFF'+[header,...rows].map(row=>row.map(csvSafe).join(',')).join('\r\n');
}
