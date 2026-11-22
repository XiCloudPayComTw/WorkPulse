import { csvSafe } from './utils.js';

const byText = (a,b) => String(a).localeCompare(String(b),'zh-Hant');
const round = value => Math.round((Number(value)||0)*100)/100;

/** Report calculations are pure: caller supplies only journals already authorized by backend. */
export function buildReport(journals = [], employees = [], departments = [], filters = {}) {
  const people = new Map(employees.map(e=>[String(e.id),e]));
  const departmentNames = new Map(departments.map(d=>[String(d.id),String(d.name)]));
  const tasks = [];
  const dateSet = new Set();
  const peopleTotals = new Map(), departmentTotals = new Map(), projectTotals = new Map(), dailyTotals = new Map();
  const metrics = () => ({tasks:0,hours:0,completed:0,doing:0,blocked:0,days:new Set()});
  const update = (map,key,label,date,t) => {
    if(!map.has(key)) map.set(key,{id:key,label,...metrics()});
    const row=map.get(key);
    row.tasks+=1;row.hours+=t.hours;row.completed+=Number(t.status==='done');
    row.doing+=Number(t.status==='doing');row.blocked+=Number(t.status==='blocked');row.days.add(date);
  };
  for(const j of journals) {
    if (!j || (filters.startDate && j.date<filters.startDate) || (filters.endDate && j.date>filters.endDate)) continue;
    const person = people.get(String(j.employeeId)) || {id:j.employeeId,name:'未知人員',departmentId:''};
    const deptId=String(person.departmentId||'');
    if(filters.employeeId && filters.employeeId!=='all' && j.employeeId!==filters.employeeId)continue;
    if(filters.departmentId && filters.departmentId!=='all' && deptId!==filters.departmentId)continue;
    const deptName=departmentNames.get(deptId)||'未分配部門';
    for(const task of j.tasks||[]) {
      if(filters.project && filters.project!=='all' && (task.project||'')!==filters.project)continue;
      if(filters.category && filters.category!=='all' && task.category!==filters.category)continue;
      if(filters.status && filters.status!=='all' && task.status!==filters.status)continue;
      const row={date:String(j.date),employeeId:String(j.employeeId),employeeName:String(person.name),departmentId:deptId,departmentName:deptName,
        project:String(task.project||'未指定專案'),category:String(task.category||''),title:String(task.title||''),description:String(task.description||''),
        result:String(task.result||''),status:String(task.status||''),hours:round(task.hours),note:String(j.note||''),tomorrow:String(j.tomorrow||'')};
      tasks.push(row);dateSet.add(j.date);
      update(peopleTotals,row.employeeId,row.employeeName,j.date,row);
      update(departmentTotals,deptId,deptName,j.date,row);
      update(projectTotals,row.project,row.project,j.date,row);
      update(dailyTotals,j.date,j.date,j.date,row);
    }
  }
  const done=tasks.filter(t=>t.status==='done').length;
  const hours=round(tasks.reduce((sum,t)=>sum+t.hours,0));
  const normalize = map => [...map.values()].map(({days,...r})=>({...r,hours:round(r.hours),days:days.size,rate:r.tasks?Math.round(r.completed/r.tasks*100):0}))
    .sort((a,b)=>b.hours-a.hours||byText(a.label,b.label));
  return {rows:tasks.sort((a,b)=>b.date.localeCompare(a.date)||byText(a.employeeName,b.employeeName)),
    count:tasks.length,hours,completed:done,pending:tasks.length-done,rate:tasks.length?Math.round(done/tasks.length*100):0,days:dateSet.size,
    byEmployee:normalize(peopleTotals),byDepartment:normalize(departmentTotals),byProject:normalize(projectTotals),
    byDay:normalize(dailyTotals).sort((a,b)=>a.id.localeCompare(b.id))};
}

export const REPORT_HEADERS = ['日期','員工','部門','專案','工作類型','工作項目','工作內容','成果／交付物','狀態','工時','當日備註','後續工作'];
const labels={done:'已完成',doing:'進行中',blocked:'待處理'};
export function reportTaskTable(report) {
  return [REPORT_HEADERS,...report.rows.map(t=>[t.date,t.employeeName,t.departmentName,t.project,t.category,t.title,t.description,t.result,labels[t.status]||t.status,t.hours,t.note,t.tomorrow])];
}
export function reportCsv(report) {
  return '\uFEFF'+reportTaskTable(report).map(row=>row.map(csvSafe).join(',')).join('\r\n');
}
export function reportSheets(report,filter={}) {
  const overview=[['WorkPulse 工作日誌統計'],['日期起',filter.startDate||''],['日期迄',filter.endDate||''],['工作項目數',report.count],['累計工時',report.hours],['完成件數',report.completed],['完成率',`${report.rate}%`],['有紀錄日期',report.days],['說明','統計只包含目前篩選且有權限查閱的資料；工時不是工資或出勤工時。']];
  const groupSheet=(title,rows)=>[[title,'項目數','工時','完成數','完成率','紀錄天數'],...rows.map(x=>[x.label,x.tasks,x.hours,x.completed,`${x.rate}%`,x.days])];
  return [
    {name:'統計總覽',rows:overview},
    {name:'工作明細',rows:reportTaskTable(report)},
    {name:'人員統計',rows:groupSheet('人員',report.byEmployee)},
    {name:'部門統計',rows:groupSheet('部門',report.byDepartment)},
    {name:'專案統計',rows:groupSheet('專案',report.byProject)},
    {name:'每日趨勢',rows:groupSheet('日期',report.byDay)},
  ];
}
