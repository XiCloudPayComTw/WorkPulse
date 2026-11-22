import { cloudCall } from './cloud.js';
import { esc, uid } from './utils.js';
import { icon } from './icons.js';

export const adminState={phase:'idle',data:null,tab:'employees',draft:null,dirty:false,saving:false,error:'',requestId:null};
const panes={employees:{title:'員工管理',singular:'員工',api:'wpAdminSaveEmployee'},departments:{title:'部門管理',singular:'部門',api:'wpAdminSaveDepartment'},projects:{title:'專案管理',singular:'專案',api:'wpAdminSaveProject'}};
const roleNames={staff:'一般員工',manager:'部門主管',admin:'系統管理員'};

export async function loadAdmin(){
  if(adminState.phase==='loading')return;
  adminState.phase='loading';adminState.error='';
  try{
    const data=await cloudCall('wpAdminBootstrap');
    if(!data || !Array.isArray(data.employees)||!Array.isArray(data.departments)||!Array.isArray(data.projects))throw Error('管理資料格式不完整');
    adminState.data=data;adminState.phase='ready';
  }catch(e){adminState.error=e.message||'讀取失敗';adminState.phase='error';}
}
export function setAdminTab(kind){if(!panes[kind])return;adminState.tab=kind;adminState.draft=null;adminState.dirty=false;adminState.requestId=null;}
export function editAdmin(kind,id=''){
  if(!panes[kind]||!adminState.data)return;
  const record=adminState.data[kind].find(x=>x.id===id);
  if(id&&!record)return;
  adminState.tab=kind;
  adminState.draft=record?{...record}:{id:'',name:'',email:'',role:'staff',departmentId:'',active:true,revision:0};
  adminState.dirty=false;adminState.requestId=null;
}
export function updateAdminDraft(field,value){
  if(!adminState.draft||!['name','email','role','departmentId','active'].includes(field))return;
  const next=field==='active'?value==='true':value;
  if(adminState.draft[field]===next)return;
  adminState.draft[field]=next;adminState.dirty=true;adminState.requestId=null;
}
export function resetAdminEditor(){adminState.draft=null;adminState.dirty=false;adminState.requestId=null;}
function selectOptions(values,chosen){return values.map(v=>`<option value="${esc(v.value)}" ${v.value===chosen?'selected':''}>${esc(v.label)}</option>`).join('');}
function input(label,field,value,options={}){
  const max=options.max||80;
  return `<label class="form-group"><span class="field-label">${label}</span><input class="input" data-admin-field="${field}" type="${options.type||'text'}" maxlength="${max}" value="${esc(value||'')}" ${options.required===false?'':'required'} autocomplete="off" /></label>`;
}
function select(label,field,choices,chosen){return `<label class="form-group"><span class="field-label">${label}</span><select class="input" data-admin-field="${field}">${selectOptions(choices,chosen)}</select></label>`;}
function editor(){
  const d=adminState.draft;if(!d)return '';
  const kind=adminState.tab;
  const name=input('名稱 *','name',d.name);
  const active=select('帳號狀態','active',[{value:'true',label:'啟用'},{value:'false',label:'停用（保留歷史資料）'}],String(d.active));
  const departments=[{value:'',label:'尚未指派'},...adminState.data.departments.filter(x=>x.active||x.id===d.departmentId).map(x=>({value:x.id,label:`${x.name}${x.active?'':' · 已停用'}`}))];
  const content=kind==='employees' ? `${input('公司電子信箱 *','email',d.email,{type:'email',max:180})}${name}
    ${select('角色','role',Object.entries(roleNames).map(([value,label])=>({value,label})),d.role)}
    ${select('所屬部門','departmentId',departments,d.departmentId)}${active}`:`${name}${active}`;
  return `<section class="soft-card card-pad-lg team-editor"><div class="card-head"><div><h2 class="card-title">${d.id?'編輯':'新增'}${panes[kind].singular}</h2><p class="card-sub">${d.id?'修改將留下操作紀錄並檢查資料版本':'送出後產生不可變更的識別碼'}</p></div><button class="soft-button ghost sm" data-action="admin-cancel">取消</button></div>
    <div class="form-fields">${content}</div>
    <div class="team-editor-actions"><span class="xs muted">${d.id?'版本 '+d.revision:'新資料'} · 更新後立即套用讀寫權限</span>
      <button class="soft-button primary" data-action="admin-save" ${adminState.saving?'disabled':''}>${icon('checkCircle',16)} ${adminState.saving?'正在儲存':'儲存變更'}</button></div>
    <p class="xs muted">員工與部門請使用公司核准的帳號資料，停用不會刪除既有日誌。</p></section>`;
}
function adminRows(){
  const kind=adminState.tab;
  const records=adminState.data?.[kind]||[];
  if(!records.length)return `<div class="team-empty">目前沒有資料，請新增第一筆${panes[kind].singular}。</div>`;
  return `<div class="team-list">${records.map(r=>{
    const detail=kind==='employees'?`${esc(r.email)} · ${esc(roleNames[r.role]||r.role)} · ${esc(adminState.data.departments.find(d=>d.id===r.departmentId)?.name||'未分配部門')}`:kind==='departments'?`部門編號 ${esc(r.id)}`:`專案編號 ${esc(r.id)}`;
    return `<div class="team-member"><div class="team-member-main"><span class="team-initial">${esc(r.name.slice(0,1)||'—')}</span><div class="team-member-label"><div>${esc(r.name)}</div><span class="xs muted">${detail}</span></div></div>
      <div class="team-member-actions"><span class="team-status ${r.active?'enabled':'disabled'}">${r.active?'使用中':'已停用'}</span><button class="soft-button ghost sm" data-action="admin-edit" data-kind="${kind}" data-id="${esc(r.id)}">${icon('edit',15)} 編輯</button></div></div>`;
  }).join('')}</div>`;
}
export function renderTeam(user){
  if(user?.role!=='admin')return `<section class="soft-card card-pad-lg"><h2>需要管理員權限</h2><p class="muted small">此功能僅對已登入的系統管理員開放。</p></section>`;
  if(adminState.phase==='loading'||adminState.phase==='idle')return `<section class="soft-card card-pad-lg sync-stage" role="status"><span class="sync-dot loading"></span><h2>正在載入團隊名冊</h2></section>`;
  if(adminState.phase==='error')return `<section class="soft-card card-pad-lg sync-stage" role="alert"><h2>無法載入管理資料</h2><p>${esc(adminState.error)}</p><button class="soft-button" data-action="admin-refresh">重新載入</button></section>`;
  const data=adminState.data;
  return `<div class="notice">${icon('shield',18)}<div>此頁僅能由已驗證的管理員使用；部門主管只能閱讀同部門日誌，無法維護員工、角色或專案。停用會立即禁止新存取，但保留既有日誌。</div></div>
    <div class="stats-grid section-space">${[
      ['啟用員工',data.employees.filter(e=>e.active).length],['部門',data.departments.filter(e=>e.active).length],['啟用專案',data.projects.filter(e=>e.active).length],['管理員',data.employees.filter(e=>e.active&&e.role==='admin').length]
    ].map(([label,count])=>`<div class="soft-card team-metric"><span class="surface-label">${label}</span><span class="team-metric-number">${count}</span></div>`).join('')}</div>
    <section class="soft-card card-pad-lg section-space"><div class="card-head"><div><h2 class="card-title">團隊資料維護</h2><p class="card-sub">選擇類別後即可新增、停用或編輯，所有變更記錄在 Audit</p></div><button class="soft-button ghost sm" data-action="admin-refresh">${icon('arrowRight',15)} 重新同步</button></div>
    <div class="team-tabs" role="tablist" aria-label="管理項目">${Object.entries(panes).map(([key,val])=>`<button class="soft-button ${key===adminState.tab?'active':''}" type="button" role="tab" aria-selected="${key===adminState.tab}" data-action="admin-tab" data-kind="${key}">${val.title}</button>`).join('')}</div>
    <div class="row-between team-list-head"><div><h3 class="section-title">${panes[adminState.tab].title}</h3><p class="card-sub">共 ${data[adminState.tab].length} 筆</p></div><button class="soft-button sm" data-action="admin-new" data-kind="${adminState.tab}">${icon('plus',15)} 新增${panes[adminState.tab].singular}</button></div>
    ${adminRows()}</section>${editor()}`;
}
export async function saveAdmin(){
  const kind=adminState.tab,d=adminState.draft;
  if(!d||adminState.saving)throw Error('管理表單尚未就緒');
  if(!d.name?.trim())throw Error('請填寫名稱');
  if(kind==='employees'&&!d.email?.trim())throw Error('請填寫公司電子信箱');
  adminState.requestId=adminState.requestId||uid().replace(/_/g,'-');
  const payload={id:d.id||'',expectedRevision:d.revision||0,requestId:adminState.requestId,active:d.active,name:d.name};
  if(kind==='employees')Object.assign(payload,{email:d.email,role:d.role,departmentId:d.departmentId});
  adminState.saving=true;
  try{
    const result=await cloudCall(panes[kind].api,payload);
    if(!result?.ok)throw Error('儲存結果未確認');
    const refreshed=await cloudCall('wpAdminBootstrap');
    adminState.data=refreshed;adminState.draft=null;adminState.dirty=false;adminState.requestId=null;adminState.phase='ready';
    return result;
  }finally{adminState.saving=false;}
}
