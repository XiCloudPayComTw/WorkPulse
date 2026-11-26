# WorkPulse — 開發交接與批次紀錄

## 協作規則

- 每一批變更由獨立 Pull Request 提交。使用者合併、測試後再進行下一批。
- 交付前核對最新 `main`、開啟中的 PR、已知問題與測試結果。
- 每批更新此文件；禁止把未完成的功能宣稱為已上線。

## v0.1.0 — 初始可操作原型

- 技術：零外部 runtime dependencies，HTML / CSS / 原生 ES modules，Node.js 僅負責本地靜態伺服器與建置。
- 五個頁面：工作總覽／填寫日誌／歷史紀錄／統計分析／系統設定。
- 視覺：參考圖色彩 `#EFF2F9`、`#E4EBF1`、`#B5BFC6`、`#6E7F8D`；深色文字確保對比；柔和浮凸按鈕、陰影、inset 欄位。
- 資料模型：`journals`（每位員工一天一筆，包含 `tasks[]`），`employees`、`projects`；儲存於 `localStorage`。支援備份及 CSV 匯出。
- 首次開啟為示範模式，首次儲存移除示範資料，避免混淆。
- 表單狀態、閱讀頁按日期群組、篩選、資料驗證、XSS escape、CSV 公式注入防護。
- 鍵盤焦點樣式與系統減少動態偏好；無額外網路請求／動畫框架。
- GitHub Actions 驗證與 Pages 部署工作流程；須由 repo 管理者在 Settings → Pages 選 GitHub Actions。

## 必須保留的限制聲明

1. 本機原型未串接 Google Sheets，跨裝置不共享，瀏覽器清除資料會遺失。
2. 選單不是登入與權限管理。正式公司環境必須由後端驗證登入者並授權。
3. GitHub Pages 的靜態前端**不可**內嵌 Google API 機密金鑰。
4. 動畫效能以 `transform` 與 `opacity` 為主；大型陰影會觸發重繪，低階裝置應視實測調整數量與模糊半徑。

## 下一批建議（v0.2.0）

- 驗證 Google Workspace 帳號與部門存取規則。
- Google Sheets 資料表結構（員工、日誌、工作明細、專案、版本與變更紀錄）。
- 伺服端資料操作：依真實登入者查讀／新增／修改，禁止客戶端自行宣告別人的身份。
- 失敗重試、重複提交去重、衝突處理、編輯紀錄與備份。
- 針對公司網域與 Apps Script 部署模式選擇可行的安全方案；先取得管理者核准與測試權限。

## 驗證方式

- `npm run verify`
- 320px、375px、390px、768px、1024px、1440px、1920px 檢查導覽和水平溢出。
- 新增、修改、跨日期切換、工時範圍、空表單、瀏覽器重整、匯出 CSV/JSON、還原、篩選及收合。
- Lighthouse／Performance 面板評估首次載入與輸入回饋；實測無框架，但不保證所有裝置都達固定 FPS。

## v0.2.0 — Google Sheets / Apps Script 雲端層（獨立 PR）

- `main` 確認已合併 v0.1.0 PR #1，開發分支單獨提交，**未替使用者 Merge**。
- GitHub Pages 繼續是 `localStorage` 本機展示版；公司雲端版需部署到 Apps Script HTMLService，*不能*把 Apps Script 私密設定貼到 GitHub Pages。
- `apps-script/Code.gs`：7 個分頁的 schema v2、手動初始化、`Session.getActiveUser` 同網域 email 身分與 Employees allowlist、staff / manager / admin 查閱／編輯規則、按月讀取、LockService 寫入鎖、expectedRevision 樂觀鎖、requestId 去重、工作細節 append-only 版本與 Audit。
- `src/cloud.js` + `src/app.js`：當 `google.script.run` 存在時啟動雲端模式；登入中／失敗狀態、儲存同步、更新、跨月讀取。雲端錯誤保留草稿，不能用本機寫入或 JSON 匯入偷渡資料。
- `scripts/build-gas.mjs`：將零相依 ES modules 轉成 `dist-gas/Index.html`，另附 `Code.gs`／`appsscript.json`。此檔案不需加入版控，建置產出即可。
- `tests/apps-script.test.mjs`：使用 Node vm + Sheets/Session 模擬驗證權限、資料衝突、重試、日誌讀寫及注入過濾。完整驗證 `npm run verify`。
- 正式部署及現場驗收：[`docs/GOOGLE_SHEETS_DEPLOYMENT.md`](GOOGLE_SHEETS_DEPLOYMENT.md)。

### 尚未完成／不得宣稱完成

1. **未在公司 Google Workspace 實際授權或部署**，無真實 Spreadsheet ID；未進行端對端 Google 身分驗證或正式環境效能驗證。
2. 個人 Gmail、跨公司網域或空 `Session.getActiveUser().getEmail()` 都不能用身分下拉選單代替，必須使用可驗證的授權方式才能上線。
3. 使用 Sheets 進行大量月度讀取並非資料庫最佳化；本批適合低量員工紀錄試行，資料量增長時評估分頁、索引或專用資料庫。
4. 管理員新增員工／專案仍需由受控 Sheets 操作，不提供公開前端編輯名單的寫入端點；資料備份政策需公司自行確認。

### 後續 v0.3.0 候選

- 完成真實 Workspace 帳號／角色／網域驗收後再提升管理 UI。
- 安全的管理員專案／員工維護流程、部門權限、離職停用。
- 版本衝突前端差異顯示、同步載入體驗、時區與操作稽核強化。
- 備份／匯入遷移、月度大資料量效能測試與部署自動化。

## v0.3.0 — 團隊管理與角色權限（獨立 PR）

- 已核對 v0.2.0 PR #2 合併至 `main`，無開啟中的 PR；從合併 commit `ec9cf253844adae8891f72271d72eee07a415b35` 繼續。
- `apps-script/Code.gs`：schema v3；Departments、新增員工/部門/專案的 CRUD（soft deactivate）、admin-only 伺服端 API、角色權限與部門可見範圍、ID／email 唯一、防最後管理員鎖死、衝突／重送保護、Audit 記錄。
- **資料遷移是明確操作**：既有 schema v2 必須先備份，使用公司管理員在 Apps Script 編輯器執行 `upgradeWorkPulseV3_()`，再發布新版；不會自動重設或刪除既有工作日誌。新公司可以執行 `setupWorkPulse_()` 建 v3。
- `src/admin.js`：雲端管理員專用的員工／部門／專案維護 UI；載入、建立、編輯、停用、同步、錯誤保留、角色選擇、部門指定。原本 GitHub Pages localStorage 展示功能不更動。權限仍由後端檢查，不信任 UI 隱藏。
- `scripts/build-gas.mjs`：加入 `admin.js` 打包；修正 HTMLService 初始 script 位置，避免 DOM 尚未存在就初始化。
- `tests/apps-script.test.mjs`：原本 9 個後端測試 + 新增 7 個管理、遷移、權限測試，連同 7 個前端資料測試共 **23 個**。`npm run verify` 通過；Chromium 離線載入 Apps Script HTML + 模擬 `google.script.run`，檢查管理員流程和七種螢幕寬度。
- 部署／角色／遷移詳見 [TEAM_ADMIN.md](TEAM_ADMIN.md)、[GOOGLE_SHEETS_DEPLOYMENT.md](GOOGLE_SHEETS_DEPLOYMENT.md)。

### v0.3.0 尚未完成（不可宣稱正式上線）

