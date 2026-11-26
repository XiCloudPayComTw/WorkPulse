// Local inspection only. Only selected month keys are sent to the private preflight endpoint.
import {esc,download} from '../../shared/utils.js';
import {cloudCall} from '../../services/cloud.js';
export const migrationReviewState={data:null,mapping:{},month:'',result:null,error:'',busy:false};
function wpMigDate(date){
 const d=new Date(String(date)+'T00:00:00Z');return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===date;
}
export function inspectMigrationPackage(p){
 if(!p||p.format!=='workpulse-local-migration-v1'||p.notImported!==true||
 !Array.isArray(p.employees)||!Array.isArray(p.journals)||!Array.isArray(p.attendance)||
 p.employees.length>200||p.journals.length+p.attendance.length>100000)throw Error('移轉封包格式或數量異常');
 const people=new Map(),rows=[],seen=new Set();
 for(const e of p.employees){
  if(!e||typeof e.id!=='string'||!e.id||e.id.length>120||typeof e.name!=='string'||people.has(e.id))throw Error('來源人員格式或識別重複');
  people.set(e.id,{id:e.id,name:e.name.slice(0,80)});
 }
 for(const [kind,items] of [['journal',p.journals],['attendance',p.attendance]]){
  for(const row of items){
   if(!row||!wpMigDate(row.date)||typeof row.employeeId!=='string'||!row.employeeId||row.employeeId.length>120)throw Error('來源日期或人員識別無效');
   if(!people.has(row.employeeId))people.set(row.employeeId,{id:row.employeeId,name:'（來源名單缺漏）'});
   const key=kind+'|'+row.employeeId+'|'+row.date,duplicate=seen.has(key);seen.add(key);
   rows.push({kind,date:row.date,sourceId:row.employeeId,demo:kind==='journal'&&/^demo-/.test(String(row.id||'')),duplicate});
  }
 }
 if(people.size>200||!rows.length)throw Error('來源人員過多或沒有可核對紀錄');
 return {people:[...people.values()],rows,months:[...new Set(rows.map(r=>r.date.slice(0,7)))].sort().reverse()};
}
export function planMigrationKeys(data,mapping,month,employees){
 const active=new Set(employees.filter(e=>e.active!==false).map(e=>e.id)),seen=new Map(),items=[],blocked=[];
 for(const row of data.rows.filter(r=>r.date.startsWith(month))){
  const id=Object.hasOwn(mapping,row.sourceId)?mapping[row.sourceId]:'';
  if(row.demo||!active.has(id)){blocked.push({...row,reason:row.demo?'展示範例':'未對應有效人員'});continue;}
  const key=row.kind+'|'+id+'|'+row.date;
  if(!seen.has(key))seen.set(key,[]);
  seen.get(key).push({...row,employeeId:id});
 }
 for(const group of seen.values()){
  if(group.length!==1||group[0].duplicate){group.forEach(r=>blocked.push({...r,reason:'同人同日重複'}));continue;}
  const r=group[0];items.push({kind:r.kind,date:r.date,employeeId:r.employeeId});
 }
 return {items,blocked};
}
export function clearMigrationReview(){
 const a=migrationReviewState;if(a.busy)return;
 a.data=null;a.mapping={};a.month='';a.result=null;a.error='';
}
export async function loadMigrationReview(file){
 const a=migrationReviewState;if(a.busy)return;
 clearMigrationReview();a.busy=true;
 try{if(!file||file.size>10000000)throw Error('請選擇 10 MB 以下移轉 JSON');a.data=inspectMigrationPackage(JSON.parse(await file.text()));a.month=a.data.months[0];}
 catch(e){a.error=e.message;}finally{a.busy=false;}
}
export function setMigrationReviewField(field,value,id){
 const a=migrationReviewState;if(a.busy||!a.data)return;
 if(field==='month'&&a.data.months.includes(value))a.month=value;
 if(field==='person'&&a.data.people.some(p=>p.id===id))a.mapping={...a.mapping,[id]:value};
 a.result=null;a.error='';
}
export async function runMigrationReview(employees){
 const a=migrationReviewState;if(a.busy||!a.data)return;
 a.busy=true;a.result=null;a.error='';
 try{
  const plan=planMigrationKeys(a.data,a.mapping,a.month,employees);
  if(!plan.items.length)throw Error('沒有可預檢資料，請先完成來源人員對應');
  if(plan.items.length>500)throw Error('本月超過 500 筆預檢上限，請分拆來源封包');
  const result=await cloudCall('wpOwnerMigrationPreflight',{month:a.month,keys:plan.items});
  const key=r=>r.kind+'|'+r.employeeId+'|'+r.date;
  if(result?.readOnly!==true||result.month!==a.month||!Array.isArray(result.results)||result.results.length!==plan.items.length||
   result.results.some((r,i)=>key(r)!==key(plan.items[i])||!['exists','deleted-history','not-found'].includes(r.status)))throw Error('預檢結果無法核對');
  a.result={...result,blocked:plan.blocked};
 }catch(e){a.error=e.message;}finally{a.busy=false;}
}
export function downloadMigrationReview(){
 const a=migrationReviewState;if(a.busy||!a.result)return;
 download('WorkPulse-migration-review-'+a.month+'.json',JSON.stringify({format:'workpulse-migration-review-v1',notImported:true,mapping:a.mapping,...a.result},null,2),'application/json');
}
export function renderMigrationReview(employees){
 const a=migrationReviewState,d=a.data,r=a.result,disabled=a.busy?' disabled':'';
 const labels={'exists':'已有正式紀錄','deleted-history':'曾刪除，需人工核對','not-found':'未找到現有紀錄'};
 return '<section class="soft-card card-pad-lg section-space wp-migration-review"><h2 class="card-title">本機資料移轉預檢</h2><p class="card-sub">僅供資料持有者。選擇已下載的移轉 JSON，手動對應人員；不會上傳工作內容或寫入正式資料。</p>'+
 '<label class="form-group"><span class="field-label">選擇移轉封包（JSON）</span><input type="file" id="migration-review-file" accept=".json,application/json" class="input"'+disabled+'></label>'+
 (a.error?'<p role="alert">'+esc(a.error)+'</p>':'')+
 (d?'<p class="small muted">'+d.rows.length+' 筆紀錄 · '+d.months.length+' 個月份</p><div class="wp-migration-map">'+d.people.map(p=>'<label class="form-group"><span class="field-label">'+esc(p.name)+' · '+esc(p.id)+'</span><select class="input" data-migration-field="person" data-source-id="'+esc(p.id)+'"'+disabled+'><option value="">不移轉／尚未對應</option>'+employees.filter(e=>e.active!==false).map(e=>'<option value="'+esc(e.id)+'" '+(a.mapping[p.id]===e.id?'selected':'')+'>'+esc(e.name)+' · '+esc(e.id)+'</option>').join('')+'</select></label>').join('')+'</div>'+
 '<label class="form-group"><span class="field-label">核對月份</span><select class="input" data-migration-field="month"'+disabled+'>'+d.months.map(x=>'<option '+(x===a.month?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label>'+
 '<div class="row" style="flex-wrap:wrap"><button type="button" class="soft-button primary" data-action="migration-check"'+disabled+'>唯讀預檢</button><button type="button" class="soft-button" data-action="migration-clear"'+disabled+'>清除預檢資料</button></div>':'')+
 (r?'<p role="status">已核對 '+r.results.length+' 筆；另有 '+r.blocked.length+' 筆未納入。此結果僅代表查詢當下。</p><div class="maintenance-list">'+r.results.map(x=>'<div><strong>'+esc(x.date)+' · '+esc(x.kind==='journal'?'日誌':'出勤')+'</strong><span>'+esc(x.employeeId)+' · '+esc(labels[x.status])+'</span></div>').join('')+r.blocked.map(x=>'<div><strong>'+esc(x.date)+' · '+esc(x.sourceId)+'</strong><span>'+esc(x.reason)+'</span></div>').join('')+'</div><button type="button" class="soft-button" data-action="migration-review-download"'+disabled+'>下載核對結果</button>':'')+'</section>';
}
