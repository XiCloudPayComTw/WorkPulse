# WorkPulse

工作日誌，不需要像工作日誌。

**WorkPulse** 是一個以手機／桌面皆適用的單頁式日誌原型。視覺靈感來自柔和的灰藍色階與 Neumorphism 浮凸表面，重點是讓員工在下班前輕鬆整理多項工作，也讓管理者按日期快速閱讀。

## 功能（v0.1.0）

- **工作總覽**：當月項目、總工時、完成數與紀錄天數；近期紀錄依日期分組。
- **填寫日誌**：人員與日期選擇、動態新增多項工作、專案／類別／狀態／工時、當日備註、明日計畫。
- **歷史查詢**：按月份、人員、狀態、文字篩選；日期群組可展開／收合；可回編同一天的紀錄。
- **統計分析**：月度工作完成率、工作分類工時、每日工時圖。
- **系統設定**：編輯人員與專案選單、JSON 備份／還原、CSV（Excel 可開啟）匯出、重設資料。
- **介面**：灰藍柔和陰影、互動 Hover／Pressed 微位移、輕量動態、鍵盤焦點樣式、`prefers-reduced-motion`、響應式底部分頁。

### ⚠️ 目前資料儲存方式

v0.1.0 為 **本機原型**。資料只儲存在目前瀏覽器的 `localStorage`，**不會寫入 Google Sheets，也沒有真正的員工登入或存取權限**。不同電腦不會同步，無痕模式／瀏覽器清除資料可能造成紀錄遺失。首次開啟會顯示虛構的示範資料；第一次儲存工作日誌會移除示範內容。

請先以測試資料操作，**不要在此版本輸入公司機密或個人敏感資訊**。正式多人環境需先完成具有身分驗證的後端與權限控管。

## 執行

需要 Node.js 20+，**無需安裝任何 npm 相依套件**。

```bash
npm run dev
# 開啟 http://127.0.0.1:5173
```

```bash
npm run verify # 語法檢查 + 單元測試 + 靜態建置
npm run build  # 輸出 dist/
```

也可直接用靜態伺服器提供專案根目錄；因為採用 ES modules，不建議使用 `file://` 直接開啟。

## GitHub Pages

合併 PR 到 `main` 後，在 GitHub repository 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。工作流程在 `.github/workflows/deploy.yml`，會先測試再部署 `dist/`，如未啟用 Pages 則工作流程可能無法部署。

> GitHub Pages 只提供靜態網站，不是資料庫。正式記錄會另經過安全的 Google Workspace / Google Sheets 整合。

## 預計架構

目前原生 HTML/CSS/JavaScript（ES modules），不使用前端框架與外部字體 CDN：載入資源少、初次啟動快，並且容易先驗證操作流程。

下一階段：選定公司 Google Workspace 驗證方式，將儲存層抽象化，改由受控後端處理 Sheets 寫入與依權限查閱。**不能**只靠「人員下拉選單」辨識登入身份，也不應在公開前端嵌入服務帳戶金鑰。

開發交接請閱讀 [`docs/PROJECT_HANDOFF.md`](docs/PROJECT_HANDOFF.md)。
