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
