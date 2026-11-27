import {startFieldLoading,stopFieldLoading} from '../app/loading.js';
/** Apps Script HTMLService provides google.script.run only inside its own web-app origin. */
const METHODS = new Set([
 'wpAccessStatus','wpAccessUnlock','wpSelfCreateEmployee','wpSharedBootstrap','wpSharedLoadMonth','wpSharedSaveJournal','wpSharedQueryReport',
 'wpOwnerBootstrap','wpOwnerBackupPlan','wpOwnerPrepareBackupFolder','workPulsePauseFieldWrites','workPulseResumeFieldWrites','wpOwnerExportBackupJson','wpOwnerCompareBackupCopies','workPulseDeploymentCheck','wpOwnerMonthIntegrity','wpOwnerMaintenance','wpOwnerMigrationPreflight','wpOwnerRecoveryPreview','wpOwnerBackupWorkbook','wpOwnerSaveEmployee','wpOwnerSaveProject','wpOwnerSaveCategories','wpOwnerDeleteJournal',
 'wpAttendanceLoad','wpAttendanceSave','wpOwnerAttendanceConfig',
 'wpOwnerSaveAttendanceConfig','wpOwnerSaveAttendanceSchedule','wpAttendanceRange'
]);
const MUTATIONS = new Set([
 'wpSelfCreateEmployee',
 'workPulsePauseFieldWrites','workPulseResumeFieldWrites','wpOwnerPrepareBackupFolder','wpOwnerBackupWorkbook','wpSharedSaveJournal','wpOwnerSaveEmployee','wpOwnerSaveProject','wpOwnerSaveCategories','wpOwnerDeleteJournal',
 'wpAttendanceSave','wpOwnerSaveAttendanceConfig','wpOwnerSaveAttendanceSchedule'
]);

const WP_TOKEN_METHODS=new Set(['wpSharedBootstrap','wpSharedLoadMonth','wpSharedSaveJournal','wpSharedQueryReport','wpAttendanceLoad','wpAttendanceSave','wpAttendanceRange','wpSelfCreateEmployee']);
let wpCloudCredential=null;
export function setCloudCredential(value){wpCloudCredential=value||null;}
function wpCredentialExpired(credential){if(credential&&wpCloudCredential===credential&&typeof document!=='undefined'&&typeof Event==='function')document.dispatchEvent(new Event('workpulse:access-expired'));}
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
 const credential=WP_TOKEN_METHODS.has(method)?wpCloudCredential:null;
 if(credential&&credential.expiresAt<=Date.now()){wpCredentialExpired(credential);return Promise.reject(Error('公司存取工作階段已到期，請重新輸入存取碼'));}
 const inlineRead=['wpAccessStatus','wpAccessUnlock','wpSelfCreateEmployee','wpSharedBootstrap','wpSharedLoadMonth','wpAttendanceLoad'].includes(method);
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
    .withSuccessHandler(result=>{if(completed)return;if(credential&&wpCloudCredential!==credential){settle(reject,Error('公司存取工作階段已變更，請核對原請求'));return;}settle(resolve,result);})
    .withFailureHandler(error=>{if(completed)return;const message=error?.message||'Google Sheets 呼叫失敗';if(credential&&/公司存取工作階段無效或已到期|公司存取工作階段已到期/.test(message))wpCredentialExpired(credential);settle(reject,new Error(message));});
   if(credential)runner[method](argument,credential.token);else if(method==='wpAccessStatus')runner[method]();else runner[method](argument);
  }catch(error){settle(reject,error);}
 });
}
