import { localISODate,shiftDate } from '../../shared/utils.js';

export function validReportDate(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return false;
 const value=new Date(date+'T00:00:00Z');
 return !Number.isNaN(value.getTime()) && value.toISOString().slice(0,10)===date;
}
export function validateReportPeriod({startDate,endDate}){
 if(!validReportDate(startDate)||!validReportDate(endDate))return '請填寫正確的起訖日期';
 const span=(Date.parse(endDate+'T00:00:00Z')-Date.parse(startDate+'T00:00:00Z'))/86400000;
 if(span<0||span>365)return '查詢日期須由早到晚，且最多 366 天';
 return '';
}
/** Mutates the caller's filters, preserving existing unrelated report choices. */
export function applyReportPeriod(filters,period,today){
 const [year,month]=today.slice(0,7).split('-').map(Number);
 if(period==='month'){
  filters.startDate=today.slice(0,7)+'-01';
  filters.endDate=today;
 }else if(period==='previous'){
  filters.startDate=localISODate(new Date(year,month-2,1));
  filters.endDate=localISODate(new Date(year,month-1,0));
 }else if(period==='quarter'){
  filters.startDate=shiftDate(today,-89);
  filters.endDate=today;
 }
 return filters;
}
