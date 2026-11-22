# WorkPulse v0.3.0 — Google Sheets / Apps Script 部署與驗收

> **未完成公司部署。** 這份程式是可自行部署的實作，不代表已拿到公司 Google Workspace 授權。正式填寫公司資料前，必須先完成以下設定並使用兩個不同員工帳號測試。

## 1. 架構、來源與保護範圍

- GitHub Pages：繼續提供**本機展示版**，資料存放 `localStorage`；不會連接 Google Sheets。
- Google Apps Script HTMLService Web App：正式多人協作入口，直接提供相同 WorkPulse UI；前端透過 `google.script.run` 呼叫 `wpBootstrap`、`wpLoadMonth`、`wpSaveJournal`。
- Apps Script 伺服端使用設定的 `WORKPULSE_SHEET_ID` 存取受保護試算表；**任何 Google OAuth token、API key、試算表寫入權限都不下放到公開的 GitHub Pages**。
- 身分依據為**伺服端**的 `Session.getActiveUser().getEmail()`，再查 `Employees` 活躍員工名冊；使用者在網頁上修改員工 ID 不能繞過權限。
- 受 Google 安全政策限制，若無法取得驗證過的 email，後端會**拒絕存取**，而不是回退到匿名或本機資料。

## 2. 建立公司試算表

使用獲公司授權、且位於**同一 Google Workspace 網域**的部署管理員帳號：

1. 建立**空白 Google Sheets**，檔名可使用 `WorkPulse 公司工作日誌`。
2. 僅讓實際管理此資料的 Google 帳號擁有試算表存取權限；**不要開放「知道連結的任何人」存取**，也不需要分享給所有填寫日誌的員工。
3. 從試算表網址 `/spreadsheets/d/<ID>/edit` 複製 `<ID>`，只填到 Apps Script 的 *Script Properties*，**不要寫進公開的 repo**。

資料表由 `setupWorkPulse_()` 建立（既有 v2 資料請先遷移）：

| 分頁 | 用途 | 重點欄位 |
| --- | --- | --- |
| `Employees` | 員工和角色 | employeeId, email, name, role, departmentId, active, revision |
| `Departments` | 部門資料 | departmentId, name, active, revision |
| `Projects` | 有效專案清單 | projectId, name, active, revision |
| `Journals` | 每人每日一筆主紀錄 | journalId, date, employeeId, revision, updatedBy, requestId, note, tomorrow |
| `Tasks` | 工作明細（保留每版） | journalId, revision, position, title, status, hours |
| `Requests` | 重複請求去重 | requestId, actorEmail, journalId, revision |
| `Audit` | 變更事件記錄 | occurredAt, actorEmail, action, journalId, revision |
| `Meta` | schemaVersion | 固定 `3` |

`Tasks` 採用 append-only revision（新版本不刪除舊資料），可以降低意外覆蓋，但不是完整交易式資料庫或自動備份。建議管理員另外設定試算表定期備份與保留政策。

## 3. 建立 Apps Script 專案

