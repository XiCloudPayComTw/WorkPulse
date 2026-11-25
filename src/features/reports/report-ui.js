import { icon } from '../../shared/icons.js';
import { CATEGORIES, STATUSES } from '../journals/data.js';
import { esc, formatDate, formatHours, localISODate, shiftDate } from '../../shared/utils.js';

const options=(rows,value)=>rows.map(([id,name])=>`<option value="${esc(id)}" ${String(value)===String(id)?'selected':''}>${esc(name)}</option>`).join('');
function filterSelect(label,field,values,selected){return `<label class="form-group"><span class="field-label">${label}</span><select class="input" data-report-filter="${field}">${options([['all','全部'],...values],selected)}</select></label>`;}
function barList(rows,emptyText='此區間沒有可供統計的資料'){
 const max=Math.max(1,...rows.map(x=>x.hours));
 return rows.length?`<div class="report-bars">${rows.slice(0,8).map(x=>`<div class="report-bar-line"><div class="report-bar-meta"><span title="${esc(x.label)}">${esc(x.label)}</span><span>${formatHours(x.hours)} · ${x.tasks} 項</span></div><div class="progress-track report-bar"><div class="progress-fill" style="width:${Math.max(2,Math.min(100,x.hours/max*100))}%"></div></div></div>`).join('')}</div>`:`<p class="small muted">${emptyText}</p>`;
}
function metric(label,value,caption,symbol){return `<div class="soft-card report-metric"><span class="report-metric-icon">${icon(symbol,17)}</span><div class="report-metric-label">${label}</div><div class="report-metric-value">${value}</div><div class="xs muted">${caption}</div></div>`;}
function summary(report){return `<div class="report-metrics">${metric('工作項目',report.count,'符合篩選條件的工作','list')}${metric('累計工時',formatHours(report.hours),'依工作項目加總','clock')}${metric('完成率',`${report.rate}%`,`${report.completed} 項已完成`,'checkCircle')}${metric('有紀錄日期',report.days,'不等同出勤天數','calendar')}</div>`;}
function groupTable(rows,heading){
 return `<section class="soft-card report-panel"><div class="report-panel-header"><div><h3>${heading}</h3><p>依篩選結果彙整，可用於工作量分析</p></div>${icon('chart',18)}</div><div class="report-table-scroll"><table class="report-table"><thead><tr><th scope="col">名稱</th><th scope="col">項目</th><th scope="col">工時</th><th scope="col">完成率</th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><th scope="row">${esc(x.label)}</th><td>${x.tasks}</td><td>${formatHours(x.hours)}</td><td>${x.rate}%</td></tr>`).join(''):`<tr><td colspan="4" class="report-table-empty">無資料</td></tr>`}</tbody></table></div></section>`;
}
function detailTable(rows){return `<section class="soft-card report-panel report-detail"><div class="report-panel-header"><div><h3>工作明細</h3><p>依日期排序，畫面最多顯示前 120 項；匯出包含全部查詢結果。</p></div><span class="tag">${rows.length} 項</span></div><div class="report-table-scroll"><table class="report-table"><thead><tr><th scope="col">日期 / 人員</th><th scope="col">專案 / 工作項目</th><th scope="col">狀態</th><th scope="col">工時</th></tr></thead><tbody>${rows.length?rows.slice(0,120).map(t=>`<tr><td class="report-date-cell"><span>${esc(t.date)}</span><small>${esc(t.employeeName)} · ${esc(t.departmentName)}</small></td><td><span class="report-task-title">${esc(t.title)}</span><small>${esc(t.project)} / ${esc(t.category)}</small>${t.result?`<small>成果：${esc(t.result)}</small>`:''}</td><td><span class="tag ${esc(t.status)}">${STATUSES[t.status]||esc(t.status)}</span></td><td>${formatHours(t.hours)}</td></tr>`).join(''):`<tr><td colspan="4" class="report-table-empty">無工作明細</td></tr>`}</tbody></table></div></section>`;}
export function renderReportWorkspace({filters,phase,error,report,meta,cloud,stale}) {
 const personOpts=(meta.employees||[]).map(e=>[e.id,e.name]);
 const deptOpts=(meta.departments||[]).map(d=>[d.id,d.name]);
 const now=localISODate();const [year,month]=now.slice(0,7).split('-').map(Number);
 const currentActive=filters.startDate===now.slice(0,7)+'-01'&&filters.endDate===now;
 const lastActive=filters.startDate===localISODate(new Date(year,month-2,1))&&filters.endDate===localISODate(new Date(year,month-1,0));
 const ninetyActive=filters.startDate===shiftDate(now,-89)&&filters.endDate===now;
 const projectNames=[...new Set([...(meta.projects||[]),...(report?.byProject||[]).map(x=>x.id)])].filter(x=>x && x!=='未指定專案').sort();
 return `<div class="report-screen">
 <section class="soft-card card-pad-lg report-toolbar">
  <div class="row-between report-toolbar-heading"><div><div class="overline">MONTHLY & CUSTOM REPORTS</div><h2 class="card-title">工作成果報表</h2><p class="card-sub">查閱每日進展，按人員、部門或專案分析實際工作內容。</p></div><span class="report-scope-tag">${icon('shield',15)} ${cloud?'依登入權限查詢':'本機展示資料'}</span></div>
  <div class="report-quick-range" role="group" aria-label="快速設定日期區間"><button class="soft-button sm ${currentActive?'active':''}" aria-pressed="${currentActive}" data-action="report-period" data-period="month">本月</button><button class="soft-button sm ${lastActive?'active':''}" aria-pressed="${lastActive}" data-action="report-period" data-period="previous">上個月</button><button class="soft-button sm ${ninetyActive?'active':''}" aria-pressed="${ninetyActive}" data-action="report-period" data-period="quarter">近 90 天</button></div>
  <div class="report-filter-grid">
   <label class="form-group"><span class="field-label">起始日期</span><input class="input" data-report-filter="startDate" type="date" value="${esc(filters.startDate)}" /></label>
   <label class="form-group"><span class="field-label">結束日期</span><input class="input" data-report-filter="endDate" type="date" value="${esc(filters.endDate)}" /></label>
   ${filterSelect('員工','employeeId',personOpts,filters.employeeId)}
   ${filterSelect('部門','departmentId',deptOpts,filters.departmentId)}
   ${filterSelect('專案','project',projectNames.map(x=>[x,x]),filters.project)}
   ${filterSelect('工作類型','category',CATEGORIES.map(x=>[x,x]),filters.category)}
   ${filterSelect('完成狀態','status',Object.entries(STATUSES).map(([x,v])=>[x,v]),filters.status)}
  </div>
  <div class="report-action-row"><div class="report-action-hint">${cloud?'日期或條件改變後，按「查詢報表」讀取授權資料。':'本機資料會依篩選條件即時重新計算。'}</div><button class="soft-button primary" data-action="report-run" ${phase==='loading'?'disabled aria-busy="true"':''}>${icon('search',16)} ${phase==='loading'?'查詢中…':'查詢報表'}</button></div>
 </section>
 ${phase==='loading'?`<section class="soft-card report-feedback" role="status"><span class="sync-dot loading"></span> 正在安全讀取工作資料…</section>`:''}
 ${phase==='error'?`<section class="notice section-space" role="alert">${icon('alert',18)} <div>${esc(error||'報表查詢失敗')}。請調整條件後重新查詢，未確認的資料不會拿來匯出。</div></section>`:''}
 ${cloud&&stale&&phase!=='loading'?`<div class="notice section-space">${icon('info',18)} <div>查詢條件已改變。請點選「查詢報表」，再查看與匯出最新結果。</div></div>`:''}
 ${report&&!stale?`${summary(report)}
 <div class="report-export-row"><p class="small muted">共 ${report.count} 項，${formatDate(filters.startDate,false)} 至 ${formatDate(filters.endDate,false)}。工時不代表出勤或加班時數。</p><div class="row report-export-actions"><button class="soft-button sm" data-action="report-export-csv">${icon('download',16)} CSV 明細</button><button class="soft-button primary sm" data-action="report-export-xlsx">${icon('download',16)} Excel 報表</button></div></div>
 <div class="report-summary-grid"><section class="soft-card report-panel"><div class="report-panel-header"><div><h3>專案工時分布</h3><p>依查詢範圍、專案與工作狀態統計</p></div>${icon('folder',18)}</div>${barList(report.byProject)}</section><section class="soft-card report-panel"><div class="report-panel-header"><div><h3>每日投入趨勢</h3><p>顯示最近 20 個有紀錄的工作日</p></div>${icon('chart',18)}</div>${barList(report.byDay.slice(-20))}</section></div>
 <div class="report-summary-grid">${groupTable(report.byEmployee,'員工工作統計')}${groupTable(report.byDepartment,'部門工作統計')}</div>
 ${detailTable(report.rows)}
 `:phase==='idle'||stale?`<section class="soft-card report-feedback">${icon('search',21)} <div><h3>設定條件後開始查詢</h3><p>報表會根據登入權限與日期區間顯示，並可下載 Excel。</p></div></section>`:''}
 </div>`;
}
