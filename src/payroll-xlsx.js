import {buildStyledXlsx} from './xlsx.js';
import {DAY_TYPES,LEAVE_TYPES} from './attendance.js';
const c=(v,s=6)=>({v,s});
const f=(formula,cached,s=7)=>({f:formula,cached,s});
const blank=(n=14)=>Array(n).fill(undefined);
const put=(rows,number,values)=>{rows[number-1]=[...values];};
const group=(rows,row,start,end,value,style)=>{const line=rows[row-1]||blank();line[start-1]=c(value,style);rows[row-1]=line;};
const fmt=(iso)=>iso.replace(/-/g,'/');
const detailPayFormula=(row)=>{
 const b="'試算總覽'!$B$6",hr=b+'/240';
 const work='ROUND((MIN(MAX(H'+row+',0),2)*4/3+MIN(MAX(H'+row+'-2,0),2)*5/3)*'+hr+',2)';
 const rest='ROUND((MIN(H'+row+',2)*4/3+MIN(MAX(H'+row+'-2,0),6)*5/3+MAX(H'+row+'-8,0)*8/3)*'+hr+',2)';
 const holiday='ROUND((8+MIN(MAX(G'+row+'-8,0),2)*4/3+MIN(MAX(G'+row+'-10,0),2)*5/3)*'+hr+',2)';
 return 'IF(OR(G'+row+'="",'+b+'=""),"",IF(C'+row+'="一般工作日",'+work+
  ',IF(C'+row+'="休息日",'+rest+',IF(C'+row+'="國定假日／特休出勤",'+holiday+',""))))';
};
const numeric=(minutes)=>minutes===null?null:minutes/60;
function makeDetail(report){
 const rows=[];
 put(rows,1,[c('WORKPULSE  /  ATTENDANCE DETAIL',1)]);
 put(rows,2,[c('員工：'+report.employeeName+'   |   期間：'+fmt(report.startDate)+' — '+fmt(report.endDate),2)]);
 put(rows,4,[c('每日出勤及加班費試算明細',3)]);
 put(rows,5,[c('金額依「試算總覽」B6 月薪基準及勞基法一般月薪制計算。黃色列為未登記，需核對；例假加班一律人工核算。',15)]);
 put(rows,7,[c('列有出勤紀錄的日期才能列入工時；未登記日期不可推定為缺勤、休假或零工時。',15)]);
 put(rows,8,['日期','星期','日別','上班','下班','休息（分鐘）','實際工時（h）','加班時數（h）','加班費（NT$）','請假類型','請假時數（h）','備註','資料狀態','修訂版本'].map(v=>c(v,4)));
 report.rows.forEach((r,index)=>{
  const row=index+9,zebra=index%2?6:5,number=index%2?8:7,money=index%2?10:9;
  if(r.status==='未登記'){
   put(rows,row,[c(r.date,11),c('週'+r.weekday,11),c('—',11),c('',11),c('',11),
    c('',11),c('',11),c('',11),c('',11),c('',11),c('',11),
    c('此日期尚無出勤資料',11),c('未登記',11),c('',11)]);
  }else{
   const pay=r.status==='需人工核對'?c('',11):f(detailPayFormula(row),r.pay,money);
   put(rows,row,[c(r.date,zebra),c('週'+r.weekday,zebra),c(r.dayTypeLabel,zebra),
    c(r.startTime||'—',zebra),c(r.endTime||'—',zebra),
    c(r.breakMinutes,number),c(numeric(r.workedMinutes),number),
    c(numeric(r.overtimeMinutes),number),pay,c(r.leaveLabel||'—',zebra),
    c(numeric(r.leaveMinutes),number),c(r.notes||'—',zebra),
    c(r.status,r.status==='需人工核對'?11:zebra),c(r.revision,number)]);
  }
 });
 const last=report.rows.length+8,totals=last+2;
 put(rows,totals,[c('總計（已登記）',17),undefined,undefined,undefined,undefined,undefined,
  f('SUM(G9:G'+last+')',report.workHours,18),f('SUM(H9:H'+last+')',report.overtimeHours,18),
  f('SUM(I9:I'+last+')',report.knownPaySubtotal,17),undefined,
  f('SUM(K9:K'+last+')',report.leaveHours,18),undefined,c(report.manualReviewDays?'另有人工核對項目':'已列示有效資料',17)]);
 put(rows,totals+2,[c('注意：此檔為出勤及加班費試算，非實際薪資明細或已核准之加班費。未登記與人工核對項目不代表零元。',15)]);
 return {name:'出勤明細',rows,widths:[16,10,24,12,12,18,19,18,20,17,18,43,18,12],
  merges:['A1:N1','A2:N2','A4:N4','A5:N5','A7:N7','A'+(totals+2)+':N'+(totals+2)],
  heights:{1:37,2:27,4:26,5:27,7:25,8:35,[totals]:30},
  freezeRows:8,autoFilter:'A8:N'+last,landscape:true,totalRow:totals,lastDataRow:last};
}
function makeSummary(report,detail){
 const rows=[],last=detail.lastDataRow;
 put(rows,1,[c('WORKPULSE  /  PAYROLL ESTIMATE',1)]);
 put(rows,2,[c('出勤與加班費試算報表   •   CONFIDENTIAL',2)]);
 put(rows,4,[c('人員',12),c(report.employeeName,3),undefined,c('試算期間',12),
  c(fmt(report.startDate)+' — '+fmt(report.endDate),3),undefined,undefined,
  c('建立日期',12),c(report.generatedAt.slice(0,10),3)]);
 put(rows,6,[c('月薪基準（NT$）',12),c(report.monthlyWage,16),undefined,c('時薪基準（NT$）',12),
  f('B6/240',report.hourlyWage,9),undefined,c('資料狀態',12),c(report.manualReviewDays?'部分人工核對':report.missingDays?'含未登記':'已全部登記',11)]);
 put(rows,8,[c('本次試算重點',3)]);
 put(rows,9,[c('實際上班總時數',12),undefined,undefined,c('加班總時數',12),undefined,undefined,
  c('已計算加班費（NT$）',12),undefined,undefined,c('請假總時數',12)]);
 put(rows,10,[f("'出勤明細'!G"+detail.totalRow,report.workHours,13),undefined,undefined,
  f("'出勤明細'!H"+detail.totalRow,report.overtimeHours,13),undefined,undefined,
  f("'出勤明細'!I"+detail.totalRow,report.knownPaySubtotal,14),undefined,undefined,
  f("'出勤明細'!K"+detail.totalRow,report.leaveHours,13)]);
 put(rows,13,[c('已登記天數',12),c(report.recordedDays,13),undefined,c('未登記天數',12),c(report.missingDays,report.missingDays?11:13),
  undefined,c('需人工核對',12),c(report.manualReviewDays,report.manualReviewDays?11:13),
  undefined,c('範圍日數',12),c(report.days,13)]);
 put(rows,14,[c('請假換算天數',12),c(report.leaveDays,13),undefined,c('預估應上班天數',12),c(report.estimatedWorkingDays,13),undefined,
  c('說明',12),c('週一至週五估算；尚未扣國定假日、調班與輪班',15)]);
 put(rows,16,[c('試算限制與核對提醒',3)]);
 put(rows,18,[c('01',12),c('缺少紀錄',3),c('本次範圍有 '+report.missingDays+' 天未登記。這些日期不視為無出勤，不列入已計算工時。',15)]);
 put(rows,20,[c('02',12),c('特殊日別',3),c(report.manualReviewDays?'有 '+report.manualReviewDays+' 天須人工核算。總加班費顯示已能計算部分，尚非最終給付總額。':'例假、調移國定假日、變形工時及跨日特殊情況須人工確認。',15)]);
 put(rows,22,[c('03',12),c('資料保密',3),c('月薪及本次試算只存於下載的 Excel 檔案，不回寫 WorkPulse／Google Sheets。此檔含敏感資料，請妥善保管。',15)]);
 put(rows,24,[c('04',12),c('試算依據',3),c('一般月薪制月薪工資總額 ÷ 240；平日、休息日、國定假日依勞基法倍率計算，詳見「計算依據」工作表。',15)]);
 put(rows,27,[c('核算總結',3)]);
 put(rows,28,[c('已計算加班費',12),f("'出勤明細'!I"+detail.totalRow,report.knownPaySubtotal,14),
  undefined,c('最終加班費',12),c(report.manualReviewDays?'需人工核對':'請依公司核薪流程確認',11)]);
 put(rows,31,[c('注意：若報表中存在未登記日、未核准加班、調班或特殊日別，請核對完整資料後再確認應給付金額。',15)]);
 return {name:'試算總覽',rows,widths:[26,28,17,24,28,17,29,22,18,24,20,14,14,14],
  merges:['A1:N1','A2:N2','E4:G4','I4:K4','H6:K6',
   'A8:N8','A9:C9','D9:F9','G9:I9','J9:L9',
   'A10:C11','D10:F11','G10:I11','J10:L11',
   'A16:N16','C18:N18','C20:N20','C22:N22','C24:N24',
   'A27:N27','E28:H28','A31:N31'],
  heights:{1:39,2:29,4:27,6:30,8:29,9:26,10:36,13:35,14:32,16:28,18:35,20:35,22:35,24:35,27:26,28:35,31:32},
  landscape:true};
}
function makeBasis(report){
 const rows=[];
 put(rows,1,[c('WORKPULSE  /  CALCULATION RULES',1)]);
 put(rows,2,[c('加班費計算基準與試算限制',2)]);
 const clauses=[
  ['月薪制時薪','符合工資定義的月薪工資總額 ÷ 240','用來推算平日每小時工資基準；特殊計薪需另行核對'],
  ['平日延長工時','第 1–2 小時 × 4/3；第 3–4 小時 × 5/3','依勞基法第 24 條'],
  ['休息日出勤','第 1–2 小時 × 4/3；第 3–8 小時 × 5/3；第 9–12 小時 × 8/3','依勞基法第 24 條相關規定'],
  ['國定假日／特別休假','月薪制 8 小時內另加一日工資；超過 8 小時部分按延長工時倍率計算','國定假日經合法調移者須重判日別'],
  ['例假出勤','原則不得安排工作；符合法定例外才可另行核算','本次報表標為需人工核對，不自動當成 0 元'],
  ['休息時間','只有未提供勞務的休息分鐘數才可扣除','跨午夜需注意兩個日期不同假日的情形'],
  ['資料未登記','不代表沒有上班，也不代表零工時','須與實際打卡紀錄、核准加班單核對'],
  ['請假計算','請假時數按分鐘累計，以 8 小時折算 1 天','實際計算仍須符合公司合法班表及請假制度'],
  ['本次試算日期',fmt(report.startDate)+' — '+fmt(report.endDate),'依會計於網站中確認的區間，不會自動跨期合併薪資'],
  ['保密與保存','薪資與金額只存在匯出的這份 Excel，網站未保存。','請限制檔案權限、避免公開分享']
 ];
 put(rows,4,[c('項目',4),c('公式／原則',4),c('適用條件或提醒',4)]);
 clauses.forEach((p,i)=>put(rows,5+i,p.map(v=>c(v,i%2?6:5))));
 put(rows,17,[c('官方參考資料',3)]);
 put(rows,18,[c('勞動部加班費試算系統',12),c('https://calcr2.mol.gov.tw/Index',15)]);
 put(rows,19,[c('勞動基準法第 24 條',12),c('https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=N0030001',15)]);
 put(rows,21,[c('本表格不是正式薪資單；未含扣繳所得稅、勞健保、退休金提繳、其他津貼及依法不同計算之項目。',11)]);
 return {name:'計算依據',rows,widths:[30,83,85],
  merges:['A1:C1','A2:C2','A17:C17','B18:C18','B19:C19','A21:C21'],
  heights:{1:38,2:29,4:28,17:28,21:37},
  freezeRows:4,landscape:true};
}
export function payrollWorkbookSheets(report){
 const detail=makeDetail(report);
 return [makeSummary(report,detail),detail,makeBasis(report)];
}
export function createPayrollXlsx(report){
 return buildStyledXlsx(payrollWorkbookSheets(report));
}
