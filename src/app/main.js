import { icon } from '../shared/icons.js';
import {closeMobileSheet,openMobileSheet,enhanceMobileSelects,syncMobileDock,mobileDockMarkup,initMobileWorkflow,mobileSkeleton} from './mobile-workflow.js';
import {buildLocalMigrationPackage} from '../features/journals/migration-package.js';
import { STORAGE_KEY, CATEGORIES, STATUSES, readState, writeState, saveJournal, journalFor, monthStats, csvExport, emptyState, validateState } from '../features/journals/data.js';
import { currentMonth, localISODate, shiftDate, formatDate, formatHours, esc, uid, download } from '../shared/utils.js';
import { cloudEnabled, cloudCall } from '../services/cloud.js';
import {fieldOnline,readFieldPending,fieldRecoveryBusy,fieldRecoveryDurable,fieldSave,retryFieldPending,removeFieldPending} from '../services/field-recovery.js';
import { adminState, loadAdmin, setAdminTab, editAdmin, updateAdminDraft, resetAdminEditor, renderTeam, saveAdmin, maintenanceState, renderMaintenance, loadMaintenance, backupMaintenance, previewMaintenanceRecovery, downloadMaintenanceRecovery } from '../features/admin/admin.js';
import {renameLocalEmployee,renameLocalProject} from '../features/admin/rename.js';
import { buildReport, reportCsv, reportSheets } from '../features/reports/reports.js';
import { buildXlsx } from '../shared/xlsx.js';
import { renderReportWorkspace } from '../features/reports/report-ui.js';
import { readQuickDraft, saveQuickDraft, clearQuickDraft, readTemplates, addTemplate, removeTemplate, renameTemplatesProject,renameTemplatesCategory, newTaskFromTemplate, recentPriorJournal } from '../features/journals/quick-entry.js';
import {attendanceState,loadAttendance,attendanceSelectDate,updateAttendance,submitAttendance,updateAttendanceConfig,saveAttendanceConfig} from '../features/attendance/attendance-state.js';
import {renderAttendance} from '../features/attendance/attendance-ui.js';
import {shouldLoadAttendance,activateAttendance} from './attendance-lifecycle.js';
import {viewFromHash,visibleNavigation,renderNavigationButton} from './navigation.js';
import {readSelectedPerson,writeSelectedPerson,shortPersonName,isMobileViewport} from './person.js';
import {addWorkCategory,renameLocalWorkCategory} from '../features/journals/categories.js';
import {rememberDescriptions,descriptionSuggestions} from '../features/journals/description-memory.js';
import {validateReportPeriod,applyReportPeriod} from '../features/reports/periods.js';

