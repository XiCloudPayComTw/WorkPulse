import {esc,download,localISODate} from '../../shared/utils.js';
import {attendanceState,currentTemporaryWage,readLocalAttendanceRange} from '../attendance/attendance-state.js';
import {cloudEnabled,cloudCall} from '../../services/cloud.js';
import {previousCompletedMonth,payrollPeriod,buildPayrollReport} from './payroll.js';
import {createPayrollXlsx} from './payroll-xlsx.js';
import {TWD_FORMAT} from '../attendance/attendance.js';

let payrollDialog=null,payrollResult=null,payrollWorking=false,payrollOriginalFocus=null;
const payrollMoney=value=>TWD_FORMAT.format(value);
const payrollButton=label=>'<button type="button" class="soft-button" data-action="payroll-close">'+label+'</button>';
function payrollClose(){
 payrollResult=null;payrollWorking=false;
 payrollDialog?.remove();payrollDialog=null;
 document.body.classList.remove('payroll-dialog-open');
 if(payrollOriginalFocus?.isConnected)payrollOriginalFocus.focus();
 payrollOriginalFocus=null;
}
function payrollAlert(message){
 const slot=payrollDialog?.querySelector('[data-payroll-alert]');
 if(slot){slot.textContent=message;slot.hidden=!message;}
}
function payrollOpen(){
 const month=previousCompletedMonth();
 const wage=currentTemporaryWage();
 if(wage==null){
  const label=document.querySelector('.att-page [data-att-salary]');
  label?.focus();
  label?.setCustomValidity('請先輸入月薪工資總額');
  label?.reportValidity();
  if(label)setTimeout(()=>label.setCustomValidity(''),0);
  return;
 }
 if(!attendanceState.employeeId){alert('請先在出勤表選擇人員');return;}
 payrollClose();payrollOriginalFocus=document.activeElement;
 const name=document.querySelector('.att-page [data-att-person] option:checked')?.textContent||'選定人員';
 payrollDialog=document.createElement('div');
 payrollDialog.className='payroll-overlay';
 payrollDialog.innerHTML='<div class="payroll-modal soft-card" role="dialog" aria-modal="true" aria-labelledby="payroll-title">'+
 '<div class="payroll-modal-head"><div><div class="overline">PAYROLL ESTIMATE</div>'+
 '<h2 id="payroll-title">建立薪資試算</h2><p>自動帶入上一個完整月份，也能手動選擇跨月日期。</p></div>'+
 '<button type="button" class="soft-button sm" data-action="payroll-close" aria-label="關閉試算視窗">關閉</button></div>'+
 '<div class="payroll-period-chip">預設期間：'+esc(month.startDate)+' ～ '+esc(month.endDate)+'</div>'+
 '<div class="payroll-modal-fields">'+
 '<label class="form-group"><span class="field-label">試算起始日期</span><input class="input" type="date" data-payroll-start value="'+esc(month.startDate)+'"></label>'+
 '<label class="form-group"><span class="field-label">試算結束日期</span><input class="input" type="date" data-payroll-end value="'+esc(month.endDate)+'"></label></div>'+
 '<p class="small muted">選定人員：<strong>'+esc(name)+'</strong>。每次最多 366 天；未登記的日期會列入報表並標記，不能視為缺勤。</p>'+
 '<p class="payroll-alert" data-payroll-alert hidden role="alert"></p>'+
 '<div class="payroll-modal-actions">'+payrollButton('取消')+
 '<button type="button" class="soft-button primary" data-action="payroll-confirm">建立此次試算</button></div>'+
 '<div data-payroll-preview></div>'+
 '<p class="small muted">月薪不會傳送至 Google Sheets。匯出的 Excel 將包含月薪與加班費，請勿分享至公開資料夾。</p>'+
 '</div>';
 document.body.append(payrollDialog);
 document.body.classList.add('payroll-dialog-open');
 payrollDialog.querySelector('[data-payroll-start]')?.focus();
}
function payrollPreview(report){
 const notes=[];
 if(report.missingDays)notes.push('本次期間有 '+report.missingDays+' 天尚未登記，請核對打卡紀錄。');
 if(report.manualReviewDays)notes.push('有 '+report.manualReviewDays+' 天需人工核算，下面的金額僅為已可計算部分。');
 if(report.isPartialMonth)notes.push('選定期間包含本月份，可能尚未結束完整薪資週期。');
 const stage=payrollDialog?.querySelector('[data-payroll-preview]');
 if(!stage)return;
 stage.innerHTML='<section class="payroll-preview"><h3>試算完成 · '+esc(report.employeeName)+'</h3>'+
 '<p>'+esc(report.startDate)+' ～ '+esc(report.endDate)+'（'+report.days+' 個日曆日）</p>'+
 '<div class="payroll-stats">'+
 '<div><span>已登記</span><strong>'+report.recordedDays+' 天</strong></div>'+
 '<div><span>總工時</span><strong>'+report.workHours.toLocaleString('zh-TW')+' h</strong></div>'+
 '<div><span>總加班</span><strong>'+report.overtimeHours.toLocaleString('zh-TW')+' h</strong></div>'+
 '<div><span>請假天數</span><strong>'+report.leaveDays.toLocaleString('zh-TW')+' 天</strong></div>'+
 '<div><span>預估應上班天數</span><strong>'+report.estimatedWorkingDays+' 天</strong></div>'+
 '<div><span>可計算加班費</span><strong>'+payrollMoney(report.knownPaySubtotal)+'</strong></div>'+
 '</div>'+
 (notes.length?'<div class="payroll-flags">'+notes.map(n=>'<p>• '+esc(n)+'</p>').join('')+'</div>':'')+
 '<div class="payroll-modal-actions"><button type="button" class="soft-button primary" data-action="payroll-export">匯出此次試算 Excel</button></div>'+
 '<p class="small muted">含彩色摘要、逐日明細（含未登記日）、可重算公式、計算依據與資料核對提醒。</p></section>';
}
async function payrollConfirm(){
 if(payrollWorking||!payrollDialog)return;
 const first=payrollDialog.querySelector('[data-payroll-start]')?.value;
 const last=payrollDialog.querySelector('[data-payroll-end]')?.value;
 try{
  const monthWage=currentTemporaryWage();
  if(monthWage===null)throw Error('月薪基準已清空，請重新輸入後開始試算');
  payrollPeriod(first,last);
  payrollAlert('');
  payrollWorking=true;
  const button=payrollDialog.querySelector('[data-action="payroll-confirm"]');
  if(button){button.disabled=true;button.textContent='正在查詢出勤資料…';}
  const employeeId=attendanceState.employeeId;
  const employeeName=document.querySelector('.att-page [data-att-person] option:checked')?.textContent||employeeId;
  // Only employee and date range leave this browser; monthly wage remains in memory.
  const answer=cloudEnabled()?
    await cloudCall('wpAttendanceRange',{employeeId,startDate:first,endDate:last}):
    {rows:readLocalAttendanceRange(employeeId,first,last)};
  if(!payrollDialog)return;
  if(attendanceState.employeeId!==employeeId||currentTemporaryWage()!==monthWage)
    throw Error('試算期間人員或月薪已變更，請重新開始');
  payrollResult=buildPayrollReport({employeeId,employeeName,startDate:first,endDate:last,
   monthlyWage:monthWage,rows:answer.rows});
  payrollPreview(payrollResult);
 }catch(error){payrollResult=null;payrollAlert(error.message||'試算失敗');}
 finally{
  payrollWorking=false;
  const button=payrollDialog?.querySelector('[data-action="payroll-confirm"]');
  if(button){button.disabled=false;button.textContent='重新試算';}
 }
}
function payrollExport(){
 if(!payrollResult)throw Error('請先完成試算');
 if(currentTemporaryWage()!==payrollResult.monthlyWage||
    attendanceState.employeeId!==payrollResult.employeeId)
  throw Error('月薪或人員已變更，請重新試算');
 const report=payrollResult;
 const name='WorkPulse-出勤與加班試算-'+report.employeeName.replace(/[\\/:*?"<>|]/g,'_').slice(0,35)+
  '-'+report.startDate+'至'+report.endDate+'.xlsx';
 download(name,createPayrollXlsx(report),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 payrollAlert('Excel 已開始下載。檔案含薪資資訊，請保存在會計專用位置。');
}
document.addEventListener('click',event=>{
 const node=event.target.closest('[data-action]');
 if(!node)return;
 const action=node.dataset.action;
 if(action==='payroll-start'&&node.closest('.att-page'))payrollOpen();
 else if(action==='payroll-close'&&node.closest('.payroll-modal'))payrollClose();
 else if(action==='payroll-confirm'&&node.closest('.payroll-modal'))payrollConfirm();
 else if(action==='payroll-export'&&node.closest('.payroll-modal')){
  try{payrollExport();}catch(error){payrollAlert(error.message);}
 }
});
document.addEventListener('pointerdown',event=>{
 if(event.target===payrollDialog&&!payrollWorking)payrollClose();
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&payrollDialog&&!payrollWorking){event.preventDefault();payrollClose();}
});
document.addEventListener('change',event=>{
 const el=event.target;
 if(payrollDialog&&el?.matches?.('.att-page [data-att-person],.att-page [data-att-month]'))payrollClose();
});
document.addEventListener('input',event=>{
 if(payrollDialog&&event.target.matches?.('.att-page [data-att-salary]')){
  payrollResult=null;
  const stage=payrollDialog.querySelector('[data-payroll-preview]');
  if(stage)stage.innerHTML='';
  payrollAlert('月薪已變更。請重新建立試算。');
 }
});
window.addEventListener('hashchange',()=>{
 if(location.hash.replace('#/','').replace('#','')!=='attendance')payrollClose();
});
