import test from 'node:test';
import assert from 'node:assert/strict';
import {minutesBetween,overtimeMinutes,payEstimate,validateAttendanceDraft,weekdayLabel,
 weekdayCount,attendanceSummary} from '../src/features/attendance/attendance.js';
import {attendanceState,loadAttendance} from '../src/features/attendance/attendance-state.js';
const draft=(overrides={})=>({date:'2026-11-25',dayType:'workday',startTime:'09:00',endTime:'18:00',
 breakMinutes:60,leaveType:'none',leaveMinutes:0,notes:'',...overrides});
test('workday records exact minutes, subtracts break and computes standard overtime',()=>{
 assert.equal(minutesBetween('09:00','18:00',60),480);
 assert.equal(minutesBetween('09:00','20:00',60),600);
 assert.equal(overtimeMinutes('workday',600),120);
 assert.equal(validateAttendanceDraft(draft()).workedMinutes,480);
});
test('overnight attendance is recognized without a negative duration',()=>{
 assert.equal(minutesBetween('22:00','06:00',60),420);
 assert.equal(validateAttendanceDraft(draft({startTime:'22:00',endTime:'06:00'})).workedMinutes,420);
});
test('monthly wage statutory normal day rates match Ministry of Labor example',()=>{
 const wage=30000;
 assert.equal(payEstimate('workday',660,wage),541.67);
 assert.equal(payEstimate('rest',360,wage),1166.67);
 assert.equal(payEstimate('holiday',360,wage),1000);
 assert.equal(Math.round((payEstimate('workday',660,wage)+payEstimate('rest',360,wage)+payEstimate('holiday',360,wage))*100)/100,2708.34);
});
test('rest-day hour nine onward uses 8/3, and short holiday still adds a full daily wage',()=>{
 assert.equal(payEstimate('rest',600,30000),2250);
 assert.equal(payEstimate('holiday',120,30000),1000);
 assert.equal(payEstimate('holiday',540,30000),1166.67);
});
test('weekly regular day cannot be auto-estimated and zero wages must not invent pay',()=>{
 assert.equal(payEstimate('weekly',120,30000),null);
 assert.equal(payEstimate('workday',600,null),null);
 assert.equal(payEstimate('rest',0,null),0);
});
test('leave minutes and day-type input are validated',()=>{
 assert.throws(()=>validateAttendanceDraft(draft({leaveType:'none',leaveMinutes:120})),/請假/);
 assert.throws(()=>validateAttendanceDraft(draft({dayType:'unknown'})),/出勤日別/);
 assert.throws(()=>validateAttendanceDraft(draft({startTime:'08:00',endTime:'23:00'})),/12 小時/);
 assert.equal(validateAttendanceDraft(draft({leaveType:'annual',leaveMinutes:240})).leaveMinutes,240);
});
test('monthly summary supports expected-day override and fractional leave days',()=>{
 const data=[
  {date:'2026-11-25',workedMinutes:480,overtimeMinutes:0,leaveMinutes:0,overtimePay:0},
  {date:'2026-11-26',workedMinutes:600,overtimeMinutes:120,leaveMinutes:120,overtimePay:400},
  {date:'2026-11-27',workedMinutes:0,overtimeMinutes:0,leaveMinutes:480,overtimePay:0}
 ];
 const sum=attendanceSummary(data,'2026-11',21,36000);
 assert.equal(sum.workedMinutes,1080);assert.equal(sum.overtimeMinutes,120);
 assert.equal(sum.leaveMinutes,600);assert.equal(sum.leaveDays,1.25);
 assert.equal(sum.totalPay,400);assert.equal(sum.expectedDays,21);
 assert.equal(sum.expectedIsEstimate,false);
});
test('without wage configuration total money remains unestimated, but hour totals remain correct',()=>{
 const s=attendanceSummary([{date:'2026-11-25',workedMinutes:600,overtimeMinutes:120,
   leaveMinutes:0,overtimePay:null}],'2026-11',null);
 assert.equal(s.totalPay,null);assert.equal(s.overtimeMinutes,120);
 assert.equal(s.expectedDays,weekdayCount('2026-11'));
 assert.equal(s.expectedIsEstimate,true);
});
test('weekday labels use Taiwan local calendar dates, without browser timezone shifts',()=>{
 assert.equal(weekdayLabel('2026-11-25'),'三');
 assert.equal(weekdayLabel('2026-11-29'),'日');
});

test('the same attendance rows are recalculated immediately for a different temporary salary',()=>{
 const rows=[{date:'2026-11-25',dayType:'workday',workedMinutes:600,overtimeMinutes:120,
   leaveMinutes:0,overtimePay:999999,monthlyWage:990000}];
 const low=attendanceSummary(rows,'2026-11',21,30000);
 const high=attendanceSummary(rows,'2026-11',21,45000);
 assert.equal(low.totalPay,333.33);
 assert.equal(high.totalPay,500);
 assert.equal(attendanceSummary(rows,'2026-11',21,null).totalPay,null);
 // The stored values must never participate in the calculation.
 assert.deepEqual(rows[0].overtimePay,999999);
});
test('zero overtime means zero pay without salary input, not a fabricated debt',()=>{
 const rows=[{date:'2026-11-25',dayType:'workday',workedMinutes:480,overtimeMinutes:0,leaveMinutes:0}];
 assert.equal(attendanceSummary(rows,'2026-11',21,null).totalPay,0);
});

test('attendance state no longer includes website salary input',()=>{assert.equal(Object.hasOwn(attendanceState,'temporarySalary'),false);});
