# WorkPulse

工作日誌，不需要像工作日誌。

**WorkPulse** 是一個以手機／桌面皆適用的單頁式日誌原型。視覺靈感來自柔和的灰藍色階與 Neumorphism 浮凸表面，重點是讓員工在下班前輕鬆整理多項工作，也讓管理者按日期快速閱讀。

## 功能（v0.4.0）

- **工作總覽**：當月項目、總工時、完成數與紀錄天數；近期紀錄依日期分組。
- **填寫日誌**：人員與日期選擇、動態新增多項工作、專案／類別／狀態／工時、當日備註、明日計畫。
- **歷史查詢**：按月份、人員、狀態、文字篩選；日期群組可展開／收合；可回編同一天的紀錄。
- **統計分析**：可跨月選日期區間，依員工、部門、專案、類型、狀態查詢；員工／部門／專案排行、每日趨勢及完整工作明細，支援六分頁 XLSX 與 CSV 匯出。
- **系統設定**：編輯人員與專案選單、JSON 備份／還原、CSV（Excel 可開啟）匯出、重設資料。
- **介面**：灰藍柔和陰影、互動 Hover／Pressed 微位移、輕量動態、鍵盤焦點樣式、`prefers-reduced-motion`、響應式底部分頁。

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

本批強化員工／部門／專案維護與角色政策，**仍須由公司管理員實際部署與驗收後才能多人使用**。這一批已提供月度報表、進階查詢與 Excel 匯出；後續評估主管審核、草稿體驗、大資料量效能與備份策略。

開發交接請閱讀 [`docs/PROJECT_HANDOFF.md`](docs/PROJECT_HANDOFF.md)。
