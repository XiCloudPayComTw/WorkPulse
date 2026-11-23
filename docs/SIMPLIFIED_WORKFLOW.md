# WorkPulse v0.7.0：簡化填寫／管理員／Google Drive 規劃

## 最終需求（2026-11-23）

1. 不需要主管與審核。一般使用者打開網站，直接選擇**姓名**，填寫／修改／查閱工作日誌，不必用 Google 帳號登入。
2. 管理員可新增、修改、停用使用者。只有管理員可刪除工作日誌；前端必須先確認，再輸入「刪除」。
3. 管理者 Google 帳號：**hello.murui.lab@xicloudpay.com.tw**。所有正式試算表、後端 Apps Script 與資料夾應由這個帳號擁有／管理。
4. 按月份自動建立獨立 Google Sheets，員工由網站查詢與寫入；此功能留待 v0.8.0 完成，**v0.7.0 仍使用原有單一 v4 工作簿**。
5. 避免將機密金鑰、私人 OAuth token 或 Google Drive 檔案共用權限公開給一般使用者。

## v0.7.0 已實作

- 移除主管審核的導覽、工作台、提交通過／退回流程，未來不提供主管權限。
- `apps-script/Simple.gs`：`wpSharedBootstrap`、`wpSharedLoadMonth`、`wpSharedSaveJournal`、`wpSharedQueryReport`：訪客不需登入，選取員工 ID 讀寫紀錄。執行日期、工時、字串、專案、版本與重送檢查。
- 管理員 API：`wpOwnerBootstrap`、`wpOwnerSaveEmployee`、`wpOwnerDeleteJournal`，**每次從 Google Session 讀取已驗證 email 並比對 Script Property `WORKPULSE_ADMIN_EMAIL`**。若返回空字串或無法驗證，一律拒絕管理操作。
- 不要求一般人員有 Google email。新增使用者存入既有 Employees 表，保留員工 ID 與歷史紀錄。
- 刪除採**可稽核的邏輯刪除**：在 Audit 記錄 `journal.deleted` 事件，讓日誌從一般查詢、月份報表消失，原始 Journals / Tasks 仍保留以供備份／追溯。刪除後可再為同一位員工、同一日期建立新的日誌。
- 管理員刪除前需兩次確認：確認視窗 + 輸入「刪除」。權限判斷不是前端選姓名，而是後端 Google 帳號比對。
- `npm run gas:build` 會輸出 `Code.gs`、`Simple.gs`、`Index.html`、`appsscript.json`。**不要再部署舊 `Review.gs`**。歷史程式碼與 v4 Review 表格僅為兼容舊版資料，不再是現在流程的一部分。

### 這個操作模式的明確風險

一般使用者只選姓名，**不是身分驗證**。知道網站網址的人可以選取其他人員、查閱共享內容並以其他姓名填寫／修改工作紀錄；資料可能遭惡意輸入。只適合公司接受此共享模型、網址存取受控、資料不含機敏個資的使用情境。未來如需防止冒名，必須增加員工登入或驗證碼等機制。

管理員權限不能使用前端密碼、姓名、固定 URL 參數、公開 API key 或 Google Drive 分享連結判斷。Apps Script 部署為「以擁有者身分執行」時，`Session.getActiveUser().getEmail()` 的可用性依帳號／部署政策而異；必須用公司管理帳號及一般訪客各自實測。**管理員若無法被驗證，應保持不可用，而不是退回到姓名選單。**

同一部署中後端同時提供公開與管理員函式。正式上線前必須驗證公開訪客絕不會取得 owner Session email；若該情境無法保證，應將管理員 API 獨立部署到限制擁有者使用的 Apps Script 專案或改用可驗證的 OIDC 服務。沒有完成這個驗證前，不可提供正式管理員刪除功能。

## v0.7.0 與真實雲端狀態

目前連接 ChatGPT 的 Google Drive 經查驗是另一個私人 Gmail 帳號，不是上述公司管理者帳號。因此**沒有**在私人帳號建立 WorkPulse 資料夾或試算表，也沒有對公司雲端寫入。實際雲端部署須由 `hello.murui.lab@xicloudpay.com.tw` 授權，設定 Script Properties：
- `WORKPULSE_SHEET_ID`：由該帳號建立的試算表 ID，現階段單一 v4 工作簿。
- `WORKPULSE_ALLOWED_DOMAIN`：`xicloudpay.com.tw`
- `WORKPULSE_ADMIN_EMAIL`：`hello.murui.lab@xicloudpay.com.tw`

GitHub Pages 仍是本機展示，不會直接操作 Drive。

## 後續批次

- **v0.8.0：按月份分檔**。在管理者的 Drive 建 WorkPulse 資料夾／管理索引；保存 YYYY-MM → spreadsheet ID 映射；每月首次新增自動建立 `WorkPulse_YYYY-MM` 原生 Google Sheets；重新讀取、跨月查詢與刪除使用對應月份；LockService 防止同月份重複建檔。試算表屬於管理者帳號。先做備份／遷移／重試，不能把舊日誌遺失。
- **v0.9.0：正式權限與管理員入口**。公司管理員 OAuth / Session 真實驗證，管理操作防冒用，員工與日誌維護介面、多人同時修改及輸入安全；若無法安全區分 Google 擁有者，分離管理員部署。
- **v1.0.0：公司環境驗收**。真實 Drive 分檔、權限隔離、資料備份還原、跨月份統計、手機／桌面版面穩定、效能與上線說明。

### 本批驗收

- [ ] GitHub Actions：全數語法與測試成功。
- [ ] 一般訪客能選任何啟用的人員，新增同一天多項工作、重新載入查閱。
- [ ] 只有真實管理員能新增使用者、刪除日誌，非管理者及空 email 需被拒絕。
- [ ] 刪除需確認視窗，後端保留 Audit 紀錄；報表不計入已刪除資料。
- [ ] 測試同日期版本衝突、重送去重、非法日期／時數。
- [ ] 公司 Google Workspace、Drive 與真實多人部署驗收尚未執行，**不得宣稱正式上線**。
