# WorkPulse

工作日誌，不需要像工作日誌。

**WorkPulse** 是一個以手機／桌面皆適用的單頁式日誌原型。視覺靈感來自柔和的灰藍色階與 Neumorphism 浮凸表面，重點是讓員工在下班前輕鬆整理多項工作，也讓管理者按日期快速閱讀。

## 功能（v0.9.1）

- **出勤表**：與工作日誌共用員工清單，記錄上下班、請假、實際工時及加班時數；月薪由會計臨時輸入，只在當前畫面試算，不上傳或儲存。
- **共用姓名填寫（雲端模式）**：一般使用者不必登入 Google，選擇姓名即可填寫、修改及查閱工作日誌。這是共用填寫而非個人身分驗證。
- **工作總覽**：當月項目、總工時、完成數與紀錄天數；近期紀錄依日期分組。
- **填寫日誌**：人員與日期選擇、動態新增多項工作、專案／類別／狀態／工時、當日備註、明日計畫；新增自動暫存未提交草稿、複製上次工作與常用工作捷徑。
- **歷史查詢**：按月份、人員、狀態、文字篩選；日期群組可展開／收合；可回編同一天的紀錄。
- **統計分析**：可跨月選日期區間，依員工、部門、專案、類型、狀態查詢；員工／部門／專案排行、每日趨勢及完整工作明細，支援六分頁 XLSX 與 CSV 匯出。
- **系統設定**：編輯人員與專案選單、JSON 備份／還原、CSV（Excel 可開啟）匯出、重設資料。
- **介面**：擴大文字尺寸、固定導覽欄與卡片約束、加強選取狀態；灰藍柔和陰影、Hover／Pressed 微位移、`prefers-reduced-motion`、手機底部導覽。

### v0.9.1：會計臨時薪資試算與 GitHub Pages 部署修正

- 在「出勤表」輸入當前選定人員的月薪工資總額，立即試算全部每日及當月加班費；切換員工／月份或離開出勤頁時清除，不儲存到 Google Sheets 或瀏覽器。
- 資料庫仍保存出勤、加班時數與請假資訊。後端新寫入日誌不含加班費，公開 API 不再回傳舊版加班費或月薪；私人管理員設定只保留當月應出勤天數。
- GitHub PR #9 已成功 Merge。先前 `main` 檢查失敗是 Pages 部署 HTTP 500；原流程重跑時又遇到兩個同名部署封包。現在每次部署依執行 ID 和次數使用獨立封包名稱，可避免重跑撞名。
- 歷史表格中**若曾由舊版寫入薪資資訊，原始 Sheets 及備份可能仍有舊值**，需要由管理者核對後另行清理。詳細說明見 [docs/ATTENDANCE.md](docs/ATTENDANCE.md)。

### v0.9.0：出勤表、請假與勞基法加班費

- 與工作日誌共用可選人員；記錄每日時間、星期、日別、休息、請假、出勤、加班時數與備註。
- 依台灣勞基法一般月薪制計算平日、休息日及國定假日加班費概算；例假和特殊工時需要人工核對。各月份 Google Sheets 對應 Attendance 分頁。

### v0.8.0：公司 Google Drive 分月存檔與正式部署準備

- 已新增「管理者 Google Drive 控制試算表」與月份索引。每個月份第一次儲存工作日誌時，自動建立 WorkPulse_YYYY-MM 原生 Google Sheets；跨月報表會由各月份讀取，查詢不存在的月份不會建立空白檔案。
- 產生**兩套獨立 Apps Script 部署包**：dist-gas/public 為一般使用者入口，**不包含管理員新增／刪除 API**；dist-gas/admin 為私人管理入口，需公司帳號驗證。
- 私人管理員可從 Apps Script 編輯器執行 workPulseInitialize 初始化 WorkPulse 資料夾與控制試算表。既有單一 v4 工作簿必須先完整備份，再透過 workPulseMigrateLegacy 遷移；資料不會自動清空。
- **尚未於 hello.murui.lab@xicloudpay.com.tw 真正建立或部署**。目前連接的 Google Drive 是其他帳號，不能把個人 Drive 當作公司資料庫。公司帳號登入、授權與真實端對端測試仍是正式啟用的必要條件。
- 實際部署步驟、兩個專案的檔案清單、Script Properties、備份與正式驗收詳見 [docs/DEPLOYMENT_V080.md](docs/DEPLOYMENT_V080.md)。

### v0.7.0：簡化工作日誌與管理員功能

- 移除主管角色、送審及退回流程。一般員工選姓名填寫；管理員可新增、修改、停用使用者，並在確認視窗中刪除日誌。
- 管理員權限必須由 Google Script 後端驗證指定擁有者帳號；若部署環境無法辨識，就拒絕管理請求。
- v0.7.0 歷史版本仍使用單一 v4 Google Sheets；從 v0.8.0 起改為控制表與月份個別檔案。公司 Google Drive 尚未連接或建立，不能把本機 GitHub Pages 當成已同步。
- 目前沒有驗證公司真實 Google Workspace；清楚的部署與安全限制見 [`docs/SIMPLIFIED_WORKFLOW.md`](docs/SIMPLIFIED_WORKFLOW.md)。

### v0.6.0（已停用的歷史功能）：可選式主管審核

- Apps Script 增加 `Reviews` 事件表、`reviewEnabled` 設定、主管審核工作台及提交／通過／退回操作；已送審或核准的日誌不可修改，退回後可修正並重新送審。
- **Google Sheets schema v4**：新公司執行新版 `setupWorkPulse_()`，既有 v3 必須先完整備份、再明確執行 `upgradeWorkPulseV4_()`；v2 必須先升到 v3。
- `npm run gas:build` 輸出 `Code.gs`、`Simple.gs`、`Index.html`、`appsscript.json`。GitHub Pages 仍是本機展示版，沒有真正的主管審核或 Google Sheets 同步。
- 角色、遷移與完整驗收見 [`docs/REVIEWS.md`](docs/REVIEWS.md)。公司 Workspace 身分及真實雲端部署尚待管理員驗證。

