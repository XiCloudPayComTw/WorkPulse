// A single-entry selector avoids retaining all historical searches in memory.
// Store updates replace journal / employee arrays; the selector never mutates its inputs.
export function createHistorySelector(){
 let previous=null;
 return function select(journals,employees,month,filters){
  const q=String(filters.query||'').trim().toLocaleLowerCase(),person=filters.employee,status=filters.status;
  if(previous&&previous.journals===journals&&previous.employees===employees&&previous.month===month&&previous.q===q&&previous.person===person&&previous.status===status)return previous.groups;
  const names=new Map(employees.map(e=>[e.id,e.name])),days=new Map();
  for(const j of journals){
   if(!j.date.startsWith(month)||(person!=='all'&&j.employeeId!==person))continue;
   const name=names.get(j.employeeId)||'未指定人員';
   const tasks=j.tasks.filter(t=>(status==='all'||t.status===status)&&(!q||[t.title,t.project,t.description,t.result,t.category,name].join(' ').toLocaleLowerCase().includes(q)));
   if(!tasks.length)continue;
   let g=days.get(j.date);if(!g){g={date:j.date,journals:[],taskCount:0,hours:0};days.set(j.date,g);}
   g.journals.push({...j,tasks});g.taskCount+=tasks.length;
   for(const task of tasks)g.hours+=Number(task.hours)||0;
  }
  const groups=[...days.values()].sort((a,b)=>b.date.localeCompare(a.date));
  previous={journals,employees,month,q,person,status,groups};return groups;
 };
}
export function historyDetailPage(group,page=0,pageSize=5){
 const size=Math.max(1,Math.min(10,Number.isInteger(pageSize)?pageSize:5)),total=group.journals.length;
 const pages=Math.max(1,Math.ceil(total/size)),index=Math.max(0,Math.min(pages-1,Number.isInteger(page)?page:0));
 const start=index*size;return {index,pages,total,start,end:Math.min(total,start+size),journals:group.journals.slice(start,start+size)};
}
