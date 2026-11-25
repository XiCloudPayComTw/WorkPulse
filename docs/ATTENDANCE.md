# WorkPulse v0.9.0 — 出勤表

## 功能

網站主要導覽新增「出勤表」，人員選擇與工作日誌共用 Employees 編制。日期與星期、上下班 HH:mm、休息分鐘、日別、實際上班時數、加班／假日出勤時數、加班費、請假類型與分鐘、備註皆可管理。月度彙總提供：總上班時數、總加班時數、總加班費、應上班天數、請假天數與請假時數。

每月 Google Sheets 在原有 WorkPulse_YYYY-MM 新增 Attendance 分頁；私人控制工作簿新增 AttendanceSettings 分頁，存放按人員／月份設定的月薪工資總額、預期工作天數。工作天數留空時只按週一至週五估計，不自動認定國定假日與調班；請假天數預設 8h＝1天。

## 加班費估算（台灣標準月薪制）

平日每小時工資基準＝符合工資定義的月薪總額 ÷ 240。
平日加班：前2小時 × 4/3，第3–4小時 × 5/3。
休息日：前2小時 × 4/3，第3–8小時 × 5/3，第9–12小時 × 8/3。
國定假日、特休出勤：月薪制 8小時內另加一天工資（未滿8h也一樣），超過8小時部分依延長工時倍率。
例假原則禁止出勤，例外情況依法另外核算，本版不自動估算。

沒有管理員設定月薪時，涉及加班的費用顯示「待設定」，不可自動視為 0。時薪制、變形工時、例假、跨日跨假日、補休、變動班表與週超40小時等情形須另依勞動法與實際班表審核。本功能為估算，不替代公司法定出勤紀錄與發薪審核。

官方資料：
https://calcr2.mol.gov.tw/Index
https://www.mol.gov.tw/1607/28162/28166/28180/81521/81707/
https://www.mol.gov.tw/1607/28162/28166/28180/81521/81529/
https://www.mol.gov.tw/1607/28162/28166/28180/81521/81533/
https://www.mol.gov.tw/1607/28690/2282/2284/2290/7119/

## 公司帳號

hello.murui.lab@xicloudpay.com.tw 為 Google Drive 正式資料持有者，負責最初建立與遷移。
design.dev@xicloudpay.com.tw 可擔任維護帳號，但須由持有者在私人專案設定 WORKPULSE_OPERATOR_EMAIL 並授予 Google Drive 編輯權限；同公司網域不代表自動有權限。第一次初始化與資料遷移仍只允許 hello.murui.lab@。

## 部署

執行 npm run verify 與 npm run gas:build。
公開版加入 Attendance.gs、AttendanceSave.gs；私人版另外加入 OwnerAttendance.gs，禁止把私人管理函式放進公開版。
已有控制表的公司由資料持有者在私人 Apps Script 執行 workPulseUpgradeAttendance 以建立 AttendanceSettings；舊月份 Attendance 分頁在第一次儲存時自動增加，不覆蓋 Journals/Tasks。
在真正 Google Workspace 測試兩個帳號、權限、跨月讀寫、假日計算、出勤與請假、手機介面及備份後再正式上線。

目前尚未驗證 design.dev 對 hello 管理的 Drive 檔案有實際編輯權，也未在公司真實 Drive 建立資料表或發布 /exec 網址。
