import {startFieldLoading,stopFieldLoading} from '../app/loading.js';
/** Apps Script HTMLService provides google.script.run only inside its own web-app origin. */
const METHODS = new Set([
 'wpSharedBootstrap','wpSharedLoadMonth','wpSharedSaveJournal','wpSharedQueryReport',
 'wpOwnerBootstrap','workPulseDeploymentCheck','wpOwnerMaintenance','wpOwnerMigrationPreflight','wpOwnerRecoveryPreview','wpOwnerBackupWorkbook','wpOwnerSaveEmployee','wpOwnerSaveProject','wpOwnerSaveCategories','wpOwnerDeleteJournal',
 'wpAttendanceLoad','wpAttendanceSave','wpOwnerAttendanceConfig',
 'wpOwnerSaveAttendanceConfig','wpOwnerSaveAttendanceSchedule','wpAttendanceRange'
]);
const MUTATIONS = new Set([
 'wpOwnerBackupWorkbook','wpSharedSaveJournal','wpOwnerSaveEmployee','wpOwnerSaveProject','wpOwnerSaveCategories','wpOwnerDeleteJournal',
 'wpAttendanceSave','wpOwnerSaveAttendanceConfig','wpOwnerSaveAttendanceSchedule'
]);

export function cloudEnabled(){
 return typeof google!=='undefined'&&Boolean(google.script&&google.script.run);
}

/**
 * Return a bounded request so a failed Google Workspace response can never leave a page
 * stuck on "loading" forever. Reads do not automatically retry; the UI supplies retry
 * buttons. Writes NEVER automatically retry (idempotent request IDs are preserved
 * by their callers).
 */
export function cloudCall(method,argument,{timeoutMs}={}){
 if(!cloudEnabled())return Promise.reject(new Error('目前不是 Google Apps Script 工作環境'));
 if(!METHODS.has(method))return Promise.reject(new Error('不允許呼叫未知的後端方法'));
 const duration=timeoutMs??(MUTATIONS.has(method)?90000:60000);
 if(!Number.isInteger(duration)||duration<1||duration>180000)
  return Promise.reject(new Error('雲端請求逾時設定無效'));
 const inlineRead=['wpSharedBootstrap','wpSharedLoadMonth','wpAttendanceLoad'].includes(method);
 const loadingId=inlineRead?null:startFieldLoading(MUTATIONS.has(method)?'正在儲存資料…':'正在讀取資料…');
 return new Promise((resolve,reject)=>{
  let completed=false;
  let timer;
  const settle=(handler,value)=>{
   if(completed)return;
   completed=true;
   clearTimeout(timer);
   if(loadingId!==null)stopFieldLoading(loadingId);
   handler(value);
  };
  timer=setTimeout(()=>settle(reject,new Error(
   'Google Sheets 連線逾時，請檢查網路後按重新讀取。若剛才正在儲存，請先確認紀錄是否已存在，避免重複送出。'
  )),duration);
  try{
   const runner=google.script.run
    .withSuccessHandler(result=>settle(resolve,result))
    .withFailureHandler(error=>settle(reject,new Error(error?.message||'Google Sheets 呼叫失敗')));
   runner[method](argument);
  }catch(error){settle(reject,error);}
 });
}
