import {esc,localISODate} from '../../shared/utils.js';
import {attendanceCalendar,attendancePlannedDay,previousAttendanceTimes} from './calendar.js';
import {cloudEnabled} from '../../services/cloud.js';
import {DAY_TYPES,LEAVE_TYPES,attendanceSummary,weekdayLabel,hoursLabel,validateAttendanceDraft} from './attendance.js';
import {attendanceState,loadAttendance,attendanceSelectDate,updateAttendance,submitAttendance,updateAttendanceConfig,saveAttendanceConfig,discardAttendanceDraft,copyPreviousAttendance,updateAttendanceSchedule,saveAttendanceSchedule} from './attendance-state.js';
function opts(items,selected){
 return Object.entries(items).map(([key,value])=>'<option value="'+esc(key)+'" '+(selected===key?'selected':'')+'>'+esc(value)+'</option>').join('');
}
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
 const days=attendanceCalendar(a.month,a.rows,a.confirmedSchedule.days,localISODate(),a.date,a.dirty?a.draft:null);
 const expected=a.expectedDays??(Object.keys(a.confirmedSchedule.days).length?days.filter(x=>x.planned==='workday').length:null);
 const info=attendanceSummary(a.rows,a.month,expected);
 const exportPanel='<section class="soft-card card-pad-lg att-panel att-export-panel"><div class="card-head"><div><h3 class="card-title">出勤紀錄 · Excel 匯出</h3><p class="card-sub">選擇人員及結算期間，下載含公式的 Excel。月薪請在電腦 Excel 輸入，網站不試算金額，也不自動上傳 Google Drive。</p></div></div>'+
  '<button class="soft-button primary" type="button" data-action="payroll-start">匯出出勤 Excel</button></section>';
 const pairs=[
 ['當月總上班時數',hoursLabel(info.workedMinutes)],
 ['當月總加班時數',hoursLabel(info.overtimeMinutes)],
 ['當月應上班天數',info.expectedDays+' 天'+(info.expectedIsEstimate?'（估）':'')],
 ['當月請假天數',Number(info.leaveDays.toFixed(2))+' 天'],
 ['當月請假時數',hoursLabel(info.leaveMinutes)]
 ];
 const metrics='<div class="att-metrics">'+pairs.map(pair=>'<div class="soft-card att-metric"><span>'+esc(pair[0])+'</span><strong>'+esc(pair[1])+'</strong></div>').join('')+'</div>';
 const d=a.draft||{date:a.date,dayType:'workday',startTime:'',endTime:'',breakMinutes:0,leaveType:'none',leaveMinutes:0,notes:''};
 let worked=0,extra=0,previewError='';
 try{const checked=validateAttendanceDraft(d);worked=checked.workedMinutes;extra=checked.overtimeMinutes;
 }catch(e){previewError=e.message;}
 const field=(label,key,type='text',extraProps='')=>'<label class="form-group"><span class="field-label">'+label+'</span><input class="input" type="'+type+'" data-att-field="'+key+'" value="'+esc(String(d[key]??''))+'" '+extraProps+'></label>';
 const previous=previousAttendanceTimes(a.rows,a.date,a.employeeId);
 const editor='<section class="soft-card card-pad-lg att-panel">'+
 '<div class="card-head"><div><h3 class="card-title">每日出勤登記</h3><p class="card-sub">時間記錄至分鐘；跨午夜下班自動視為隔日。工作時間會扣除未提供勞務的休息時間。</p></div></div>'+
 '<div class="att-copy-row"><button class="soft-button sm" data-action="attendance-copy-previous" '+(!previous||a.saving?'disabled':'')+'>複製前一天上下班時間</button><span class="small muted">只複製時間與休息分鐘，不複製假別、備註或日別。</span></div>'+
 '<div class="att-fields"><label class="form-group"><span class="field-label">日期</span><input class="input" type="date" data-att-date value="'+esc(d.date)+'"></label>'+
 '<div class="form-group"><span class="field-label">星期</span><div class="att-static">星期'+weekdayLabel(d.date)+'</div></div>'+
 '<label class="form-group"><span class="field-label">出勤日別</span><select class="input" data-att-field="dayType">'+opts(DAY_TYPES,d.dayType)+'</select></label>'+
 field('當日上班時間','startTime','time')+field('當日下班時間','endTime','time')+
 field('休息時間（分鐘）','breakMinutes','number','min="0" max="1440" step="1"')+
 '<label class="form-group"><span class="field-label">請假類型</span><select class="input" data-att-field="leaveType">'+opts(LEAVE_TYPES,d.leaveType)+'</select></label>'+
 field('請假分鐘數','leaveMinutes','number','min="0" max="480" step="1" '+(d.leaveType==='none'?'disabled':''))+
 '<label class="form-group att-full"><span class="field-label">備註</span><textarea class="input" maxlength="1000" data-att-field="notes" placeholder="例：出差、加班事項、補登說明…">'+esc(d.notes)+'</textarea></label></div>'+
 '<div class="att-preview"><div><span>當日上班時數</span><strong>'+hoursLabel(worked)+'</strong></div>'+
 '<div><span>當日加班／假日出勤時數</span><strong>'+hoursLabel(extra)+'</strong></div></div>'+
 (previewError?'<p class="att-error" role="alert">'+esc(previewError)+'</p>':'')+
 (a.dirty?'<p class="small muted" role="status">'+(!cloudEnabled()?'尚未正式儲存。':a.draftStored?'尚未正式儲存；草稿暫存於本分頁。':'無法暫存草稿，請勿關閉頁面。')+'</p><button class="soft-button sm" data-action="attendance-discard" '+(a.saving?'disabled':'')+'>捨棄未儲存修改</button>':'')+
 '<div class="att-actions"><span class="small muted">例假出勤、國定假日調移、變形工時需另行人工核對。</span>'+
 '<button class="soft-button primary" data-action="attendance-save" '+(a.saving?'disabled':'')+'>'+(a.saving?'儲存中…':'儲存出勤紀錄')+'</button></div></section>';
 const admin=isAdmin&&a.adminConfig?'<section class="soft-card card-pad-lg att-panel"><h3 class="card-title">管理員排班設定</h3>'+
 '<p class="card-sub">可設定當月應上班天數。薪資一律在匯出的 Excel 處理。</p>'+
 '<div class="att-fields">'+
 '<label class="form-group"><span class="field-label">當月應上班天數</span><input class="input" type="number" min="0" max="31" data-att-config="expectedDays" value="'+esc(String(a.adminConfig.expectedDays??''))+'" placeholder="不填則為週一～五估計"></label></div>'+
 '<div class="att-actions"><span class="small muted">只儲存應上班天數，不儲存薪資。</span>'+
 '<button class="soft-button" data-action="attendance-config-save" '+(a.configSaving?'disabled':'')+'>儲存設定</button></div></section>':'';
 const calendar=renderAttendanceCalendar(days);
 const scheduleEditor=isAdmin&&a.adminConfig?renderAttendanceSchedule(a):'';
 const table='<section class="soft-card card-pad-lg att-panel"><div class="card-head"><div><h3 class="card-title">本月出勤明細</h3>'+
 '<p class="card-sub">點選日期可編輯既有紀錄。桌面使用表格，手機使用逐日卡片。</p></div><span class="tag">'+a.rows.length+' 筆</span></div>'+
 (a.rows.length?'<div class="att-scroll"><table class="att-table"><thead><tr><th>日期</th><th>星期</th><th>出勤日別</th><th>上班</th><th>下班</th><th>當日上班時數</th><th>當日加班時數</th><th>請假</th><th>備註</th><th>操作</th></tr></thead><tbody>'+
 a.rows.map(r=>'<tr><td>'+esc(r.date)+'</td><td>週'+weekdayLabel(r.date)+'</td><td>'+esc(DAY_TYPES[r.dayType]||r.dayType)+'</td>'+
 '<td>'+esc(r.startTime||'—')+'</td><td>'+esc(r.endTime||'—')+'</td><td>'+hoursLabel(r.workedMinutes)+'</td><td>'+hoursLabel(r.overtimeMinutes)+'</td>'+
 '<td>'+(r.leaveMinutes?esc(LEAVE_TYPES[r.leaveType]||r.leaveType)+' '+hoursLabel(r.leaveMinutes):'—')+'</td>'+
 '<td><span class="att-note" title="'+esc(r.notes||'')+'">'+esc(r.notes||'—')+'</span></td>'+
 '<td><button class="soft-button mini" data-action="attendance-edit" data-date="'+esc(r.date)+'">編輯</button></td></tr>').join('')+
 '</tbody></table></div>'+renderMobileAttendanceRows(a.rows):'<p class="small muted">尚無本月出勤紀錄。</p>')+'</section>';
 const law='<section class="soft-card att-law-panel att-panel"><h3 class="card-title">加班費計算公式（勞基法）</h3>'+
 '<div class="att-law"><p><strong>月薪制基準時薪</strong>月薪工資總額 ÷ 240</p>'+
 '<p><strong>平日加班</strong>前 2 小時 × 4/3；第 3–4 小時 × 5/3</p>'+
 '<p><strong>休息日工作</strong>前 2 小時 × 4/3；第 3–8 小時 × 5/3；第 9–12 小時 × 8/3</p>'+
 '<p><strong>國定假日／特休出勤</strong>月薪制 8 小時內另加 1 日工資；超過 8 小時依延長工時計。</p></div>'+
 '<p class="small muted">本欄為月薪制標準工時的估算，例假原則不得出勤；換班、週逾40小時、補休、天災特殊情形請人工核算。'+
 '<a href="https://calcr2.mol.gov.tw/Index" target="_blank" rel="noopener noreferrer">勞動部加班費試算</a></p></section>';
 return '<div class="att-page">'+toolbar+(attendanceNotice?'<div class="notice att-notice" role="status">'+esc(attendanceNotice)+'</div>':'')+metrics+
 (info.expectedIsEstimate?'<p class="small muted att-estimate">應上班天數暫用週一至週五推估，未扣除國定假日與調班，管理員可設定確切天數。</p>':'')+
 calendar+'<div class="att-layout">'+editor+admin+scheduleEditor+'</div>'+table+exportPanel+law+'</div>';
}