1. 未取得公司 Google Workspace 身分驗證或正式試算表 ID，尚未做真實雲端端對端測試；模擬 API 不代表真實 Google 授權已通過。
2. 版本遷移尚未在公司真實既有表格執行；正式環境執行前必須備份。
3. 尚未實作細緻的「主管審核日誌」、「多層部門管理」、批次人員匯入、人事歷史快照或大量工作日誌優化。
4. 團隊管理只在 Apps Script 雲端模式可用；GitHub Pages 仍為本機原型。

### 後續 v0.4.0 建議

- 月度彙總、部門與人員統計、查詢與 Excel / CSV 匯出；先確認資料存取政策與效能。
- 管理員稽核檢視、主管審核需求評估、支援多人使用的資料備份及跨月索引優化。

## v0.4.0 — 月度報表／進階查詢／Excel 匯出（獨立 PR）

- 先核對 PR #3 已合併至 `main`（起始 commit `21cf751ce61cedb1bf936002c1c3861ff12f60dd`），當時沒有其他開啟中的 PR。本批從該合併版本的獨立分支開發。
- `apps-script/Code.gs`：新增 `wpQueryReport` 唯讀報表 API，沿用 schema v3、伺服端 OAuth Session / Employee allowlist / role+department 權限；支援最多 366 天跨月日期、員工/部門/專案/類型/狀態篩選，排除舊版 Tasks revision。超過 1,500 份日誌或 10,000 項工作時拒絕大型回傳。
- `src/reports.js`：純函式計算工時、件數、完成率、日期、員工／部門／專案彙總，CSV 純文字安全匯出。
- `src/xlsx.js`：零相依真正 XLSX/OOXML 多工作表輸出（含凍結首列、標題底色、欄寬與欄位篩選）；文字一律用 inlineStr，防止公式被當指令。
- `src/report-ui.js` + `src/app.js`：統計分析頁改成可選日期區間／跨月／員工／部門／專案／狀態，支援本月／上月／近 90 天快捷、重新查詢與 CSV/XLSX 下載。雲端篩選變更後，直到 API 成功回傳前不可匯出舊結果；GitHub Pages 仍本機演示。
- `src/cloud.js`：增加 `wpQueryReport` 白名單。`scripts/build-gas.mjs` 加入新模組。新增 `docs/REPORTS.md` 操作／權限與驗收指南。
- 驗證：`npm run verify` 通過 **33/33**；Python `openpyxl` 成功讀取六張 XLSX 工作表、繁體中文、凍結標題、篩選及公式純文字；Chromium 使用離線載入與模擬登入測試，於 320/375/390/768/1024/1440/1920px 沒有水平溢出；雲端模擬確認查詢參數與匯出行為。
- **沒有對正式 Google Sheets 進行寫入或部署**；schema v3 不變，若已是 v3 不需執行資料遷移。

### 後續 v0.5.0 候選

- 下班草稿自動儲存、快速複製昨日工作、常用項目、鍵盤操作與低階手機效能。
- 大量工作日誌的索引／分頁／快取評估，主管審核操作及資料備份排程；視公司授權情況再決定正式部署與審核流程。


## v0.5.0 — UX 穩定性與快速填寫（獨立 PR）

- 基於 v0.4.0 PR #4 已合併的 `main` commit `53511d3018b3ec9e9ee1db8f7eddb215cd71917b` 開發；合併前沒有開啟中的 PR。
- `styles.css`：文字全面提升一級、主字級 16px、輸入欄位 16px；透過 `minmax(0,1fr)` / `min-width:0` / overflow 限制長文字只影響自身，固定 sidebar 與主內容格局；導航顯著選取狀態（灰藍柔和背景與左側細線）；手機導覽斷點提早為 900px。保留 transition/transform 與 reduced-motion。
- `src/quick-entry.js`：未提交草稿讀寫、到期與帳號隔離；本機 localStorage、雲端 sessionStorage；常用工作範本上限 10 個；讀取已載入日誌中同人最近前一筆；複製重設結果、完成狀態和時數。
- `src/app.js`：填寫頁新增快速工具、常用工作、捨棄／還原草稿、Ctrl/Cmd+S／Ctrl/Cmd+Enter；確認正式儲存成功後才清除草稿。雲端儲存失敗保留草稿，未改變既有伺服端授權政策。
- `src/report-ui.js`：日期快速範圍增加 aria-pressed 與醒目選取樣式；團隊子頁籤維持 aria-selected。
- `scripts/build-gas.mjs` 加入 quick-entry 模組；`package.json` 版本 v0.5.0。Google Sheets schema v3 不變，無須遷移。
- `tests/quick-entry.test.mjs` 新增 7 項；`npm run verify` 共 40 項單元測試通過。Chromium 離線／模擬雲端在 320–1920px（12 種寬度）檢查布局；強制超長員工／專案／工作標題；測試草稿暫存／還原、複製、快捷鍵與儲存清除。詳見 [UX_STABILITY.md](UX_STABILITY.md)。

### 本批限制／下一步

1. **沒有在公司真實 Google Workspace 執行部署**；現有 Google Sheets schema v3 不變，虛擬 Workspace API 測試不等於正式授權驗收。
2. 雲端版草稿與範本只在當前分頁，且 sessionStorage 會留在重整後的同一分頁；不是跨裝置同步與企業長期儲存。共用裝置要另做帳號安全稽核與作業政策。
3. 近期工作只會搜尋已載入月份，跨月缺漏時不會擅自讀取未授權紀錄；複製與套用範本都不直接提交。
4. 大量記錄的分頁、正式登入實測、主管審核與備份仍屬後續批次。

## v0.6.0 — 主管審核工作流（PR #6）

- 核對 v0.5.0 PR #5 已合併，起始 main commit `0a5399fefec170541d9a4a2779dc8839c773b790`，開發時無待處理 PR；基於獨立 `feat/workpulse-v0.6.0`。
- `apps-script/Review.gs`：新增可選式審核，schema v4 `Reviews` append-only 事件、Meta 開關與版本、使用者與部門後端授權、本人提交／主管通過或退回、自我審核禁止、版本鎖與 idempotency；斷線後同一 requestId 重送可回傳日誌，且重送前重新檢查使用者的部門權限；不允許在仍有 submitted 日誌時停用功能。
- `apps-script/Code.gs`：初始化 v4，讀取與儲存整合審核狀態；送審與通過後鎖定寫入，退回才重新可編輯；保留舊 `Tasks`／`Audit`。
- `src/review-ui.js` 和 `src/app.js`：新增主管審核導覽／工作台、員工提交按鈕、歷史狀態與原因、事件歷程，以及管理員的啟用開關。原本簡約浮凸色彩維持，行動版防止長文字溢出。
- `scripts/build-gas.mjs`：加入 review-ui 模組並輸出 Review.gs；`src/cloud.js` 只允許明確列出的審核 API；`package.json` v0.6.0。
- 由既有 v3 資料升級**必須先備份**、管理員從 Apps Script 編輯器手動執行 `upgradeWorkPulseV4_()`；v2 應先經 v3。新公司可用 v4 初始化。流程見 [REVIEWS.md](REVIEWS.md)。
- GitHub Pages 不具公司身分與後端寫入，**沒有真實主管審核能力**；Google Workspace 真實授權、多人端對端與資料備份仍未正式驗收。
- 完成後以 `npm run verify`（54 項）與 GitHub Actions 做完整驗證；真實 Workspace／Sheets 仍需部署後獨立測試。

## v0.7.0 — 簡化姓名填寫／管理員維護（PR #7）

