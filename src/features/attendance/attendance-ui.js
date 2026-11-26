import {esc} from '../../shared/utils.js';
import {DAY_TYPES,LEAVE_TYPES,attendanceSummary,weekdayLabel,hoursLabel,TWD_FORMAT,validateAttendanceDraft,payEstimate} from './attendance.js';
import {attendanceState,loadAttendance,attendanceSelectDate,updateAttendance,submitAttendance,updateAttendanceConfig,saveAttendanceConfig,updateTemporarySalary,clearTemporarySalary,currentTemporaryWage} from './attendance-state.js';
function opts(items,selected){
 return Object.entries(items).map(([key,value])=>'<option value="'+esc(key)+'" '+(selected===key?'selected':'')+'>'+esc(value)+'</option>').join('');
}
const cost=n=>n==null?'待設定／人工核對':TWD_FORMAT.format(Number(n));
let knownPeople=[],knownAdmin=false,attendanceNotice='';
export function renderAttendance(people,isAdmin=false){
 knownPeople=people||[];knownAdmin=isAdmin;
 const a=attendanceState;
 if(!people?.length)return '<section class="soft-card card-pad-lg">尚未設定員工名單，請管理員先新增人員。</section>';
 const person=people.some(x=>x.id===a.employeeId)?a.employeeId:people[0].id;
 const toolbar='<section class="soft-card card-pad-lg att-panel"><div class="card-head"><div><div class="overline">ATTENDANCE</div><h2 class="card-title">出勤表</h2><p class="card-sub">依姓名、月份查閱出勤及加班紀錄</p></div></div>'+
 '<div class="att-selectors"><label class="form-group"><span class="field-label">人員</span><select class="input" data-att-person>'+
 people.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===person?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>'+
 '<label class="form-group"><span class="field-label">月份</span><input class="input" type="month" data-att-month value="'+esc(a.month)+'"></label>'+
 '<button class="soft-button sm" data-action="attendance-refresh">重新讀取</button></div></section>';
 if(a.phase==='idle'||a.phase==='loading')return '<div class="att-page">'+toolbar+'<section class="soft-card card-pad-lg" role="status">正在讀取出勤資料…</section></div>';
 if(a.phase==='error')return '<div class="att-page">'+toolbar+'<section class="soft-card card-pad-lg" role="alert">出勤資料讀取失敗：'+esc(a.error)+'</section></div>';
 const wage=currentTemporaryWage();
 const info=attendanceSummary(a.rows,a.month,a.expectedDays,wage);
 const salaryPanel='<section class="soft-card card-pad-lg att-salary-panel" aria-label="本次臨時薪資試算">'+
  '<div><h3 class="card-title">薪資基準 · 即時計算</h3>'+
  '<p class="card-sub">會計輸入選定人員月薪，立即試算當月所有加班費。切換人員、月份或離開出勤頁後即清除。</p></div>'+
  '<div class="att-salary-tools"><label class="form-group"><span class="field-label">月薪工資總額（NT$）</span>'+
  '<input class="input" data-att-salary type="number" min="1" max="10000000" step="1" inputmode="numeric" autocomplete="off" placeholder="待設定 · 輸入月薪開始試算" value="'+esc(a.temporarySalary)+'"></label>'+
  '<button class="soft-button primary sm" type="button" data-action="payroll-start">開始試算／匯出 Excel</button>'+
  '<button class="soft-button sm" type="button" data-action="attendance-salary-clear">清除試算</button></div>'+
  '<p class="small muted">薪資基準與試算金額不會送至伺服器、寫入 Google Sheets 或儲存在瀏覽器。僅目前畫面可見；共用電腦請使用完畢後清除。</p></section>';
 const pairs=[
 ['當月總上班時數',hoursLabel(info.workedMinutes)],
 ['當月總加班時數',hoursLabel(info.overtimeMinutes)],
 ['當月總加班費',cost(info.totalPay)],
 ['當月應上班天數',info.expectedDays+' 天'+(info.expectedIsEstimate?'（估）':'')],
 ['當月請假天數',Number(info.leaveDays.toFixed(2))+' 天'],
 ['當月請假時數',hoursLabel(info.leaveMinutes)]
 ];
 const metrics='<div class="att-metrics">'+pairs.map((pair,index)=>'<div class="soft-card att-metric"><span>'+esc(pair[0])+'</span><strong '+(index===2?'data-att-monthly-pay':'')+'>'+esc(pair[1])+'</strong></div>').join('')+'</div>';
 const d=a.draft||{date:a.date,dayType:'workday',startTime:'',endTime:'',breakMinutes:0,leaveType:'none',leaveMinutes:0,notes:''};
 let worked=0,extra=0,previewError='',previewPay=null;
 try{const checked=validateAttendanceDraft(d);worked=checked.workedMinutes;extra=checked.overtimeMinutes;
  previewPay=payEstimate(d.dayType,worked,wage);
 }catch(e){previewError=e.message;}
 const field=(label,key,type='text',extraProps='')=>'<label class="form-group"><span class="field-label">'+label+'</span><input class="input" type="'+type+'" data-att-field="'+key+'" value="'+esc(String(d[key]??''))+'" '+extraProps+'></label>';
 const editor='<section class="soft-card card-pad-lg att-panel">'+
 '<div class="card-head"><div><h3 class="card-title">每日出勤登記</h3><p class="card-sub">時間記錄至分鐘；跨午夜下班自動視為隔日。工作時間會扣除未提供勞務的休息時間。</p></div></div>'+
 '<div class="att-fields"><label class="form-group"><span class="field-label">日期</span><input class="input" type="date" data-att-date value="'+esc(d.date)+'"></label>'+
 '<div class="form-group"><span class="field-label">星期</span><div class="att-static">星期'+weekdayLabel(d.date)+'</div></div>'+
 '<label class="form-group"><span class="field-label">出勤日別</span><select class="input" data-att-field="dayType">'+opts(DAY_TYPES,d.dayType)+'</select></label>'+
 field('當日上班時間','startTime','time')+field('當日下班時間','endTime','time')+
 field('休息時間（分鐘）','breakMinutes','number','min="0" max="1440" step="1"')+
 '<label class="form-group"><span class="field-label">請假類型</span><select class="input" data-att-field="leaveType">'+opts(LEAVE_TYPES,d.leaveType)+'</select></label>'+
 field('請假分鐘數','leaveMinutes','number','min="0" max="480" step="1" '+(d.leaveType==='none'?'disabled':''))+
 '<label class="form-group att-full"><span class="field-label">備註</span><textarea class="input" maxlength="1000" data-att-field="notes" placeholder="例：出差、加班事項、補登說明…">'+esc(d.notes)+'</textarea></label></div>'+
 '<div class="att-preview"><div><span>當日上班時數</span><strong>'+hoursLabel(worked)+'</strong></div>'+
 '<div><span>當日加班／假日出勤時數</span><strong>'+hoursLabel(extra)+'</strong></div>'+
 '<div><span>當日加班費估算</span><strong data-att-preview-pay>'+cost(previewPay)+'</strong></div></div>'+
 (previewError?'<p class="att-error" role="alert">'+esc(previewError)+'</p>':'')+
 '<div class="att-actions"><span class="small muted">例假出勤、國定假日調移、變形工時需另行人工核對。</span>'+
 '<button class="soft-button primary" data-action="attendance-save" '+(a.saving?'disabled':'')+'>'+(a.saving?'儲存中…':'儲存出勤紀錄')+'</button></div></section>';
 const admin=isAdmin&&a.adminConfig?'<section class="soft-card card-pad-lg att-panel"><h3 class="card-title">管理員排班設定</h3>'+
 '<p class="card-sub">可設定當月應上班天數。月薪基準改在頁面下方的臨時輸入框試算，不儲存。</p>'+
 '<div class="att-fields">'+
 '<label class="form-group"><span class="field-label">當月應上班天數</span><input class="input" type="number" min="0" max="31" data-att-config="expectedDays" value="'+esc(String(a.adminConfig.expectedDays??''))+'" placeholder="不填則為週一～五估計"></label></div>'+
 '<div class="att-actions"><span class="small muted">應上班天數會儲存。臨時月薪和試算加班費不儲存。</span>'+
 '<button class="soft-button" data-action="attendance-config-save" '+(a.configSaving?'disabled':'')+'>儲存設定</button></div></section>':'';
 const table='<section class="soft-card card-pad-lg att-panel"><div class="card-head"><div><h3 class="card-title">本月出勤明細</h3>'+
 '<p class="card-sub">點選日期可編輯既有紀錄。表格可橫向捲動，不會撐開網站版型。</p></div><span class="tag">'+a.rows.length+' 筆</span></div>'+
 (a.rows.length?'<div class="att-scroll"><table class="att-table"><thead><tr><th>日期</th><th>星期</th><th>出勤日別</th><th>上班</th><th>下班</th><th>當日上班時數</th><th>當日加班時數</th><th>加班費（估）</th><th>請假</th><th>備註</th><th>操作</th></tr></thead><tbody>'+
 a.rows.map(r=>'<tr><td>'+esc(r.date)+'</td><td>週'+weekdayLabel(r.date)+'</td><td>'+esc(DAY_TYPES[r.dayType]||r.dayType)+'</td>'+
 '<td>'+esc(r.startTime||'—')+'</td><td>'+esc(r.endTime||'—')+'</td><td>'+hoursLabel(r.workedMinutes)+'</td><td>'+hoursLabel(r.overtimeMinutes)+'</td>'+
 '<td data-att-row-pay="'+esc(r.date)+'">'+esc(cost(payEstimate(r.dayType||'workday',r.workedMinutes,wage)))+'</td><td>'+(r.leaveMinutes?esc(LEAVE_TYPES[r.leaveType]||r.leaveType)+' '+hoursLabel(r.leaveMinutes):'—')+'</td>'+
 '<td><span class="att-note" title="'+esc(r.notes||'')+'">'+esc(r.notes||'—')+'</span></td>'+
 '<td><button class="soft-button mini" data-action="attendance-edit" data-date="'+esc(r.date)+'">編輯</button></td></tr>').join('')+
 '</tbody></table></div>':'<p class="small muted">尚無本月出勤紀錄。</p>')+'</section>';
 const law='<section class="soft-card att-law-panel att-panel"><h3 class="card-title">加班費計算公式（勞基法）</h3>'+
 '<div class="att-law"><p><strong>月薪制基準時薪</strong>月薪工資總額 ÷ 240</p>'+
 '<p><strong>平日加班</strong>前 2 小時 × 4/3；第 3–4 小時 × 5/3</p>'+
 '<p><strong>休息日工作</strong>前 2 小時 × 4/3；第 3–8 小時 × 5/3；第 9–12 小時 × 8/3</p>'+
 '<p><strong>國定假日／特休出勤</strong>月薪制 8 小時內另加 1 日工資；超過 8 小時依延長工時計。</p></div>'+
 '<p class="small muted">本欄為月薪制標準工時的估算，例假原則不得出勤；換班、週逾40小時、補休、天災特殊情形請人工核算。'+
 '<a href="https://calcr2.mol.gov.tw/Index" target="_blank" rel="noopener noreferrer">勞動部加班費試算</a></p></section>';
 return '<div class="att-page">'+toolbar+(attendanceNotice?'<div class="notice att-notice" role="status">'+esc(attendanceNotice)+'</div>':'')+metrics+
 (info.expectedIsEstimate?'<p class="small muted att-estimate">應上班天數暫用週一至週五推估，未扣除國定假日與調班，管理員可設定確切天數。</p>':'')+
 '<div class="att-layout">'+editor+admin+'</div>'+table+salaryPanel+law+'</div>';
}

