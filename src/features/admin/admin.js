import { cloudCall } from '../../services/cloud.js';
import { esc, uid, download } from '../../shared/utils.js';
import { icon } from '../../shared/icons.js';
import {addWorkCategory,renameWorkCategory} from '../journals/categories.js';

export const adminState={phase:'idle',data:null,tab:'employees',draft:null,dirty:false,saving:false,error:'',requestId:null};
export const deploymentCheckState={busy:false,data:null,error:''};
const wpDeploymentLabels={domainMode:'公司網域存取',dataFolder:'日常資料夾',controller:'控制試算表',headers:'控制表結構',monthIndex:'分月索引',backupFolder:'獨立備份資料夾',backupRegistration:'備份觸發器與執行紀錄'};
export async function loadDeploymentCheck(){
 const a=deploymentCheckState;if(a.busy)return;a.busy=true;a.error='';a.data=null;
 try{const d=await cloudCall('workPulseDeploymentCheck');if(d?.readOnly!==true||d.productionVerified!==false||typeof d.configurationPassed!=='boolean'||!Array.isArray(d.checks)||!d.checks.length||d.checks.some(x=>typeof x.key!=='string'||typeof x.ok!=='boolean'||typeof x.detail!=='string'))throw Error('部署檢查回應格式異常，請確認私人發布包版本');a.data=d;}
 catch(e){a.error=e.message||'部署檢查失敗';}finally{a.busy=false;}
}
export function renderDeploymentCheck(){
 const a=deploymentCheckState,d=a.data;
 return '<section class="soft-card card-pad-lg section-space wp-deployment-check"><div class="card-head"><div><h2 class="card-title">正式部署準備度</h2><p class="card-sub">資料持有者專用唯讀檢查；不會建立檔案、修改權限或啟用排程。</p></div><button type="button" class="soft-button" data-action="deployment-check" '+(a.busy?'disabled':'')+'>'+(a.busy?'檢查中…':'執行檢查')+'</button></div>'+
 (a.error?'<p role="alert" class="small">'+esc(a.error)+'</p>':'')+
 (d?'<p role="status"><strong>'+ (d.configurationPassed?'設定檢查通過':'仍有設定需要處理')+'</strong> · '+d.checks.filter(x=>x.ok).length+'/'+d.checks.length+' 項 · '+esc(d.checkedAt||'')+'</p><div class="maintenance-list">'+d.checks.map(x=>'<div><strong>'+esc(wpDeploymentLabels[x.key]||x.key)+' · '+(x.ok?'通過':'待處理')+'</strong><span>'+esc(x.detail)+'</span></div>').join('')+'</div>':'')+
 '<div class="notice"><div><strong>正式營運尚須人工驗收</strong><p>兩套專案屬性一致、實際登入與外部帳號拒絕、個別員工存取需求、跨裝置寫入、實際備份還原、手機及 Excel 驗收。即使設定全部通過，仍不代表正式上線。</p></div></div></section>';
}
export const maintenanceState={month:'',data:null,error:'',backup:null,backupRequest:null,backupTarget:'',busy:false,recovery:null};
export async function loadAdmin(){
 if(adminState.phase==='loading')return;
 adminState.phase='loading';adminState.error='';
 try{
  const data=await cloudCall('wpOwnerBootstrap');
  if(!data||!Array.isArray(data.employees)||!Array.isArray(data.projects)||!Array.isArray(data.categories))
   throw Error('管理名單格式錯誤，請確認管理員 Apps Script 已更新');
  adminState.data=data;adminState.phase='ready';
 }catch(e){adminState.phase='error';adminState.error=e.message||'管理權限驗證失敗';}
}
export function setAdminTab(kind){
 if(!['employees','projects','categories'].includes(kind))return;
 adminState.tab=kind;resetAdminEditor();
}
export function editAdmin(kind,id=''){
 if(!['employees','projects','categories'].includes(kind)||!adminState.data)return;
 const record=kind==='categories'?
  (adminState.data.categories||[]).find(name=>name===id):
  adminState.data[kind]?.find(row=>row.id===id);
 if(id&&!record)return;
 adminState.tab=kind;
 adminState.draft=kind==='categories'?
  {kind,id:record||'',name:record||'',active:true,revision:adminState.data.categoryRevision||0}:
  record?{...record,kind}:{id:'',name:'',active:true,revision:0,kind};
 adminState.dirty=false;adminState.requestId=null;
}
export function updateAdminDraft(field,value){
 if(!adminState.draft||!['name','active'].includes(field))return;
 adminState.draft[field]=field==='active'?value==='true':value;
 adminState.dirty=true;adminState.requestId=null;
}
export function resetAdminEditor(){
 adminState.draft=null;adminState.dirty=false;adminState.requestId=null;
}
export function renderTeam(user){
 if(user?.role!=='admin')
  return '<section class="soft-card card-pad-lg">管理員權限驗證失敗，不能維護人員或專案。</section>';
 if(adminState.phase==='idle'||adminState.phase==='loading')
  return '<section class="soft-card card-pad-lg" role="status">正在驗證管理員並讀取設定名單…</section>';
 if(adminState.phase==='error')
  return `<section class="soft-card card-pad-lg" role="alert"><h2 class="card-title">無法讀取管理資料</h2><p>${esc(adminState.error)}</p><button class="soft-button" data-action="admin-refresh">重新驗證</button></section>`;
 const kind=adminState.tab==='projects'?'projects':adminState.tab==='categories'?'categories':'employees';
 const isProject=kind==='projects';
 const isCategory=kind==='categories';
 const rows=isCategory?(adminState.data?.categories||[]).map(name=>({id:name,name,active:true,revision:adminState.data.categoryRevision||0})):adminState.data?.[kind]||[],d=adminState.draft;
 const typeLabel=isCategory?'工作類型':isProject?'專案':'使用者';
 const tabs='<div class="team-tabs row section-space" role="group" aria-label="管理資料類別">'+
  '<button class="soft-button sm '+(!isProject?'active':'')+'" data-action="admin-tab" data-kind="employees" aria-pressed="'+(!isProject)+'">使用者</button>'+
  '<button class="soft-button sm '+(isProject?'active':'')+'" data-action="admin-tab" data-kind="projects" aria-pressed="'+isProject+'">專案清單</button>'+
  '<button class="soft-button sm '+(isCategory?'active':'')+'" data-action="admin-tab" data-kind="categories" aria-pressed="'+isCategory+'">工作類型</button></div>';
 return `<section class="soft-card card-pad-lg">
  <div class="card-head"><div><h2 class="card-title">管理員控制台</h2>
  <p class="card-sub">使用者姓名、專案清單與工作類型可由管理員新增及編輯。</p></div>
  <button class="soft-button sm" data-action="admin-refresh">${icon('arrowRight',15)} 同步</button></div>
  <div class="notice">${icon('shield',18)}<div>員工 ID 不變，舊工作紀錄保留原始專案／類型名稱，避免更改歷史資料。</div></div>
  ${tabs}
  <div class="row-between section-space"><span class="small muted">目前 ${rows.filter(row=>row.active).length} 個${isCategory?'可用':'啟用'}${typeLabel}</span>
  <button class="soft-button primary sm" data-action="admin-new" data-kind="${kind}">${icon('plus',16)} 新增${typeLabel}</button></div>
  <div class="team-list">${rows.map(row=>`<div class="team-member">
   <div class="team-member-main"><span class="team-initial">${esc(row.name.slice(0,1)||'—')}</span>
    <div class="team-member-label"><div>${esc(row.name)}</div>
     <span class="small muted">${isCategory?'填寫日誌可選類型':row.active?(isProject?'可選專案':'可填寫工作日誌'):'已停用'} · 第 ${row.revision} 版</span>
    </div></div>
   <button class="soft-button sm" data-action="admin-edit" data-kind="${kind}" data-id="${esc(row.id)}">${icon('edit',15)} 編輯</button>
  </div>`).join('')}</div></section>
  ${d&&d.kind===kind?`<section class="soft-card card-pad-lg section-space"><div class="card-head">
   <h2 class="card-title">${d.id?'編輯':'新增'}${typeLabel}</h2>
   <button class="soft-button ghost sm" data-action="admin-cancel">取消</button></div>
   <div class="form-fields"><label class="form-group"><span class="field-label">${typeLabel}名稱 *</span>
    <input class="input" data-admin-field="name" maxlength="${isProject?100:80}"
      value="${esc(d.name)}" placeholder="輸入${typeLabel}名稱" /></label>
    ${isCategory?'':`<label class="form-group"><span class="field-label">狀態</span>
    <select class="input" data-admin-field="active">
     <option value="true" ${d.active?'selected':''}>使用中</option>
     <option value="false" ${d.active?'':'selected'}>停用（保留歷史紀錄）</option>
    </select></label>`}</div>
   <div class="team-editor-actions"><span class="small muted">變更會寫入 Google Sheets 的稽核紀錄。${isProject?'舊工作項目的專案文字不會被改寫。':''}</span>
   <button class="soft-button primary" data-action="admin-save" ${adminState.saving?'disabled':''}>儲存${typeLabel}</button></div>
   </section>`:''}`;
}
export async function saveAdmin(){
 if(!adminState.draft||adminState.saving)throw Error('管理表單尚未就緒');
 const d=adminState.draft;
 if(!d.name?.trim())throw Error('請輸入名稱');
 const isProject=d.kind==='projects';
 if(!isProject&&d.kind!=='employees'&&d.kind!=='categories')throw Error('管理類別錯誤');
 adminState.requestId=adminState.requestId||uid();
 adminState.saving=true;
 try{
  const method=d.kind==='categories'?'wpOwnerSaveCategories':
   isProject?'wpOwnerSaveProject':'wpOwnerSaveEmployee';
  const payload=d.kind==='categories'?{
    categories:d.id?renameWorkCategory(adminState.data.categories,d.id,d.name):
      addWorkCategory(adminState.data.categories,d.name),
    expectedRevision:adminState.data.categoryRevision||0,requestId:adminState.requestId
   }:{id:d.id,name:d.name,active:d.active,
   expectedRevision:d.revision||0,requestId:adminState.requestId};
  const result=await cloudCall(method,payload);
  if(!result?.ok)throw Error('雲端沒有確認更新');
  adminState.data=await cloudCall('wpOwnerBootstrap');
  adminState.draft=null;adminState.dirty=false;adminState.requestId=null;adminState.phase='ready';
  return result;
 }finally{adminState.saving=false;}
}