- 使用者明確取消主管與審核工作流。一般人員僅需姓名下拉選擇、填寫與調閱；管理員可新增／停用使用者並刪除工作日誌。
- 基於 v0.6.0 PR #6 已 Merge 的 `main` commit `6e9fd8998f1aeb8881a1a1cc7d069826152a3e2b`，獨立分支 `feat/workpulse-v0.7.0-simplify`，**等使用者 Merge 後再進下一批**。
- `apps-script/Simple.gs`：共享姓名 public API（讀寫、月份讀取、報表）、Google Session owner-only API（員工名單、新增／停用、刪除日誌）。公開 API 的選姓名不是身分驗證；資料一律透過 Apps Script 後端驗證格式與版本。
- 刪除採 Audit `journal.deleted` 事件的邏輯刪除，可稽核且普通查詢與報表不再回傳已刪除紀錄；前端按鈕另有確認視窗與輸入「刪除」驗證，後端仍獨立進行管理者驗證。
- `src/admin.js`：簡化為管理員名稱與狀態維護；`src/app.js` 移除主管導航、審核操作及歷程、使用新的 `wpShared*` API。現在 GitHub Pages 仍本機展示模式。
- 管理者 Google 帳號為 `hello.murui.lab@xicloudpay.com.tw`；目前連接 Google Drive 的帳號不同，**不得把資料建在私人 Google Drive 或聲稱已建立公司試算表**。
- 此批仍沿用 v4 單一 Google Sheets 工作簿，尚未實作月份自動分檔（預計 v0.8.0）、正式管理員身分與雲端端對端驗證（v0.9.0）、整體上線效能與備份（v1.0.0）。
- 詳細規劃、部署注意與公司身分安全條件見 [SIMPLIFIED_WORKFLOW.md](SIMPLIFIED_WORKFLOW.md)。


## v0.8.0 — Google Drive 分月建檔／雙入口正式部署準備（PR #8）

- 核對 PR #7 已 Merge；本批基於 main commit b8426bc744a5db9e4cceb72a0b6cb3d7b9d52eac，使用獨立分支 feat/workpulse-v0.8.0-monthly-deployment，等待使用者 Merge 後才進行下一批。
- 核心資料：每月第一次儲存會以指定公司的 Google Drive 擁有者身分建立 WorkPulse_YYYY-MM 原生 Google Sheets。WorkPulse_Control 保留 Employees、Projects、MonthIndex 等資訊；各月份含 Journals、Tasks、Requests、Audit、Meta。
- apps-script/Core.gs：移出舊版 Code.gs 的必要共用函式，只提供查詢與寫入基本功能，沒有舊主管審核與管理員 API。apps-script/Monthly.gs：月檔索引、同月建檔去重、跨月份範圍、所有權檢查與安全遷移。apps-script/Simple.gs：訪客姓名填寫、月檔儲存與查詢、跨月報表。apps-script/Owner.gs：只在私人管理員專案部署的新增／停用使用者與日誌刪除 API。
- scripts/build-gas.mjs 產生 dist-gas/public 與 dist-gas/admin 兩份各自獨立的 Apps Script 發布包，先刪除舊輸出防止意外公開上一版管理員程式。公開版只包含 Core、Monthly、Simple、Index、manifest；私人版另外包含 Owner。舊 Code.gs/Review.gs 不再部署。
- src/app.js 新增 private portal 驗證機制；必須先成功從私人端取得 wpOwnerBootstrap 才顯示管理選單。管理員刪除請求指定日誌 ID、日期與版本。
- Apps Script 私人編輯器可執行 workPulseInitialize：在設定的公司管理者雲端建立資料夾與控制 Google Sheets，使用 WORKPULSE_ADMIN_EMAIL、WORKPULSE_ALLOWED_DOMAIN、WORKPULSE_SHEET_ID、WORKPULSE_FOLDER_ID。已有舊 v4 資料時要求備份，再用 workPulseMigrateLegacy 遷移，不會自動清除。
- tests/monthly.test.mjs 使用模擬 Google Drive/Sheets 驗證空月份不建檔、兩個月不同檔案、跨月查詢、重複請求、版控、刪除權限、擁有者雙重驗證、備份遷移及初始化。歷史 Code/Review 的測試分離為舊版相容測試。
- **正式公司 Google Drive 尚未連線**：目前 ChatGPT 的 Google Drive 連線經檔案擁有者驗證是其他 Gmail；本批沒有在 hello.murui.lab@xicloudpay.com.tw 建立任何資料，也未取得 Apps Script 真實 /exec 部署網址。模擬測試與 CI 不代表正式上線。
- 人員選姓名不是身分驗證；公開網址使用者可能選別人姓名查閱／修改。使用者要求保留這個簡便模式，但應避免放入機密資料或無控制地散佈網址。
- 詳細操作以 docs/DEPLOYMENT_V080.md 為準：由公司帳號建立私人和公開兩個獨立 Apps Script 專案、同步 Script Properties、只發布不同權限包、實際驗證匿名讀寫和管理員刪除、備份及資料恢復。
- 下一批優先進行**公司帳號授權後的端對端驗收**、備份、跨專案競態與大量工作日誌性能測試。開發流程依舊：每批測試 → PR → 使用者 Merge。

## v0.9.0 — 出勤表／加班費與公司維護帳號（PR #9）

- 起始 main 已含 v0.8.0 PR #8（commit 0477bab78fa8941c454f992055beac5eef862a12），獨立分支 feat/workpulse-v0.9.0-attendance。
- 新增出勤頁，位於工作總覽後，與工作日誌共用人員下拉清單。每日日期、星期、上班及下班時間、休息分鐘、出勤日別、加班時數及估算費用、請假種類與時數、備註。月統計：總工時、加班時數、加班費、應出勤天數、請假天數與請假時數。
- apps-script/Attendance.gs / AttendanceSave.gs：按月在 Google Sheets 新增 Attendance 分頁，資料版本、重送去重、時間驗證與費用計算。apps-script/OwnerAttendance.gs 僅私人版可存取，依員工和月份設定月薪基準及應上班天數，控制表新增 AttendanceSettings。
- 依勞動部官方資訊計算一般月薪制平日（4/3、5/3）、休息日（4/3、5/3、8/3）、國定假日另發一天工資及超時部分；例假、變形工時、時薪制、週工時和國定假日調班需人工核對。未設薪資時不虛構加班費。
- 設定 WORKPULSE_OPERATOR_EMAIL 可允許 design.dev@xicloudpay.com.tw 在授權及共用 Drive 權限下使用私人管理介面；首次初始化與遷移仍由 hello.murui.lab@xicloudpay.com.tw 主責，不因同一網域自動分享權限。
- 網站 UI 延續灰藍色柔邊、主要文字 16px、卡片 min-width 0 及明細內部橫向捲動；手機底部導航增加可水平捲動避免擠壓。
- 既有公司月檔採懶增 Attendance，控制表由私人編輯器執行 workPulseUpgradeAttendance 安全補建設定表。部署與驗收見 ATTENDANCE.md。
- 尚未取得公司 Google Drive 的可核對寫入權限，Google Workspace／跨裝置端對端、歷史資料和真實工時排班未正式驗證；不得宣稱已上線。


## v0.9.1 — Merge 後 Pages 部署及月薪臨時試算（PR #10）

