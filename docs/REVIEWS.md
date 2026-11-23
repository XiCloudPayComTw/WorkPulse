# WorkPulse v0.6.0｜主管審核與提交流程

## 功能與角色

主管審核是**可選功能**，新安裝預設 **關閉**；未啟用前，員工照舊可在工作日誌頁儲存及修改日誌。管理員可在「系統設定 → 主管審核流程」啟用。關閉前必須把全部待審核日誌處理完；已核准的紀錄不會因功能關閉而解除鎖定。

當啟用後：
1. 員工先填寫並「儲存至 Google Sheets」，再從填寫頁或歷史紀錄點選「提交主管審核」。
2. 主管使用「主管審核」頁，依月份查看自己**同部門**已提交的紀錄；管理員可查看全公司授權範圍。
3. 主管可「通過審核」或「退回修改」；退回至少輸入 3 字元原因。系統保留提交人、審核人、時間、版本與原因。
4. 已提交、已通過的日誌不能直接修改。退回後員工可以編輯、重新儲存，再次送審。歷史頁可展開「審核歷程」。
5. 主管／管理員不能審核自己的日誌。管理員自己的工作若需審核，應由其他有管理權限的帳號處理；不要透過偽造員工身分規避檢查。

### 權限模型

| 身分 | 查看日誌 | 提交審核 | 核准／退回 | 開關設定 |
|---|---|---|---|---|
| staff | 僅自己 | 僅自己的已儲存日誌 | 否 | 否 |
| manager | 自己＋同部門可見紀錄 | 僅自己 | 同部門其他在職員工 | 否 |
| admin | 所有授權員工 | 僅自己 | 其他在職員工 | 是 |

後端使用 Google Workspace 真實帳號的 `Session.getActiveUser().getEmail()`、Employees allowlist、部門與角色逐次檢查。前端的按鈕隱藏不能代替後端授權。跨網域或信箱缺失必須拒絕存取。

## 新資料結構（schema v4）

增加 `Reviews` 工作表，欄位依序為：

`reviewId, journalId, journalRevision, status, actorEmail, comment, requestId, createdAt`

這是 append-only 事件表。狀態為 `draft`（尚未提交）、`submitted`（待審）、`approved`（通過）、`returned`（退回）。每次事件留存版本、操作者和時間，舊事件不覆寫；查詢時以最新事件判斷狀態。日誌 `revision` 仍在 `Journals`，工作明細仍保留各版於 `Tasks`。

`Meta` 新增：
- `reviewEnabled`: 字串 `false` 或 `true`，預設 `false`
- `reviewSettingsRevision`: 設定版本，預設 `1`

`Reviews`、`Requests` 與 `Audit` 不是交易式資料庫；雖然有 LockService、重複請求辨識、版本衝突及稽核，仍應定期備份、限制 Google Sheets 共用權限，並在正式環境驗證逾時／部分寫入與資料復原策略。

## 升級方式（必要）

**切勿直接在 v3 資料表上執行新版 `setupWorkPulse_()`，也不要手動修改 `schemaVersion`。**

1. 管理員先建立 Google Sheets 完整備份。
2. 更新 Apps Script 專案中的 **`Code.gs`、`Review.gs`、`Index.html`**（由 `npm run gas:build` 產生）；manifest 使用同一建置版本。
3. 已是 schema v3：管理員從 Apps Script 編輯器手動執行 **`upgradeWorkPulseV4_()`**，成功後確認 `Meta.schemaVersion = 4`、`Reviews` 表頭、審核預設關閉。
4. 若仍是 v2：先依舊版本說明執行 `upgradeWorkPulseV3_()`，再執行 `upgradeWorkPulseV4_()`。
5. 完全新建資料：設定公司 Script Properties 後執行 `setupWorkPulse_()` 建立 v4。
6. 重新部署 Apps Script Web App，依身分登入測試；未正式驗證前不要開放公司實際工作資料。

## 上線前驗收

- [ ] 資料表版本 v4 及新表完成備份／驗證，資料表保持私有。
- [ ] 未啟用審核時工作日誌仍可正常儲存；啟用後能正式提交。
- [ ] 未授權帳號不能登入、查詢或編輯；員工不能提交他人日誌。
- [ ] 主管只能審核同部門同事；管理員不得審核自己，跨部門員工資料不外洩。
- [ ] 退回需要明確理由；員工修改後重新儲存、重新提交，再核准成功。
- [ ] 兩個瀏覽器同時修改／審核同筆資料時，舊版請求會被拒絕。
- [ ] 重送相同 requestId 不新增重複事件；審核歷程能按權限正確查閱。
- [ ] 有待審核日誌時禁止關閉功能；核准後仍保留鎖定與事件歷程。
- [ ] 320px 手機與桌面：工作台卡片、狀態標籤、長文字不溢出。
- [ ] 實際 Google Workspace 身分及 Google Sheets 端對端驗證、備份／復原測試完成。

### 已知限制

- 正式 Google Workspace 部署與公司真實試算表寫入**尚未驗證**；Node 模擬測試與 GitHub CI 不等同於正式上線。
- 目前沒有 email／即時推播通知、複雜多層主管簽核、可自訂審核者、審核後撤銷核准、跨月份集中待辦或企業級大量資料索引。
- GitHub Pages 僅保留本機展示版，沒有公司帳號、主管權限與 Google Sheets，同樣不能視為可用的正式審核服務。
