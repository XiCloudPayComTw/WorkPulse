# WorkPulse

工作日誌，不需要像工作日誌。

**WorkPulse** 是一個以手機／桌面皆適用的單頁式日誌原型。視覺靈感來自柔和的灰藍色階與 Neumorphism 浮凸表面，重點是讓員工在下班前輕鬆整理多項工作，也讓管理者按日期快速閱讀。

## 功能（v0.5.0）

- **工作總覽**：當月項目、總工時、完成數與紀錄天數；近期紀錄依日期分組。
- **填寫日誌**：人員與日期選擇、動態新增多項工作、專案／類別／狀態／工時、當日備註、明日計畫；新增自動暫存未提交草稿、複製上次工作與常用工作捷徑。
- **歷史查詢**：按月份、人員、狀態、文字篩選；日期群組可展開／收合；可回編同一天的紀錄。
- **統計分析**：可跨月選日期區間，依員工、部門、專案、類型、狀態查詢；員工／部門／專案排行、每日趨勢及完整工作明細，支援六分頁 XLSX 與 CSV 匯出。
- **系統設定**：編輯人員與專案選單、JSON 備份／還原、CSV（Excel 可開啟）匯出、重設資料。
- **介面**：擴大文字尺寸、固定導覽欄與卡片約束、加強選取狀態；灰藍柔和陰影、Hover／Pressed 微位移、`prefers-reduced-motion`、手機底部導覽。

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

既有員工／部門／專案權限與統計匯出仍適用，**仍須由公司管理員實際部署與驗收後才能多人使用**。v0.5.0 不更動 Sheets schema v3，既有 v3 不需遷移。後續可評估主管審核、大資料量效能、跨裝置草稿與備份策略。

開發交接請閱讀 [`docs/PROJECT_HANDOFF.md`](docs/PROJECT_HANDOFF.md)。
