import { cloudCall } from '../../services/cloud.js';
import { esc, uid } from '../../shared/utils.js';
import { icon } from '../../shared/icons.js';

export const adminState={phase:'idle',data:null,tab:'employees',draft:null,dirty:false,saving:false,error:'',requestId:null};
export async function loadAdmin(){
 if(adminState.phase==='loading')return;
 adminState.phase='loading';adminState.error='';
 try{
  const data=await cloudCall('wpOwnerBootstrap');
  if(!data||!Array.isArray(data.employees)||!Array.isArray(data.projects))
   throw Error('管理名單格式錯誤，請確認管理員 Apps Script 已更新');
  adminState.data=data;adminState.phase='ready';
 }catch(e){adminState.phase='error';adminState.error=e.message||'管理權限驗證失敗';}
}
export function setAdminTab(kind){
 if(!['employees','projects'].includes(kind))return;
 adminState.tab=kind;resetAdminEditor();
}
export function editAdmin(kind,id=''){
 if(!['employees','projects'].includes(kind)||!adminState.data)return;
 const record=adminState.data[kind]?.find(row=>row.id===id);
 if(id&&!record)return;
 adminState.tab=kind;
 adminState.draft=record?{...record,kind}:{id:'',name:'',active:true,revision:0,kind};
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
 const kind=adminState.tab==='projects'?'projects':'employees';
 const isProject=kind==='projects';
 const rows=adminState.data?.[kind]||[],d=adminState.draft;
 const typeLabel=isProject?'專案':'使用者';
 const tabs='<div class="team-tabs row section-space" role="group" aria-label="管理資料類別">'+
  '<button class="soft-button sm '+(!isProject?'active':'')+'" data-action="admin-tab" data-kind="employees" aria-pressed="'+(!isProject)+'">使用者</button>'+
  '<button class="soft-button sm '+(isProject?'active':'')+'" data-action="admin-tab" data-kind="projects" aria-pressed="'+isProject+'">專案清單</button></div>';
 return `<section class="soft-card card-pad-lg">
  <div class="card-head"><div><h2 class="card-title">管理員控制台</h2>
  <p class="card-sub">使用者可編輯姓名；專案可新增、重新命名或停用。相關設定由管理員 Google 帳號驗證。</p></div>
  <button class="soft-button sm" data-action="admin-refresh">${icon('arrowRight',15)} 同步</button></div>
  <div class="notice">${icon('shield',18)}<div>員工識別碼維持不變，改名不會影響既有出勤／工作日誌。已儲存的歷史專案名稱會原樣保留，避免擅自改寫舊資料。</div></div>
  ${tabs}
  <div class="row-between section-space"><span class="small muted">目前 ${rows.filter(row=>row.active).length} 個啟用${typeLabel}</span>
  <button class="soft-button primary sm" data-action="admin-new" data-kind="${kind}">${icon('plus',16)} 新增${typeLabel}</button></div>
  <div class="team-list">${rows.map(row=>`<div class="team-member">
   <div class="team-member-main"><span class="team-initial">${esc(row.name.slice(0,1)||'—')}</span>
    <div class="team-member-label"><div>${esc(row.name)}</div>
     <span class="small muted">${row.active?(isProject?'可選專案':'可填寫工作日誌'):'已停用'} · 第 ${row.revision} 版</span>
    </div></div>
   <button class="soft-button sm" data-action="admin-edit" data-kind="${kind}" data-id="${esc(row.id)}">${icon('edit',15)} 編輯</button>
  </div>`).join('')}</div></section>
  ${d&&d.kind===kind?`<section class="soft-card card-pad-lg section-space"><div class="card-head">
   <h2 class="card-title">${d.id?'編輯':'新增'}${typeLabel}</h2>
   <button class="soft-button ghost sm" data-action="admin-cancel">取消</button></div>
   <div class="form-fields"><label class="form-group"><span class="field-label">${typeLabel}名稱 *</span>
    <input class="input" data-admin-field="name" maxlength="${isProject?100:80}"
      value="${esc(d.name)}" placeholder="輸入${typeLabel}名稱" /></label>
    <label class="form-group"><span class="field-label">狀態</span>
    <select class="input" data-admin-field="active">
     <option value="true" ${d.active?'selected':''}>使用中</option>
     <option value="false" ${d.active?'':'selected'}>停用（保留歷史紀錄）</option>
    </select></label></div>
   <div class="team-editor-actions"><span class="small muted">變更會寫入 Google Sheets 的稽核紀錄。${isProject?'舊工作項目的專案文字不會被改寫。':''}</span>
   <button class="soft-button primary" data-action="admin-save" ${adminState.saving?'disabled':''}>儲存${typeLabel}</button></div>
   </section>`:''}`;
}
export async function saveAdmin(){
 if(!adminState.draft||adminState.saving)throw Error('管理表單尚未就緒');
 const d=adminState.draft;
 if(!d.name?.trim())throw Error('請輸入名稱');
 const isProject=d.kind==='projects';
 if(!isProject&&d.kind!=='employees')throw Error('管理類別錯誤');
 adminState.requestId=adminState.requestId||uid();
 adminState.saving=true;
 try{
  const method=isProject?'wpOwnerSaveProject':'wpOwnerSaveEmployee';
  const result=await cloudCall(method,{
   id:d.id,name:d.name,active:d.active,
   expectedRevision:d.revision||0,requestId:adminState.requestId
  });
  if(!result?.ok)throw Error('雲端沒有確認更新');
  adminState.data=await cloudCall('wpOwnerBootstrap');
  adminState.draft=null;adminState.dirty=false;adminState.requestId=null;adminState.phase='ready';
  return result;
 }finally{adminState.saving=false;}
}
