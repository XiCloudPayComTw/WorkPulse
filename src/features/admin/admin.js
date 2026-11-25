import { cloudCall } from '../../services/cloud.js';
import { esc, uid } from '../../shared/utils.js';
import { icon } from '../../shared/icons.js';

export const adminState={phase:'idle',data:null,tab:'employees',draft:null,dirty:false,saving:false,error:'',requestId:null};
export async function loadAdmin(){
  if(adminState.phase==='loading')return;
  adminState.phase='loading';adminState.error='';
  try{
    const data=await cloudCall('wpOwnerBootstrap');
    if(!data||!Array.isArray(data.employees))throw Error('管理名單格式錯誤');
    adminState.data=data;adminState.phase='ready';
  }catch(e){adminState.phase='error';adminState.error=e.message||'管理權限驗證失敗';}
}
export function setAdminTab(){adminState.tab='employees';}
export function editAdmin(_kind,id=''){
  const record=adminState.data?.employees?.find(e=>e.id===id);
  if(id&&!record)return;
  adminState.draft=record?{...record}:{id:'',name:'',active:true,revision:0};
  adminState.dirty=false;adminState.requestId=null;
}
export function updateAdminDraft(field,value){
  if(!adminState.draft||!['name','active'].includes(field))return;
  adminState.draft[field]=field==='active'?value==='true':value;
  adminState.dirty=true;adminState.requestId=null;
}
export function resetAdminEditor(){adminState.draft=null;adminState.dirty=false;adminState.requestId=null;}
export function renderTeam(user){
  if(user?.role!=='admin')return '<section class="soft-card card-pad-lg">管理員權限驗證失敗，不能管理員工。</section>';
  if(adminState.phase==='idle'||adminState.phase==='loading')return '<section class="soft-card card-pad-lg" role="status">正在驗證管理員並讀取使用者名單…</section>';
  if(adminState.phase==='error')return `<section class="soft-card card-pad-lg" role="alert"><h2 class="card-title">無法讀取使用者名單</h2><p>${esc(adminState.error)}</p><button class="soft-button" data-action="admin-refresh">重新驗證</button></section>`;
  const people=adminState.data?.employees||[],d=adminState.draft;
  return `<section class="soft-card card-pad-lg"><div class="card-head"><div><h2 class="card-title">使用者管理</h2><p class="card-sub">只需要姓名。管理員可新增、修改或停用使用者；不需要為一般使用者建立 Google 帳號。</p></div><button class="soft-button sm" data-action="admin-refresh">${icon('arrowRight',15)} 同步</button></div>
    <div class="notice">${icon('shield',18)}<div>一般使用者在網頁選擇姓名即可填寫；只有經 Google 帳號驗證的管理員能維護名單或刪除日誌。</div></div>
    <div class="row-between section-space"><span class="small muted">目前 ${people.filter(p=>p.active).length} 位啟用使用者</span><button class="soft-button primary sm" data-action="admin-new" data-kind="employees">${icon('plus',16)} 新增使用者</button></div>
    <div class="team-list">${people.map(p=>`<div class="team-member"><div class="team-member-main"><span class="team-initial">${esc(p.name.slice(0,1)||'—')}</span><div class="team-member-label"><div>${esc(p.name)}</div><span class="small muted">${p.active?'可填寫工作日誌':'已停用'} · 第 ${p.revision} 版</span></div></div><button class="soft-button sm" data-action="admin-edit" data-kind="employees" data-id="${esc(p.id)}">${icon('edit',15)} 編輯</button></div>`).join('')}</div></section>
    ${d?`<section class="soft-card card-pad-lg section-space"><div class="card-head"><h2 class="card-title">${d.id?'編輯使用者':'新增使用者'}</h2><button class="soft-button ghost sm" data-action="admin-cancel">取消</button></div>
     <div class="form-fields"><label class="form-group"><span class="field-label">使用者姓名 *</span><input class="input" data-admin-field="name" maxlength="80" value="${esc(d.name)}" placeholder="輸入使用者姓名" /></label>
     <label class="form-group"><span class="field-label">狀態</span><select class="input" data-admin-field="active"><option value="true" ${d.active?'selected':''}>使用中</option><option value="false" ${d.active?'':'selected'}>停用（保留歷史紀錄）</option></select></label></div>
     <div class="team-editor-actions"><span class="small muted">變更會寫入 Google Sheets 的稽核紀錄。</span><button class="soft-button primary" data-action="admin-save" ${adminState.saving?'disabled':''}>儲存使用者</button></div></section>`:''}`;
}
export async function saveAdmin(){
  if(!adminState.draft||adminState.saving)throw Error('管理表單尚未就緒');
  const d=adminState.draft;
  if(!d.name?.trim())throw Error('請輸入姓名');
  adminState.requestId=adminState.requestId||uid();
  adminState.saving=true;
  try{
    const result=await cloudCall('wpOwnerSaveEmployee',{id:d.id,name:d.name,active:d.active,
      expectedRevision:d.revision||0,requestId:adminState.requestId});
    if(!result?.ok)throw Error('雲端沒有確認更新');
    adminState.data=await cloudCall('wpOwnerBootstrap');
    adminState.draft=null;adminState.dirty=false;adminState.requestId=null;adminState.phase='ready';
    return result;
  }finally{adminState.saving=false;}
}
