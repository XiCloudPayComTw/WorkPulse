import { cloudCall } from './cloud.js';
import { esc, uid, formatDate, formatHours, currentMonth } from './utils.js';
export const REVIEW_NAMES={draft:'未提交',submitted:'待審核',approved:'已通過',returned:'退回修改'};
export const reviewState={month:currentMonth(),phase:'idle',records:[],enabled:false,error:'',reasons:{},busy:false,token:0};
export function reviewBadge(review){
  const code=review?.status||'draft';
  return `<span class="review-tag review-${esc(code)}">${esc(REVIEW_NAMES[code]||REVIEW_NAMES.draft)}</span>`;
}
export async function loadReviewQueue(month=reviewState.month) {
  const token=++reviewState.token;
  reviewState.month=month;reviewState.phase='loading';reviewState.error='';
  try{
    const payload=await cloudCall('wpReviewQueue',month);
    if(token!==reviewState.token)return;
    reviewState.records=Array.isArray(payload?.records)?payload.records:[];
    reviewState.enabled=Boolean(payload?.enabled);reviewState.phase='ready';
  }catch(error){
    if(token!==reviewState.token)return;
    reviewState.phase='error';reviewState.error=error.message||'查詢失敗';reviewState.records=[];
  }
}
export function setReviewReason(journalId,value){reviewState.reasons[journalId]=String(value).slice(0,500);}
export async function decideReview(journal,decision){
  if(reviewState.busy)throw Error('審核正在處理中');
  const reason=String(reviewState.reasons[journal.id]||'').trim();
  if(decision==='returned'&&reason.length<3)throw Error('退回時請輸入至少 3 字的說明');
  reviewState.busy=true;
  try{
    const payload=await cloudCall('wpReviewDecision',{
      journalId:journal.id,expectedRevision:journal.revision,requestId:uid(),decision,reason
    });
    if(!payload?.ok)throw Error('雲端沒有確認審核結果');
    delete reviewState.reasons[journal.id];
    await loadReviewQueue(reviewState.month);
    return payload;
  }finally{reviewState.busy=false;}
}
export function renderReviewWorkspace(user){
  if(!['manager','admin'].includes(user?.role))
    return '<section class="soft-card card-pad-lg">此帳號沒有主管審核權限。</section>';
  const select=`<label class="form-group review-month-label"><span class="field-label">審核月份</span><input class="input" type="month" data-review-month value="${esc(reviewState.month)}" /></label>`;
  const header=`<section class="soft-card card-pad-lg review-head"><div><div class="overline">REVIEW DESK</div><h2 class="card-title">主管審核工作台</h2><p class="card-sub">只顯示已授權部門且不是自己提交的工作日誌，審核結果將保留紀錄。</p></div><div class="review-top-actions">${select}<button class="soft-button sm" data-action="review-refresh">重新載入</button></div></section>`;
  if(reviewState.phase==='idle'||reviewState.phase==='loading')return header+'<section class="soft-card card-pad-lg section-space" role="status">正在讀取待審核紀錄…</section>';
  if(reviewState.phase==='error')return header+`<section class="soft-card card-pad-lg section-space" role="alert">讀取失敗：${esc(reviewState.error)}</section>`;
  if(!reviewState.enabled)return header+'<section class="soft-card card-pad-lg section-space"><h3 class="card-title">尚未啟用審核功能</h3><p class="card-sub">此功能由管理員在「系統設定」中啟用。停用期間仍可正常儲存工作日誌。</p></section>';
  const body=reviewState.records.length?reviewState.records.map(j=>{
    const hours=(j.tasks||[]).reduce((n,t)=>n+(Number(t.hours)||0),0);
    return `<article class="soft-card card-pad-lg review-record">
      <div class="row-between review-record-title"><div><div class="small muted">${esc(formatDate(j.date))} · ${esc(j.employeeId)}</div><h3 class="card-title">${j.tasks.length} 項工作 · ${esc(formatHours(hours))}</h3></div>${reviewBadge(j.review)}</div>
      <div class="review-tasks">${j.tasks.map(t=>`<div class="review-task"><span>${esc(t.title)}</span><span class="small muted">${esc(t.project||t.category)} · ${esc(formatHours(t.hours))}</span></div>`).join('')}</div>
      ${j.note?`<p class="small review-note">備註：${esc(j.note)}</p>`:''}
      <label class="form-group"><span class="field-label">退回原因（選擇退回時必填）</span><textarea class="input" data-review-reason="${esc(j.id)}" maxlength="500" placeholder="請說明需要修正的內容…">${esc(reviewState.reasons[j.id]||'')}</textarea></label>
      <div class="review-actions"><button class="soft-button primary sm" data-action="review-decision" data-decision="approved" data-id="${esc(j.id)}" ${reviewState.busy?'disabled':''}>通過審核</button>
      <button class="soft-button sm" data-action="review-decision" data-decision="returned" data-id="${esc(j.id)}" ${reviewState.busy?'disabled':''}>退回修改</button></div>
    </article>`;
  }).join(''):'<section class="soft-card card-pad-lg section-space"><h3 class="card-title">目前沒有待審核紀錄</h3><p class="card-sub">可切換月份查看其他時段。只有已提交的日誌會顯示在此。</p></section>';
  return header+`<div class="review-summary section-space"><span class="review-count">${reviewState.records.length}</span><span>份待審核日誌</span></div><div class="review-list">${body}</div>`;
}