1. 在瀏覽器打開 [script.google.com](https://script.google.com/) → 新增專案，名稱建議 `WorkPulse Server`。
2. 在 repo 本機執行 `npm run gas:build`，產生 `dist-gas/Code.gs`、`dist-gas/Index.html`、`dist-gas/appsscript.json`。
3. 將 `dist-gas/Code.gs` 全部貼到 Apps Script 的 `Code.gs`。
4. 新增一個 HTML 檔案，名稱必須為 `Index`；將 `dist-gas/Index.html` 的內容貼入。
5. 如要使用明確 OAuth scopes，開啟 *Project Settings → Show appsscript.json manifest*，套用 `dist-gas/appsscript.json`（需 `spreadsheets` 與 `userinfo.email` scopes）。
6. 在 *Project Settings → Script Properties* 設定以下三個鍵：

   - `WORKPULSE_SHEET_ID`：第 2 步取得的 Google Sheets ID。
   - `WORKPULSE_ALLOWED_DOMAIN`：公司 Google Workspace 網域，例如 `example.com`（**請更換成公司真實網域**）。
   - `WORKPULSE_ADMIN_EMAIL`：部署管理員信箱，且必須屬於上面的網域，例如 `admin@example.com`（**請更換**）。

7. 在 Apps Script 編輯器中，**由這位管理員手動執行** `setupWorkPulse_`，同意 Google 授權。它會建立 schema v3 的八個分頁及管理員 `Employees` 紀錄；重複執行不會複製管理員，但會檢查既有欄位格式。**已使用 schema v2 的公司必須先備份，並依 [`TEAM_ADMIN.md`](TEAM_ADMIN.md) 由管理員手動執行 `upgradeWorkPulseV3_()`；不要對舊表直接執行初始化。**
8. 管理員在 `Employees` 中新增員工，建議透過管理員「團隊管理」頁面進行，先建立部門再設定角色。原有資料不要刪除員工 ID，停用即可。**直接手動編輯表格必須維持唯一 email、ID 和正確 revision，否則可能被安全檢查拒絕讀取。**

## 4. 部署 Web App 與身分驗證

1. *Deploy → New deployment → Web app*，設定成以**部署者／擁有者身分執行**（Execute as me），存取範圍選**僅限該 Google Workspace 網域**（如果介面有該選項）。
2. 先由同網域管理員實際開啟部署網址；確認介面顯示 **「Google Sheets 已連線」**。
3. 使用另一位**未獲試算表直接分享權限**、但名列 `Employees` 的公司員工登入 Web App，測試「填寫 → 儲存 → 重新整理 → 查閱」。成功後還要確認該員工**無法直接開啟原始 Google Sheets**。
4. 用一位不在 `Employees` 的帳號、以及其他網域帳號實際測試拒絕存取；再用部門主管測試跨員工讀取及不可編輯別人的紀錄；管理員測試新增／停用員工、部門與專案。
5. 如果 Apps Script 因為帳號政策回傳空的 `Session.getActiveUser().getEmail()`，請**停止公司上線**。不要改成匿名、不要預設管理員、不要只用前端人員下拉選單來認證。需由 IT 管理者確認 Workspace 部署政策或評估其他身分驗證後端。

Google 官方文件：

- [Apps Script Web Apps（執行身分與部署）](https://developers.google.com/apps-script/guides/web)
- [Session.getActiveUser / email 可用性限制](https://developers.google.com/apps-script/reference/base/session)
- [HTMLService 的 google.script.run](https://developers.google.com/apps-script/guides/html/communication)
- [LockService 同步與配額](https://developers.google.com/apps-script/reference/lock/lock-service)

## 5. 資料權限與同步規則

- `staff`：只能查看、提交及修改自己工作日誌。
- `manager`：可以查看**相同 departmentId** 的在職與停用同事紀錄；僅允許編輯自己的紀錄。
- `admin`：可查看所有活躍／停用使用者的歷史紀錄；只能替 active 使用者提交及編輯；可管理員工、部門、專案。
- 日誌以 `date + employeeId` 唯一；每次成功儲存更新 `revision`。
- 儲存送出 `expectedRevision`：若其他人已修改，後端拒絕覆寫（`CONFLICT`），畫面保留草稿。
- 同一次儲存使用唯一 `requestId`，伺服端 `Requests` 登記已處理的請求；避免重複點擊造成重複紀錄。
- 讀取時僅回傳選定**月份**與有權限的紀錄；編輯過去月份，先讀取當月資料。
- 失敗時不會靜默切回本機，更不會聲稱雲端已儲存。
- Sheets 欄位內容做長度、日期、工時、類別驗證及公式注入處理，前端渲染也會 HTML escape。

## 6. 上線前驗收（不可略過）

- [ ] 公司管理員同意使用 Google Sheets 記錄工作資料，並決定員工資料保留和備份政策。
- [ ] Apps Script 版本與 Schema v3 初始化／遷移成功，且試算表未開放公開瀏覽。
- [ ] 管理員與至少一位一般員工使用各自 Google Workspace 帳號實測登入成功。
- [ ] 無名單或跨網域帳號遭拒絕，員工不能讀取或修改別人紀錄。
- [ ] 同一日期可儲存多項工作，頁面重新整理及跨裝置登入能讀到資料。
- [ ] 同時從兩個瀏覽器修改同日資料，第二個舊版本請求必須拒絕覆蓋。
- [ ] 短暫斷線後以同一 requestId 重送，不會產生重複工作明細。
- [ ] 跨月查詢、工時上限、停用員工權限、稽核記錄符合預期。
- [ ] 手機 320–390px 與桌面確認排版，執行 Lighthouse 或 DevTools 效能抽查。

> 現階段 `npm run verify` 會執行 Apps Script 邏輯的 **Node 模擬環境測試**，不等於公司帳號的真實授權或雲端端對端驗收。

## v0.4.0 報表功能補充

報表使用新端點 `wpQueryReport`，部署方式維持原架構，資料表仍是 schema v3，**不需要從 v3 再遷移**。但必須同時更新 `Code.gs` 和 `Index.html`，讓伺服端支援報表請求。請依 [`REPORTS.md`](REPORTS.md) 測試員工、部門主管與管理員的查詢及 Excel 匯出權限。
