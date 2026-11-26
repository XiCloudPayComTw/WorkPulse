# WorkPulse｜程式檔案架構（v0.10.1）

## 目標

依**功能及責任**分類原始程式碼，避免共用程式、出勤表、薪資、報表及 Google Apps Script 權限 API 混在同一個平面目錄。這是檔案與模組的結構整理，**不遷移**公司資料庫、不修改 Google Sheets 欄位、不重設本機紀錄。

### 前端

```text
src/
├─ app.js                         # 瀏覽器穩定入口，只引入 app/main.js
├─ app/
│  ├─ main.js                     # 現有網站畫面、導覽與日誌流程整合
│  └─ attendance-lifecycle.js     # 首次進入／切換／雲端初始化的出勤啟動流程
├─ shared/
│  ├─ utils.js                    # 日期與字串等工具
│  ├─ icons.js                    # 圖示
│  └─ xlsx.js                     # 共用 Excel 產生器
├─ services/
│  └─ cloud.js                    # Apps Script API 呼叫
└─ features/
   ├─ journals/
   │  ├─ data.js                  # 日誌資料處理
   │  └─ quick-entry.js           # 快速填寫與草稿
   ├─ attendance/
   │  ├─ attendance.js            # 出勤／加班費計算純函式
   │  ├─ attendance-state.js      # 人員月份、表單、雲端讀取與儲存
   │  └─ attendance-ui.js         # 出勤表畫面與事件
   ├─ payroll/
   │  ├─ payroll.js               # 薪資試算期間與資料彙總
   │  ├─ payroll-ui.js            # 會計試算視窗
   │  └─ payroll-xlsx.js          # 會計用 Excel 版面
   ├─ reports/
   │  ├─ reports.js               # 日誌統計
   │  └─ report-ui.js             # 報表畫面
   └─ admin/
      └─ admin.js                 # 管理員控制台
```

`src/app/main.js` 仍保留既有日誌、設定、主導覽的整合邏輯；這批先保留其執行順序以降低回歸風險。未來如繼續切分此檔，應以頁面 rendering 與 action handler 為界，並補齊整合測試後逐批遷移。

### CSS

```text
styles/
├─ index.css                      # 瀏覽器以 @import 依序載入
├─ base.css                       # 全站基本樣式
├─ cloud.css                      # 雲端狀態
├─ admin.css                      # 管理員
├─ reports.css                    # 統計報表
├─ stability.css                  # 響應式／不跑版
├─ legacy-review.css              # 歷史審核 UI 相容
├─ attendance.css                 # 出勤表
└─ payroll.css                    # 會計薪資試算
```

CSS 保留原有的瀏覽器 cascade **先後順序**。`scripts/build.mjs` 將整個 `styles/` 複製到靜態網站；`scripts/build-gas.mjs` 依相同順序將 CSS 原始碼合併進 HTMLService 的 `<style>`，避免 Apps Script 網頁執行時依賴外部 CSS 匯入。

### Google Apps Script 原始碼

```text
apps-script/
├─ appsscript.json
├─ shared/
│  ├─ Core.gs
│  └─ Monthly.gs
├─ journals/
│  └─ Simple.gs
├─ attendance/
│  ├─ Attendance.gs
│  ├─ AttendanceSave.gs
│  └─ AttendanceRange.gs
├─ admin/
│  ├─ Owner.gs
│  └─ OwnerAttendance.gs
└─ legacy/
   ├─ Code.gs
   └─ Review.gs
```

原始碼雖然依資料夾整理，**輸出仍需符合 Apps Script 專案平面檔案限制**：

- `dist-gas/public/`：Core、Monthly、Simple、Attendance、AttendanceSave、AttendanceRange、Index.html、Manifest。
- `dist-gas/admin/`：上述公開程式外加 Owner、OwnerAttendance。
- `legacy/` 僅供歷史相容性測試，**不得放進公開部署**。

## 直接重新整理出勤表的問題

原有在 `#/attendance` 上按瀏覽器重新整理的情境，只顯示載入提示，但本機模式沒有執行出勤初始查詢。切到別頁再返回會觸發 `changeView` 的查詢，因此才正常顯示。

現改為統一 `activateAttendancePage()`：

1. 初次進站，如果 hash 指向出勤表且是本機模式，立即載入出勤名單與資料。
2. 如果是 Google Apps Script 雲端版，先等待員工清單 bootstrap 成功，才開始出勤查詢。
3. 透過側邊欄、hash 切換進出勤表，也使用同一套載入流程。
4. 載入期間呈現正確狀態；完成或發生錯誤後都會重新渲染，無須先切往別頁。
5. 透過最新請求序號，避免慢速舊月份查詢覆蓋新月份與新員工紀錄。

## 驗證

執行 `npm run verify`（Node.js 20+），涵蓋靜態站與 Apps Script 雙部署包建置。新增出勤啟動測試，涵蓋直接用 `#/attendance` 載入本機展示及雲端 bootstrap、切換後的畫面清理。

正式公司 Google Workspace 的實際多人瀏覽器測試，仍必須在公司部署後執行，不能用 Node 模擬測試取代。

## v0.10.2 穩定性與自動驗收

- `src/app/navigation.js`：頁面清單、Hash 路由解析、管理員頁面與系統設定可見性的判斷。
- `src/features/reports/periods.js`：日期驗證、上個完整月份、當月及近 90 日等報表期間計算。
- `src/services/cloud.js`：Apps Script API 加入等待期限。讀取最多 60 秒、寫入最多 90 秒；逾時後網頁顯示錯誤，且不會自動再次執行任何可能寫入資料的 API。手動重試前先確認上一筆資料是否成功。
- `src/app/main.js`：雲端初始化重試用請求序號避免舊回應覆蓋；快速切換雲端日誌月份也只接受最後一次載入結果。
- `src/app/attendance-lifecycle.js`：額外捕捉非預期的出勤載入錯誤，轉成頁面錯誤與重新讀取入口。

測試分層：

1. `npm run test`：Node 原生測試（日期、權限、逾時、資料不重覆寫入、出勤與薪資）。
2. `npm run verify`：語法檢查、單元與模擬整合測試、靜態網站建置、公開與私人 Apps Script 編譯。
3. `npm run smoke:browser`：**真實無頭 Chrome** 在窄螢幕和桌面尺寸開啟六個網站路由，確認畫面載入、無 JS 例外與整頁水平溢出。
4. GitHub Pages 在 PR 會先檢查 Node 測試與瀏覽器測試，兩者皆成功才允許建立發布封包。真正的 Pages 部署仍需 Merge 後的 `main` 工作流程另外驗證。

Chrome 執行環境依賴 Ubuntu Runner 預裝的 `google-chrome`；開發者本地需自行安裝 Chrome/Chromium 後才能執行瀏覽器檢查。Chrome 模擬測試不等於真實公司 Google Workspace 的資料讀寫驗收。