- 已查 PR #9 於 2026-11-26（臺灣時間）真正 Merge，main= b40c41d965cc530652fc85e5befae8e3e3d31820。main 的 check/build 成功，但 deploy-pages 回 HTTP 500；重跑相同 workflow 的失敗 job 因重複 github-pages artifacts 而失敗。v0.9.1 上傳與部署改為每次 run_id/run_attempt 唯一 artifact 名稱；需 Merge 後下一個全新 workflow push 才能實際驗證 Pages。
- 使用者將「薪資基準待設定」改成會計在出勤頁面當次輸入的框。frontend src/attendance-state.js 使用純記憶體 temporarySalary，不走 localStorage/sessionStorage 或 API；離開頁面、換員工或月份清除。src/attendance-ui.js 逐格更新每日、當日預覽與月度金額，輸入框不失焦。
- src/attendance.js attendanceSummary 不再信任任何 persisted overtimePay，一律按當前輸入月薪基準重算；無月薪且涉及加班則呈現待設定，沒加班則 0 元。
- apps-script/AttendanceSave.gs 明確禁止月薪或 overtimePay 欄位上傳，新出勤記錄只存工時／請假等，Google Sheets 的歷史 overtimePay 欄位新寫入會留空。Attendance.gs 的 public wpAttendanceLoad 與 private wpOwnerAttendanceConfig 均不回傳舊版月薪／加班費。OwnerAttendance.gs 只儲存 expectedDays，拒絕儲存月薪。舊 localStorage 展示紀錄也在讀取時移除已保存的薪資與試算欄位。
- **正式公司資料未改動**，如果已由 v0.9.0 真的存過工資或加班費，原 Sheets 儲存格、歷史版本或備份仍可能有舊資料。需公司擁有者自行核對、備份後再清理；本次只阻止後續洩漏，不能宣稱完全刪除。
- CI、Pages 部署及實際 Google Workspace 尚需分別驗證，PR 不自動合併。

## v0.10.0 — 會計月度試算、日期懸浮視窗與 Excel（PR #11）

- 基於 v0.9.1 合併後 main 252c79e45a4473fcc46ab3933e4cdec44c044827，分支 feat/workpulse-v0.10.0-payroll-export。
- 出勤頁臨時月薪欄位旁新增「開始試算／匯出 Excel」，日期 modal 依瀏覽器本地日期預設上個完整曆月；支持跨年、閏年、大小月及自訂起訖日（最多 366 日），禁止未來日期。
- apps-script/AttendanceRange.gs 新增不攜帶薪資的單一人員跨月份唯讀查詢。Apps Script 公開與管理員發布包都需包含此檔，前端 src/cloud.js 已加入方法白名單。
- 前端 src/payroll.js 純函式組合整段日期（含缺資料日），只在記憶體中估算加班費，標記缺資料與例假人工核算，避免零時數假象。
- src/payroll-ui.js 在前端建立無障礙日期懸浮視窗、查詢預覽與本機 XLSX 下載，不將輸入薪資傳至後端。
- src/xlsx.js 新增 buildStyledXlsx，對既有簡易 buildXlsx 保留相容；src/payroll-xlsx.js 使用富格式 OOXML 編製彩色總覽／逐日明細／計算依據，包含凍結列、打印設定、數值格式、公式與跨表引用，Excel 改總覽 B6 月薪可重算。
- tests/payroll.test.mjs 與 tests/monthly.test.mjs 增加閏年、跨月、安全、缺資料與 OOXML 驗證。真實 Google Workspace、Excel 現場開啟與行動版瀏覽器需公司完成部署驗收。
- 報表下載至會計裝置後有機密薪資，應限制權限。WorkPulse 網頁和共用 Sheets 不保存計算薪資資料。
- 交付文件：docs/PAYROLL_EXPORT.md；待使用者自行 Merge PR #11。

## v0.10.1 — 模組檔案結構與出勤深連結初始化（PR #13）

- 以 PR #12 已合併且 Pages 成功部署的 main（a63df999dc2c290e52f43f31b470d933e607619f）建立獨立分支 fix/workpulse-v0.10.1-structure-attendance-boot。
- 原本 `src/app.js` 本機模式只在頁面切換時啟動出勤查詢；直接 `#/attendance` 或 F5 刷新會讓 attendanceState.phase 持續 idle 並顯示「正在讀取出勤資料」。現在用 `src/app/attendance-lifecycle.js` 統一啟動，直接落地載入本機出勤；GAS 雲端則待 bootstrap 完成才載入，所有入口一致。
- `attendance-state.js` 使用遞增查詢序號，只允許最後一次人員／月份查詢覆蓋資料，防止併行導致舊資料回寫。
- 原始碼依功能拆到 `src/features/{journals,attendance,payroll,reports,admin}`；共用工具放 `src/shared`、雲端 API 放 `src/services`、主介面整合放 `src/app`，入口 src/app.js 只 import 新主程式。
- CSS 拆分為 styles/index.css 加 8 個功能 CSS layer，瀏覽器透過 @import 依順序載入，GAS builder 依相同順序直接拼接 CSS 到 Index.html。
- Apps Script 原始檔移入 `shared`、`journals`、`attendance`、`admin`、`legacy` 資料夾；發布時仍產生 public／admin 分離且檔案平面化的 dist-gas，不混入舊版管理員 API。歷史測試與部署建置腳本均已更新路徑。
- 新增直接 deep link 本機／雲端回歸與資料夾結構測試。詳細架構 docs/ARCHITECTURE.md。未操作 Google Drive 公司正式資料。

## v0.10.2 — 路由模組與雲端載入穩定性（PR #14）

- main 已包含 v0.10.1 PR #13，並已成功完成 GitHub Pages 部署；本批分支 feat/workpulse-v0.10.2-stability。
- 將原本 `src/app/main.js` 的路由清單、Hash 解析與管理員導覽可見性抽至 `src/app/navigation.js`；報表日期驗證與期間快捷邏輯抽至 `src/features/reports/periods.js`。Apps Script 打包順序已加入新的前端模組，維持原有兩個獨立發行包。
- `src/services/cloud.js` 為 Google Apps Script 呼叫設置讀取 60 秒、寫入 90 秒的等待期限與回應去重。載入失敗會顯示可手動重試的錯誤狀態，絕不自動重送寫入 API。
- `src/app/main.js` 加上 bootstrap 重試請求序號以及月份讀取最後請求保護，避免網路回應順序顛倒造成過時資料覆蓋。出勤 loader 額外在未預期拋錯時進入 error 畫面。
- 增加路由／報表日期／雲端讀寫逾時／Bootstrap 重試的 Node 回歸測試；GitHub Actions 額外增加 Headless Chrome 的窄螢幕、桌面路由煙霧測試，成功才建 Pages artifact。
- 不調整既有 Google Sheets Schema、薪資暫時試算、權限架構與 UI 主題。正式 Workspace 部署仍待公司帳號驗收。

## v0.10.3 — 名稱編輯、管理員專案與出勤排版（PR #15）

- 本批來自成功合併且 Pages 已部署的 v0.10.2 main，獨立分支 feat/workpulse-v0.10.3-edit-names-layout。
- 展示版新增「編輯人員名稱」、「編輯專案名稱」內嵌輸入框；原員工 ID 不變，本機專案更名會連同已儲存日誌與常用範本文字更新。
- 雲端 Admin 原本可以編輯姓名，此批新增專案管理分頁與私人 `wpOwnerSaveProject`（新增／更名／停用）和各項伺服端安全檢查；公開 Apps Script 封包不包含私人 API。
- 雲端歷史日誌仍保存原本專案名稱。歷史紀錄保留舊標籤並允許回編，新紀錄限用目前啟用專案。
- 出勤薪資試算卡片移至明細後、勞基法公式前；公式卡片改緊湊；頭部模式改明確「展示版／共用／管理員」。
- 不更改 Google Sheets schema，不擅自操作公司 Drive。須在公司管理員正式部署後驗證 private `OwnerProjects.gs` 的寫入權限。

