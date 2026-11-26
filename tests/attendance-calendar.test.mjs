import test from 'node:test';
import assert from 'node:assert/strict';
import {attendanceMonthDates,attendancePlannedDay,attendanceCalendar,previousAttendanceTimes} from '../src/features/attendance/calendar.js';
test('calendar handles leap years and invalid months',()=>{
 assert.equal(attendanceMonthDates('2024-02').length,29);assert.equal(attendanceMonthDates('2025-02').length,28);assert.deepEqual(attendanceMonthDates('2026-13'),[]);
});
test('calendar uses explicit schedule and does not classify today or future as missing',()=>{
 const days=attendanceCalendar('2026-11',[],{'2026-11-23':'holiday','2026-11-22':'workday'},'2026-11-24');
 const find=d=>days.find(x=>x.date===d);
 assert.equal(find('2026-11-22').missing,true);assert.equal(find('2026-11-23').missing,false);
 assert.equal(find('2026-11-24').missing,false);assert.equal(find('2026-11-25').missing,false);
 assert.equal(attendancePlannedDay('2026-11-21'),'rest');
});
test('calendar flags actual vs planned mismatch without changing recorded day',()=>{
 const row={date:'2026-11-23',dayType:'weekly',workedMinutes:300,leaveMinutes:0,startTime:'08:00',endTime:'13:00'};
 const day=attendanceCalendar('2026-11',[row],{},'2026-11-26').find(x=>x.date===row.date);
 assert.equal(day.status,'review');assert.equal(day.row.dayType,'weekly');assert.equal(day.issues.length,2);
});
test('copy uses exact preceding day, same employee, and only time fields',()=>{
 const rows=[{employeeId:'a',date:'2026-11-25',startTime:'08:00',endTime:'17:00',breakMinutes:60,notes:'secret',dayType:'rest'}];
 assert.deepEqual(previousAttendanceTimes(rows,'2026-11-26','a'),{startTime:'08:00',endTime:'17:00',breakMinutes:60});
 assert.equal(previousAttendanceTimes(rows,'2026-11-26','b'),null);assert.equal(previousAttendanceTimes(rows,'2026-11-27','a'),null);
});