### v0.5.0：文字可讀性、版面穩定與快速填寫

- **字級與排版**：主要表單字體約 15–16px（輸入欄位 16px），大幅降低 10–12px 輔助文字；側欄固定欄寬、移動到手機導覽的斷點提前到 900px，長員工姓名／專案／備註只會在所屬卡片內換行或截斷，不會擠壓整頁。已選取的選單使用更明確的灰藍內凹底色、左側標記，並維持 `aria-current` / `aria-selected`。
- **下班快速填寫**：未提交文字在編輯後約 0.5 秒暫存；重開頁面可還原、明確按鈕捨棄。可複製**目前已載入日期範圍內，同一位員工的最近一筆紀錄**，或收藏工作成常用項目；帶入時會清空原有成果、已完成狀態和工時。
- **鍵盤**：Ctrl/Cmd + S 正式提交；Ctrl/Cmd + Enter 增加工作。快捷鍵只在日誌編輯頁生效。
- **儲存界線**：本機展示版的草稿與常用項目保存在目前瀏覽器 `localStorage`；雲端版僅存在目前分頁 `sessionStorage`，依公司帳號隔離，**它不是 Google Sheets 同步或正式提交**；正式儲存仍必須通過既有 Apps Script 權限及版本檢查。共用電腦務必關閉工作分頁並清除必要瀏覽資料。
- **測試**：`npm run verify`（40 項測試）＋ Chromium 離線版、模擬 Workspace 登入版，涵蓋 320–1920px、五個一般頁面、管理員三個子頁籤、故意超長文字，以及草稿還原／快速新增流程。完整紀錄見 [`docs/UX_STABILITY.md`](docs/UX_STABILITY.md)。

### v0.4.0：月度報表、進階查詢與 Excel 匯出

新增 Apps Script 唯讀 `wpQueryReport` API（含後端角色／部門檢查），以及真正的 `.xlsx` 多工作表匯出。篩選日期可跨月但最多 366 天；最多查閱 1,500 份日誌或 10,000 項明細。工作內容一律當 Excel 純文字儲存，避免意外執行公式。詳見 [`docs/REPORTS.md`](docs/REPORTS.md)。

### v0.3.0：員工／部門／專案管理及角色保護

**已實作程式碼、尚未部署到公司 Google Workspace**：

- **GitHub Pages**：維持本機展示版（`localStorage`），沒有雲端同步；適合無公司憑證時試用畫面，不要輸入公司敏感內容。
- **Apps Script Web App**：`apps-script/Code.gs` 內有 Sheets 後端、公司 email 驗證、staff/manager/admin 權限、按月讀取、日誌版本衝突保護、重複寫入去重及稽核記錄。**管理員**另有團隊管理頁，能新增／修改／停用員工、部門、專案。
- **共享前端**：`src/cloud.js` 偵測 `google.script.run`；若是 Apps Script 託管，使用安全的伺服端方法；若不是，維持本機展示。連線或身分驗證失敗時 **不會假裝同步成功**。
- **部署**：`npm run gas:build` 產生可手動放入 Apps Script 的 `dist-gas/` 三個檔案。正式部署需要公司允許並設定自己的 Sheets ID、管理員 email 與網域。

完整部署與安全驗收請先閱讀 **[`docs/GOOGLE_SHEETS_DEPLOYMENT.md`](docs/GOOGLE_SHEETS_DEPLOYMENT.md)**、**[`docs/TEAM_ADMIN.md`](docs/TEAM_ADMIN.md)**。從 v0.2.0 的 schema v2 升級必須備份並在 Apps Script 編輯器明確執行 `upgradeWorkPulseV3_()`，不可直接覆寫資料表。

## 執行

需要 Node.js 20+，**無需安裝任何 npm 相依套件**。

```bash
npm run dev
# 開啟 http://127.0.0.1:5173
```

```bash
npm run verify # 語法檢查 + 單元測試 + 靜態建置 + Apps Script 發佈包
npm run build  # 輸出 dist/（GitHub Pages 展示版）
npm run gas:build # 輸出 dist-gas/（Apps Script 公司雲端版）
```

也可直接用靜態伺服器提供專案根目錄；因為採用 ES modules，不建議使用 `file://` 直接開啟。

## GitHub Pages

合併 PR 到 `main` 後，在 GitHub repository 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。工作流程在 `.github/workflows/deploy.yml`，會先測試再部署 `dist/`，如未啟用 Pages 則工作流程可能無法部署。

> GitHub Pages 只提供靜態網站，不是資料庫。正式多人紀錄必須部署另一個 Apps Script Web App（請見部署指南）。

## 系統架構

前端維持原生 HTML、CSS 與 JavaScript ES modules，無外部 runtime 依賴。GitHub Pages 使用模組檔案；Apps Script 則由離線建置腳本將相同前端整合成 HTMLService 的 `Index.html`，確保視覺與工作流程一致。

目前實際使用的是簡化的姓名填寫模式，不再提供主管審核。正式雲端部署採雙 Apps Script 專案，並由公司管理者帳號擁有資料。完整部署、安全與遷移方式以 v0.8.0 的 DEPLOYMENT_V080.md 為準；舊版角色／審核章節僅供歷史參考。

開發交接請閱讀 [`docs/PROJECT_HANDOFF.md`](docs/PROJECT_HANDOFF.md)。