/** Attendance interactions are delegated here to avoid coupling the journal editor. */
function refreshAttendanceDom(){
 const element=document.querySelector('.att-page');
 if(element)element.outerHTML=renderAttendance(knownPeople,knownAdmin);
}
async function changeAttendanceMonth(month,employee){
 attendanceNotice='';
 const promise=loadAttendance(knownPeople,knownAdmin,month,employee);
 refreshAttendanceDom();
 await promise;
 refreshAttendanceDom();
}
document.addEventListener('click',event=>{
 const el=event.target.closest('[data-action]');
 if(!el||!el.closest('.att-page'))return;
 const action=el.dataset.action;
 if(action==='attendance-refresh'){
  changeAttendanceMonth(attendanceState.month,attendanceState.employeeId)
   .catch(e=>{attendanceNotice=e.message;refreshAttendanceDom();});
 }else if(action==='attendance-edit'){
  attendanceNotice='';attendanceSelectDate(el.dataset.date);refreshAttendanceDom();
  document.querySelector('.att-layout')?.scrollIntoView({behavior:'smooth',block:'start'});
 }else if(action==='attendance-save'){
  attendanceNotice='正在儲存出勤紀錄…';
  submitAttendance().then(()=>attendanceNotice='出勤紀錄已成功儲存至 Google Sheets／本機展示資料。')
   .catch(e=>attendanceNotice='無法儲存：'+e.message).finally(refreshAttendanceDom);
  refreshAttendanceDom();
 }else if(action==='attendance-salary-clear'){
  clearTemporarySalary();
  attendanceNotice='臨時薪資基準已清除';
  refreshAttendanceDom();
 }else if(action==='attendance-config-save'){
  attendanceNotice='正在儲存計薪設定…';
  saveAttendanceConfig().then(()=>attendanceNotice='計薪與應上班天數設定已儲存')
   .catch(e=>attendanceNotice='設定失敗：'+e.message).finally(refreshAttendanceDom);
  refreshAttendanceDom();
 }
});
document.addEventListener('input',event=>{
 const el=event.target;
 if(!el.closest('.att-page'))return;
 if(el.matches('[data-att-salary]')){
  updateTemporarySalary(el.value);
  // Update monetary cells in place; never rebuild the input during typing.
  const panel=el.closest('.att-page'),wage=currentTemporaryWage(),a=attendanceState;
  const sum=attendanceSummary(a.rows,a.month,a.expectedDays,wage);
  const total=panel.querySelector('[data-att-monthly-pay]');
  if(total)total.textContent=cost(sum.totalPay);
  const preview=panel.querySelector('[data-att-preview-pay]');
  if(preview){
   try{
    const draft=validateAttendanceDraft(a.draft);
    preview.textContent=cost(payEstimate(draft.dayType,draft.workedMinutes,wage));
   }catch{preview.textContent='待設定／人工核對';}
  }
  for(const cell of panel.querySelectorAll('[data-att-row-pay]')){
   const row=a.rows.find(r=>r.date===cell.dataset.attRowPay);
   if(row)cell.textContent=cost(payEstimate(row.dayType||'workday',row.workedMinutes,wage));
  }
  return;
 }
 if(el.matches('[data-att-field]'))updateAttendance(el.dataset.attField,el.value);
 if(el.matches('[data-att-config]'))updateAttendanceConfig(el.dataset.attConfig,el.value);
});
document.addEventListener('change',event=>{
 const el=event.target;
 if(!el.closest('.att-page'))return;
 if(el.matches('[data-att-person]')||el.matches('[data-att-month]')){
  if(attendanceState.dirty&&!confirm('出勤資料尚未儲存，確定要切換？')){refreshAttendanceDom();return;}
  const month=el.matches('[data-att-month]')?el.value:attendanceState.month;
  const employee=el.matches('[data-att-person]')?el.value:attendanceState.employeeId;
  changeAttendanceMonth(month,employee).catch(e=>{attendanceNotice=e.message;refreshAttendanceDom();});return;
 }
 if(el.matches('[data-att-date]')){
  if(attendanceState.dirty&&!confirm('出勤資料尚未儲存，確定要切換日期？')){refreshAttendanceDom();return;}
  const date=el.value;
  if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)){attendanceNotice='日期格式無效';refreshAttendanceDom();return;}
  if(date.slice(0,7)!==attendanceState.month){
   attendanceState.date=date;
   changeAttendanceMonth(date.slice(0,7),attendanceState.employeeId)
    .catch(e=>{attendanceNotice=e.message;refreshAttendanceDom();});
   return;
  }
  attendanceNotice='';attendanceSelectDate(date);refreshAttendanceDom();return;
 }
 if(el.matches('[data-att-field]')){
  updateAttendance(el.dataset.attField,el.value);refreshAttendanceDom();
 }
});

// The temporary wage must not survive navigation away from the attendance page.
window.addEventListener('hashchange',()=>{
 if(location.hash.replace('#/','').replace('#','')!=='attendance')clearTemporarySalary();
});