## v0.11.0 — 外勤手機 UI／全站人員／動態工作類型（PR #16）

- branch feat/workpulse-v0.11.0-field-mobile 自 v0.10.3 已成功合併與 Pages 部署的 main 建立。
- `src/app/person.js`：用穩定 ID 於 localStorage 保存已選人員，右上角只顯示最後兩字，點開自訂名單。明確人員變更同步至工作日誌、出勤表、歷史查詢、報表。選姓名不是驗證。
- `src/app/main.js`：手機外勤首頁採大面積功能入口，mobile 導覽不含 insights/settings，且阻擋手機深連結進入這兩頁。日誌第一欄使用工作類型，工作名稱改向下相容資料欄，歷史內容保留。
- `src/features/journals/categories.js` 及 `src/features/journals/data.js`：本機工作類型新增／改名、舊日誌映射及 JSON 匯入相容。
- `apps-script/shared/Core.gs`：公開讀取的 `wsCategories_`、`wsCategoryRevision_` 讀取 Meta JSON，保留預設 `WP_CATEGORIES`。
- `apps-script/admin/OwnerCategories.gs`：管理員私人變更清單、LockService + revision + requestId + Audit；公開 GAS 不包含修改函式，並不改動月表 schema。
- `src/app/loading.js` + `styles/field-mobile.css`：雲端請求統一果凍式浮層；900px 以下手機隱藏薪資／法規卡，但保留出勤操作；一般文字禁止圈選與複製，文字編輯欄保留正常操作。
- `src/features/journals/description-memory.js`：每一個人員在單一裝置獨立記憶 35 筆已填寫／已儲存內容，手機執行內容輸入框有建議選單；沒有把建議額外寫入雲端。
- 細節及所有功能：[docs/FIELD_V011.md](FIELD_V011.md)。CI 與後端整合驗證需通過；真正公司 Workspace 部署仍須另行進行。


## v0.12.0 — 外勤弱網路與資料恢復

- 起始 main 305af6d063452626a475b9635587c12893cd10e7，已合併 PR #16；獨立分支 feat/workpulse-v0.12.0-field-recovery，不自動 Merge。
- `src/services/field-recovery.js`：工作日誌及出勤寫入的 per-tab 待同步；保留原始 requestId、expectedRevision 與內容；離線不發送、不自動重送；已知 CONFLICT 需人工核對；手動重送結果確認後移除待同步，使用者需重新查閱對應日期。
- `src/features/attendance/attendance-draft.js`：按人員日期保存未提交草稿，保留原 revision，成功提交才清除；提供捨棄按鈕。薪資維持記憶體試算。
- 連線狀態與待同步清單、同時讀寫載入提示修正、常用範本以工作類型／專案／執行內容區分。
- 限制：sessionStorage 不保證跨關閉分頁／裝置；禁用儲存僅記憶體；不支援離線冷啟動或背景同步；Chrome 窄螢幕改採精準 CSS viewport（320／375／390／430px）與桌面 1366px；手機實機及公司 Workspace 正式部署仍待驗收。
- 操作及驗收見 [FIELD_RECOVERY_V012.md](FIELD_RECOVERY_V012.md)；CI 狀態以 PR 最新提交為準。

### 後續路線（2026-11-26 使用者提供原始規劃，可靠性優先調整）
- v0.12.0：外勤弱網路與資料恢復；原規劃出勤月曆、前日時間複製、班表設定及異常提醒移至 v0.12.1。
- v0.13.0：會計結算週期、發薪日、缺漏／異常檢查、Excel 列印／公式保護與逐人匯出；薪資維持記憶體試算。
- v0.14.0：資料安全、刪除復原、備份／還原演練、版本衝突、權限與跨月效能。
- v0.15.0：公司 Google Workspace 正式部署與跨裝置驗收，須取得公司授權；公開展示與正式入口分離。
- v1.0.0：核心功能全數實際驗收才可稱正式營運；PWA 視 Apps Script 限制另列候選，不取代會計強化。


## v0.12.1 — 出勤月曆與區塊標題間距

- 基於已合併 PR #17 的 main f8d4332a9e16f55502b7ad558fa2ae1c67b777d0，分支 feat/workpulse-v0.12.1-attendance-calendar；不自動 Merge。
- 修復 .section-head.section-space 上方 margin 被覆蓋；紀錄清單、工作項目標題桌面 32px、手機 26px 上距。
- 出勤月曆以每人每月呈現已登記、請假、待核對、缺漏、今日及未來；點選日期進編輯。缺漏只對過去預計工作日提示，不等於曠職。週曆預設週一至五工作、六休息、日例假，國定假日與公司調班須管理員設定。
- 私人管理員每日班表覆寫存控制表 Meta 單列 JSON，獨立 revision／requestId、鎖定與 Audit；公開端唯讀，不改月表 schema、不自動修改已存出勤。應上班天數保留原手動設定優先，未設定時按日班表推算。
- 前日複製僅使用已載入同人同月前一天的上下班及休息分鐘；不複製請假、備註、日別。跨月第一天暫不支援。
- 異常提示包括班表日別不符、紀錄不全、工時與例假需核對；既有加班費公式維持不變，特殊班表仍人工核算，不自行認定合法班表。實際雲端部署仍待公司授權。
- Excel 下載在本機，不會自動上傳 Drive；原生月份 Google Sheets 的 Attendance 工作表寫入已實作但未正式驗收，薪資維持本機記憶體。若需自動匯出雲端須另行設計私人會計資料夾及權限。
- 下一批 v0.13.0 會計結算、缺漏核對、Excel 強化；v0.14.0 備份及安全、v0.15.0 正式 Workspace 驗收、v1.0.0 正式營運。

- 管理員未儲存的班表修改僅留在設定區，月曆與新出勤預設以最後已確認班表為準；Chrome 增加月曆點選與兩處區塊標題上距檢查。


## v0.13.0 — Excel 專屬計薪與出勤匯出

- 使用者明確決策：網站移除薪資輸入、即時金額及試算 UI；保留工時、加班時數、出勤月曆與勞基法說明（依原設計桌面顯示）。Excel 下載至本機，會計填寫薪資後手動放至公司私人 Google Drive；不新增自動上傳。此決策取代先前網站記憶體試算流程。
- 匯出視窗選人員、結算起訖（預設上一完整月份）、選填發薪日期；逐人查詢、檢查缺漏與異常後各自下載，不需關閉視窗；未來日期不納入，發薪日不可早於結算結束。日期與發薪日不寫入公司設定，也不跨視窗保存。
- 出勤明細讀取已確認資料與已儲存班表；依預計工作日標記缺漏，日別不符、例假出勤、跨午夜與異常工時需人工核對，不自動計薪。班表未設定依週曆推估，不等於法定排班。
- Excel 試算總覽 B6 空白且可編輯，金額公式在薪資有效輸入前留白；公式與資料工作表保護避免誤改（非加密、可取消保護），保留 A4 橫向縮放列印。出勤原始資料與薪資不回寫網站。僅加班費估算，不含完整薪資扣繳；有人工核對資料須人工補算。實際 Excel 開啟、公式重新計算與公司 Workspace 驗收尚需實測。
- 基於 PR #18 head ec8f52cfa66af98df98e17d736a2c76e4b2047ae（尚未合併時建立 stacked branch feat/workpulse-v0.13.0-excel-only），PR #19 base 已改為 main 以觸發現有 CI；先 Merge #18，再檢查 #19 的 diff／CI 並 Merge #19；不自動 Merge。
- 下一批 v0.14.0 資料安全、備份與營運維護；v0.15.0 正式公司 Workspace；v1.0.0 驗收。薪資匯出原則以本批為準。