const root = document.querySelector('#app');
const today = localISODate();
const isCloud = cloudEnabled();
const isOwnerPortal = isCloud && typeof window!=='undefined' && window.WORKPULSE_ADMIN_PORTAL===true;
const state = {
  store:isCloud?emptyState():readState(),view:fromHash(),month:currentMonth(),
  filters:{query:'',employee:'all',status:'all'},localRename:null,selectedPersonId:'',
  expanded:new Set([today,shiftDate(today,-1)]),draft:null,dirty:false,draftRestored:false,draftStatus:'未有暫存草稿',templates:[],
  toast:null,cloud:{phase:isCloud?'loading':'local',user:null,error:'',saving:false,loadingMonth:false,monthToken:0},saveRequestId:null,
  report:{filters:{startDate:today.slice(0,7)+'-01',endDate:today,employeeId:'all',departmentId:'all',project:'all',category:'all',status:'all'},phase:'idle',error:'',payload:null,applied:null,token:0}
};
const permanentStorage=()=>{try{return globalThis.localStorage;}catch{return null;}};
state.selectedPersonId=readSelectedPerson(permanentStorage(),state.store.employees);
state.filters.employee=state.selectedPersonId;
state.report.filters.employeeId=state.selectedPersonId;
if(isMobileViewport()&&['settings','insights'].includes(state.view))state.view='overview';
state.draft=makeDraft(today,state.selectedPersonId);
const draftStorage = () => { try { return isCloud ? window.sessionStorage : window.localStorage; }catch { return null; } };
const draftAccount = () => isCloud ? `selected:${state.draft?.employeeId||'none'}` : 'local-device';
let draftTimer = null;
function restoreQuickDraft(){
  const stored=readQuickDraft(draftStorage(),draftAccount(),isCloud?86400000:7*86400000);
  if(stored&&(!isCloud||canEditJournal(stored.employeeId))){
    state.draft={...makeDraft(stored.date,stored.employeeId),...stored,tasks:stored.tasks.map(makeItem)};
    state.dirty=true;state.draftRestored=true;state.draftStatus='已還原未提交草稿';
  } else {state.draftRestored=false;state.draftStatus='草稿自動暫存已啟用';}
  state.templates=readTemplates(draftStorage(),draftAccount());
}
function flushQuickDraft(){
  clearTimeout(draftTimer);draftTimer=null;
  if(!state.dirty)return;
  const success=saveQuickDraft(draftStorage(),draftAccount(),state.draft);
  state.draftStatus=success?'草稿已暫存於此瀏覽器':'無法暫存草稿，請儘快正式儲存';
  const label=document.querySelector('#draft-save-status');if(label)label.textContent=state.draftStatus;syncMobileDock();
}
function scheduleQuickDraft(){
  state.draftStatus='草稿暫存中…';
  const label=document.querySelector('#draft-save-status');if(label)label.textContent=state.draftStatus;syncMobileDock();
  clearTimeout(draftTimer);draftTimer=setTimeout(flushQuickDraft,480);
}
function markDraftDirty(){state.dirty=true;state.saveRequestId=null;state.draftRestored=false;scheduleQuickDraft();}
function appendReusableTasks(rows){
  if(!rows?.length)return;
  const entries=rows.map(newTaskFromTemplate);
  const tasks=state.draft.tasks;
  const empty=tasks.length===1&&!tasks[0].description?.trim()&&!tasks[0].result?.trim()&&!tasks[0].project?.trim();
  if(tasks.length-(empty?1:0)+entries.length>100){notify('同一天最多可填寫 100 項工作',true);return;}
  if(empty)tasks.splice(0,1);
  tasks.push(...entries);markDraftDirty();render();notify(`已加入 ${entries.length} 項工作，進度和工時已重設`);
}
if(!isCloud)restoreQuickDraft();
function fromHash(){return viewFromHash(location.hash);}
function visibleNav(){return visibleNavigation(isCloud,state.cloud.user?.role);}
function mobileNav(){return visibleNav().filter(n=>!['settings','insights'].includes(n.id));}
function allowedMobileView(view){return !isMobileViewport()||!['settings','insights'].includes(view);}
function selectPersonId(id){
 if(!state.store.employees.some(p=>p.id===id))return false;
 state.selectedPersonId=id;
 writeSelectedPerson(permanentStorage(),id);
 state.filters.employee=id;
 state.report.filters.employeeId=id;state.report.phase='idle';
 state.report.payload=null;state.report.applied=null;
 return true;
}
function changeSelectedPerson(id,{fromAttendance=false}={}){
 if(id===state.selectedPersonId)return true;
 if(state.cloud.saving||state.cloud.loadingMonth||(isCloud&&state.cloud.phase!=='ready')||attendanceState.saving||attendanceState.scheduleSaving)return false;
 if(attendanceState.scheduleDirty&&!confirm('班表尚未儲存，確定切換人員？'))return false;
 if(!state.store.employees.some(p=>p.id===id))return false;
 if(state.dirty&&!confirm('切換人員後，未提交的工作內容會先暫存，確定切換？'))return false;
 flushQuickDraft();selectPersonId(id);
 state.draft=makeDraft(state.draft?.date||today,id);
 state.dirty=false;state.saveRequestId=null;
 restoreQuickDraft();
 if(state.view==='attendance'&&!fromAttendance){
  const task=loadAttendance(state.store.employees,isOwnerPortal,attendanceState.month,id);
  render();void task.then(render);
 }else render();
 return true;
}
function makeItem(source={}) {const category=source.category||state.store.categories?.[0]||CATEGORIES[0];return {id:source.id||uid(),project:source.project||'',category,title:source.title||category,description:source.description||'',result:source.result||'',status:source.status||'doing',hours:source.hours??0};}
function makeDraft(date=today,employeeId=state.store.employees[0]?.id,fromRecord=null) {
  const record = fromRecord ?? (state.store.mode==='demo'?null:journalFor(state.store,date,employeeId));
  return {date,employeeId,note:record?.note||'',tomorrow:record?.tomorrow||'',tasks:record?.tasks.length?record.tasks.map(makeItem):[makeItem()],editing:!!record,revision:record?.revision||0};
}
function canEditJournal(employeeId){return !isCloud || Boolean(state.cloud.user?.canWriteIds?.includes(employeeId));}
function employeeName(id){return state.store.employees.find(e=>e.id===id)?.name || '未指定人員';}
function navButton(n,mobile=false){return renderNavigationButton(n,state.view,mobile);}
function renderPersonMenu(){
 const people=state.store.employees||[];
 const person=people.find(p=>p.id===state.selectedPersonId);
 return `<div class="wp-person-picker">
  <button class="wp-person-trigger" type="button" data-action="person-menu"
   aria-label="目前人員：${esc(person?.name||'尚未選擇')}，點擊切換" aria-expanded="false">
   <span>${esc(shortPersonName(person?.name||'人員'))}</span>${icon('chevronDown',14)}</button>
  <div class="wp-person-menu" hidden role="group" aria-label="切換填寫人員">
   <div class="wp-person-menu-title">目前操作人員</div>
   ${people.map(p=>`<button type="button" class="wp-person-option ${p.id===state.selectedPersonId?'selected':''}"
    data-action="person-select" data-id="${esc(p.id)}" aria-pressed="${p.id===state.selectedPersonId}">
    <span class="wp-person-avatar">${esc(shortPersonName(p.name))}</span><span>${esc(p.name)}</span>
    ${p.id===state.selectedPersonId?icon('checkCircle',15):''}</button>`).join('')}
   <p class="wp-person-hint">切換後，其他頁面會同步使用此人員</p>
  </div></div>`;
}
function fieldRecoveryMarkup(){
 if(!isCloud)return '';
 const all=readFieldPending(),rows=all.filter(x=>x.payload.employeeId===state.selectedPersonId),online=fieldOnline(),other=all.length-rows.length;
 return '<div class="wp-recovery-status" role="status"><strong>'+(!online?'目前離線 · 資料尚未同步':'網路可用 · 仍以雲端確認為準')+'</strong>'+
 (rows.length?' · '+rows.length+' 筆待處理':'')+(other?' <span class="wp-recovery-other">另有 '+other+' 筆其他人員待同步，切換人員後核對。</span>':'')+(!fieldRecoveryDurable()?' <span>瀏覽器暫存受限，請勿關閉頁面。</span>':'')+'</div>'+
 rows.map(x=>{const id=esc(x.payload.requestId),busy=fieldRecoveryBusy(x.payload.requestId);
 return '<div class="wp-recovery-row"><span>'+esc(x.payload.date)+' · '+(x.method==='wpSharedSaveJournal'?'工作日誌':'出勤')+' · '+(busy?'同步中':x.status==='conflict'?'版本衝突，請先查閱雲端':x.status==='offline'?'尚未送出':'儲存結果未確認')+'</span>'+
 '<div><button type="button" class="soft-button mini" data-action="field-download" data-id="'+id+'" '+(busy?'disabled':'')+'>保存原始請求</button> <button type="button" class="soft-button mini" data-action="field-retry" data-id="'+id+'" '+(!online||busy||x.status==='conflict'?'disabled':'')+'>重送原始請求</button> '+
 '<button type="button" class="soft-button mini" data-action="field-discard" data-id="'+id+'" '+(busy?'disabled':'')+'>移除待同步</button></div></div>';
 }).join('');
}
function updateFieldRecovery(){const panel=document.querySelector('#wp-field-recovery');if(panel)panel.innerHTML=fieldRecoveryMarkup();const banner=document.querySelector('.sync-banner');if(banner)banner.outerHTML=syncBanner();}
function renderShell(){
 closeMobileSheet(false);
 const head = {overview:['工作總覽','掌握每一天的工作節奏'],attendance:['出勤表','每月出勤、加班時數與請假紀錄'],entry:['填寫工作日誌','整理今天的付出，留下清晰紀錄'],history:['歷史工作紀錄','以日期為單位，快速找到每項工作'],insights:['統計分析','從工作日誌看見實際進展'],settings:['系統設定','管理員資料與系統操作'],team:['管理員控制台','管理員可新增使用者並管理日誌']}[state.view];
 root.innerHTML = `<div class="shell">
   <aside class="sidebar" aria-label="側邊選單"><div class="brand"><div class="brand-symbol">W<small>·</small></div><div><div class="brand-title">WorkPulse</div><div class="brand-subtitle">WORK JOURNAL</div></div></div>
   <div><div class="sidebar-caption">WORKSPACE</div><nav class="nav-list" aria-label="主要選單">${visibleNav().map(n=>navButton(n)).join('')}</nav></div>
   <div class="sidebar-bottom"><div class="mode-card"><div class="mode-title">${icon('database',16)} ${isCloud?'Google Sheets 雲端版':'本機展示版本'}</div><p>${isCloud?'選擇使用者即可填寫與查閱，所有雲端資料都由管理者 Google Drive 保存。':'目前資料儲存在這台裝置的瀏覽器，尚未與 Google Sheets 同步。'}</p></div><div class="sidebar-foot">WORKPULSE · v0.15.1</div></div></aside>
   <main class="main"><header class="topbar"><div><div class="eyebrow">WORKPULSE / ${esc(state.view.toUpperCase())}</div><h1 class="page-title">${head[0]}</h1><p class="page-desc">${head[1]}</p></div>
   <div class="top-actions"><span class="tiny-date">${formatDate(today)}<br/>${today.slice(0,4)} 年</span><button class="soft-button sm" data-action="new-journal">${icon('plus',15)} 新增日誌</button>${renderPersonMenu()}</div></header>
   ${!isCloud?'<div class="wp-storage-banner" role="status"><strong>本機展示版</strong><span>資料只保存在此瀏覽器，尚未同步至公司 Google Drive。</span><button type="button" class="soft-button sm" data-action="export-migration">下載移轉封包</button></div>':''}${isCloud&&isOwnerPortal?'<div class="wp-storage-banner"><strong>私人管理入口</strong><span>正式模式的日誌與出勤儲存請使用公司員工入口。</span></div>':''}${isCloud?`<section id="wp-field-recovery" class="wp-recovery-panel" aria-label="連線與待同步">${fieldRecoveryMarkup()}</section>`:''}<div id="page-content" class="flash">${state.cloud.phase==='loading'?renderCloudWaiting():state.cloud.phase==='error'?renderCloudError():state.cloud.loadingMonth?mobileSkeleton('正在讀取指定月份…'):renderPage()}</div><footer class="footer">WorkPulse · Make every day count &nbsp; / &nbsp; v0.15.1</footer></main>
   <nav class="mobile-nav" style="--nav-count:${mobileNav().length}" aria-label="手機導覽">${mobileNav().map(n=>navButton(n,true)).join('')}</nav>
   ${mobileDockMarkup()}<div class="toast-stack" id="toast-stack" role="status" aria-live="polite"></div>
   <input id="import-file" type="file" accept=".json,application/json" aria-label="匯入工作日誌 JSON 備份" />
  </div>`;
 if(state.cloud.saving)for(const element of document.querySelectorAll('#page-content input,#page-content textarea,#page-content select'))element.disabled=true;
 enhanceMobileSelects();syncMobileDock();
 if(state.toast) showToast(state.toast.text,state.toast.error,true);
}
function renderCloudWaiting(){return mobileSkeleton('正在連接工作日誌資料庫，讀取人員與本月資料…');}
function renderCloudError(){return `<section class="soft-card card-pad-lg sync-stage" role="alert"><span class="sync-dot failed"></span><h2>無法連接雲端工作日誌</h2><p>${esc(state.cloud.error)}</p><button class="soft-button" data-action="retry-cloud">${icon('arrowRight',16)} 重新驗證與載入</button><p class="xs muted">存取失敗時不會自動切換為本機資料，避免誤以為已同步。</p></section>`;}
function syncBanner(){if(!isCloud)return '';const status=!fieldOnline()?'error':state.cloud.saving?'saving':state.cloud.loadingMonth?'saving':state.cloud.phase==='ready'?'ready':'error';const label=!fieldOnline()?'目前離線，尚未確認同步':status==='ready'?'Google Sheets 已連線':status==='saving'?'正在與 Google Sheets 同步':'同步失敗';return `<div class="sync-banner ${status}" role="status"><span class="sync-dot ${status}"></span><span>${label}</span><span class="xs muted">${esc(state.cloud.user?.email||'')}</span><button class="soft-button ghost mini" data-action="refresh-cloud" ${status==='saving'?'disabled':''}>重新整理</button></div>`;}
function renderPage(){switch(state.view){case 'attendance':return `${syncBanner()}${renderAttendance(state.store.employees,isOwnerPortal)}`;case 'entry':return renderEntry();case 'history':return renderHistory();case 'insights':return renderInsights();case 'settings':return renderSettings();case 'team':return `${syncBanner()}${renderTeam(state.cloud.user)}${isOwnerPortal&&state.cloud.user?.role==='admin'?renderMaintenance():''}`;default:return renderOverview();}}
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
 const groups = groupJournals(state.store.journals.filter(j=>j.date.startsWith(state.month)&&j.employeeId===state.selectedPersonId)).slice(0,limit);
 if(!groups.length) return empty('calendar','還沒有工作紀錄','新增第一筆日誌，這裡就會開始出現你的工作摘要。','開始填寫','new-journal');
 return `<div>${groups.map(g=>`<div class="record-group"><div class="record-date"><div class="row"><span class="date-icon">${icon('calendar',16)}</span><div><div style="font-size:13px;font-weight:500">${formatDate(g.date)}</div><div class="xs muted">${g.journals.length} 位人員 · ${g.journals.flatMap(j=>j.tasks).length} 個項目</div></div></div><span class="tag">${formatHours(totalHours(g.journals))}</span></div>
 ${g.journals.flatMap(j=>j.tasks).slice(0,4).map(t=>`<div class="record-line"><span class="record-bullet ${esc(t.status)}"></span><span class="record-line-title" title="${esc(t.title)}">${esc(t.title)}</span><span class="tag ${esc(t.status)}">${STATUSES[t.status]}</span></div>`).join('')}
 </div>`).join('')}</div>`;
}
function renderFieldHome(){
 const links=[
  {view:'attendance',title:'出勤表',hint:'登記上下班與請假',iconName:'clock'},
  {view:'entry',title:'填寫工作日誌',hint:'快速記錄今日工作',iconName:'pen'},
  {view:'history',title:'歷史紀錄',hint:'查閱與修改已存資料',iconName:'calendar'},
  ...(isCloud&&state.cloud.user?.role==='admin'?[{view:'team',title:'管理員控制台',hint:'管理人員、專案及工作類型',iconName:'users'}]:[])
 ];
 return `<section class="wp-field-home" aria-label="外勤功能首頁">
  <div class="wp-field-hero"><span class="overline">WORKPULSE / FIELD</span>
  <h2>今天要處理什麼工作？</h2>
  <p>目前人員：${esc(employeeName(state.selectedPersonId))}。請直接選擇要使用的功能。</p></div>
  <div class="wp-field-grid">${links.map(item=>`<button class="wp-field-tile" type="button" data-action="navigate" data-view="${item.view}">
   <span class="wp-field-tile-icon">${icon(item.iconName,25)}</span>
   <span class="wp-field-tile-body"><strong>${item.title}</strong><small>${item.hint}</small></span>
   ${icon('arrowRight',18)}</button>`).join('')}</div>
 </section>`;
}
function renderOverview(){
 const stats=monthStats({...state.store,journals:state.store.journals.filter(j=>j.employeeId===state.selectedPersonId)},state.month);
 return `${syncBanner()}${renderFieldHome()}<div class="wp-desktop-overview"><section class="soft-card hero"><div><div class="overline">A BETTER WAY TO WORK</div><h2>讓每一天的進展，<br/>都變得清晰可見。</h2><p>在下班前花幾分鐘整理工作，讓記錄、查閱與回顧成為自然的習慣。</p><button class="soft-button primary" data-action="new-journal">${icon('pen',16)} 填寫今日工作 ${icon('arrowRight',15)}</button></div><div class="hero-graphic" aria-hidden="true">W<span class="dot">.</span></div></section>
 ${state.store.mode==='demo'?`<div class="notice section-space">${icon('info',18)}<div>目前看到的是<strong style="font-weight:550">示範資料</strong>，首次儲存正式工作紀錄時會自動移除示範內容。請勿在此版本輸入機密資料。</div></div>`:''}
 ${summaryTiles(stats)}<div class="two-col section-space"><section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">最近工作紀錄</h2><p class="card-sub">依日期整合當日所有工作內容</p></div><button class="soft-button ghost sm" data-action="navigate" data-view="history">查看全部 ${icon('arrowRight',15)}</button></div>${recentGroups()}</section>
 <section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">本月工作狀態</h2><p class="card-sub">工作完成概況與投入分布</p></div>${icon('target',19)}</div><div class="insight-pair"><span class="muted">完成率</span><span style="font-size:26px;line-height:1">${stats.rate}<span class="small">%</span></span></div><div class="progress-track"><div class="progress-fill" style="width:${stats.rate}%"></div></div><div class="divider"></div><div class="row-between"><span class="small muted">已完成項目</span><span class="small">${stats.completed} 項</span></div><div class="row-between" style="margin-top:13px"><span class="small muted">未完成項目</span><span class="small">${stats.pending} 項</span></div><div class="divider"></div><div class="overline">WORK DISTRIBUTION</div>${categoryBars(stats)}</section></div></div>`;
}
function categoryBars(stats){
 if(!stats.byCategory.length) return '<p class="small muted">目前沒有可統計的工作分類。</p>';
 const max=Math.max(...stats.byCategory.map(x=>x.hours),1);
 return stats.byCategory.slice(0,5).map(x=>`<div class="bar-row"><span class="muted">${esc(x.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2,x.hours/max*100)}%"></div></div><span style="text-align:right">${formatHours(x.hours)}</span></div>`).join('');
}
function renderEntry(){
 const d=state.draft;
 const existing = state.store.mode !== 'demo' && journalFor(state.store,d.date,d.employeeId);
 const previous=recentPriorJournal(state.store.journals,d.date,d.employeeId);
 const templates=state.templates;
  return `${syncBanner()}<div class="entry-grid"><div><section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">基本資訊</h2><p class="card-sub">選擇日期與填寫人員，同一天可建立多個工作項目</p></div><span class="tag">${existing?'編輯紀錄':'新增紀錄'}</span></div><div class="form-fields">
  <label class="form-group"><span class="field-label">工作日期 *</span><input class="input" type="date" id="entry-date" data-identity="date" value="${esc(d.date)}" required /></label>
  <label class="form-group"><span class="field-label">填寫人員 *</span><select class="input" id="entry-employee" data-identity="employeeId">${state.store.employees.filter(e=>canEditJournal(e.id)).map(e=>`<option value="${esc(e.id)}" ${d.employeeId===e.id?'selected':''}>${esc(e.name)}</option>`).join('')}</select></label>
 </div></section>
 <section class="quick-tools soft-card card-pad section-space" aria-label="快速填寫工具">
  <div class="quick-tool-head"><div><h2 class="card-title">快速填寫</h2><p class="card-sub">從上一次工作或常用範本帶入，不會直接提交資料</p></div><span class="tag">${isCloud?'此分頁暫存':'本機暫存'}</span></div>
  <div class="quick-tool-actions"><button class="soft-button sm" data-action="copy-previous" ${!previous?'disabled':''}>${icon('calendar',16)} ${previous?`複製上次工作 · ${formatDate(previous.date,false)}`:'沒有可複製的上次工作'}</button>
   <span class="small muted" id="draft-save-status" role="status" aria-live="polite">${esc(state.draftStatus)}</span>
   <button class="soft-button ghost sm" data-action="discard-draft" ${state.dirty?'':'disabled'}>${icon('trash',15)} 捨棄草稿</button></div>
  ${templates.length?`<div class="quick-template-list" aria-label="常用工作項目">${templates.map(t=>`<div class="quick-template"><button class="quick-template-use" data-action="use-template" data-id="${esc(t.id)}" title="${esc(t.title)}">${icon('plus',14)}<span>${esc(t.title)}</span></button><button class="quick-template-remove" data-action="remove-template" data-id="${esc(t.id)}" title="移除 ${esc(t.title)}" aria-label="移除 ${esc(t.title)}">${icon('x',13)}</button></div>`).join('')}</div>`:'<p class="xs muted quick-template-empty">可在下方工作項目按「設為常用」，以後一鍵加入。</p>'}
  <p class="xs muted quick-shortcuts">快捷鍵：Ctrl / Cmd + S 正式儲存，Ctrl / Cmd + Enter 新增項目。${isCloud?'草稿僅暫存於目前瀏覽器分頁，不代表已同步至 Google Sheets。':'草稿會暫存於這個瀏覽器，正式紀錄仍需點擊儲存。'}</p>
 </section>
 <div class="section-head section-space"><div><h2 class="section-title">工作項目 <span class="muted" style="font-size:13px">(${d.tasks.length})</span></h2><p class="card-sub">每件工作獨立記錄，儲存時自動合併到同一天</p></div><button class="soft-button sm" data-action="add-task">${icon('plus',15)} 新增項目</button></div>
 <div class="entry-task-list">${d.tasks.map((t,i)=>renderTask(t,i)).join('')}</div>
 <button class="soft-button" style="width:100%;margin-top:18px" data-action="add-task">${icon('plus',17)} 新增另一項工作</button>
 <section class="soft-card card-pad-lg section-space"><div class="card-head"><div><h2 class="card-title">每日補充</h2><p class="card-sub">這些內容會附在當天的整體工作紀錄中</p></div>${icon('edit',18)}</div><div class="form-fields"><label class="form-group full"><span class="field-label">當日備註</span><textarea class="input" data-draft="note" placeholder="記下需要協調、追蹤或提醒的事項…">${esc(d.note)}</textarea></label><label class="form-group full"><span class="field-label">明日計畫</span><textarea class="input" data-draft="tomorrow" placeholder="明天預計接續處理的工作…">${esc(d.tomorrow)}</textarea></label></div></section></div>
 <aside class="entry-summary"><section class="soft-card card-pad-lg"><div class="overline">DAILY SUMMARY</div><div class="divider"></div><div class="small muted">${formatDate(d.date)}</div><div class="status-big" id="draft-hours">${formatHours(totalDraftHours())}</div><div class="small muted">預計 / 實際投入工時</div><div class="divider"></div><div class="row-between"><span class="small muted">工作項目</span><strong id="draft-count" style="font-weight:500">${d.tasks.length}</strong></div><div class="row-between" style="margin-top:12px"><span class="small muted">已完成</span><span id="draft-done" class="small">${d.tasks.filter(t=>t.status==='done').length} 項</span></div><div class="entry-actions"><button class="soft-button primary" data-action="save-journal" ${state.cloud.saving?'disabled aria-busy="true"':''}>${icon('save',16)} ${state.cloud.saving?'正在儲存…':isCloud?'儲存至 Google Sheets':'儲存今日工作'}</button><button class="soft-button" data-action="navigate" data-view="history">${icon('calendar',15)} 查看歷史紀錄</button></div><div class="divider"></div><div class="hint-row">${icon('checkCircle',15)} 一次儲存當天全部工作項目</div><div class="hint-row">${icon('edit',15)} 同一天再次儲存會更新原有紀錄</div><div class="hint-row">${icon('database',15)} ${isCloud?'雲端儲存會進行權限及版本檢查':'資料目前只保存在此瀏覽器'}</div></section><div class="note-box section-space">${icon('sparkles',15)} &nbsp; 提醒：同一日期與填寫人員的工作會自動整理成一組，方便之後查閱。</div></aside></div>`;
}
function renderTask(t,i){
 const key=`task-${i}`;
 const options=(items,value)=>[...(value&&!items.includes(value)?[value]:[]),...items].map(v=>`<option value="${esc(v)}" ${value===v?'selected':''}>${esc(v||'未指定專案')}</option>`).join('');
 return `<article class="task-card"><div class="task-heading"><div class="task-number"><span class="task-number-spot">${String(i+1).padStart(2,'0')}</span> 工作內容</div><div class="task-heading-actions"><button class="soft-button ghost mini" data-action="save-template" data-index="${i}" title="儲存此工作為常用項目">${icon('sparkles',15)} 設為常用</button><button class="soft-button ghost mini danger" aria-label="刪除第 ${i+1} 項工作" data-action="remove-task" data-index="${i}">${icon('trash',16)}</button></div></div>
 <div class="form-fields"><label class="form-group full"><span class="field-label">工作類型 *</span><select class="input" data-task="${i}" data-field="category">${options(state.store.categories||CATEGORIES,t.category)}</select></label>
 <label class="form-group"><span class="field-label">所屬專案</span><select class="input" data-task="${i}" data-field="project"><option value="" ${!t.project?'selected':''}>未指定專案</option>${options(state.store.projects,t.project)}</select></label>
 <label class="form-group full wp-description-field"><span class="field-label">執行內容</span>
 <textarea class="input" data-task="${i}" data-field="description" maxlength="2000" autocomplete="off"
 placeholder="工作名稱、現場施工與實際執行細節都寫在這裡…">${esc(t.description)}</textarea>
 <div class="wp-description-suggestions" data-description-suggestions="${i}" hidden></div></label>
 <label class="form-group full"><span class="field-label">成果 / 交付項目</span><input class="input" maxlength="1000" data-task="${i}" data-field="result" placeholder="例如：完成平面配置圖初稿" value="${esc(t.result)}" /></label>
 <label class="form-group"><span class="field-label">處理狀態</span><select class="input" data-task="${i}" data-field="status">${Object.entries(STATUSES).map(([v,label])=>`<option value="${v}" ${v===t.status?'selected':''}>${label}</option>`).join('')}</select></label>
 <label class="form-group"><span class="field-label">投入工時</span><input class="input" type="number" inputmode="decimal" step="0.5" min="0" max="24" data-task="${i}" data-field="hours" value="${Number(t.hours)||0}" /></label>
 </div></article>`;
}
function updateDescriptionSuggestions(textarea){
 if(!isMobileViewport())return;
 const index=Number(textarea.dataset.task);
 const target=document.querySelector('[data-description-suggestions="'+index+'"]');
 if(!target)return;
 const suggestions=descriptionSuggestions(permanentStorage(),state.selectedPersonId,textarea.value,state.store.journals);
 target.innerHTML=suggestions.map((value,i)=>`<button type="button" class="wp-description-suggestion"
 data-action="description-use" data-index="${index}" data-suggestion="${i}"
 title="${esc(value)}">${esc(value.slice(0,100))}</button>`).join('');
 target.hidden=!suggestions.length;
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
 return `${syncBanner()}<section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">篩選工作日誌</h2><p class="card-sub">按日期、人員、狀態或關鍵字尋找工作</p></div>${icon('filter',18)}</div><div class="filters">
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
 ${j.tasks.map(t=>`<div class="history-task"><div><div class="pill-row"><span class="tag">${esc(t.category)}</span>${t.project?`<span class="tag">${esc(t.project)}</span>`:''}</div>${t.title&&t.title!==t.category?`<h4>${esc(t.title)}</h4>`:''}${t.description?`<p>${esc(t.description)}</p>`:''}${t.result?`<p>成果：${esc(t.result)}</p>`:''}</div><div style="text-align:right"><span class="tag ${t.status}">${STATUSES[t.status]}</span><p class="xs muted">${formatHours(t.hours)}</p></div></div>`).join('')}
  ${j.note?`<p class="small muted">當日備註：${esc(j.note)}</p>`:''}${j.tomorrow?`<p class="small muted">後續計畫：${esc(j.tomorrow)}</p>`:''}
  <div class="history-foot"><span class="xs muted">最後更新：${esc((j.updatedAt||'').slice(0,10))}</span><div class="review-actions">${isCloud&&state.cloud.user?.role==='admin'?`<button class="soft-button sm danger" data-action="admin-delete-journal" data-id="${esc(j.id)}">${icon('trash',15)} 刪除此紀錄</button>`:''}${canEditJournal(j.employeeId)?`<button class="soft-button sm" data-action="edit-journal" data-id="${esc(j.id)}">${icon('edit',15)} 編輯這一天</button>`:'<span class="xs muted">僅供查閱</span>'}</div></div></div>`).join(''):''}</div></article>`;
 }).join('');
}
function reportMeta(){
 const source=isCloud?state.report.payload:null;
 return {employees:source?.employees || state.store.employees.map(e=>({id:e.id,name:e.name,departmentId:''})),
  departments:source?.departments || [],projects:source?.projects || state.store.projects,
   categories:state.store.categories||CATEGORIES};
}
function reportResult(){
 if(reportDateError())return null;
 if(!isCloud)return buildReport(state.store.journals,reportMeta().employees,reportMeta().departments,state.report.filters);
 if(state.report.phase!=='ready')return null;
 if(!state.report.payload||!state.report.applied||JSON.stringify(state.report.applied)!==JSON.stringify(state.report.filters))return null;
 return buildReport(state.report.payload.journals,state.report.payload.employees,state.report.payload.departments,state.report.filters);
}
function renderInsights(){
 const stale=isCloud && (!state.report.applied || JSON.stringify(state.report.applied)!==JSON.stringify(state.report.filters));
 return `${syncBanner()}${renderReportWorkspace({filters:state.report.filters,phase:state.report.phase,error:state.report.error,
  report:reportResult(),meta:reportMeta(),cloud:isCloud,stale})}`;
}
function reportDateError(){return validateReportPeriod(state.report.filters);}
async function loadCloudReport(){
 if(!isCloud||state.cloud.phase!=='ready'||state.report.phase==='loading')return;
 const error=reportDateError();if(error){state.report.error=error;state.report.phase='error';render();return;}
 const filters={...state.report.filters};const token=++state.report.token;
 state.report.phase='loading';state.report.error='';render();
 try{
  const result=await cloudCall('wpSharedQueryReport',filters);
  if(token!==state.report.token)return;
  if(!Array.isArray(result?.journals)||!Array.isArray(result?.employees)||!Array.isArray(result?.departments))throw Error('報表資料格式不完整');
  state.report.payload=result;state.report.applied=filters;state.report.phase='ready';
 }catch(e){if(token!==state.report.token)return;state.report.phase='error';state.report.error=e.message||'未知錯誤';}
 finally{if(token===state.report.token)render();}
}
function selectReportPeriod(period){applyReportPeriod(state.report.filters,period,today);}
function exportReport(type){
 const error=reportDateError();if(error){notify(error,true);return;}
 const report=reportResult();if(!report){notify('請先完成目前條件的查詢，再匯出報表',true);return;}
 const span=`${state.report.filters.startDate}_${state.report.filters.endDate}`;
 if(type==='xlsx')download(`WorkPulse-報表-${span}.xlsx`,buildXlsx(reportSheets(report,state.report.filters)),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 else download(`WorkPulse-明細-${span}.csv`,reportCsv(report),'text/csv;charset=utf-8');
 notify(`已產生 ${type==='xlsx'?'Excel':'CSV'} 報表（${report.count} 項）`);
}
function renderLocalNamedItem(kind,id,name){
 const editing=state.localRename?.kind===kind&&state.localRename?.id===id;
 const max=kind==='employee'?80:100;
 if(editing)return `<span class="chip local-rename-editor">
  <input class="input" data-local-rename maxlength="${max}" value="${esc(name)}" aria-label="編輯${kind==='employee'?'人員':'專案'}名稱">
  <button class="soft-button mini" data-action="local-rename-save">儲存</button>
  <button class="soft-button mini" data-action="local-rename-cancel">取消</button></span>`;
 return `<span class="chip local-named-chip"><span>${esc(name)}</span>
  <button data-action="local-rename-start" data-kind="${kind}" data-id="${esc(id)}"
   aria-label="編輯${esc(name)}名稱">${icon('edit',13)}</button>