export function renderMaintenance(){
 const a=maintenanceState,d=a.data;
 return '<section class="soft-card card-pad-lg section-space"><div class="card-head"><div><h2 class="card-title">營運維護與稽核</h2><p class="card-sub">私人管理員查閱操作紀錄及已刪除日誌。備份僅由資料持有者執行，不覆寫正式資料。</p></div></div>'+
 '<div class="form-fields"><label class="form-group"><span class="field-label">查詢月份</span><input class="input" type="month" data-maintenance-month value="'+esc(a.month)+'" '+(a.busy?'disabled':'')+'></label>'+
 '<div class="form-group"><span class="field-label">操作</span><button class="soft-button" data-action="maintenance-load" '+(a.busy?'disabled':'')+'>查詢操作紀錄</button></div></div>'+
 (a.error?'<p role="alert" class="small">'+esc(a.error)+'</p>':'')+
 (d?'<div class="notice"><div><strong>'+esc(d.pausedAt?'目前已暫停日常寫入':'日常寫入未暫停')+'</strong><p>存取模式：'+esc(d.accessMode||'legacy')+'。'+esc(d.pausedAt?'停寫開始 '+d.pausedAt:'正式刪除須由資料持有者先停寫並確認無進行中寫入。')+'</p></div></div><p class="small muted">每日備份：'+(d.schedule?.configured?'已登記排程（須核對實際執行）':'尚未啟用')+'</p>'+(d.schedule?.lastRun?'<div class="maintenance-list"><div><strong>最近執行 '+esc(d.schedule.lastRun.day)+' · '+(d.schedule.lastRun.ok?'通過':'部分失敗')+'</strong><span>'+esc((d.schedule.lastRun.results||[]).map(x=>x.target+'：'+(x.ok?'完成':x.error||'失敗')).join('；'))+'</span></div></div>':'')+'<p class="small muted">'+esc(d.month)+' · 稽核 '+d.auditCount+' 筆 · 已刪除 '+d.deletedCount+' 筆（各顯示最近至多 100 筆）</p>'+
 '<div class="maintenance-list">'+d.audit.map(x=>'<div><strong>'+esc(x.action)+'</strong><span>'+esc(x.occurredAt)+' · '+esc(x.actor)+' · '+esc(x.recordId)+'</span></div>').join('')+'</div>'+
 '<h3 class="card-title section-space">已刪除日誌（唯讀）</h3><div class="maintenance-list">'+d.deleted.map(x=>'<div><strong>'+esc(x.date)+' · '+esc(x.employeeName)+'</strong><span>版本 '+x.revision+' · '+esc(x.id)+'</span><button type="button" class="soft-button sm" data-action="maintenance-recovery" data-id="'+esc(x.id)+'" '+(a.busy?'disabled':'')+'>核對復原資料</button></div>').join('')+'</div>':'')+
 (a.recovery?'<div class="notice" role="status"><div><strong>復原資料已讀取 · '+esc(a.recovery.journal.date)+'</strong><p>'+esc(a.recovery.activeCollision?'同人同日已有正式紀錄，禁止覆蓋，請人工合併。':'目前未發現同日正式紀錄，仍須重新核對後人工補登。')+'</p><p>'+a.recovery.journal.tasks.length+' 項工作 · 此資料僅供核對，不會寫回。</p><button type="button" class="soft-button sm" data-action="maintenance-recovery-download" '+(a.busy?'disabled':'')+'>下載復原 JSON</button></div></div>':'')+
 '<div class="divider"></div><h3 class="card-title">建立獨立備份</h3><p class="small muted">須預先配置持有者專用備份資料夾；建議於暫停填寫時執行。每次僅複製一份檔案，並非整庫原子快照。</p>'+
 '<div class="row" style="flex-wrap:wrap"><button class="soft-button" data-action="maintenance-backup" data-target="control" '+(a.busy?'disabled':'')+'>備份控制表</button><button class="soft-button" data-action="maintenance-backup" data-target="month" '+(a.busy?'disabled':'')+'>備份所選月份</button></div>'+
 (a.backup?'<p class="small muted" role="status">副本：'+esc(a.backup.name)+' · '+a.backup.sheets.length+' 個工作表。請在私人 Drive 確認。</p>':'')+'</section>';
}
export async function loadMaintenance(month){
 const a=maintenanceState;if(a.busy)return;
 a.month=month;a.busy=true;a.data=null;a.recovery=null;a.error='';
 try{const result=await cloudCall('wpOwnerMaintenance',{month});if(result?.month!==month||!Array.isArray(result.audit)||!Array.isArray(result.deleted))throw Error('稽核回應格式錯誤');a.data=result;}
 catch(e){a.error=e.message;}finally{a.busy=false;}
}
export async function backupMaintenance(target){
 const a=maintenanceState;if(a.busy)return;
 if(a.backupTarget!==target||!a.backupRequest){a.backupTarget=target;a.backupRequest=uid();}
 a.busy=true;a.error='';a.backup=null;
 try{const result=await cloudCall('wpOwnerBackupWorkbook',{target,requestId:a.backupRequest},{timeoutMs:180000});if(!result?.ok||!Array.isArray(result.sheets))throw Error('未確認備份結果');a.backup=result;a.backupRequest=null;a.backupTarget='';}
 catch(e){a.error=e.message+'；如結果未確認，請先檢查私人 Drive，再使用同一目標重試。';}finally{a.busy=false;}
}

export async function previewMaintenanceRecovery(id){
 const a=maintenanceState;if(a.busy)return;
 const row=a.data?.deleted.find(x=>x.id===id);if(!row)return;
 a.busy=true;a.recovery=null;a.error='';
 try{
  const result=await cloudCall('wpOwnerRecoveryPreview',{journalId:id,date:row.date,expectedRevision:row.revision});
  if(result?.readOnly!==true||result.journal?.id!==id||!Array.isArray(result.journal.tasks))throw Error('復原資料格式錯誤');
  a.recovery=result;
 }catch(e){a.error=e.message;}finally{a.busy=false;}
}
export function downloadMaintenanceRecovery(){
 const data=maintenanceState.recovery;if(!data||maintenanceState.busy)return;
 download('WorkPulse-Recovery-'+data.journal.date+'-'+data.journal.id+'.json',JSON.stringify(data,null,2),'application/json');
}