/** Attendance interactions are delegated here to avoid coupling the journal editor. */
function renderMobileAttendanceRows(rows){
 return '<div class="att-mobile-records" aria-label="逐日出勤明細">'+rows.map(r=>
 '<article class="att-mobile-record"><div class="row-between"><strong>'+esc(r.date)+' · 週'+weekdayLabel(r.date)+'</strong><span class="tag">'+esc(DAY_TYPES[r.dayType]||r.dayType)+'</span></div>'+
 '<dl class="att-mobile-values">'+[['上班',r.startTime||'—'],['下班',r.endTime||'—'],['實際工時',hoursLabel(r.workedMinutes)],['加班時數',hoursLabel(r.overtimeMinutes)],['請假',r.leaveMinutes?(LEAVE_TYPES[r.leaveType]||r.leaveType)+' '+hoursLabel(r.leaveMinutes):'—'],['休息分鐘',String(r.breakMinutes??0)]].map(v=>'<div><dt>'+esc(v[0])+'</dt><dd>'+esc(v[1])+'</dd></div>').join('')+'</dl>'+
 (r.notes?'<p class="att-mobile-note"><strong>備註：</strong>'+esc(r.notes)+'</p>':'')+
 '<button type="button" class="soft-button sm" data-action="attendance-edit" data-date="'+esc(r.date)+'">編輯這一天</button></article>').join('')+'</div>';
}
function renderAttendanceCalendar(days){
 const a=attendanceState,offset=days.length?new Date(days[0].date+'T00:00:00Z').getUTCDay():0;
 const labels={recorded:'有紀錄',leave:'請假',review:'待核對',missing:'缺紀錄',future:'未到日期',today:'今日',off:'休假／休息'};
 const missing=days.filter(d=>d.missing).length,review=days.filter(d=>d.issues.length).length;
 return '<section class="soft-card card-pad-lg att-panel att-calendar"><div class="card-head"><div><h3 class="card-title">出勤月曆</h3><p class="card-sub">點選日期登記／編輯，未來日期不列入缺漏。班表未設定時以週一至五、六休息、日例假暫估，國定假日及調班須管理員設定。</p></div></div>'+
 '<p class="small muted">待補紀錄 '+missing+' 天 · 待核對 '+review+' 天（僅提示，非缺勤判定）</p>'+
 '<div class="att-calendar-grid">'+['日','一','二','三','四','五','六'].map(x=>'<span class="att-cal-week">'+x+'</span>').join('')+
 Array.from({length:offset},()=>'<span aria-hidden="true"></span>').join('')+
 days.map(d=>'<button type="button" class="att-cal-day '+d.status+(d.selected?' selected':'')+'" data-action="attendance-edit" data-date="'+esc(d.date)+'" aria-pressed="'+d.selected+'" aria-label="'+esc(d.date+' '+labels[d.status]+' '+(DAY_TYPES[d.planned]||'')+' '+d.issues.join('；'))+'" title="'+esc(d.issues.join('；')||labels[d.status])+'"><strong>'+Number(d.date.slice(-2))+'</strong><small>'+labels[d.status]+'</small></button>').join('')+'</div>'+
 '<div class="att-cal-issues">'+days.filter(d=>d.issues.length||d.missing).map(d=>'<p class="small muted">'+esc(d.date)+'：'+esc([...d.issues,...(d.missing?['預計工作日尚無紀錄']:[])].join('；'))+'</p>').join('')+'</div></section>';
}
function renderAttendanceSchedule(a){
 const dates=attendanceCalendar(a.month,[],a.schedule.days,localISODate());
 return '<section class="soft-card card-pad-lg att-panel"><div class="card-head"><div><h3 class="card-title">每日班表設定（管理員）</h3><p class="card-sub">只調整預計日別；既有出勤、工時與加班費不會被自動覆寫。未指定使用週曆暫估。</p></div></div>'+
 '<div class="att-schedule-grid">'+dates.map(d=>'<label class="form-group"><span class="field-label">'+esc(d.date.slice(-2))+' 日／週'+weekdayLabel(d.date)+'</span><select class="input" data-att-schedule="'+esc(d.date)+'"><option value="">預設：'+esc(DAY_TYPES[attendancePlannedDay(d.date)])+'</option>'+opts(DAY_TYPES,a.schedule.days[d.date]||'')+'</select></label>').join('')+'</div>'+
 '<div class="att-actions"><span class="small muted">'+(a.scheduleDirty?'班表尚未儲存':'班表已載入')+'</span><button class="soft-button" data-action="attendance-schedule-save" '+(!a.scheduleDirty||a.scheduleSaving?'disabled':'')+'>儲存班表</button></div></section>';
}
function refreshAttendanceDom(){
 const element=document.querySelector('.att-page');
 if(element){element.outerHTML=renderAttendance(knownPeople,knownAdmin);if(attendanceState.saving)for(const input of document.querySelectorAll('.att-page input,.att-page select,.att-page textarea'))input.disabled=true;}
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
 if(attendanceState.saving||attendanceState.scheduleSaving)return;
 const action=el.dataset.action;
 if(action==='attendance-refresh'){
  if(attendanceState.scheduleDirty&&!confirm('班表尚未儲存，確定重新讀取？'))return;
  changeAttendanceMonth(attendanceState.month,attendanceState.employeeId)
   .catch(e=>{attendanceNotice=e.message;refreshAttendanceDom();});
 }else if(action==='attendance-copy-previous'){
  if(copyPreviousAttendance()){attendanceNotice='已帶入前一天時間，請核對後儲存。';refreshAttendanceDom();}
 }else if(action==='attendance-schedule-save'){
  saveAttendanceSchedule().then(()=>attendanceNotice='班表已儲存；既有出勤紀錄不變。').catch(e=>attendanceNotice=e.message).finally(refreshAttendanceDom);refreshAttendanceDom();
 }else if(action==='attendance-edit'){
  if(attendanceState.dirty&&!confirm('目前出勤尚未正式儲存，確定切換日期？'))return;
  attendanceNotice='';attendanceSelectDate(el.dataset.date);refreshAttendanceDom();
  document.querySelector('.att-layout')?.scrollIntoView({behavior:'smooth',block:'start'});
 }else if(action==='attendance-discard'){
  if(!attendanceState.saving&&confirm('確定捨棄未儲存的出勤草稿？待同步請求需另外處理。')){discardAttendanceDraft();refreshAttendanceDom();}
 }else if(action==='attendance-save'){
  attendanceNotice='正在儲存出勤紀錄…';
  submitAttendance().then(()=>attendanceNotice='出勤紀錄已成功儲存至 Google Sheets／本機展示資料。')
   .catch(e=>attendanceNotice='無法儲存：'+e.message).finally(refreshAttendanceDom);
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
 if(el.matches('[data-att-field]'))updateAttendance(el.dataset.attField,el.value);
 if(el.matches('[data-att-config]'))updateAttendanceConfig(el.dataset.attConfig,el.value);
});
document.addEventListener('change',event=>{
 const el=event.target;
 if(!el.closest('.att-page'))return;
 if(attendanceState.saving||attendanceState.scheduleSaving){refreshAttendanceDom();return;}
 if(el.matches('[data-att-schedule]')){updateAttendanceSchedule(el.dataset.attSchedule,el.value);refreshAttendanceDom();return;}
 if(el.matches('[data-att-person]')||el.matches('[data-att-month]')){
  if((attendanceState.dirty||attendanceState.scheduleDirty)&&!confirm('出勤資料或班表尚未儲存，確定要切換？')){refreshAttendanceDom();return;}
  const month=el.matches('[data-att-month]')?el.value:attendanceState.month;
  const employee=el.matches('[data-att-person]')?el.value:attendanceState.employeeId;
  if(el.matches('[data-att-person]')){
   const ok=document.dispatchEvent(new CustomEvent('workpulse:select-person',{detail:{id:employee},cancelable:true}));
   if(!ok){refreshAttendanceDom();return;}
  }
  changeAttendanceMonth(month,employee).catch(e=>{attendanceNotice=e.message;refreshAttendanceDom();});return;
 }
 if(el.matches('[data-att-date]')){
  if(attendanceState.dirty&&!confirm('出勤資料尚未儲存，確定要切換日期？')){refreshAttendanceDom();return;}
  const date=el.value;
  if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)){attendanceNotice='日期格式無效';refreshAttendanceDom();return;}
  if(date.slice(0,7)!==attendanceState.month){
   if(attendanceState.scheduleDirty&&!confirm('班表尚未儲存，確定切換月份？')){refreshAttendanceDom();return;}
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