${kind==='category'?'':`<button data-action="remove-${kind}" data-id="${esc(id)}" aria-label="移除 ${esc(name)}">${icon('x',13)}</button>`}
  </span>`;
}
function renderSettings(){
 const categoryUI=` <section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">工作類型</h2>
  <p class="card-sub">填寫日誌的第一個欄位，可以新增或編輯類型名稱</p></div>${icon('edit',19)}</div>
  <div class="inline-add"><input class="input" id="new-category" maxlength="100"
   placeholder="新增工作類型" aria-label="新增工作類型">
   <button class="soft-button icon-only" data-action="add-category" aria-label="新增工作類型">${icon('plus',17)}</button></div>
  <div class="chip-list">${(state.store.categories||CATEGORIES).map(value=>renderLocalNamedItem('category',value,value)).join('')}</div></section>`;
 if(isCloud)return `${syncBanner()}<section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">管理者 Google Drive</h2><p class="card-sub">只有驗證通過的管理員能維護使用者與刪除日誌。</p></div></div><div class="notice">${icon('info',18)}<div>一般使用者直接選擇姓名填寫與查閱；請注意姓名選單並非登入身分驗證。</div></div><button class="soft-button primary section-space" data-action="navigate" data-view="team">${icon('users',16)} 管理員控制台</button></section>`;

 return `<div class="notice">${icon('shield',20)}<div><strong style="font-weight:550">資料存放與權限提醒</strong><br/>這是可操作的本機原型，所有紀錄只存在目前瀏覽器的 localStorage。人員選單不等於登入驗證，且資料尚未同步至 Google Sheets。請先使用測試資料。</div></div>
 <div class="settings-grid section-space"><section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">填寫人員</h2><p class="card-sub">管理日誌表單的人員選單</p></div>${icon('users',19)}</div><div class="inline-add"><input class="input" id="new-employee" maxlength="80" placeholder="新增人員名稱" aria-label="新增人員名稱"/><button class="soft-button icon-only" data-action="add-employee" aria-label="新增人員">${icon('plus',17)}</button></div><div class="chip-list">${state.store.employees.map(e=>renderLocalNamedItem('employee',e.id,e.name)).join('')}</div></section>
 <section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">專案清單</h2><p class="card-sub">管理表單中可選的專案</p></div>${icon('folder',19)}</div><div class="inline-add"><input class="input" id="new-project" maxlength="100" placeholder="新增專案名稱" aria-label="新增專案名稱"/><button class="soft-button icon-only" data-action="add-project" aria-label="新增專案">${icon('plus',17)}</button></div><div class="chip-list">${state.store.projects.map(p=>renderLocalNamedItem('project',p,p)).join('')}</div></section>
 ${categoryUI}</div>
 <section class="soft-card card-pad-lg section-space"><div class="card-head"><div><h2 class="card-title">資料備份與匯出</h2><p class="card-sub">所有功能皆在本機執行，不會上傳至外部伺服器</p></div>${icon('database',19)}</div><div class="row" style="flex-wrap:wrap"><button class="soft-button" data-action="export-json">${icon('download',16)} 匯出 JSON 備份</button><button class="soft-button" data-action="export-csv">${icon('download',16)} 匯出 CSV 報表</button><button class="soft-button" data-action="import-json">${icon('upload',16)} 匯入 JSON 備份</button></div><div class="divider"></div><div class="row-between" style="flex-wrap:wrap"><div><div class="small">重設本機資料</div><div class="xs muted">這會清除目前瀏覽器內的工作日誌與設定，無法復原。</div></div><button class="soft-button danger sm" data-action="reset-data">${icon('trash',15)} 清空資料</button></div></section>
 <section class="soft-card card-pad-lg section-space"><div class="card-head"><div><h2 class="card-title">下一步：Google Sheets</h2><p class="card-sub">正式多人使用需先完成伺服端權限驗證</p></div>${icon('arrowUpRight',19)}</div><p class="small muted" style="line-height:1.95">規劃使用 Google Workspace 帳號辨識員工，由受控的服務端處理資料存取、操作紀錄及編輯權限。完成前不提供可供匿名使用者直接寫入試算表的公開介面。</p></section>`;
}
function empty(symbol,title,body,button,action){return `<div class="empty"><div class="empty-orb">${icon(symbol,28)}</div><h3>${title}</h3><p>${body}</p><button class="soft-button sm" data-action="${action}">${icon('plus',15)} ${button}</button></div>`;}
function render(){renderShell();}
function activateAttendancePage(){
 if(!shouldLoadAttendance({view:state.view,isCloud,cloudPhase:state.cloud.phase}))return;
 void activateAttendance({
   load:()=>loadAttendance(state.store.employees,isOwnerPortal,attendanceState.month,state.selectedPersonId),
   render,
   isActive:()=>shouldLoadAttendance({view:state.view,isCloud,cloudPhase:state.cloud.phase}),
   onError:error=>{attendanceState.phase='error';attendanceState.error=error?.message||'出勤表讀取失敗';}
 });
}
function changeView(view){if(state.view==='attendance'&&view!=='attendance'&&(attendanceState.scheduleSaving||(attendanceState.scheduleDirty&&!confirm('班表尚未儲存，確定離開？'))))return;if(!visibleNav().some(n=>n.id===view)||!allowedMobileView(view))return;state.view=view;location.hash=`/${view}`;window.scrollTo({top:0,behavior:'instant'});render();if(view==='team' && adminState.phase==='idle')refreshTeam();if(view==='attendance')activateAttendancePage();if(view==='insights'&&isCloud&&state.cloud.phase==='ready'&&state.report.phase==='idle')loadCloudReport();}
async function refreshTeam(){if(!isCloud||state.cloud.user?.role!=='admin')return;if(!maintenanceState.month)maintenanceState.month=state.month;const promise=loadAdmin();render();await promise;render();}
function notify(text,error=false){state.toast={text,error};showToast(text,error);}
function showToast(text,error=false,preserve=false){const container=document.querySelector('#toast-stack');if(!container)return;if(!preserve)container.innerHTML='';container.insertAdjacentHTML('beforeend',`<div class="toast ${error?'error':''}">${icon(error?'alert':'checkCircle',18)} ${esc(text)}</div>`);}
function saveStore(next){if(isCloud){notify('雲端版禁止使用本機儲存通道',true);return false;}try {if(state.store.mode==='demo'){next={...next,journals:next.journals.filter(j=>!String(j.id).startsWith('demo-'))};}writeState(next);state.store={...next,mode:'local'};return true;}catch(e){notify('儲存失敗：請確認瀏覽器儲存空間與隱私模式設定',true);console.error(e);return false;}}
function requireDiscard(){if(!state.dirty)return true;flushQuickDraft();return confirm('目前內容尚未正式提交，已暫存為本機草稿。確定要離開目前的填寫畫面嗎？');}
function openRecord(record){if(!requireDiscard())return;state.saveRequestId=null;selectPersonId(record.employeeId);state.draft=makeDraft(record.date,record.employeeId,record);state.dirty=false;changeView('entry');}
function openNew(){if(state.cloud.saving||state.cloud.loadingMonth||(isCloud&&state.cloud.phase!=='ready'))return;if(!requireDiscard())return;state.saveRequestId=null;const target=state.selectedPersonId;if(isCloud&&state.month!==today.slice(0,7)){state.view='entry';location.hash='/entry';loadCloudMonth(today.slice(0,7),today,target);return;}state.draft=makeDraft(today,target);state.dirty=false;changeView('entry');}
function downloadBackup(){download(`WorkPulse-backup-${today}.json`,JSON.stringify({...state.store,mode:'local'},null,2));}
function persistChanges(){if(isCloud)return false;const next={...state.store,mode:'local'};return saveStore(next);}

