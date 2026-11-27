/**
 * Range reading for one selected employee. Salary inputs and computed money are
 * NEVER accepted, stored, or returned by this endpoint.
 */
function wpAttendanceRange(input,token){
 wpFieldAccess_(token);
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('試算期間查詢格式錯誤');
 if(Object.prototype.hasOwnProperty.call(input,'monthlyWage')||
    Object.prototype.hasOwnProperty.call(input,'salary')||
    Object.prototype.hasOwnProperty.call(input,'overtimePay'))
   throw Error('薪資不得傳送至 Google Apps Script');
 var a=wpDate_(input.startDate),b=wpDate_(input.endDate);
 if(b<a)throw Error('結束日期不可早於開始日期');
 var start=new Date(a+'T00:00:00Z'),end=new Date(b+'T00:00:00Z');
 var span=Math.round((end.getTime()-start.getTime())/86400000)+1;
 if(span<1||span>366)throw Error('單次查詢範圍不得超過 366 天');
 var id=String(input.employeeId||''),control=wsBook_();
 wpAttEmployee_(control,id);
 var months=wpMonthRange_(a,b),output=[],scheduleByMonth={};
 months.forEach(function(month){
  var file=wpMonthFile_(control,month,false),schedule=wpAttSchedule_(control,id,month);
  scheduleByMonth[month]={days:schedule.days,revision:schedule.revision};
  wpAttRows_(file,id).forEach(function(row){
   if(row.date>=a&&row.date<=b){
    if(Object.prototype.hasOwnProperty.call(row,'overtimePay')||
       Object.prototype.hasOwnProperty.call(row,'monthlyWage'))
      throw Error('不允許回傳任何薪資資訊');
    output.push(row);
   }
  });
 });
 output.sort(function(x,y){return x.date.localeCompare(y.date);});
 return {employeeId:id,startDate:a,endDate:b,rows:output,recordCount:output.length,scheduleByMonth:scheduleByMonth};
}
