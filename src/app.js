import { icon } from './icons.js';
import { STORAGE_KEY, CATEGORIES, STATUSES, readState, writeState, saveJournal, journalFor, monthStats, csvExport, emptyState, validateState } from './data.js';
import { currentMonth, localISODate, shiftDate, formatDate, formatHours, esc, uid, download } from './utils.js';

const root = document.querySelector('#app');
const NAV = [
  {id:'overview',label:'工作總覽',symbol:'dashboard'},
  {id:'entry',label:'填寫日誌',symbol:'pen'},
  {id:'history',label:'歷史紀錄',symbol:'calendar'},
  {id:'insights',label:'統計分析',symbol:'chart'},
  {id:'settings',label:'系統設定',symbol:'settings'}
];
const today = localISODate();
const state = {
  store:readState(),view:fromHash(),month:currentMonth(),
  filters:{query:'',employee:'all',status:'all'},
  expanded:new Set([today,shiftDate(today,-1)]),draft:null,dirty:false,
  toast:null
};
state.draft = makeDraft(today, state.store.employees[0]?.id);
function fromHash(){const key = location.hash.replace(/^#\/?/,'');return NAV.some(n=>n.id===key)?key:'overview';}
function makeItem(source={}) {return {id:source.id||uid(),project:source.project||'',category:source.category||'前端開發',title:source.title||'',description:source.description||'',result:source.result||'',status:source.status||'doing',hours:source.hours??0};}
function makeDraft(date=today,employeeId=state.store.employees[0]?.id,fromRecord=null) {
  const record = fromRecord ?? (state.store.mode==='demo'?null:journalFor(state.store,date,employeeId));
  return {date,employeeId,note:record?.note||'',tomorrow:record?.tomorrow||'',tasks:record?.tasks.length?record.tasks.map(makeItem):[makeItem()],editing:!!record};
}
function employeeName(id){return state.store.employees.find(e=>e.id===id)?.name || '未指定人員';}
function navButton(n, mobile=false){return `<button type="button" class="nav-link ${state.view===n.id?'active':''}" data-action="navigate" data-view="${n.id}" aria-current="${state.view===n.id?'page':'false'}">${icon(n.symbol,mobile?18:19)}<span>${n.label}</span></button>`;}
function renderShell(){
 const head = {overview:['工作總覽','掌握每一天的工作節奏'],entry:['填寫工作日誌','整理今天的付出，留下清晰紀錄'],history:['歷史工作紀錄','以日期為單位，快速找到每項工作'],insights:['統計分析','從工作日誌看見實際進展'],settings:['系統設定','管理選項與本機資料']}[state.view];
 root.innerHTML = `<div class="shell">
   <aside class="sidebar" aria-label="側邊選單"><div class="brand"><div class="brand-symbol">W<small>·</small></div><div><div class="brand-title">WorkPulse</div><div class="brand-subtitle">WORK JOURNAL</div></div></div>
   <div><div class="sidebar-caption">WORKSPACE</div><nav class="nav-list" aria-label="主要選單">${NAV.map(n=>navButton(n)).join('')}</nav></div>
   <div class="sidebar-bottom"><div class="mode-card"><div class="mode-title">${icon('database',16)} 本機展示版本</div><p>目前資料儲存在這台裝置的瀏覽器，尚未與 Google Sheets 同步。</p></div><div class="sidebar-foot">WORKPULSE · v0.1.0</div></div></aside>
   <main class="main"><header class="topbar"><div><div class="eyebrow">WORKPULSE / ${esc(state.view.toUpperCase())}</div><h1 class="page-title">${head[0]}</h1><p class="page-desc">${head[1]}</p></div>
   <div class="top-actions"><span class="tiny-date">${formatDate(today)}<br/>${today.slice(0,4)} 年</span><button class="soft-button sm" data-action="new-journal">${icon('plus',15)} 新增日誌</button><span class="avatar" title="展示模式，尚無登入機制">示</span></div></header>
   <div id="page-content" class="flash">${renderPage()}</div><footer class="footer">WorkPulse · Make every day count &nbsp; / &nbsp; v0.1.0</footer></main>
   <nav class="mobile-nav" aria-label="手機導覽">${NAV.map(n=>navButton(n,true)).join('')}</nav>
   <div class="toast-stack" id="toast-stack" role="status" aria-live="polite"></div>
   <input id="import-file" type="file" accept=".json,application/json" aria-label="匯入工作日誌 JSON 備份" />
  </div>`;
 if(state.toast) showToast(state.toast.text,state.toast.error,true);
}
function renderPage(){switch(state.view){case 'entry':return renderEntry();case 'history':return renderHistory();case 'insights':return renderInsights();case 'settings':return renderSettings();default:return renderOverview();}}
function summaryTiles(stats){
 return `<div class="stats-grid section-space flash-delay">
 ${[
  ['list','本月工作項目',stats.count,'已記錄的工作項目'],
  ['clock','累計投入工時',formatHours(stats.hours),'本月登錄總時數'],
  ['checkCircle','已完成',stats.completed,`完成率 ${stats.rate}%`],
  ['calendar','紀錄天數',stats.days,'有填寫紀錄的日期']
 ].map(([i,label,value,foot])=>`<div class="soft-card stat-card"><div class="row-between"><span class="surface-label">${label}</span><span class="stat-icon">${icon(i,18)}</span></div><div class="stat-number">${value}</div><div class="stat-foot">${foot}</div></div>`).join('')}</div>`;
}
function recentGroups(limit=3){
 const groups = groupJournals(state.store.journals.filter(j=>j.date.startsWith(state.month))).slice(0,limit);
 if(!groups.length) return empty('calendar','還沒有工作紀錄','新增第一筆日誌，這裡就會開始出現你的工作摘要。','開始填寫','new-journal');
 return `<div>${groups.map(g=>`<div class="record-group"><div class="record-date"><div class="row"><span class="date-icon">${icon('calendar',16)}</span><div><div style="font-size:13px;font-weight:500">${formatDate(g.date)}</div><div class="xs muted">${g.journals.length} 位人員 · ${g.journals.flatMap(j=>j.tasks).length} 個項目</div></div></div><span class="tag">${formatHours(totalHours(g.journals))}</span></div>
 ${g.journals.flatMap(j=>j.tasks).slice(0,4).map(t=>`<div class="record-line"><span class="record-bullet ${esc(t.status)}"></span><span class="record-line-title" title="${esc(t.title)}">${esc(t.title)}</span><span class="tag ${esc(t.status)}">${STATUSES[t.status]}</span></div>`).join('')}
 </div>`).join('')}</div>`;
}
function renderOverview(){
 const stats=monthStats(state.store,state.month);
 return `<section class="soft-card hero"><div><div class="overline">A BETTER WAY TO WORK</div><h2>讓每一天的進展，<br/>都變得清晰可見。</h2><p>在下班前花幾分鐘整理工作，讓記錄、查閱與回顧成為自然的習慣。</p><button class="soft-button primary" data-action="new-journal">${icon('pen',16)} 填寫今日工作 ${icon('arrowRight',15)}</button></div><div class="hero-graphic" aria-hidden="true">W<span class="dot">.</span></div></section>
 ${state.store.mode==='demo'?`<div class="notice section-space">${icon('info',18)}<div>目前看到的是<strong style="font-weight:550">示範資料</strong>，首次儲存正式工作紀錄時會自動移除示範內容。請勿在此版本輸入機密資料。</div></div>`:''}
 ${summaryTiles(stats)}<div class="two-col section-space"><section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">最近工作紀錄</h2><p class="card-sub">依日期整合當日所有工作內容</p></div><button class="soft-button ghost sm" data-action="navigate" data-view="history">查看全部 ${icon('arrowRight',15)}</button></div>${recentGroups()}</section>
 <section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">本月工作狀態</h2><p class="card-sub">工作完成概況與投入分布</p></div>${icon('target',19)}</div><div class="insight-pair"><span class="muted">完成率</span><span style="font-size:26px;line-height:1">${stats.rate}<span class="small">%</span></span></div><div class="progress-track"><div class="progress-fill" style="width:${stats.rate}%"></div></div><div class="divider"></div><div class="row-between"><span class="small muted">已完成項目</span><span class="small">${stats.completed} 項</span></div><div class="row-between" style="margin-top:13px"><span class="small muted">未完成項目</span><span class="small">${stats.pending} 項</span></div><div class="divider"></div><div class="overline">WORK DISTRIBUTION</div>${categoryBars(stats)}</section></div>`;
}
function categoryBars(stats){
 if(!stats.byCategory.length) return '<p class="small muted">目前沒有可統計的工作分類。</p>';
 const max=Math.max(...stats.byCategory.map(x=>x.hours),1);
 return stats.byCategory.slice(0,5).map(x=>`<div class="bar-row"><span class="muted">${esc(x.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2,x.hours/max*100)}%"></div></div><span style="text-align:right">${formatHours(x.hours)}</span></div>`).join('');
}
function renderEntry(){
 const d=state.draft;
 const existing = state.store.mode !== 'demo' && journalFor(state.store,d.date,d.employeeId);
 return `<div class="entry-grid"><div><section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">基本資訊</h2><p class="card-sub">選擇日期與填寫人員，同一天可建立多個工作項目</p></div><span class="tag">${existing?'編輯紀錄':'新增紀錄'}</span></div><div class="form-fields">
  <label class="form-group"><span class="field-label">工作日期 *</span><input class="input" type="date" id="entry-date" data-identity="date" value="${esc(d.date)}" required /></label>
  <label class="form-group"><span class="field-label">填寫人員 *</span><select class="input" id="entry-employee" data-identity="employeeId">${state.store.employees.map(e=>`<option value="${esc(e.id)}" ${d.employeeId===e.id?'selected':''}>${esc(e.name)}</option>`).join('')}</select></label>
 </div></section>
 <div class="section-head section-space"><div><h2 class="section-title">工作項目 <span class="muted" style="font-size:13px">(${d.tasks.length})</span></h2><p class="card-sub">每件工作獨立記錄，儲存時自動合併到同一天</p></div><button class="soft-button sm" data-action="add-task">${icon('plus',15)} 新增項目</button></div>
 <div class="entry-task-list">${d.tasks.map((t,i)=>renderTask(t,i)).join('')}</div>
 <button class="soft-button" style="width:100%;margin-top:18px" data-action="add-task">${icon('plus',17)} 新增另一項工作</button>
 <section class="soft-card card-pad-lg section-space"><div class="card-head"><div><h2 class="card-title">每日補充</h2><p class="card-sub">這些內容會附在當天的整體工作紀錄中</p></div>${icon('edit',18)}</div><div class="form-fields"><label class="form-group full"><span class="field-label">當日備註</span><textarea class="input" data-draft="note" placeholder="記下需要協調、追蹤或提醒的事項…">${esc(d.note)}</textarea></label><label class="form-group full"><span class="field-label">明日計畫</span><textarea class="input" data-draft="tomorrow" placeholder="明天預計接續處理的工作…">${esc(d.tomorrow)}</textarea></label></div></section></div>
 <aside class="entry-summary"><section class="soft-card card-pad-lg"><div class="overline">DAILY SUMMARY</div><div class="divider"></div><div class="small muted">${formatDate(d.date)}</div><div class="status-big" id="draft-hours">${formatHours(totalDraftHours())}</div><div class="small muted">預計 / 實際投入工時</div><div class="divider"></div><div class="row-between"><span class="small muted">工作項目</span><strong id="draft-count" style="font-weight:500">${d.tasks.length}</strong></div><div class="row-between" style="margin-top:12px"><span class="small muted">已完成</span><span id="draft-done" class="small">${d.tasks.filter(t=>t.status==='done').length} 項</span></div><div class="entry-actions"><button class="soft-button primary" data-action="save-journal">${icon('save',16)} 儲存今日工作</button><button class="soft-button" data-action="navigate" data-view="history">${icon('calendar',15)} 查看歷史紀錄</button></div><div class="divider"></div><div class="hint-row">${icon('checkCircle',15)} 一次儲存當天全部工作項目</div><div class="hint-row">${icon('edit',15)} 同一天再次儲存會更新原有紀錄</div><div class="hint-row">${icon('database',15)} 資料目前只保存在此瀏覽器</div></section><div class="note-box section-space">${icon('sparkles',15)} &nbsp; 提醒：同一日期與填寫人員的工作會自動整理成一組，方便之後查閱。</div></aside></div>`;
}
function renderTask(t,i){
 const key=`task-${i}`;
 const options=(items,value)=>[...(value&&!items.includes(value)?[value]:[]),...items].map(v=>`<option value="${esc(v)}" ${value===v?'selected':''}>${esc(v||'未指定專案')}</option>`).join('');
 return `<article class="task-card"><div class="task-heading"><div class="task-number"><span class="task-number-spot">${String(i+1).padStart(2,'0')}</span> 工作內容</div><button class="soft-button ghost mini danger" aria-label="刪除第 ${i+1} 項工作" data-action="remove-task" data-index="${i}">${icon('trash',16)}</button></div>
 <div class="form-fields"><label class="form-group full"><span class="field-label">工作名稱 *</span><input class="input" id="${key}-title" maxlength="160" data-task="${i}" data-field="title" placeholder="例如：確認自助洗衣設備配置" value="${esc(t.title)}" /></label>
 <label class="form-group"><span class="field-label">所屬專案</span><select class="input" data-task="${i}" data-field="project"><option value="" ${!t.project?'selected':''}>未指定專案</option>${options(state.store.projects,t.project)}</select></label>
 <label class="form-group"><span class="field-label">工作類型</span><select class="input" data-task="${i}" data-field="category">${options(CATEGORIES,t.category)}</select></label>
 <label class="form-group full"><span class="field-label">執行內容</span><textarea class="input" data-task="${i}" data-field="description" maxlength="2000" placeholder="今天實際執行的工作、處理進度與細節…">${esc(t.description)}</textarea></label>
 <label class="form-group full"><span class="field-label">成果 / 交付項目</span><input class="input" maxlength="1000" data-task="${i}" data-field="result" placeholder="例如：完成平面配置圖初稿" value="${esc(t.result)}" /></label>
 <label class="form-group"><span class="field-label">處理狀態</span><select class="input" data-task="${i}" data-field="status">${Object.entries(STATUSES).map(([v,label])=>`<option value="${v}" ${v===t.status?'selected':''}>${label}</option>`).join('')}</select></label>
 <label class="form-group"><span class="field-label">投入工時</span><input class="input" type="number" inputmode="decimal" step="0.5" min="0" max="24" data-task="${i}" data-field="hours" value="${Number(t.hours)||0}" /></label>
 </div></article>`;
}
function totalDraftHours(){return state.draft.tasks.reduce((sum,t)=>sum+(Number(t.hours)||0),0);}
function updateDraftSummary(){
 const h=document.querySelector('#draft-hours');if(h)h.textContent=formatHours(totalDraftHours());
 const c=document.querySelector('#draft-count');if(c)c.textContent=state.draft.tasks.length;
 const d=document.querySelector('#draft-done');if(d)d.textContent=`${state.draft.tasks.filter(t=>t.status==='done').length} 項`;
}
function groupJournals(journals){
 const map=new Map();for(const j of [...journals].sort((a,b)=>b.date.localeCompare(a.date))) {if(!map.has(j.date)) map.set(j.date,[]);map.get(j.date).push(j);}
 return [...map].map(([date,journals])=>({date,journals}));
}
function totalHours(journals){return journals.flatMap(j=>j.tasks).reduce((sum,t)=>sum+(Number(t.hours)||0),0);}
function filteredGroups(){
 const q=state.filters.query.trim().toLocaleLowerCase();
 const journals=state.store.journals.filter(j=>j.date.startsWith(state.month) && (state.filters.employee==='all'||j.employeeId===state.filters.employee)).map(j=>({
  ...j,tasks:j.tasks.filter(t=>(state.filters.status==='all'||t.status===state.filters.status)&&(!q||[t.title,t.project,t.description,t.result,t.category,employeeName(j.employeeId)].join(' ').toLocaleLowerCase().includes(q)))
 })).filter(j=>j.tasks.length);
 return groupJournals(journals);
}
function renderHistory(){
 return `<section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">篩選工作日誌</h2><p class="card-sub">按日期、人員、狀態或關鍵字尋找工作</p></div>${icon('filter',18)}</div><div class="filters">
 <label class="form-group"><span class="field-label">搜尋</span><input class="input" data-filter="query" value="${esc(state.filters.query)}" placeholder="工作名稱、內容、專案…" /></label>
 <label class="form-group"><span class="field-label">月份</span><input class="input" type="month" data-month value="${esc(state.month)}" /></label>
 <label class="form-group"><span class="field-label">填寫人員</span><select class="input" data-filter="employee"><option value="all">所有人員</option>${state.store.employees.map(e=>`<option value="${esc(e.id)}" ${state.filters.employee===e.id?'selected':''}>${esc(e.name)}</option>`).join('')}</select></label>
 </div><div class="row-between" style="margin-top:17px"><div class="small muted">依日期群組顯示紀錄</div><label class="row small muted" for="status-filter">狀態<select id="status-filter" class="month-select" data-filter="status"><option value="all">全部</option>${Object.entries(STATUSES).map(([v,n])=>`<option value="${v}" ${state.filters.status===v?'selected':''}>${n}</option>`).join('')}</select></label></div></section>
 <div class="section-head section-space"><h2 class="section-title">紀錄清單</h2><span class="tag" id="history-count">${filteredGroups().length} 個工作日</span></div>
 <div id="history-results" class="history-list">${renderHistoryResults()}</div>`;
}
function renderHistoryResults(){
 const groups=filteredGroups();
 if(!groups.length)return empty('search','找不到符合的紀錄','可以試試其他關鍵字、日期或工作狀態。','新增工作日誌','new-journal');
 return groups.map(g=>{
 const open=state.expanded.has(g.date);
 const tasks=g.journals.flatMap(j=>j.tasks);
 return `<article class="soft-card history-record"><button class="accordion-heading history-head" data-action="toggle-day" data-date="${g.date}" aria-expanded="${open}" aria-controls="day-${g.date}"><div class="row"><span class="date-icon">${icon('calendar',17)}</span><div><div class="history-date-name">${formatDate(g.date)}</div><div class="small muted">${g.date.slice(0,4)} 年 · ${g.journals.length} 位人員</div></div></div><div class="history-day-summary"><span>${tasks.length} 項工作</span><span>·</span><span>${formatHours(totalHours(g.journals))}</span>${icon('chevronDown',18,'accordion-arrow')}</div></button>
 <div id="day-${g.date}" ${open?'':'hidden'}>${open?g.journals.map(j=>`<div class="history-detail"><div class="row-between"><span class="small" style="font-weight:550">${icon('users',16)} &nbsp;${esc(employeeName(j.employeeId))}</span><span class="small muted">${j.tasks.length} 項</span></div>
 ${j.tasks.map(t=>`<div class="history-task"><div><div class="pill-row"><span class="tag">${esc(t.category)}</span>${t.project?`<span class="tag">${esc(t.project)}</span>`:''}</div><h4>${esc(t.title)}</h4>${t.description?`<p>${esc(t.description)}</p>`:''}${t.result?`<p>成果：${esc(t.result)}</p>`:''}</div><div style="text-align:right"><span class="tag ${t.status}">${STATUSES[t.status]}</span><p class="xs muted">${formatHours(t.hours)}</p></div></div>`).join('')}
 ${j.note?`<p class="small muted">當日備註：${esc(j.note)}</p>`:''}${j.tomorrow?`<p class="small muted">後續計畫：${esc(j.tomorrow)}</p>`:''}
 <div class="history-foot"><span class="xs muted">最後更新：${esc((j.updatedAt||'').slice(0,10))}</span><button class="soft-button sm" data-action="edit-journal" data-id="${esc(j.id)}">${icon('edit',15)} 編輯這一天</button></div></div>`).join(''):''}</div></article>`;
 }).join('');
}
function renderInsights(){
 const stats=monthStats(state.store,state.month);
 const max=Math.max(1,...stats.byDay.map(d=>d.hours));
 const days=stats.byDay.slice(-14);
 return `<section class="soft-card card-pad-lg"><div class="row-between insights-month-head"><div><h2 class="card-title">月份統計</h2><p class="card-sub">以工作日誌自動彙整，不需要手動計算</p></div><label class="form-group"><span class="sr-only">統計月份</span><input class="input" type="month" data-month value="${esc(state.month)}" /></label></div></section>
 ${summaryTiles(stats)}<div class="two-col section-space"><section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">投入工時分布</h2><p class="card-sub">最近 ${days.length} 個有紀錄的工作日</p></div>${icon('chart',19)}</div><div class="mini-chart" aria-label="每天投入工時的長條圖">${days.length?days.map(d=>`<div class="mini-chart-col" title="${d.date}：${formatHours(d.hours)}" style="height:${Math.max(5,d.hours/max*100)}%"></div>`).join(''):'<div class="empty" style="width:100%;padding:30px">尚無統計資料</div>'}</div>${days.length?`<div class="mini-chart-axis"><span>${formatDate(days[0].date,false)}</span><span>${formatDate(days.at(-1).date,false)}</span></div>`:''}</section>
 <section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">工作類型占比</h2><p class="card-sub">依已記錄工時分類</p></div>${icon('folder',19)}</div>${categoryBars(stats)}<div class="divider"></div><div class="row-between"><span class="small muted">本月總工時</span><span style="font-size:22px">${formatHours(stats.hours)}</span></div></section></div>
 <section class="soft-card card-pad-lg section-space"><div class="card-head"><div><h2 class="card-title">完成狀態</h2><p class="card-sub">工作項目進度</p></div><span class="tag done">${stats.rate}% 已完成</span></div><div class="progress-track" style="height:14px"><div class="progress-fill" style="width:${stats.rate}%"></div></div><div class="row-between section-space"><span class="small muted">已完成 ${stats.completed} 項</span><span class="small muted">進行中 / 待處理 ${stats.pending} 項</span></div></section>`;
}
function renderSettings(){
 return `<div class="notice">${icon('shield',20)}<div><strong style="font-weight:550">資料存放與權限提醒</strong><br/>這是可操作的本機原型，所有紀錄只存在目前瀏覽器的 localStorage。人員選單不等於登入驗證，且資料尚未同步至 Google Sheets。請先使用測試資料。</div></div>
 <div class="settings-grid section-space"><section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">填寫人員</h2><p class="card-sub">管理日誌表單的人員選單</p></div>${icon('users',19)}</div><div class="inline-add"><input class="input" id="new-employee" maxlength="80" placeholder="新增人員名稱" aria-label="新增人員名稱"/><button class="soft-button icon-only" data-action="add-employee" aria-label="新增人員">${icon('plus',17)}</button></div><div class="chip-list">${state.store.employees.map(e=>`<span class="chip">${esc(e.name)}<button aria-label="移除 ${esc(e.name)}" data-action="remove-employee" data-id="${esc(e.id)}">${icon('x',13)}</button></span>`).join('')}</div></section>
 <section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">專案清單</h2><p class="card-sub">管理表單中可選的專案</p></div>${icon('folder',19)}</div><div class="inline-add"><input class="input" id="new-project" maxlength="100" placeholder="新增專案名稱" aria-label="新增專案名稱"/><button class="soft-button icon-only" data-action="add-project" aria-label="新增專案">${icon('plus',17)}</button></div><div class="chip-list">${state.store.projects.map(p=>`<span class="chip">${esc(p)}<button aria-label="移除 ${esc(p)}" data-action="remove-project" data-id="${esc(p)}">${icon('x',13)}</button></span>`).join('')}</div></section></div>
 <section class="soft-card card-pad-lg section-space"><div class="card-head"><div><h2 class="card-title">資料備份與匯出</h2><p class="card-sub">所有功能皆在本機執行，不會上傳至外部伺服器</p></div>${icon('database',19)}</div><div class="row" style="flex-wrap:wrap"><button class="soft-button" data-action="export-json">${icon('download',16)} 匯出 JSON 備份</button><button class="soft-button" data-action="export-csv">${icon('download',16)} 匯出 CSV 報表</button><button class="soft-button" data-action="import-json">${icon('upload',16)} 匯入 JSON 備份</button></div><div class="divider"></div><div class="row-between" style="flex-wrap:wrap"><div><div class="small">重設本機資料</div><div class="xs muted">這會清除目前瀏覽器內的工作日誌與設定，無法復原。</div></div><button class="soft-button danger sm" data-action="reset-data">${icon('trash',15)} 清空資料</button></div></section>
 <section class="soft-card card-pad-lg section-space"><div class="card-head"><div><h2 class="card-title">下一步：Google Sheets</h2><p class="card-sub">正式多人使用需先完成伺服端權限驗證</p></div>${icon('arrowUpRight',19)}</div><p class="small muted" style="line-height:1.95">規劃使用 Google Workspace 帳號辨識員工，由受控的服務端處理資料存取、操作紀錄及編輯權限。完成前不提供可供匿名使用者直接寫入試算表的公開介面。</p></section>`;
}
function empty(symbol,title,body,button,action){return `<div class="empty"><div class="empty-orb">${icon(symbol,28)}</div><h3>${title}</h3><p>${body}</p><button class="soft-button sm" data-action="${action}">${icon('plus',15)} ${button}</button></div>`;}
function render(){renderShell();}
function changeView(view){if(!NAV.some(n=>n.id===view))return;state.view=view;location.hash=`/${view}`;window.scrollTo({top:0,behavior:'instant'});render();}
function notify(text,error=false){state.toast={text,error};showToast(text,error);}
function showToast(text,error=false,preserve=false){const container=document.querySelector('#toast-stack');if(!container)return;if(!preserve)container.innerHTML='';container.insertAdjacentHTML('beforeend',`<div class="toast ${error?'error':''}">${icon(error?'alert':'checkCircle',18)} ${esc(text)}</div>`);}
function saveStore(next){try {if(state.store.mode==='demo'){next={...next,journals:next.journals.filter(j=>!String(j.id).startsWith('demo-'))};}writeState(next);state.store={...next,mode:'local'};return true;}catch(e){notify('儲存失敗：請確認瀏覽器儲存空間與隱私模式設定',true);console.error(e);return false;}}
function requireDiscard(){return !state.dirty || confirm('目前有尚未儲存的變更，要放棄嗎？');}
function openRecord(record){if(!requireDiscard())return;state.draft=makeDraft(record.date,record.employeeId,record);state.dirty=false;changeView('entry');}
function openNew(){if(!requireDiscard())return;state.draft=makeDraft(today,state.store.employees[0]?.id);state.dirty=false;changeView('entry');}
function downloadBackup(){download(`WorkPulse-backup-${today}.json`,JSON.stringify({...state.store,mode:'local'},null,2));}
function persistChanges(){const next={...state.store,mode:'local'};return saveStore(next);}

root.addEventListener('click', event=>{
 const button=event.target.closest('[data-action]');if(!button)return;
 const action=button.dataset.action;
 if(action==='navigate'){if(state.view==='entry' && !requireDiscard())return;state.dirty=false;changeView(button.dataset.view);return;}
 if(action==='new-journal'){openNew();return;}
 if(action==='add-task'){state.draft.tasks.push(makeItem());state.dirty=true;render();document.querySelector('.task-card:last-child input[data-field="title"]')?.focus();return;}
 if(action==='remove-task'){const index=Number(button.dataset.index);state.draft.tasks.splice(index,1);if(!state.draft.tasks.length)state.draft.tasks.push(makeItem());state.dirty=true;render();return;}
 if(action==='save-journal'){
   try{
    const base=state.store.mode==='demo'?{...state.store,journals:[],mode:'local'}:state.store;
    const next=saveJournal(base,state.draft);
    if(saveStore(next)){state.draft=makeDraft(state.draft.date,state.draft.employeeId);state.dirty=false;render();notify('工作日誌已儲存至目前瀏覽器');}
    updateDraftSummary();
   }catch(e){notify(e.message||'無法儲存日誌',true);}return;
 }
 if(action==='toggle-day'){const date=button.dataset.date;if(state.expanded.has(date))state.expanded.delete(date);else state.expanded.add(date);const oldTop=window.scrollY;const target=document.querySelector('#history-results');if(target)target.innerHTML=renderHistoryResults();window.scrollTo(0,oldTop);return;}
 if(action==='edit-journal'){const record=state.store.journals.find(j=>j.id===button.dataset.id);if(record)openRecord(record);return;}
 if(action==='add-employee'){
   const input=document.querySelector('#new-employee');const name=input?.value.trim();if(!name){notify('請輸入人員名稱',true);return;}
   if(state.store.employees.some(e=>e.name===name)){notify('人員名稱已存在',true);return;}
   if(state.store.employees.length>=200){notify('人員數量已達上限',true);return;}
   if(saveStore({...state.store,employees:[...state.store.employees,{id:uid(),name}]})){notify('已新增人員');render();}return;
 }
 if(action==='remove-employee'){
   const id=button.dataset.id;if(state.store.employees.length<=1){notify('至少保留一位人員',true);return;}
   if(state.store.journals.some(j=>j.employeeId===id)){notify('此人員已有工作紀錄，不能直接移除',true);return;}
   if(!confirm('確定移除此人員？'))return;
   if(saveStore({...state.store,employees:state.store.employees.filter(e=>e.id!==id)})){state.draft=makeDraft();render();}return;
 }
 if(action==='add-project'){
   const name=document.querySelector('#new-project')?.value.trim();if(!name){notify('請輸入專案名稱',true);return;}
   if(state.store.projects.includes(name)){notify('專案名稱已存在',true);return;}
   if(state.store.projects.length>=500){notify('專案數量已達上限',true);return;}
   if(saveStore({...state.store,projects:[...state.store.projects,name]})){notify('已新增專案');render();}return;
 }
 if(action==='remove-project'){
   const name=button.dataset.id;if(!confirm(`確定從選單移除「${name}」？既有紀錄不會刪除。`))return;
   if(saveStore({...state.store,projects:state.store.projects.filter(p=>p!==name)})){render();}return;
 }
 if(action==='export-json'){downloadBackup();notify('JSON 備份已開始下載');return;}
 if(action==='export-csv'){download(`WorkPulse-journal-${today}.csv`,csvExport(state.store),'text/csv;charset=utf-8');notify('CSV 報表已開始下載');return;}
 if(action==='import-json'){document.querySelector('#import-file')?.click();return;}
 if(action==='reset-data'){
   if(!confirm('確定清除目前瀏覽器中的所有 WorkPulse 工作日誌？此操作無法復原，建議先匯出備份。'))return;
   if(saveStore(emptyState())){state.draft=makeDraft();state.dirty=false;render();notify('本機資料已清空');}return;
 }
});
root.addEventListener('input',event=>{
 const el=event.target;
 if(el.matches('[data-task]')){const t=state.draft.tasks[Number(el.dataset.task)];if(!t)return;t[el.dataset.field]=el.dataset.field==='hours'?Number(el.value):el.value;state.dirty=true;updateDraftSummary();return;}
 if(el.matches('[data-draft]')){state.draft[el.dataset.draft]=el.value;state.dirty=true;return;}
 if(el.matches('[data-filter="query"]')){state.filters.query=el.value;const target=document.querySelector('#history-results');if(target)target.innerHTML=renderHistoryResults();const count=document.querySelector('#history-count');if(count)count.textContent=`${filteredGroups().length} 個工作日`;return;}
});
root.addEventListener('change',event=>{
 const el=event.target;
 if(el.matches('[data-identity]')){
   const field=el.dataset.identity;const value=el.value;
   if(state.dirty&&!confirm('切換日期或人員會放棄尚未儲存的內容，確定繼續嗎？')){el.value=state.draft[field];return;}
   const date=field==='date'?value:state.draft.date;const employee=field==='employeeId'?value:state.draft.employeeId;
   state.draft=makeDraft(date,employee);state.dirty=false;render();return;
 }
 if(el.matches('[data-filter]')){state.filters[el.dataset.filter]=el.value;render();return;}
 if(el.matches('[data-month]')){state.month=el.value||currentMonth();render();return;}
});
root.addEventListener('keydown',event=>{
 if(event.key==='Enter'&&event.target.matches('#new-employee')){event.preventDefault();document.querySelector('[data-action="add-employee"]')?.click();}
 if(event.key==='Enter'&&event.target.matches('#new-project')){event.preventDefault();document.querySelector('[data-action="add-project"]')?.click();}
});
root.addEventListener('change',async event=>{
 if(event.target.id!=='import-file')return;
 const file=event.target.files?.[0];if(!file)return;
 try{
   if(file.size>10_000_000)throw Error('備份檔案超過 10 MB 上限');
   const payload=validateState(JSON.parse(await file.text()));
   if(!confirm(`匯入將取代目前所有本機紀錄（${payload.journals.length} 筆日誌），確定繼續？`))return;
   if(saveStore(payload)){state.draft=makeDraft();state.dirty=false;state.filters={query:'',employee:'all',status:'all'};render();notify('備份資料匯入成功');}
 }catch(e){notify(`匯入失敗：${e.message}`,true);}finally{event.target.value='';}
});
window.addEventListener('hashchange',()=>{const view=fromHash();if(view!==state.view){state.view=view;render();}});
window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
render();
