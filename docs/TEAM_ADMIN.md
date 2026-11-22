# WorkPulse v0.3.0｜團隊與權限管理

> 本版提供可部署程式碼與模擬測試，**未在公司 Google Workspace 實際部署**。GitHub Pages 仍是純本機展示版；「團隊管理」只有 Apps Script 雲端版、且伺服端確認登入者是 `admin` 才會顯示。畫面顯示不是安全邊界：所有管理 API 仍在 Apps Script 中逐次核對角色。

## 權限矩陣

| 功能 | `staff` | `manager` | `admin` |
|---|---|---|---|
| 讀取自己的日誌 | 是 | 是 | 是 |
| 編輯自己的日誌 | 是 | 是 | 是 |
| 讀取同部門在職及離職員工的歷史日誌 | 否 | 是 | 是 |
| 讀取其他部門日誌 | 否 | 否 | 是 |
| 編輯其他人在職員工日誌 | 否 | 否 | 是 |
| 維護員工、部門、專案 | 否 | 否 | 是 |
| 讀取完整人事名冊（含停用） | 否 | 否 | 是 |

停用的人員無法登入／新增／修改任何工作日誌，但日誌內容與員工 ID **不會刪除**。主管可查原部門歷史紀錄，管理員可跨部門查閱。停用的專案不再可選為新工作項目，但歷史工作明細仍保留原有專案文字。部門停用前必須先移動或停用其所有在職員工。

## 第一次使用：建立新資料表

1. 依照 [GOOGLE_SHEETS_DEPLOYMENT.md](GOOGLE_SHEETS_DEPLOYMENT.md) 設定公司試算表、同網域 Apps Script 和 `WORKPULSE_*` Script Properties。
2. 由 `WORKPULSE_ADMIN_EMAIL` 帳號在 Apps Script 編輯器手動執行 `setupWorkPulse_`。它會建立 **schema v3** 的八個表：`Employees`、`Departments`、`Projects`、`Journals`、`Tasks`、`Requests`、`Audit`、`Meta`。
3. 確認 Google Workspace Web App 部署身份確實能用 `Session.getActiveUser().getEmail()` 取得**目前登入者**，否則應停止上線。不要退回匿名模式或單純姓名下拉選單。
4. 由管理員進入「團隊管理」，先建立部門，再新增員工及指定角色／部門；至少兩個真實公司帳號進行跨帳號權限驗收。

## 由 v0.2.0 / schema v2 遷移（**必要**）

1. 先備份原試算表（檔案 → 建立副本），確認原本八欄以下的工作表與現有日誌都在備份中，將網站暫停寫入；請勿直接重跑 `setupWorkPulse_`。
2. 將 v0.3.0 建置後的 `dist-gas/Code.gs`、`Index.html` 內容更新至 Apps Script；部署前先由 `WORKPULSE_ADMIN_EMAIL` 以編輯器手動執行 **`upgradeWorkPulseV3_()`**。
3. 遷移只接受 `Meta.schemaVersion = 2`，並驗證 `Employees`、`Projects` 既有欄位前綴。它新增 `Departments`，將現有員工的 `departmentId` 建立成同 ID 部門，為員工／專案加上 `revision`、`updatedAt`、`updatedBy`，最後才更新 `schemaVersion = 3`。
4. **不會刪除或重新指派任何既有的 employeeId／journalId／taskId。** 若中途中斷，保留備份，先檢查表頭再重新執行；遇到格式不一致會拒絕推測，需人工排查。
5. 檢查部門名稱（預設沿用部門 ID），確認停用與主管範圍，再發佈新的 Apps Script Deployment Version；逐一以管理員、主管、員工進行端對端驗收。

## 管理操作與保護

- 管理員可在「團隊管理」切換員工、部門、專案；支援新增、修改、停用、重新啟用。既有資料只做 soft delete，永不直接刪列。
- `employeeId`／`departmentId`／`projectId` 是不可變更的固定識別碼；換 email、名稱或部門時，歷史工作項目仍依 ID 關聯。
- 員工 email 必須屬於設定的公司網域，且不得與任何現有帳號（包含停用）重複。主管必須有部門。人員只能指派到啟用中的部門。
- 管理員不可停用自己、降權自己或改掉自己的登入信箱；`WORKPULSE_ADMIN_EMAIL` 帳號受到額外鎖定，不能被其他管理員轉移／移除，也不允許停用最後一位啟用中的管理員。
- 每筆寫入包含 `expectedRevision`（多人編輯衝突檢查）和 `requestId`（同一次請求去重），伺服端在 LockService 鎖內重新確認身份、權限與資料版本；拒絕靜默覆寫。
- 管理操作會記錄到 `Audit`：`action=Employees:create`／`Departments:update`／`Projects:update` 等；`journalId` 欄存放 `Employees:<id>` 等對應資料 ID，並沿用原有 `Requests` 登記去重資訊。
- 若伺服端回報 CONFLICT，表單保留目前輸入；管理員應先重新整理並確認最新資料，再重新提交。

## 尚待真實上線驗證

- 授權政策、網域與 `Session.getActiveUser()` 的實際登入辨識。尤其不能把「以擁有者身分執行」當成必定取得訪客 email；必須實測。
- 兩位管理員同時編輯同筆人員、停用人員後跨裝置即時拒絕、主管跨部門拒絕及離職人員的歷史資料查閱。
- 公司資料備份、試算表直接共用權限、保留年限及離職交接流程。
- Apps Script + Google Sheets 大量名冊的效能；此架構適合小型團隊試行，尚非大型 HR 資料庫。
