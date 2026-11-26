import {cloudCall} from '../../services/cloud.js';
import {esc,uid,download} from '../../shared/utils.js';
export const backupCenterState={busy:false,plan:null,job:null,error:'',comparison:null,month:''};
function wpBackupTargetValid(x){return x==='control'||/^\d{4}-(0[1-9]|1[0-2])$/.test(x);}
function wpBackupTargetName(x){return x==='control'?'控制表':x;}
async function wpBackupReadPlan(){
 const p=await cloudCall('wpOwnerBackupPlan');
 if(p?.readOnly!==true||typeof p.folderConfigured!=='boolean'||!Array.isArray(p.targets)||p.targets[0]!=='control'||!p.targets.every(wpBackupTargetValid)||new Set(p.targets).size!==p.targets.length)throw Error('備份清單格式錯誤');
 backupCenterState.plan=p;return p;
}
export async function loadBackupPlan(){const a=backupCenterState;if(a.busy)return;a.busy=true;a.error='';a.plan=null;try{await wpBackupReadPlan();}catch(e){a.error=e.message;}finally{a.busy=false;}}
export async function prepareBackupFolder(){const a=backupCenterState;if(a.busy)return;a.busy=true;a.error='';try{const r=await cloudCall('wpOwnerPrepareBackupFolder');if(!r?.ok||!r.folderConfigured)throw Error('資料夾結果未確認');await wpBackupReadPlan();}catch(e){a.error=e.message+'；請先到 Drive 確認是否已建立資料夾，再重試。';}finally{a.busy=false;}}
export async function startBackupBatch(target,onProgress=()=>{}){
 const a=backupCenterState;if(a.busy)return;
 if(a.job&&a.job.items.some(x=>x.status!=='done')){a.error='尚有未完成備份，請先核對並繼續，或重新載入後在 Drive 人工核對';return;}
 a.busy=true;a.error='';
 try{
  const p=await wpBackupReadPlan();if(!p.folderConfigured)throw Error('請先建立獨立備份資料夾');
  const targets=target==='all'?p.targets:[target];if(!targets.every(x=>p.targets.includes(x)))throw Error('該月份尚無資料');
  if(target==='all'&&!p.pausedAt)throw Error('全部備份前請由持有者執行停寫，並確認沒有進行中寫入');
  a.job={startedAt:new Date().toISOString(),all:target==='all',items:targets.map(target=>({target,requestId:uid(),status:'pending'}))};
  await wpRunBackupBatch(onProgress);
 }catch(e){a.error=e.message;}finally{a.busy=false;}
}
async function wpRunBackupBatch(progress){
 const a=backupCenterState,j=a.job;
 for(const item of j.items){
  if(item.status==='done')continue;
  item.status='running';progress();
  try{
   if(j.all){const p=await wpBackupReadPlan();if(!p.pausedAt||JSON.stringify(p.targets)!==JSON.stringify(j.items.map(x=>x.target)))throw Error('停寫或月份清單已改變，須人工核對');}
   const r=await cloudCall('wpOwnerBackupWorkbook',{target:item.target,requestId:item.requestId},{timeoutMs:180000});
   if(!r?.ok||r.target!==item.target||typeof r.name!=='string'||!Array.isArray(r.sheets))throw Error('備份結果未確認');
   item.status='done';item.name=r.name;item.sheets=r.sheets.length;
  }catch(e){item.status='unconfirmed';item.error=e.message;throw Error(wpBackupTargetName(item.target)+'：'+e.message+'；已停止，請核對 Drive 後以原識別碼繼續。');}
  progress();
 }
 j.completedAt=new Date().toISOString();
}
export async function continueBackupBatch(progress=()=>{}){
 const a=backupCenterState;if(a.busy||!a.job||a.job.completedAt)return;a.busy=true;a.error='';
 try{await wpRunBackupBatch(progress);}catch(e){a.error=e.message;}finally{a.busy=false;}
}
export function downloadBackupReport(){const j=backupCenterState.job;if(j)download('WorkPulse-backup-report.json',JSON.stringify({format:'workpulse-backup-report-v1',atomic:false,...j},null,2));}
export async function exportBackupValues(target){
 const a=backupCenterState;if(a.busy)return;a.busy=true;a.error='';
 try{if(!wpBackupTargetValid(target))throw Error('請選擇有效目標');const d=await cloudCall('wpOwnerExportBackupJson',{target},{timeoutMs:180000});
  if(d?.format!=='workpulse-values-v1'||d.readOnly!==true||d.restoreSupported!==false||d.target!==target||!Array.isArray(d.sheets))throw Error('JSON 回應格式錯誤');
  download('WorkPulse-values-'+target+'.json',JSON.stringify(d,null,2));}catch(e){a.error=e.message;}finally{a.busy=false;}
}
export async function compareBackupCopies(month,sourceId,copyId){
 const a=backupCenterState;if(a.busy)return;a.busy=true;a.error='';a.comparison=null;
 try{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!sourceId?.trim()||!copyId?.trim()||sourceId.trim()===copyId.trim())throw Error('請選月份及兩個不同的試算表 ID');
 const d=await cloudCall('wpOwnerCompareBackupCopies',{month,sourceId:sourceId.trim(),copyId:copyId.trim()},{timeoutMs:180000});
 if(d?.readOnly!==true||d.productionVerified!==false||d.month!==month||typeof d.valuesMatch!=='boolean'||typeof d.stableDuringCheck!=='boolean')throw Error('比對結果格式錯誤');a.comparison=d;
 }catch(e){a.error=e.message;}finally{a.busy=false;}
}
export function renderBackupCenter(month){
 const a=backupCenterState,p=a.plan,j=a.job,busy=a.busy?'disabled':'',pending=j&&!j.completedAt,ready=p?.folderConfigured&&!pending&&!a.busy;
 const button=(action,label,disabled=false)=>'<button type="button" class="soft-button" data-action="backup-center-'+action+'" '+(disabled||a.busy?'disabled':'')+'>'+label+'</button>';
 return '<section class="soft-card card-pad-lg section-space wp-backup-center"><h2 class="card-title">手動備份與復原中心</h2><p class="card-sub">管理員專用 · 不需要每日排程。全部備份逐檔處理，須先停寫；不會覆寫正式資料。</p>'+
 '<div class="row wp-backup-actions">'+button('load','更新備份清單')+button('folder','建立／確認私人備份資料夾')+'</div>'+
 (p?'<p role="status">'+(p.folderConfigured?'私人備份資料夾已設定':'尚未設定私人備份資料夾')+' · '+(p.targets.length-1)+' 個月份 · '+(p.pausedAt?'已停寫（仍須確認寫入結束）':'尚未停寫')+'</p>':'')+
 '<label class="form-group"><span class="field-label">指定月份</span><input class="input" id="backup-center-month" type="month" value="'+esc(a.month||month)+'" '+busy+'></label><div class="row wp-backup-actions">'+button('all','備份全部資料',!ready||!p?.pausedAt)+button('control','備份控制表',!ready)+button('month','備份指定月份',!ready)+'</div>'+
 '<p class="small muted">全部備份前由持有者執行 workPulsePauseFieldWrites，確認寫入停止；完成核對後執行 workPulseResumeFieldWrites。關閉頁面不會繼續未送出的項目。</p>'+
 (j?'<p role="status"><strong>'+j.items.filter(x=>x.status==='done').length+' / '+j.items.length+' 檔已確認</strong></p><div class="maintenance-list">'+j.items.map(x=>'<div><strong>'+esc(wpBackupTargetName(x.target))+' · '+({done:'完成',running:'處理中',pending:'未開始',unconfirmed:'未確認'}[x.status])+'</strong><span>'+esc(x.name||x.error||'')+'</span></div>').join('')+'</div><div class="row wp-backup-actions">'+button('resume','核對後繼續',!pending)+button('report','下載備份結果')+'</div>':'')+
 '<h3 class="card-title section-space">下載 JSON 資料值</h3><p class="small muted">僅供人工核對，薪資欄位清空；不含公式及格式，不可直接匯入。請私下保存。</p><label class="form-group"><span class="field-label">匯出目標</span><select class="input" id="backup-json-target" '+busy+'>'+([...(p?.targets||['control',month])].map(x=>'<option value="'+esc(x)+'">'+esc(wpBackupTargetName(x))+'</option>').join(''))+'</select></label>'+button('json','下載所選 JSON')+
 '<h3 class="card-title section-space">獨立月檔復原預檢</h3><p class="small muted">先在 Drive 手動複製備份到獨立測試位置。輸入兩份非正式索引檔案的 ID，唯讀比較資料值；月份使用上方指定月份。</p><label class="form-group"><span class="field-label">原始備份試算表 ID</span><input class="input" id="backup-source-id" autocomplete="off" '+busy+'></label><label class="form-group"><span class="field-label">獨立復原副本 ID</span><input class="input" id="backup-copy-id" autocomplete="off" '+busy+'></label>'+button('compare','唯讀比對')+
 (a.comparison?'<p role="status">'+esc(a.comparison.month)+' · '+(a.comparison.valuesMatch&&a.comparison.stableDuringCheck?'資料值相符（非整庫驗收）':'資料值不同或檢查期間有變動')+'</p>':'')+(a.error?'<p role="alert">'+esc(a.error)+'</p>':'')+'</section>';
}