- PR #19 CI 修正：桌面 Chrome 的匯出視窗測試失敗（attendance@1366, missing-export）。根因是靜態 src/app.js 未載入 payroll-ui.js，GAS 原已包含該模組。新增靜態入口 import，保留原測試並加驗查詢預覽及下載按鈕；結構測試確認兩套入口均包含模組。CI 以最新提交為準，未自動合併。


## v0.14.0 — 營運維護第一階段

- 基於 PR #19 已合併且 Pages CI 成功的 main b6f8f9031319e50b18f92077585ccd05d274ac2e；分支 feat/workpulse-v0.14.0-maintenance。不自動 Merge。
- 私人管理員控制台：按月查閱控制表當月／指定月份檔 Audit（合併後最多 100 筆）、已刪除日誌唯讀清單（最多 100 筆）。不返回日誌全文、不修改既有資料。公共封包無私人 API。
- 持有者限定單檔 Drive 原生副本：明確配置 WORKPULSE_BACKUP_FOLDER_ID，檢查持有者、私人分享及編輯／檢視權限，拒絕同營運資料夾；控制表或指定月份各自備份，requestId 防重複命名，來源與副本工作表／列數比對僅作初步檢查。非原子跨檔快照；建議暫停填寫再執行。未操作真實公司 Drive。
- 公開與私人 Apps Script 是不同專案，ScriptLock 不跨專案，不能宣稱全域多人互斥。刪除仍是稽核標記；直接恢復至正式資料、跨專案寫入序列化、自動排程及完整還原演練留 v0.14.1，禁止自動覆寫正式資料。詳見 [MAINTENANCE.md](MAINTENANCE.md)。
- 薪資仍僅 Excel、本機下載手動存 Drive。

- 響應式：900px 以下出勤明細採逐日卡片，桌面保留完整表格；底部導航均分、44px 以上主要觸控區、16px 表單、safe-area 與浮動提示位置調整；原本手機隱藏會計與法規區的決策維持。Chrome 加驗導航無溢出、觸控高度與輸入字級；iOS/Android 鍵盤、旋轉與觸控仍需實機驗證。

- 備份新增模擬 Drive 複製成功、同 requestId 重試、拒絕額外分享者及正式索引不變測試。GAS viewport 同步 viewport-fit=cover。備份權限驗證不能代替實際 Drive 管理員檢查（含父層分享）。稽核 selected: 人員僅代表選取的姓名，不能當成登入身分證明。


## v0.14.1 — 定期備份、內容核對與復原準備

- 基於 PR #20 已合併、Pages CI 通過的 main fff629f5f163f96bc854a6e2029b99fcaca9f6ba，分支 feat/workpulse-v0.14.1-backup-recovery，不自動 Merge。
- 每日備份排程：僅由資料持有者登入私人 Apps Script 編輯器執行 workPulseInstallDailyBackup，先配置私人 WORKPULSE_BACKUP_FOLDER_ID；03:00–04:00 台北時間為預設觸發區間（Google 調度非精準分鐘）。控制表、已存在的當月、上月及每日輪替一個較舊月份；未自動刪除備份。每日日期與目標作命名去重；同日重試若來源已變動，拒絕宣稱驗證成功。管理員可看到最近一次結果；移除用 workPulseRemoveDailyBackup。私人封包額外 script.scriptapp scope，公開封包不增加。
- 備份核對已由列數提升為已知 schema 欄位的儲存格值前後比對（最多 250000 格），非公式／格式／ACL 完整驗證、非跨檔原子快照；來源變動拒絕確認，不自動刪副本。觸發器需符合已登記 UID 及持有者 effective account。未安裝真實觸發器、未操作公司 Drive。
- 管理員可查閱已刪除日誌快照、檢查同人同日正式紀錄衝突、下載 JSON 人工核對；不變更正式資料，不自動解除刪除標記。跨專案寫入互斥未完成，直接復原與完整還原演練移至 v0.15.0 的正式環境驗收前置；普通使用者以姓名選取並非登入驗證。
- 月份與跨月報表以 journalId 建立 task index，避免每份日誌掃描全部工作明細；保留 revision 過濾及原有查詢上限，無真實大型資料量基準測試。
- 使用者確認將所有行動版提升納入正式路線，見 [ROADMAP.md](ROADMAP.md)。工作日誌及出勤正式保存仍使用公司 Drive 原生分月 Sheets；GitHub Pages 本機版不會自動上傳。薪資只在下載 Excel 處理。

## 已確認後續路線（v0.14.1 起）

- **v0.14.2 — 行動版操作體驗深化**：固定底部儲存／新增操作區，顯示草稿與正式儲存狀態；VisualViewport 鍵盤避讓與焦點／安全區；人員、工作類型、專案及歷史篩選 Bottom Sheet（鍵盤、焦點、返回與無障礙）；一般讀取 Skeleton 骨架與錯誤重試，正式寫入仍保留果凍浮層；平板獨立雙欄／橫式版型。所有既有手機隱藏功能限制維持。加驗 320–430px、平板 768/820/1024px、桌面、橫向及減少動態，真實 iOS Safari／Android Chrome 鍵盤與觸控需實機驗收。
- **v0.15.0 — 正式公司 Workspace 部署與資料安全驗收**：正式資料持有者及維護授權、雙入口權限與一般共用姓名的風險驗收；評估並落實單一可信寫入路徑，避免兩套 GAS 的 ScriptLock 互斥缺口。停寫演練與獨立測試還原、正式 Drive 備份排程驗證、跨裝置測試、Excel 實機測試。未完成前不得提供自動覆寫正式紀錄的復原按鈕。
- **v0.16.0 — 進階離線與 PWA**：IndexedDB 持久草稿、離線快取、重新連線管理；按人員／裝置隔離、資料清除與保留政策、未確認寫入去重及衝突防護；先驗證 Apps Script iframe／service worker 可行性，不承諾完整離線冷啟動。若限制無法克服，評估獨立前端與受控 API。不得將本機暫存當作正式備份。
- **v1.0.0 — 正式營運驗收**：功能、資安、備份／還原、實機、權限及文件通過後再標記正式營運。


## v0.14.2 — 行動版操作體驗深化

- 基於已合併 PR #21 的 main 7e85c701b95fbeb02f316efdbf77e64e2726d381，分支 feat/workpulse-v0.14.2-mobile-workflow，不自動 Merge。
- 手機固定底部日誌新增／正式儲存與出勤儲存操作區，委派既有事件，不另行寫入；顯示暫存提示。鍵盤以 VisualViewport、可編輯焦點及可見高度推估，遮擋時隱藏底部操作與導覽；手機實機、旋轉及瀏覽器差異待測。
- Native dialog Bottom Sheet：全站人員選擇、日誌人員／工作類型／專案、歷史人員／狀態及出勤人員；沿用 select 原生 input/change 與既有人員切換規則；桌面和不支援 dialog 的瀏覽器保留舊控制。Escape/關閉、原生 modal 焦點限制，切換頁面清除。
- bootstrap／月份／出勤讀取改頁內 skeleton，其餘讀取保留有遮罩的骨架浮層；寫入果凍浮層不變。月份讀取暫時隱藏舊表單，避免對錯誤月份操作。保留逾時與錯誤提示、重讀；尚未全面非阻塞化。
- 700–900px 平板雙欄首頁與日誌摘要；901–1100px 緊湊桌面單欄。原手機隱藏統計／設定／會計原則不變。Chrome 加入 768/820/1024px、固定操作與抽屜選項測試；真實手機觸控、鍵盤及橫向／減少動畫完整驗收仍待完成。
- 公司帳號所有權與 Firebase Spark 備份選項詳見 [STORAGE_STRATEGY.md](STORAGE_STRATEGY.md)；不新增外部資料傳輸，未修改正式公司 Drive。v0.15.0 須先選定公司控制的資料持有與權限設計、處理跨專案寫入互斥、實際驗收。v0.16.0 進階離線仍保留。

