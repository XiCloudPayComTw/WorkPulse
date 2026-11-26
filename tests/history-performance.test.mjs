import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistorySelector,historyDetailPage} from '../src/features/journals/history-query.js';
import {monthStats} from '../src/features/journals/data.js';
import {descriptionSuggestions} from '../src/features/journals/description-memory.js';
function fixture(){
 const employees=Array.from({length:50},(_,i)=>({id:'e'+i,name:'同仁'+i}));
 const journals=Array.from({length:1500},(_,i)=>({id:'j'+i,date:'2026-11-'+String(Math.floor(i/50)+1).padStart(2,'0'),employeeId:'e'+i%50,tasks:Array.from({length:i<1000?7:6},(_,k)=>({category:k%2?'設計':'工務',description:'紀錄'+i+'-'+k,title:'工作',status:k%2?'done':'doing',hours:1}))}));
 return {employees,journals};
}
test('1500 journals and 10000 tasks aggregate without changing results or inputs',()=>{
 const {employees,journals}=fixture(),stats=monthStats({journals},'2026-11'),select=createHistorySelector(),filters={employee:'all',status:'all',query:''};
 const groups=select(journals,employees,'2026-11',filters);
 assert.equal(stats.count,10000);assert.equal(stats.hours,10000);assert.equal(stats.days,30);assert.equal(stats.byCategory.reduce((n,x)=>n+x.count,0),10000);
 assert.equal(stats.byDay.reduce((n,x)=>n+x.hours,0),10000);assert.equal(groups.length,30);assert.equal(groups.reduce((n,g)=>n+g.taskCount,0),10000);
 assert.equal(groups[0].date,'2026-11-30');assert.strictEqual(select(journals,employees,'2026-11',filters),groups);
 assert.equal(journals[0].tasks.length,7);
 const page=historyDetailPage(groups[0],9);assert.equal(page.total,50);assert.equal(page.pages,10);assert.equal(page.journals.length,5);assert.equal(page.start,45);assert.equal(historyDetailPage(groups[0],99).index,9);
});
test('history selector invalidates for filters, month, new records and employee names',()=>{
 const {employees,journals}=fixture(),select=createHistorySelector(),filters={employee:'e0',status:'done',query:'同仁0'};
 const first=select(journals,employees,'2026-11',filters);assert.equal(first.length,30);assert.ok(first.every(g=>g.journals.every(j=>j.employeeId==='e0'&&j.tasks.every(t=>t.status==='done'))));
 assert.equal(select(journals,employees,'2026-12',filters).length,0);
 const renamed=employees.map(e=>e.id==='e0'?{...e,name:'新名字'}:e);assert.equal(select(journals,renamed,'2026-11',filters).length,0);
 assert.equal(select(journals.slice(50),employees,'2026-11',filters).length,29);
});
test('suggestions stop after limit and preserve local priority, uniqueness and person boundaries',()=>{
 const storage={getItem:()=>JSON.stringify(['常用一','常用一','常用二'])};
 const journals=[{employeeId:'other',tasks:[{description:'其他人'}]},{employeeId:'e',tasks:[{description:'常用一'},{description:'第三'}]}];
 assert.deepEqual(descriptionSuggestions(storage,'e','',journals,3),['常用一','常用二','第三']);
 assert.deepEqual(descriptionSuggestions(storage,'e','常用一',journals),[]);
 assert.deepEqual(descriptionSuggestions(storage,'e','',journals,0),[]);
});
