/** Apps Script HTMLService provides google.script.run only inside its own web-app origin. */
export function cloudEnabled() {
  return typeof google !== 'undefined' && Boolean(google.script && google.script.run);
}
export function cloudCall(method, argument) {
  if (!cloudEnabled()) return Promise.reject(new Error('目前不是 Google Apps Script 工作環境'));
  if (!['wpBootstrap','wpLoadMonth','wpSaveJournal','wpAdminBootstrap','wpAdminSaveEmployee','wpAdminSaveDepartment','wpAdminSaveProject','wpQueryReport','wpReviewQueue','wpReviewSubmit','wpReviewDecision','wpReviewHistory','wpReviewSetEnabled'].includes(method))
    return Promise.reject(new Error('不允許呼叫未知的後端方法'));
  return new Promise((resolve,reject)=>{
    try {
      const run=google.script.run.withSuccessHandler(resolve).withFailureHandler(error=>reject(new Error(error?.message||'Google Sheets 呼叫失敗')));
      run[method](argument);
    }catch(error){reject(error);}
  });
}