- 讀取骨架期間阻擋新增／切換人員與日誌寫入，避免未確認月份的競爭；鍵盤隱藏導覽時不把 dock 高度寫為 0，出勤錯誤提供重新讀取按鈕。Chrome 探針於互動後再檢查 JS 錯誤。


## v0.15.0 — Google Drive 正式部署準備與行動細節

- 使用者確認 Google Drive／Sheets 唯一雲端方案，不採用 Firebase Firestore，取消原先候選第二備份，不增加外部資料庫；維持本機 Excel 計薪與手動 Drive 保存。資料持有以公司管控 My Drive 帳號為現階段相容方案；Shared Drive 尚未支援。
- PR #22 最新 CI 通過但建立本批時未合併；基於其 head 2fcec48da6c68077b746e6d58313667d1687fe1a。分支 feat/workpulse-v0.15.0-drive-readiness，PR 目標 main，先合併 #22 再本批，不自動 Merge。
- 私人編輯器新增 workPulseDeploymentCheck：唯讀檢查公司存取設定、控制表 schema、資料夾／控制表擁有者及分享初步檢查、索引、獨立備份資料夾及最近成功紀錄，不宣稱正式驗收。未連接公司 Google Drive、不建立真實檔案或觸發器。
- 兩套專案可設 WORKPULSE_ACCESS_MODE=domain，公司 Google 登入無法辨識時拒絕讀寫。預設 legacy 保留既有姓名共用模式供相容；正式上線須核對實際 Workspace 政策。domain 只確認網域成員，仍可選別人姓名，不是每員工資料隔離。正式模式日常日誌與出勤寫入只走 public bundle，私人 admin bundle 的日常寫入拒絕；控制表 Meta 共用停寫標記，兩套新版日常寫入均拒絕。資料持有者執行 workPulsePauseFieldWrites / workPulseResumeFieldWrites，domain 下刪除須停寫至少 10 分鐘並人工確認舊部署與執行已停止。這不是跨專案原子鎖或完整交易保證，直接還原仍禁止，管理員設定競爭仍須驗收。
- 手機 Bottom Sheet 增加搜尋／無結果、狀態及假別選擇；狹短橫向排版、可視高度限制、焦點樣式與縮放區分；明確本機提示與出勤草稿狀態。Chrome 新增 667×375、844×390 及搜尋驗證，實際 iOS/Android 鍵盤、觸控仍待驗收。
- 正式部署前使用 [DEPLOYMENT_V015.md](DEPLOYMENT_V015.md)，下一階段 v0.15.x 真實公司授權、正式員工身份與跨裝置／備份還原演練；v0.16.0 持久草稿、離線與 PWA，v1.0.0 正式驗收。Firebase 不再列為候選。


## v0.15.1 — Google Drive 驗收工具與本機移轉準備

- 基於已合併 PR #22/#23、main Pages CI 通過的 c93c440bbe23361264f0ce2880c75f461febee94；分支 feat/workpulse-v0.15.1-drive-verification，不自動 Merge。Google Drive／Sheets 唯一雲端方案，Firebase 取消不變。
- 私人編輯器 workPulseVerifyMonthFiles()：逐批核對最多 12 個索引月檔（預設最新），驗證持有者與私人分享初步條件、索引唯一、月份標籤、6 個分頁及表頭；回傳各表資料列數與 nextFromMonth；設定 WORKPULSE_VERIFY_FROM_MONTH 繼續舊月份。唯讀，不創檔、不改表，不代表完整資料一致性或還原驗收。
- 本機展示版手機／桌面提示新增「下載移轉封包」：保存已儲存日誌、工作明細、員工、專案、類型及全月份出勤；不取未提交草稿、不自動上傳、不包含薪資或未知出勤欄位；缺人員、重複與 demo ID 提醒，使用既有日誌格式正規化。非原始資料無損備份，仍須保留原 JSON、逐筆核對人員對應及資料；尚無自動匯入正式庫。資料應由公司私下保存。
- 弱網路：待同步區提示其他人員待處理筆數、可下載目前人員未確認的原始請求 JSON 供人工核對，原 requestId／revision 保留；不自動重送、不宣稱已儲存，不取代 sessionStorage／IndexedDB。窄手機按鈕重排為可觸控全寬與雙欄。
- 公司實際 Google Workspace 尚未授權，未建立真實資料或排程，個別員工身份授權、備份還原、跨裝置與真實手機驗收仍待完成；v0.15.2 優先完成公司部署及安全驗收，v0.16.0 進階離線與 PWA。不得把本機展示版當正式雲端。

## v0.15.2 — 正式資料移轉預檢

- 基於已合併 PR #24、Pages CI 通過的 main c1b0fa108b8d55a686604abcfede585c93b21d71，分支 feat/workpulse-v0.15.2-migration-preflight，不自動 Merge。
- 私人管理入口新增本機移轉封包預檢（最多 10 MB）：瀏覽器只保留來源人員識別、日期、紀錄類型與範例／重複標記，不保留完整工作內容；手動對應有效正式人員，預設不對應。展示範例、未對應及映射後同人同日重複項目排除；每次選一月份、最多 500 筆。正式人員名單以管理控制台資料為準，後端再次驗證。
- wpOwnerMigrationPreflight 僅資料持有者雙重身分驗證，唯讀；只接收 kind/date/employeeId，不接收完整工作內容。檢查當下已存在紀錄、曾刪除日誌及未找到現有紀錄；不建檔、不修改、不匯入、不保證查詢後狀態不變。核對結果可下載私人 JSON；無自動寫回及無自動覆蓋。前端清除可釋放暫存識別資料，重新整理即消失。
- Google Drive／Sheets 唯一雲端方案，Firebase 已取消。實際公司授權、備份、還原、跨裝置及真實手機驗收尚未完成；不聲稱已正式部署。個別員工身分隔離仍須由公司確認需求；維持選姓名工作流程，不新增主管審核。下一個可獨立開發批次 v0.16.0 進階離線，正式部署驗收可並行於公司授權後執行。


## v0.16.0 — 進階離線：持久草稿與待同步請求

