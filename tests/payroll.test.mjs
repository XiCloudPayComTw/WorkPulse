import test from 'node:test';
import assert from 'node:assert/strict';
import {previousCompletedMonth,payrollPeriod,payrollDays,buildPayrollReport,buildAttendanceExportReport} from '../src/features/payroll/payroll.js';
import {payrollWorkbookSheets,createPayrollXlsx} from '../src/features/payroll/payroll-xlsx.js';

function sampleRows(){
 return [
  {date:'2026-11-02',employeeId:'E1',dayType:'workday',startTime:'09:00',
   endTime:'20:00',workedMinutes:600,overtimeMinutes:120,breakMinutes:60,
   leaveType:'none',leaveMinutes:0,notes:'例行開發',revision:1,overtimePay:9999999},
  {date:'2026-11-07',employeeId:'E1',dayType:'rest',startTime:'09:00',
   endTime:'15:00',workedMinutes:360,overtimeMinutes:360,breakMinutes:0,
   leaveType:'none',leaveMinutes:0,notes:'週六支援',revision:2},
  {date:'2026-12-01',employeeId:'E1',dayType:'weekly',startTime:'09:00',
   endTime:'11:00',workedMinutes:120,overtimeMinutes:120,breakMinutes:0,
   leaveType:'none',leaveMinutes:0,notes:'例假出勤',revision:1}
 ];
}
function makeReport(start='2026-11-01',end='2026-11-30'){
 return buildPayrollReport({employeeId:'E1',employeeName:'小明',startDate:start,endDate:end,
 monthlyWage:36000,rows:sampleRows(),today:new Date(2027,0,9,12)});
}
test('default period is the whole previous month, including year transitions',()=>{
 assert.deepEqual(previousCompletedMonth(new Date(2026,11,2,12)),
   {startDate:'2026-11-01',endDate:'2026-11-30'});
 assert.deepEqual(previousCompletedMonth(new Date(2027,0,2,12)),
   {startDate:'2026-12-01',endDate:'2026-12-31'});
});
test('leap years follow native Gregorian calendar without external fetch',()=>{
 assert.deepEqual(previousCompletedMonth(new Date(2024,2,10,12)),
   {startDate:'2024-02-01',endDate:'2024-02-29'});
 assert.deepEqual(previousCompletedMonth(new Date(2025,2,10,12)),
   {startDate:'2025-02-01',endDate:'2025-02-28'});
 assert.deepEqual(previousCompletedMonth(new Date(2024,4,10,12)),
   {startDate:'2024-04-01',endDate:'2024-04-30'});
});
test('custom date ranges are validated and inclusive',()=>{
 assert.equal(payrollPeriod('2026-11-30','2026-12-01',new Date(2026,11,2)).days,2);
 assert.deepEqual(payrollDays('2026-11-30','2026-12-01'),['2026-11-30','2026-12-01']);
 assert.throws(()=>payrollPeriod('2025-02-29','2025-03-01'),/日期不存在/);
 assert.throws(()=>payrollPeriod('2026-12-01','2026-11-30'),/結束日期/);
 assert.throws(()=>payrollPeriod('2025-01-01','2026-02-01'),/366/);
 assert.throws(()=>payrollPeriod('2026-12-01','2026-12-30',new Date(2026,11,2)),/未來/);
});
test('payroll report contains all calendar dates, flags missing entries rather than zero attendance',()=>{
 const report=makeReport();
 assert.equal(report.days,30);
 assert.equal(report.recordedDays,2);
 assert.equal(report.missingDays,28);
 assert.equal(report.estimatedWorkingDays,21);
 assert.equal(report.leaveDays,0);
 assert.equal(report.rows[0].status,'未登記');
 assert.equal(report.rows[1].status,'已登記');
 assert.equal(report.workHours,16);
 assert.equal(report.overtimeHours,8);
 assert.equal(report.knownPaySubtotal,1800);
 assert.equal(report.rows[1].pay,400); // 2 hours * 4/3 * 150
 assert.equal(report.rows[6].pay,1400); // rest: 2 hours *4/3 + 4 hours *5/3
 assert.equal(report.rows[1].overtimePay,undefined);
});
test('monthly salary is applied only in returned local report object, not source rows',()=>{
 const source=sampleRows(),copy=JSON.stringify(source);
 const r=buildPayrollReport({employeeId:'E1',employeeName:'小明',startDate:'2026-11-01',
  endDate:'2026-11-30',monthlyWage:45000,rows:source,today:new Date(2027,0,9)});
 assert.equal(r.knownPaySubtotal,2250);
 assert.equal(JSON.stringify(source),copy);
 assert.throws(()=>buildPayrollReport({employeeId:'E1',startDate:'2026-11-01',
  endDate:'2026-11-30',monthlyWage:null,rows:source,today:new Date(2027,0,9)}),/月薪/);
});
test('cross-month queries combine records and warn about weekly rest-day manual calculation',()=>{
 const report=makeReport('2026-11-30','2026-12-02');
 assert.equal(report.days,3);
 assert.equal(report.recordedDays,1);
 assert.equal(report.manualReviewDays,1);
 assert.equal(report.totalPay,null);
 assert.equal(report.rows[1].status,'需人工核對');
});
test('xlsx export has three colored, merged, formula-backed worksheets',async()=>{
 const report=makeReport();
 const sheets=payrollWorkbookSheets(report);
 assert.deepEqual(sheets.map(s=>s.name),['試算總覽','出勤明細','計算依據']);
 assert.equal(sheets[0].rows[5][1].v,36000);
 assert.equal(sheets[1].rows.length>=40,true);
 const blob=createPayrollXlsx(report);
 assert.ok(blob.size>15000);
 const bytes=new Uint8Array(await blob.arrayBuffer()),parts=new Map();
 const decoder=new TextDecoder();
 for(let p=0;p<bytes.length-30;){
  const dv=new DataView(bytes.buffer,bytes.byteOffset+p);
  if(dv.getUint32(0,true)!==0x04034b50)break;
  const nameLen=dv.getUint16(26,true),extra=dv.getUint16(28,true),
    size=dv.getUint32(18,true);
  const name=decoder.decode(bytes.slice(p+30,p+30+nameLen));
  const start=p+30+nameLen+extra;
  parts.set(name,decoder.decode(bytes.slice(start,start+size)));
  p=start+size;
 }
 assert.equal(parts.size,8);
 assert.match(parts.get('xl/styles.xml'),/FFEAF2F7|FF203F57/);
 assert.match(parts.get('xl/worksheets/sheet1.xml'),/mergeCells/);
 assert.match(parts.get('xl/worksheets/sheet1.xml'),/B6/);
 assert.match(parts.get('xl/worksheets/sheet2.xml'),/MIN\(MAX\(H/);
 assert.match(parts.get('xl/worksheets/sheet2.xml'),/未登記/);
 assert.match(parts.get('xl/workbook.xml'),/fullCalcOnLoad="1"/);
 assert.doesNotMatch(parts.get('xl/worksheets/sheet2.xml'),/9999999/);
});
test('formula-injection-like remarks export as literal strings, never Excel formulas',async()=>{
 const rows=[{...sampleRows()[0],notes:'=HYPERLINK("https://evil.invalid","click")'}];
 const report=buildPayrollReport({employeeId:'E1',employeeName:'小明',
 startDate:'2026-11-02',endDate:'2026-11-02',monthlyWage:30000,
 rows,today:new Date(2027,0,1)});
 const sheets=payrollWorkbookSheets(report),day=sheets[1].rows[8];
 assert.equal(day[11].v,'=HYPERLINK("https://evil.invalid","click")');
 assert.equal(day[11].f,undefined);
 const xlsx=await createPayrollXlsx(report).arrayBuffer();
 assert.ok(xlsx.byteLength>10000);
});

test('Excel-only export leaves wages and cached amounts blank and marks scheduled missing days',async()=>{
 const report=buildAttendanceExportReport({employeeId:'E1',employeeName:'小明',startDate:'2026-11-01',endDate:'2026-11-30',payDate:'2026-12-10',rows:sampleRows(),today:new Date(2027,0,9),scheduleByMonth:{'2026-11':{days:{'2026-11-03':'holiday'}}}});
 assert.equal(report.monthlyWage,null);assert.equal(report.knownPaySubtotal,null);assert.equal(report.missingWorkDays,19);
 assert.equal(report.rows[1].pay,null);
 const sheets=payrollWorkbookSheets(report);assert.equal(sheets[0].rows[5][1].v,'');assert.equal(sheets[0].rows[5][4].cached,null);
 assert.equal(sheets[1].rows[9][8].cached,null);assert.ok(sheets.every(s=>s.protect));
 const xml=new TextDecoder().decode(await createPayrollXlsx(report).arrayBuffer());
 assert.match(xml,/sheetProtection sheet="1"/);assert.match(xml,/protection locked="0"/);assert.match(xml,/r="B6" t="inlineStr" s="16"/);assert.doesNotMatch(xml,/9999999/);
 assert.match(xml,/ISNUMBER/);
});
test('export excludes abnormal dates from automated Excel formulas',()=>{
 const report=buildAttendanceExportReport({employeeId:'E1',startDate:'2026-12-01',endDate:'2026-12-01',rows:sampleRows(),today:new Date(2027,0,9)});
 assert.equal(report.manualReviewDays,1);assert.equal(payrollWorkbookSheets(report)[1].rows[8][8].f,undefined);
});