let cloudBootstrapSequence=0;
async function initCloud(){
 if(!isCloud)return;
 const sequence=++cloudBootstrapSequence;
 state.cloud.phase='loading';state.cloud.error='';state.report.payload=null;state.report.applied=null;state.report.phase='idle';render();
 try{
  const payload=await cloudCall('wpSharedBootstrap',state.month);
  if(sequence!==cloudBootstrapSequence)return;
  if(!payload?.store || !payload?.user)throw Error('雲端回應格式不完整');
  state.store={...payload.store,mode:'cloud'};
  if(isOwnerPortal){
    const owner=await cloudCall('wpOwnerBootstrap');
    if(sequence!==cloudBootstrapSequence)return;
    if(!owner || !Array.isArray(owner.employees))throw Error('管理員身分未通過驗證');
    payload.user={...payload.user,role:'admin',name:'管理員'};
  }
  state.cloud.user=payload.user;state.cloud.phase='ready';
  state.selectedPersonId=readSelectedPerson(permanentStorage(),state.store.employees);
  selectPersonId(state.selectedPersonId);
  state.draft=makeDraft(today,state.selectedPersonId);
  state.dirty=false;restoreQuickDraft();if(state.view==='team' && payload.user.role!=='admin')state.view='overview';render();
  if(state.view==='team'&&payload.user.role==='admin')refreshTeam();
  if(state.view==='insights'&&state.report.phase==='idle')loadCloudReport();
  if(state.view==='attendance')activateAttendancePage();
 }catch(e){if(sequence!==cloudBootstrapSequence)return;state.cloud.phase='error';state.cloud.error=e.message||'連線失敗';render();}
}
async function loadCloudMonth(month,focusDate=null,focusEmployee=null){
 if(!isCloud)return;
 if(state.cloud.phase!=='ready')return;
 state.cloud.loadingMonth=true;const token=++state.cloud.monthToken;render();
 try{
  const result=await cloudCall('wpSharedLoadMonth',month);
  if(token!==state.cloud.monthToken)return;
  state.store={...state.store,journals:result.journals};state.month=month;
  if(focusDate){state.draft=makeDraft(focusDate,focusEmployee||state.selectedPersonId);state.dirty=false;}
 }catch(e){if(token===state.cloud.monthToken)notify('雲端讀取失敗：'+(e.message||'未知錯誤'),true);}
 finally{if(token===state.cloud.monthToken){state.cloud.loadingMonth=false;render();}}
}
async function saveCloudJournal(){
 if(state.cloud.saving||state.cloud.loadingMonth||state.cloud.phase!=='ready')return;
 const d=state.draft;
 if(!d.date || !d.employeeId || !d.tasks.some(t=>String(t.category||'').trim())){notify('請選日期、人員並至少選擇一個工作類型',true);return;}
 const hours=d.tasks.reduce((sum,t)=>sum+(Number(t.hours)||0),0);
 if(d.tasks.some(t=>Number(t.hours)<0||Number(t.hours)>24) || hours>24){notify('每日總工時不可超過 24 小時',true);return;}
 state.saveRequestId=state.saveRequestId||uid();
 const request={requestId:state.saveRequestId,expectedRevision:d.revision||0,date:d.date,employeeId:d.employeeId,
  note:d.note,tomorrow:d.tomorrow,tasks:d.tasks.filter(t=>String(t.category||'').trim()).map(t=>({...t,title:t.title?.trim()||t.category}))};
 flushQuickDraft();state.cloud.saving=true;render();
 try{
  const result=await fieldSave('wpSharedSaveJournal',request);
  if(!result?.ok || !result.journal)throw Error('雲端回傳資料不完整，請先重新整理再嘗試');
  state.saveRequestId=null;
  state.store={...state.store,journals:[...state.store.journals.filter(j=>!(j.date===result.journal.date && j.employeeId===result.journal.employeeId)),result.journal]};
  state.draft=makeDraft(result.journal.date,result.journal.employeeId,result.journal);
  state.report.payload=null;state.report.applied=null;state.report.phase='idle';
  rememberDescriptions(permanentStorage(),result.journal.employeeId,result.journal.tasks);
  state.dirty=false;clearTimeout(draftTimer);clearQuickDraft(draftStorage(),draftAccount());state.draftStatus='已正式儲存至 Google Sheets';
  notify(result.deduplicated?'已確認此筆工作日誌存在雲端':'工作日誌已成功儲存到 Google Sheets');
 }catch(e){
  notify('雲端儲存未確認：'+(e.message||'請重新嘗試')+'。保留目前草稿，請勿重新填寫。',true);
 }finally{state.cloud.saving=false;render();}
}
root.addEventListener('click', event=>{
 const button=event.target.closest('[data-action]');if(!button)return;
 const action=button.dataset.action;
 if(action==='field-retry'||action==='field-discard'||action==='field-download'){
  const id=button.dataset.id;
  if(!isCloud||!readFieldPending().some(x=>x.payload.requestId===id&&x.payload.employeeId===state.selectedPersonId))return;
  if(action==='field-download'){
   const item=readFieldPending().find(x=>x.payload.requestId===id&&x.payload.employeeId===state.selectedPersonId);
   if(!item||fieldRecoveryBusy(id)||!confirm('下載未確認的原始請求供人工核對，不代表已儲存；請妥善保管公司資料。確定下載？'))return;
   download('WorkPulse-pending-'+item.payload.date+'-'+id+'.json',JSON.stringify({format:'workpulse-pending-v1',notConfirmed:true,...item},null,2),'application/json');return;
  }
  if(action==='field-discard'){
   if(confirm('請先查閱雲端確認原請求是否已儲存。移除只會清除本分頁的待同步請求，不會刪除雲端紀錄。確定移除？'))removeFieldPending(id);
   return;
  }
  if(state.cloud.phase!=='ready'||state.cloud.saving||attendanceState.saving||fieldRecoveryBusy(id))return;
  if(!confirm('以相同識別碼與原始資料重送？完成後請重新讀取對應紀錄；目前草稿不會被覆蓋。'))return;
  retryFieldPending(id,state.selectedPersonId).then(()=>notify('雲端已確認原始請求。請重新讀取對應日期，核對並視需要捨棄舊草稿。'))
   .catch(error=>notify('同步未完成：'+error.message,true));
  return;
 }
 if(action==='person-menu'){
  if(isCloud&&(state.cloud.phase!=='ready'||state.cloud.loadingMonth||state.cloud.saving))return;
  if(openMobileSheet(button,'目前操作人員',state.store.employees.map(p=>({value:p.id,label:p.name,selected:p.id===state.selectedPersonId})),id=>changeSelectedPerson(id)))return;
  const box=button.closest('.wp-person-picker'),menu=box?.querySelector('.wp-person-menu');
  if(menu){menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));}
  return;
 }
 if(action==='person-select'){changeSelectedPerson(button.dataset.id);return;}
 if(action==='description-use'){
  const index=Number(button.dataset.index);
  const textarea=document.querySelector('textarea[data-task="'+index+'"][data-field="description"]');
  const suggestions=descriptionSuggestions(permanentStorage(),state.selectedPersonId,
    textarea?.value||'',state.store.journals);
  const value=suggestions[Number(button.dataset.suggestion)];
  if(textarea&&value){
   textarea.value=value;
   const task=state.draft.tasks[index];if(task)task.description=value;
   markDraftDirty();
   const popover=document.querySelector('[data-description-suggestions="'+index+'"]');
   if(popover)popover.hidden=true;
   textarea.focus();
  }
  return;
 }
 if(action==='retry-cloud'){initCloud();return;}
 if(action==='maintenance-recovery'||action==='maintenance-recovery-download'){
  if(!isOwnerPortal||state.cloud.user?.role!=='admin'||maintenanceState.busy)return;
  if(action==='maintenance-recovery-download'){if(confirm('復原 JSON 包含員工工作內容，請存放私人位置。確定下載？'))downloadMaintenanceRecovery();return;}
  const promise=previewMaintenanceRecovery(button.dataset.id);render();promise.finally(()=>render());return;
 }
 if(action==='maintenance-load'||action==='maintenance-backup'){
  if(!isOwnerPortal||state.cloud.user?.role!=='admin'||maintenanceState.busy)return;
  const month=document.querySelector('[data-maintenance-month]')?.value||state.month;
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){notify('請選擇有效月份',true);return;}
  maintenanceState.month=month;
  if(action==='maintenance-backup'&&!confirm('建立獨立私人備份，不會覆寫正式資料。建議目前沒有其他人填寫。確定執行？'))return;
  const promise=action==='maintenance-load'?loadMaintenance(month):backupMaintenance(button.dataset.target==='control'?'control':month);render();promise.finally(()=>render());return;
 }
 if(action==='admin-refresh'){if(adminState.saving)return;if(adminState.dirty&&!confirm('尚未儲存的團隊資料會遺失，確定重新整理？'))return;resetAdminEditor();refreshTeam();return;}
 if(action==='admin-tab'){if(adminState.saving)return;if(adminState.dirty&&!confirm('要放棄尚未儲存的變更嗎？'))return;setAdminTab(button.dataset.kind);render();return;}
 if(action==='admin-new'){if(adminState.saving)return;if(adminState.dirty&&!confirm('要放棄尚未儲存的變更嗎？'))return;editAdmin(button.dataset.kind);render();return;}
 if(action==='admin-edit'){if(adminState.saving)return;if(adminState.dirty&&!confirm('要放棄尚未儲存的變更嗎？'))return;editAdmin(button.dataset.kind,button.dataset.id);render();return;}
 if(action==='admin-cancel'){if(adminState.saving)return;if(adminState.dirty&&!confirm('確定放棄尚未儲存的變更？'))return;resetAdminEditor();render();return;}
 if(action==='admin-save'){
   if(adminState.saving)return;
   if(adminState.draft && adminState.draft.active===false && !confirm('停用後該資料將不再可用，但歷史紀錄會保留。確定儲存？'))return;
   saveAdmin().then(async r=>{
     const updated=await cloudCall('wpSharedBootstrap',state.month);
     state.store={...updated.store,mode:'cloud'};state.selectedPersonId=readSelectedPerson(permanentStorage(),state.store.employees);
     selectPersonId(state.selectedPersonId);
     state.cloud.user=updated.user;state.report.payload=null;state.report.applied=null;state.report.phase='idle';
     if(updated.user?.role!=='admin'){state.view='overview';location.hash='/overview';}
     else if(!canEditJournal(state.draft?.employeeId))state.draft=makeDraft(today,state.selectedPersonId);
     render();notify(r.deduplicated?'已確認資料儲存結果':'團隊資料已更新');
   }).catch(e=>{render();notify('變更未儲存：'+(e.message||'未知錯誤'),true);});
   render();return;
 }
 if(state.cloud.phase==='error' || state.cloud.phase==='loading')return;
 if(action==='local-rename-start'){
   if(isCloud)return;
   const kind=button.dataset.kind,id=button.dataset.id;
   if(!((kind==='employee'&&state.store.employees.some(e=>e.id===id))||
        (kind==='project'&&state.store.projects.includes(id))||
        (kind==='category'&&(state.store.categories||CATEGORIES).includes(id))))return;
   state.localRename={kind,id};render();
   document.querySelector('[data-local-rename]')?.focus();return;
 }
 if(action==='local-rename-cancel'){
   state.localRename=null;render();return;
 }
 if(action==='local-rename-save'){
   if(isCloud||!state.localRename)return;
   const {kind,id}=state.localRename;
   const value=document.querySelector('[data-local-rename]')?.value;
   try{
    const before=kind==='project'||kind==='category'?id:state.store.employees.find(e=>e.id===id)?.name;
    const next=kind==='employee'?renameLocalEmployee(state.store,id,value):
      kind==='category'?renameLocalWorkCategory(state.store,id,value.trim()):
      renameLocalProject(state.store,id,value);
    if(saveStore(next)){
     if(kind==='category'&&id!==value?.trim()){
      const target=value.trim();
      state.draft.tasks=state.draft.tasks.map(t=>t.category===id?{
       ...t,category:target,title:t.title===id?target:t.title
      }:t);
      state.templates=renameTemplatesCategory(draftStorage(),draftAccount(),id,target);
      if(state.report.filters.category===id)state.report.filters.category=target;
      if(state.dirty)scheduleQuickDraft();
     }
     if(kind==='project'&&id!==value?.trim()){
      const target=value.trim();
      state.draft.tasks=state.draft.tasks.map(t=>t.project===id?{...t,project:target}:t);
      state.templates=renameTemplatesProject(draftStorage(),draftAccount(),id,target);
      if(state.report.filters.project===id)state.report.filters.project=target;
      if(state.dirty)scheduleQuickDraft();
     }
     state.localRename=null;render();
     notify((kind==='employee'?'人員':kind==='category'?'工作類型':'專案')+'已由「'+before+'」更名為「'+value.trim()+'」');
    }
   }catch(e){notify(e.message||'更名失敗',true);}
   return;
 }

 if(action==='admin-delete-journal'){
   if(!isCloud||state.cloud.user?.role!=='admin'||state.cloud.saving)return;
   const j=state.store.journals.find(x=>x.id===button.dataset.id);
   if(!j){notify('此日誌已不存在，請重新整理',true);return;}
   const name=employeeName(j.employeeId);
   if(!confirm(`確定刪除「${name}」在 ${j.date} 的整日工作日誌（${j.tasks.length} 項）？刪除後一般使用者將無法查閱。`))return;
   if(prompt('為避免誤刪，請輸入「刪除」確認：')!=='刪除')return;
   state.cloud.saving=true;render();
   cloudCall('wpOwnerDeleteJournal',{journalId:j.id,date:j.date,expectedRevision:j.revision,requestId:uid()})
    .then(result=>{
      if(!result?.ok)throw Error('刪除結果未確認');
      state.store={...state.store,journals:state.store.journals.filter(x=>x.id!==j.id)};
      if(state.draft?.date===j.date&&state.draft?.employeeId===j.employeeId){
        state.draft=makeDraft(j.date,j.employeeId);state.dirty=false;
      }
      state.report.payload=null;state.report.phase='idle';state.report.applied=null;
      notify('工作日誌已刪除，後端稽核紀錄仍會保留');
    }).catch(e=>notify('刪除失敗：'+e.message,true))
      .finally(()=>{state.cloud.saving=false;render();});
   return;
 }
 if(action==='report-run'){if(isCloud)loadCloudReport();else {const err=reportDateError();if(err)notify(err,true);else {render();notify('報表已更新');}}return;}
 if(action==='report-period'){selectReportPeriod(button.dataset.period);render();return;}
 if(action==='report-export-csv'){exportReport('csv');return;}
 if(action==='report-export-xlsx'){exportReport('xlsx');return;}
 if(action==='refresh-cloud'){if(requireDiscard())initCloud();return;}
 if(isCloud && state.cloud.saving)return;
 if(action==='navigate'){if(state.view==='entry' && !requireDiscard())return;if(state.view==='team'&&adminState.dirty&&!confirm('團隊資料尚未儲存，確定離開嗎？'))return;state.dirty=false;changeView(button.dataset.view);return;}
 if(action==='new-journal'){openNew();return;}
 if(action==='copy-previous'){
  const previous=recentPriorJournal(state.store.journals,state.draft.date,state.draft.employeeId);
  if(previous)appendReusableTasks(previous.tasks);else notify('目前載入的月份沒有可複製的上次工作',true);
  return;
 }
 if(action==='save-template'){
  const task=state.draft.tasks[Number(button.dataset.index)];if(!task)return;
  const result=addTemplate(draftStorage(),draftAccount(),task);
  if(!result.ok){notify(result.reason,true);return;}
  state.templates=readTemplates(draftStorage(),draftAccount());render();notify('已加入常用項目');return;
 }
 if(action==='remove-template'){
  removeTemplate(draftStorage(),draftAccount(),button.dataset.id);
  state.templates=readTemplates(draftStorage(),draftAccount());render();return;
 }
 if(action==='use-template'){
  const t=state.templates.find(t=>t.id===button.dataset.id);if(t)appendReusableTasks([t]);return;
 }
 if(action==='discard-draft'){
  if(!confirm('要捨棄目前尚未正式儲存的草稿嗎？'))return;
  clearTimeout(draftTimer);clearQuickDraft(draftStorage(),draftAccount());
  state.draft=makeDraft(state.draft.date,state.draft.employeeId);state.dirty=false;state.saveRequestId=null;state.draftStatus='草稿已捨棄';render();return;
 }
 if(action==='add-task'){if(state.cloud.saving||state.cloud.loadingMonth)return;if(state.draft.tasks.length>=100){notify('同一天最多可填寫 100 項工作',true);return;}state.draft.tasks.push(makeItem());markDraftDirty();render();((isMobileViewport()?document.querySelector('.task-card:last-child select[data-field="category"] + .wp-sheet-trigger'):null)||document.querySelector('.task-card:last-child select[data-field="category"]'))?.focus();return;}
 if(action==='remove-task'){const index=Number(button.dataset.index);state.draft.tasks.splice(index,1);if(!state.draft.tasks.length)state.draft.tasks.push(makeItem());markDraftDirty();render();return;}
 if(action==='save-journal'){
   if(isCloud){saveCloudJournal();return;}
   try{
    const base=state.store.mode==='demo'?{...state.store,journals:[],mode:'local'}:state.store;
    const next=saveJournal(base,state.draft);
    if(saveStore(next)){rememberDescriptions(permanentStorage(),state.draft.employeeId,state.draft.tasks);state.draft=makeDraft(state.draft.date,state.draft.employeeId);state.dirty=false;clearTimeout(draftTimer);clearQuickDraft(draftStorage(),draftAccount());state.draftStatus='已存於本機 · 未同步 Drive';render();notify('工作日誌已儲存至目前瀏覽器');}
    updateDraftSummary();
   }catch(e){notify(e.message||'無法儲存日誌',true);}return;
 }
 if(action==='toggle-day'){const date=button.dataset.date;if(state.expanded.has(date))state.expanded.delete(date);else state.expanded.add(date);const oldTop=window.scrollY;const target=document.querySelector('#history-results');if(target)target.innerHTML=renderHistoryResults();window.scrollTo(0,oldTop);return;}
 if(action==='edit-journal'){const record=state.store.journals.find(j=>j.id===button.dataset.id);if(record&&canEditJournal(record.employeeId))openRecord(record);return;}
 if(action==='add-category'){
  if(isCloud)return;
  try{
   const categories=addWorkCategory(state.store.categories||CATEGORIES,
     document.querySelector('#new-category')?.value);
   if(saveStore({...state.store,categories})){render();notify('已新增工作類型');}
  }catch(error){notify(error.message,true);}
  return;
 }
 if(action==='add-employee'){if(isCloud){notify('雲端員工由管理員維護',true);return;}
   const input=document.querySelector('#new-employee');const name=input?.value.trim();if(!name){notify('請輸入人員名稱',true);return;}
   if(state.store.employees.some(e=>e.name===name)){notify('人員名稱已存在',true);return;}
   if(state.store.employees.length>=200){notify('人員數量已達上限',true);return;}
   if(saveStore({...state.store,employees:[...state.store.employees,{id:uid(),name}]})){notify('已新增人員');render();}return;
 }
 if(action==='remove-employee'){if(isCloud)return;
   const id=button.dataset.id;if(state.store.employees.length<=1){notify('至少保留一位人員',true);return;}
   if(state.store.journals.some(j=>j.employeeId===id)){notify('此人員已有工作紀錄，不能直接移除',true);return;}
   if(!confirm('確定移除此人員？'))return;
   if(saveStore({...state.store,employees:state.store.employees.filter(e=>e.id!==id)})){
    selectPersonId(readSelectedPerson(permanentStorage(),state.store.employees));
    state.draft=makeDraft(today,state.selectedPersonId);render();
   }return;
 }
 if(action==='add-project'){if(isCloud){notify('雲端專案由管理員維護',true);return;}
   const name=document.querySelector('#new-project')?.value.trim();if(!name){notify('請輸入專案名稱',true);return;}
   if(state.store.projects.includes(name)){notify('專案名稱已存在',true);return;}
   if(state.store.projects.length>=500){notify('專案數量已達上限',true);return;}
   if(saveStore({...state.store,projects:[...state.store.projects,name]})){notify('已新增專案');render();}return;
 }
 if(action==='remove-project'){if(isCloud)return;
   const name=button.dataset.id;if(!confirm(`確定從選單移除「${name}」？既有紀錄不會刪除。`))return;
   if(saveStore({...state.store,projects:state.store.projects.filter(p=>p!==name)})){render();}return;
 }
 if(action==='export-migration'){
  if(isCloud)return;
  try{const pack=buildLocalMigrationPackage(permanentStorage());if(!confirm('將下載 '+pack.counts.journals+' 筆日誌、'+pack.counts.attendance+' 筆出勤（'+pack.warnings.length+' 項待核對）。包含公司資料，請保存至私人位置；不會自動上傳。確定下載？'))return;
   download('WorkPulse-local-migration-'+today+'.json',JSON.stringify(pack,null,2),'application/json');notify('移轉封包已開始下載，尚未寫入 Google Drive。');}
  catch(e){notify('移轉封包未建立：'+e.message,true);}return;
 }
 if(action==='export-json'){downloadBackup();notify('JSON 備份已開始下載');return;}
 if(action==='export-csv'){download(`WorkPulse-journal-${today}.csv`,csvExport(state.store),'text/csv;charset=utf-8');notify('CSV 報表已開始下載');return;}
 if(action==='import-json'){if(isCloud)return;document.querySelector('#import-file')?.click();return;}
 if(action==='reset-data'){if(isCloud)return;
   if(!confirm('確定清除目前瀏覽器中的所有 WorkPulse 工作日誌？此操作無法復原，建議先匯出備份。'))return;
   if(saveStore(emptyState())){clearQuickDraft(draftStorage(),draftAccount());selectPersonId(readSelectedPerson(permanentStorage(),state.store.employees));state.draft=makeDraft(today,state.selectedPersonId);state.dirty=false;render();notify('本機資料已清空');}return;
 }
});
root.addEventListener('input',event=>{
 const el=event.target;
 if(el.matches('[data-admin-field]')){updateAdminDraft(el.dataset.adminField,el.value);return;}
 if(el.matches('[data-task]')){
  const t=state.draft.tasks[Number(el.dataset.task)];if(!t)return;
  if(el.dataset.field==='category'&&(!t.title||t.title===t.category))t.title=el.value;
  t[el.dataset.field]=el.dataset.field==='hours'?Number(el.value):el.value;
  markDraftDirty();updateDraftSummary();
  if(el.dataset.field==='description')updateDescriptionSuggestions(el);
  return;
 }
 if(el.matches('[data-draft]')){state.draft[el.dataset.draft]=el.value;markDraftDirty();return;}
 if(el.matches('[data-filter="query"]')){state.filters.query=el.value;const target=document.querySelector('#history-results');if(target)target.innerHTML=renderHistoryResults();const count=document.querySelector('#history-count');if(count)count.textContent=`${filteredGroups().length} 個工作日`;return;}
});
root.addEventListener('change',event=>{
 const el=event.target;
 if(el.matches('[data-admin-field]')){updateAdminDraft(el.dataset.adminField,el.value);return;}
 if(el.matches('[data-report-filter]')){
  if(el.dataset.reportFilter==='employeeId'&&el.value!=='all'&&
     !changeSelectedPerson(el.value)){render();return;}
  state.report.filters[el.dataset.reportFilter]=el.value;render();return;
 }
 if(el.matches('[data-identity]')){
   const field=el.dataset.identity;const value=el.value;
   if(state.dirty&&!confirm('切換日期或人員會放棄尚未儲存的內容，確定繼續嗎？')){el.value=state.draft[field];return;}
   flushQuickDraft();const date=field==='date'?value:state.draft.date;const employee=field==='employeeId'?value:state.draft.employeeId;
   state.saveRequestId=null;
   if(isCloud && date.slice(0,7)!==state.month){loadCloudMonth(date.slice(0,7),date,employee);return;}
   if(field==='employeeId')selectPersonId(employee);
   state.draft=makeDraft(date,employee);state.templates=readTemplates(draftStorage(),draftAccount());state.dirty=false;render();return;
 }
 if(el.matches('[data-filter]')){
  if(el.dataset.filter==='employee'&&el.value!=='all'&&
     !changeSelectedPerson(el.value)){render();return;}
  state.filters[el.dataset.filter]=el.value;render();return;
 }
 if(el.matches('[data-month]')){const month=el.value||currentMonth();if(isCloud){loadCloudMonth(month);return;}state.month=month;render();return;}
});
window.addEventListener('keydown',event=>{
 if((event.ctrlKey||event.metaKey)&&state.view==='entry'&&!event.altKey){
  if(event.key.toLowerCase()==='s'){event.preventDefault();document.querySelector('[data-action="save-journal"]')?.click();return;}
  if(event.key==='Enter'){event.preventDefault();document.querySelector('[data-action="add-task"]')?.click();return;}
 }
});
root.addEventListener('keydown',event=>{
 if(event.key==='Enter'&&event.target.matches('#new-employee')){event.preventDefault();document.querySelector('[data-action="add-employee"]')?.click();}
 if(event.key==='Enter'&&event.target.matches('#new-project')){event.preventDefault();document.querySelector('[data-action="add-project"]')?.click();}
 if(event.key==='Enter'&&event.target.matches('#new-category')){event.preventDefault();document.querySelector('[data-action="add-category"]')?.click();}
 if(event.target.matches('[data-local-rename]')){
  if(event.key==='Enter'){event.preventDefault();document.querySelector('[data-action="local-rename-save"]')?.click();}
  if(event.key==='Escape'){event.preventDefault();document.querySelector('[data-action="local-rename-cancel"]')?.click();}
 }
});
root.addEventListener('change',async event=>{
 if(event.target.id!=='import-file')return;
 const file=event.target.files?.[0];if(!file)return;
 try{
   if(file.size>10_000_000)throw Error('備份檔案超過 10 MB 上限');
   const payload=validateState(JSON.parse(await file.text()));
   if(!confirm(`匯入將取代目前所有本機紀錄（${payload.journals.length} 筆日誌），確定繼續？`))return;
   if(saveStore(payload)){selectPersonId(readSelectedPerson(permanentStorage(),state.store.employees));state.draft=makeDraft(today,state.selectedPersonId);state.dirty=false;state.filters={query:'',employee:state.selectedPersonId,status:'all'};render();notify('備份資料匯入成功');}
 }catch(e){notify(`匯入失敗：${e.message}`,true);}finally{event.target.value='';}
});
window.addEventListener('hashchange',()=>{const view=fromHash();if(view!==state.view){if(!visibleNav().some(n=>n.id===view)||!allowedMobileView(view)){changeView('overview');return;}state.view=view;render();if(view==='team'&&adminState.phase==='idle')refreshTeam();if(view==='attendance')activateAttendancePage();if(view==='insights'&&isCloud&&state.cloud.phase==='ready'&&state.report.phase==='idle')loadCloudReport();}});
document.addEventListener('workpulse:select-person',event=>{
 if(!changeSelectedPerson(event.detail?.id,{fromAttendance:true}))event.preventDefault();
});
document.addEventListener('click',event=>{
 if(event.target.closest?.('.wp-person-picker'))return;
 const menu=document.querySelector('.wp-person-menu:not([hidden])');
 if(menu){
  menu.hidden=true;
  menu.closest('.wp-person-picker')?.querySelector('[data-action="person-menu"]')
   ?.setAttribute('aria-expanded','false');
 }
});
root.addEventListener('change',event=>{
 const node=event.target;
 if(node.matches?.('[data-field="description"][data-task]')){
  const entry=state.draft.tasks[Number(node.dataset.task)];
  if(entry)rememberDescriptions(permanentStorage(),state.selectedPersonId,[entry]);
 }
});
root.addEventListener('focusin',event=>{
 if(event.target.matches?.('[data-field="description"][data-task]'))
  updateDescriptionSuggestions(event.target);
});
document.addEventListener('copy',event=>{
 if(event.target.closest?.('input,textarea,[contenteditable="true"]'))return;
 event.preventDefault();
});
window.addEventListener('online',updateFieldRecovery);
window.addEventListener('offline',updateFieldRecovery);
document.addEventListener('workpulse:field-recovery',updateFieldRecovery);
window.addEventListener('pagehide',()=>{if(state.dirty)flushQuickDraft();});
window.addEventListener('beforeunload',event=>{if(state.dirty)flushQuickDraft();if(state.dirty||adminState.dirty||attendanceState.scheduleDirty||(attendanceState.dirty&&!attendanceState.draftStored)||!fieldRecoveryDurable()){event.preventDefault();event.returnValue='';}});
initMobileWorkflow();render();
if(isCloud)initCloud();
else activateAttendancePage();
