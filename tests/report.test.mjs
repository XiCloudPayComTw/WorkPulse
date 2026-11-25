import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, reportCsv, reportSheets } from '../src/features/reports/reports.js';
import { buildXlsx } from '../src/shared/xlsx.js';

const employees=[{id:'a',name:'甲同事',departmentId:'d1'},{id:'b',name:'乙同事',departmentId:'d2'}];
const departments=[{id:'d1',name:'設計部'},{id:'d2',name:'工程部'}];
const journals=[
 {date:'2026-11-01',employeeId:'a',note:'今日備註',tomorrow:'明日計畫',tasks:[
  {title:'完成設定頁',project:'WorkPulse',category:'前端開發',status:'done',hours:2.5,description:'設定介面',result:'已交付'},
  {title:'討論案場',project:'新店',category:'展店設計',status:'doing',hours:1.25,description:'會議',result:''}]},
 {date:'2026-11-02',employeeId:'b',tasks:[{title:'=HYPERLINK("bad")',project:'WorkPulse',category:'前端開發',status:'blocked',hours:3,description:'危險字串',result:''}]},
 {date:'2026-12-01',employeeId:'a',tasks:[{title:'十二月工作',project:'新店',category:'前端開發',status:'done',hours:4}]},
];
const bounds={startDate:'2026-11-01',endDate:'2026-11-30'};

test('report aggregates only tasks in inclusive range, with accurate dimensions',()=>{
 const r=buildReport(journals,employees,departments,bounds);
 assert.equal(r.count,3);assert.equal(r.hours,6.75);assert.equal(r.completed,1);assert.equal(r.rate,33);assert.equal(r.days,2);
 assert.equal(r.byEmployee.length,2);assert.equal(r.byProject.find(x=>x.id==='WorkPulse').hours,5.5);
 assert.equal(r.byDepartment.find(x=>x.id==='d1').tasks,2);
 assert.equal(r.byDay[0].id,'2026-11-01');
});
test('report combines employee, department, project, category and status filters',()=>{
 const r=buildReport(journals,employees,departments,{...bounds,employeeId:'a',departmentId:'d1',project:'WorkPulse',category:'前端開發',status:'done'});
 assert.equal(r.count,1);assert.equal(r.hours,2.5);
 assert.equal(buildReport(journals,employees,departments,{...bounds,employeeId:'b',status:'done'}).count,0);
});
test('empty report has zero completion and non-NaN totals',()=>{
 const r=buildReport([],[],[],bounds);
 assert.deepEqual([r.count,r.rate,r.hours,r.days],[0,0,0,0]);
 assert.deepEqual(r.byEmployee,[]);
});
test('CSV protects formula-looking user text, includes BOM and quotes',()=>{
 const r=buildReport(journals,employees,departments,bounds);
 const csv=reportCsv(r);
 assert.ok(csv.startsWith('\uFEFF'));
 assert.ok(csv.includes("'=HYPERLINK"));
 assert.ok(csv.includes('工作內容'));
});
test('report XLSX contains six Excel worksheets and safe typed strings',async()=>{
 const r=buildReport(journals,employees,departments,bounds);
 const sheets=reportSheets(r,bounds);assert.equal(sheets.length,6);
 const blob=buildXlsx(sheets);
 const bytes=new Uint8Array(await blob.arrayBuffer());
 assert.equal(String.fromCharCode(...bytes.subarray(0,2)),'PK');
 const asString=new TextDecoder().decode(bytes);
 assert.ok(asString.includes('xl/worksheets/sheet6.xml'));
 assert.ok(asString.includes('HYPERLINK'));
 assert.ok(!asString.includes('<f>'));
 assert.ok(asString.includes('<c r="F4" t="inlineStr">'));
});
test('XLSX accepts long spreadsheet text as UTF-8, rejects unsafe sheet names',async()=>{
 const x=buildXlsx([{name:'設計回顧',rows:[['測試','繁體中文'],['=SUM(1,1)',123.75]]}]);
 assert.ok((await x.arrayBuffer()).byteLength>400);
 assert.throws(()=>buildXlsx([{name:'[invalid]',rows:[]}]),/名稱/);
});