- 基於已合併 PR #25 main f680746e9b856e1ab64bb7ab882e59a441c1c332，分支 feat/workpulse-v0.16.0-offline-vault，不自動 Merge。
- 新增 IndexedDB vault：僅在正式 domain 模式有經伺服器驗證的帳號、且員工入口配置 WORKPULSE_OFFLINE_SCOPE（部署唯一 16–80 ASCII 英數／底線／連字號）時提供。資料依部署＋登入帳號隔離，日誌／出勤另依選取人員、出勤日期隔離；選姓名仍非員工身份授權。管理入口及 legacy 無持久模式。公司尚未實際設定或授權。
- 預設不啟用持久化，使用者須確認專用裝置（未加密、勿共用）。Web Locks 保證同一瀏覽器同一 origin／scope 僅一個分頁可持久寫入；其他分頁仍可用各自分頁暫存，不能保證跨裝置互斥。缺支援時不降級成不安全的共享持久寫入。重開後須先成功雲端 bootstrap 才能恢復該帳號的持久副本；不支援完整離線冷啟動、整月資料快取、service worker 或 PWA 安裝。GAS iframe 儲存分區與 Web Locks 真實可行性尚待驗收。
- 僅保存草稿與原始待同步請求（不快取整份雲端紀錄、不存薪資或憑證）。日誌仍每人一份最近草稿（持久啟用時讀取有效期 7 天），出勤每人每日；最多 250 鍵／4 MB 字元封包、待同步 30 筆。待同步及出勤草稿不自動刪除；應由使用者核對、清理。非正式備份，瀏覽器清除／配額／私密模式可能造成遺失。配置 scope 前先下載舊待同步及正式本機資料，原有未分區 session 草稿不自動搬入新 scope，避免跨帳號混合。
- 手機與桌面待同步區加入持久狀態、啟用／停用清除副本、目前人員草稿定位。停用只清除持久副本，保留本分頁暫存；如分頁與持久副本不一致不自動合併。啟用後送出前等待 IndexedDB 交易完成；失敗保留原請求、不自動重送；雲端已確認但本機清除失敗時仍以伺服器確認為準，須人工核對舊請求，原 requestId/revision 不變。
- Google Drive／Sheets 唯一正式雲端架構，Firebase 取消；本批無公司資料操作。下一批 v0.16.1 響應式深化（長表單收合、日期定位、常用內容、減少渲染），v0.17.0 PWA 與離線冷啟動可行性，正式公司部署及真實手機驗收仍需公司實測。

- 啟用／清除交易期間拒絕並行暫存及正式送出；跨月日誌草稿先讀取正確月份再開啟，出勤走既有月份載入流程。雲端確認後等待本機清除交易，若清除失敗仍顯示本機警告。

- Chrome CI 新增原生 IndexedDB／Web Locks 測試（合成資料、同一 origin，重新建立 storage instance、第二實例拒絕鎖及清除），不是關閉實體手機或 GAS iframe 實測。跨月草稿不在錯誤月份自動載入；待同步資料若只能留在記憶體，持久模式不發送 RPC。

- PR #26 CI 修正：原生 IndexedDB 探針在 Chrome --virtual-time-budget 下觸發「離線資料庫開啟逾時」。改用獨立 loopback 測試伺服器、真實時鐘、隔離暫存 Chrome profile，等待實際瀏覽器回報結果（45 秒上限，原產品 5 秒開啟／交易逾時不變）。保留原生啟用、寫入、第二實例鎖定、復原及清除檢查，並回報失敗階段；其他 60 個響應式路由測試不變。最新 CI 通過前勿 Merge，正式 GAS 實機仍待驗收。


## v0.16.1 — 響應式長表單與多日期草稿

- 基於 PR #26 已合併且完整 CI 通過的 main 07855d9cc920e95e3bc29517acc788cdd5ae3e4a，分支 feat/workpulse-v0.16.1-mobile-detail；不自動 Merge。
- 工作項目逐項收合、全部收合／展開，保留 DOM 與未提交內容，不重新渲染整個表單；標題摘要顯示類別、執行內容及工時；手機 44px 觸控。常用內容按鈕可主動查閱目前人員的既有建議，不另增雲端請求。
- 歷史日期定位支援跨月份載入，保留搜尋、人員與狀態篩選；找不到符合紀錄時提示。搜尋防抖 180ms，單次計算分組，減少重複渲染。
- 日誌草稿改同一 storage key 的 v2 rows，依人員／日期分開，兼容 v0.16.0 單筆格式；每個 account key 最多 31 筆，滿額拒絕新存不自動淘汰，依既有 24 小時／7 天讀取期限。正式儲存及單筆捨棄只清除當前人員日期；日期切換前若暫存失敗不離開。未提交草稿列表與跨月份定位。過期草稿不自動清除，仍占額度，可透過清除持久副本等人工處理。IndexedDB 既有 4MB 與 250 鍵上限仍適用。
- 保留公司 Google Drive／Sheets 唯一雲端架構、手動重送、原版本防護；未操作正式公司資料。真實 GAS、iOS/Android 實機仍待驗收。下一批 v0.17.0 PWA 可行性，再 v0.18.0 效能及穩定性，v1.0.0 正式驗收。

- 額外補強：草稿超期／異常項目可經確認後獨立清理，不清除未確認的待同步請求；日期格式驗證、類型摘要即時更新、無常用內容提示、捨棄清除失敗時保留畫面。切換月份前先暫存目前草稿。


## v0.17.0 — PWA 外殼與安裝體驗

- 基於 PR #27 已合併且完整 CI 通過的 main d1fd260164a6d42b18895dbb4cc329eaae06bcc1，分支 feat/workpulse-v0.17.0-pwa-shell；不自動 Merge。
- 僅 GitHub Pages 靜態 build 生成 relative manifest、192/512 PNG、maskable 512、Apple 180 圖示及 Service Worker，支援 /WorkPulse/ 子目錄。來源開發頁面及兩套 GAS 不註冊 Service Worker；GAS 只顯示瀏覽器捷徑說明。
- 首次連線預載固定靜態清單，依內容雜湊版本及 SHA-256 驗證，安裝失敗不啟用部分快取。只攔截同 origin、固定清單 GET／根或 index 導覽；不快取 API、登入回應、公司資料、查詢參數或任意請求。舊 worker 仍服務舊版；不 skipWaiting、不強制重整，待所有舊視窗關閉後新 worker 接管，清除同 scope 舊快取。離線重新啟動僅展示版，既有本機資料仍依瀏覽器儲存規則。
- 安裝提示使用 beforeinstallprompt（若支援），其餘提供 Safari/Chrome/Edge 手動說明；standalone 模式，非原生 App，實際安裝按鈕與啟動畫面由 OS/browser 決定。保留 safe-area 與手機功能限制。新版下載提示不強制刷新。
- 增加建置與原生 Chrome 子目錄測試：快取完整、未知路徑不寫入、來源伺服器回 503 時重新載入日誌表單。這是模擬來源不可用，不是實機飛航模式或 OS 安裝驗收。保留 60 項響應式及 IndexedDB 原生測試。
- 正式 Apps Script iframe 無本專案控制的同 origin worker URL／scope，不能直接套用 Pages worker；仍須雲端驗證，已開啟頁面的 opt-in IndexedDB 草稿與手動重送不變。不自動改為匿名代理、外部 API 或雙主庫。公司正式 Google Drive 未操作，Firebase 取消。下一批 v0.18.0 全站效能穩定性，v1.0.0 正式部署與驗收。

- PR #28 修正（實機 iOS 回報）：日期欄位超出卡片。手機 `.form-group` 單欄 minmax(0,1fr)，原生 date/month/time/datetime-local 欄位明確 border-box、inline-size、min/max width、移除 WebKit 原生外觀及內部 value/edit 置中最小尺寸，保留原生選擇器與 16px 字體；Chrome 全路由檢查可見日期／月份／時間欄位矩形是否超出 form-group／卡片，不只量整頁 scrollWidth。實際 iOS Safari 仍需確認。
- PR #28 原 CI 163/163 通過，但原生 PWA probe `FAIL offline: wait timed out`。靜態 worker 導覽快取 key 明確去除 hash fragment，測試改為來源 503 後建立新的 iframe 文件（非沿用舊已載入 app 或 hash-only navigation），保留指定 entry 路由、controller、表單及本機提示的驗證；若失敗回傳 URL、標題、body 片段供診斷。原生 IndexedDB 和 60 項響應式測試保留，未確認新 CI 通過前勿 Merge。
