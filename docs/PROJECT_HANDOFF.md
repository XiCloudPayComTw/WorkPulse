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
