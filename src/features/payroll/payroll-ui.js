import {esc,download} from '../../shared/utils.js';
import {attendanceState,readLocalAttendanceRange} from '../attendance/attendance-state.js';
import {cloudEnabled,cloudCall} from '../../services/cloud.js';
import {previousCompletedMonth,payrollPeriod,buildAttendanceExportReport,parsePayrollDate} from './payroll.js';
import {createPayrollXlsx} from './payroll-xlsx.js';
let payrollDialog=null,payrollResult=null,payrollWorking=false,payrollOriginalFocus=null;
const payrollButton=label=>'<button type="button" class="soft-button" data-action="payroll-close">'+label+'</button>';
function payrollClose(){
 payrollResult=null;payrollWorking=false;payrollDialog?.remove();payrollDialog=null;document.body.classList.remove('payroll-dialog-open');
 if(payrollOriginalFocus?.isConnected)payrollOriginalFocus.focus();payrollOriginalFocus=null;
}
function payrollAlert(message){const slot=payrollDialog?.querySelector('[data-payroll-alert]');if(slot){slot.textContent=message;slot.hidden=!message;}}
function payrollOpen(){
 const month=previousCompletedMonth(),people=[...document.querySelectorAll('.att-page [data-att-person] option')];if(!people.length)return;
 payrollClose();payrollOriginalFocus=document.activeElement;
 payrollDialog=document.createElement('div');payrollDialog.className='payroll-overlay';
 payrollDialog.innerHTML='<div class="payroll-modal soft-card" role="dialog" aria-modal="true" aria-labelledby="payroll-title">'+
 '<div class="payroll-modal-head"><div><div class="overline">ATTENDANCE EXPORT</div><h2 id="payroll-title">匯出出勤 Excel</h2><p>預設上一完整月份，支援自訂結算期間與發薪日。網站不輸入或計算薪資。</p></div>'+payrollButton('關閉')+'</div>'+
 '<div class="payroll-modal-fields"><label class="form-group"><span class="field-label">匯出人員</span><select class="input" data-payroll-person>'+people.map(o=>'<option value="'+esc(o.value)+'" '+(o.value===attendanceState.employeeId?'selected':'')+'>'+esc(o.textContent)+'</option>').join('')+'</select></label>'+
 '<label class="form-group"><span class="field-label">發薪日期（選填）</span><input class="input" type="date" data-payroll-pay-date></label>'+
 '<label class="form-group"><span class="field-label">結算起始日期</span><input class="input" type="date" data-payroll-start value="'+esc(month.startDate)+'"></label>'+
 '<label class="form-group"><span class="field-label">結算結束日期</span><input class="input" type="date" data-payroll-end value="'+esc(month.endDate)+'"></label></div>'+
 '<p class="small muted">每次最多 366 天。可在同一視窗逐位選擇人員，核對後分別下載。</p><p class="payroll-alert" data-payroll-alert hidden role="alert"></p>'+
 '<div class="payroll-modal-actions">'+payrollButton('取消')+'<button type="button" class="soft-button primary" data-action="payroll-confirm">查詢與核對出勤</button></div>'+
 '<div data-payroll-preview></div><p class="small muted">下載後在 Excel「試算總覽」B6 填入月薪，確認後由會計手動上傳私人 Google Drive 資料夾。</p></div>';
 document.body.append(payrollDialog);document.body.classList.add('payroll-dialog-open');payrollDialog.querySelector('[data-payroll-person]')?.focus();
}
function payrollPreview(report){
 const stage=payrollDialog?.querySelector('[data-payroll-preview]');if(!stage)return;
 const notes=[];
 if(report.missingWorkDays)notes.push('有 '+report.missingWorkDays+' 個過去預計工作日尚未登記，請核對；不等於缺勤。');
 if(report.manualReviewDays)notes.push('有 '+report.manualReviewDays+' 天紀錄異常或需人工核對，Excel 不自動計算這些日期的加班費。');
 if(report.isPartialMonth)notes.push('選定期間包含本月份，可能尚未結束完整薪資週期。');
 const issues=report.rows.filter(d=>d.issues?.length||(d.status==='未登記'&&d.planned==='workday')).map(d=>d.date+'：'+(d.issues?.join('；')||'預計工作日尚無紀錄'));
 stage.innerHTML='<section class="payroll-preview"><h3>出勤核對 · '+esc(report.employeeName)+'</h3><p>'+esc(report.startDate)+' ～ '+esc(report.endDate)+(report.payDate?' · 發薪 '+esc(report.payDate):'')+'</p>'+
 '<div class="payroll-stats">'+[['已登記',report.recordedDays+' 天'],['總工時',report.workHours+' h'],['總加班',report.overtimeHours+' h'],['請假時數',report.leaveHours+' h'],['預計工作日缺漏',report.missingWorkDays+' 天'],['需核對',report.manualReviewDays+' 天']].map(v=>'<div><span>'+v[0]+'</span><strong>'+esc(v[1])+'</strong></div>').join('')+'</div>'+
 (notes.length?'<div class="payroll-flags">'+notes.map(n=>'<p>'+esc(n)+'</p>').join('')+'</div>':'')+
 (issues.length?'<details><summary>查看待核對日期</summary><div class="att-cal-issues">'+issues.map(n=>'<p>'+esc(n)+'</p>').join('')+'</div></details>':'')+
 '<div class="payroll-modal-actions"><button type="button" class="soft-button primary" data-action="payroll-export">下載 Excel</button></div><p class="small muted">下載後可選下一位人員，沿用本次結算期間與發薪日。</p></section>';
}
function payrollInvalidate(){payrollResult=null;const stage=payrollDialog?.querySelector('[data-payroll-preview]');if(stage)stage.innerHTML='';payrollAlert('');}
async function payrollConfirm(){
 if(payrollWorking||!payrollDialog)return;
 const dialog=payrollDialog,first=dialog.querySelector('[data-payroll-start]').value,last=dialog.querySelector('[data-payroll-end]').value,payDate=dialog.querySelector('[data-payroll-pay-date]').value;
 const select=dialog.querySelector('[data-payroll-person]'),employeeId=select.value,employeeName=select.selectedOptions[0]?.textContent||employeeId;payrollInvalidate();
 try{
  payrollPeriod(first,last);if(payDate&&parsePayrollDate(payDate)<parsePayrollDate(last))throw Error('發薪日期不可早於結算結束日');
  payrollWorking=true;for(const el of dialog.querySelectorAll('input,select,button'))el.disabled=true;
  dialog.querySelector('[data-action="payroll-confirm"]').textContent='正在查詢出勤資料…';
  const answer=cloudEnabled()?await cloudCall('wpAttendanceRange',{employeeId,startDate:first,endDate:last}):{rows:readLocalAttendanceRange(employeeId,first,last)};
  if(payrollDialog!==dialog)return;if(!Array.isArray(answer?.rows))throw Error('出勤回應格式不完整');
  payrollResult=buildAttendanceExportReport({employeeId,employeeName,startDate:first,endDate:last,payDate,rows:answer.rows,scheduleByMonth:answer.scheduleByMonth||{}});
  payrollPreview(payrollResult);
 }catch(error){if(payrollDialog===dialog){payrollResult=null;payrollAlert(error.message||'出勤查詢失敗');}}
 finally{if(payrollDialog===dialog){payrollWorking=false;for(const el of dialog.querySelectorAll('input,select,button'))el.disabled=false;dialog.querySelector('[data-action="payroll-confirm"]').textContent='重新查詢與核對';}}
}
function payrollExport(){
 if(!payrollResult||payrollWorking)throw Error('請先完成出勤查詢');
 const report=payrollResult,name='WorkPulse-出勤-'+report.employeeName.replace(/[\\/:*?"<>|]/g,'_').slice(0,35)+'-'+report.startDate+'至'+report.endDate+'.xlsx';
 download(name,createPayrollXlsx(report),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');payrollAlert('Excel 已開始下載，月薪尚未填寫；請在電腦 Excel 完成後手動保存。');
}
document.addEventListener('click',event=>{
 const node=event.target.closest('[data-action]');if(!node)return;const action=node.dataset.action;
 if(action==='payroll-start'&&node.closest('.att-page'))payrollOpen();
 else if(action==='payroll-close'&&node.closest('.payroll-modal')&&!payrollWorking)payrollClose();
 else if(action==='payroll-confirm'&&node.closest('.payroll-modal'))void payrollConfirm();
 else if(action==='payroll-export'&&node.closest('.payroll-modal')){try{payrollExport();}catch(error){payrollAlert(error.message);}}
});
document.addEventListener('pointerdown',event=>{if(event.target===payrollDialog&&!payrollWorking)payrollClose();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&payrollDialog&&!payrollWorking){event.preventDefault();payrollClose();}});
document.addEventListener('input',event=>{if(payrollDialog&&event.target.closest?.('.payroll-modal')&&event.target.matches('input,select'))payrollInvalidate();});
document.addEventListener('change',event=>{if(payrollDialog&&event.target.closest?.('.payroll-modal')&&event.target.matches('input,select'))payrollInvalidate();});
window.addEventListener('hashchange',()=>{if(location.hash.replace('#/','').replace('#','')!=='attendance')payrollClose();});
