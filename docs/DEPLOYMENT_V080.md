# WorkPulse v0.8.0｜Google Drive 正式部署指南

狀態：已開發可部署的程式與自動化測試，但尚未連接公司的 Google 管理帳號，也沒有真實上線。請勿將 GitHub Pages 展示版當作雲端正式版。

## 1. 系統架構

管理者 hello.murui.lab@xicloudpay.com.tw 的 Google Drive 中，設有 WorkPulse 資料夾，包含：

- WorkPulse_Control：控制用 Google Sheets，集中保存 Employees、Projects、MonthIndex、Meta 等管理資訊。
- WorkPulse_2026-11：11 月工作日誌，含 Journals、Tasks、Requests、Audit、Meta。
- WorkPulse_2026-12：12 月工作日誌。之後新增日期時同樣自動建立 WorkPulse_YYYY-MM。
- 對不存在月份的查詢會回傳空資料，不會建立空白試算表。
- MonthIndex 記錄月份與 spreadsheet ID 的對應，跨月報表讀取各月份試算表。
- 使用 ScriptLock 防止同月多次併發建檔；若產生未索引的同名月檔，先查驗後復用而不直接再新增。

資料直接寫入 Google Sheets，不是下載 xlsx 再重複匯入。需要 Excel 時，仍能從網站產生 xlsx 報表。

## 2. 安全架構：兩個獨立 Apps Script 專案

執行 npm run verify 和 npm run gas:build，會得到兩個發布包。

| 發布包 | 檔案 | 部署方式 |
|---|---|---|
| dist-gas/public | Core.gs、Monthly.gs、Simple.gs、Index.html、appsscript.json | 公開填寫／歷史查詢，執行身分為管理者 |
| dist-gas/admin | 上述檔案加 Owner.gs | 私人管理員網站，執行身分為存取者，只開放管理者 |

公開版絕對不可以混入 Owner.gs、舊 Code.gs 或 Review.gs。即使刪除按鈕隱藏，只要公開後端包含管理 API，仍可能被直接呼叫。

所有內部工具函式以底線結尾，是 Apps Script 的私有方法，不能由 google.script.run 從網頁直接呼叫。

選姓名並非身分驗證。任何能開啟公開網址的人都可能選擇其他人的姓名填寫或查閱。正式使用前，公司必須評估資料敏感度與網址散佈範圍；如果需要保護個別員工資料，則需新增登入制度。

## 3. 用公司管理者帳號初始化雲端

1. 請使用 hello.murui.lab@xicloudpay.com.tw 登入 Google Drive。
2. 建立私人 Apps Script 專案，將 dist-gas/admin 內的檔案加入；必要時在編輯器專案設定中開啟 Manifest 檔案檢視。
3. 在私人專案「專案設定 → 指令碼屬性」設定：
   - WORKPULSE_ADMIN_EMAIL = hello.murui.lab@xicloudpay.com.tw
   - WORKPULSE_ALLOWED_DOMAIN = xicloudpay.com.tw
4. 在 Apps Script 編輯器選擇 workPulseInitialize 並執行。由公司帳號本人同意 Sheets 與 Drive 授權。
5. 程式自動建立 WorkPulse 資料夾、WorkPulse_Control 試算表、員工與月份索引結構，並將 WORKPULSE_SHEET_ID、WORKPULSE_FOLDER_ID 記錄在私人專案 Script Properties。
6. 回到 Google Drive 檢查檔案擁有者確實是指定公司管理者，確認控制表 Meta 的 monthlyStorage = enabled。
7. 後續可以透過私人管理員網站新增／停用員工。一般員工只需選姓名，無須建立個別 Google 帳號。

重複初始化會使用已設定的工作簿與資料夾。若控制表已有舊版日誌，系統會拒絕直接啟用分月模式，要求先做備份與遷移。

## 4. 部署公開員工網站

1. 以相同的公司管理者 Google 帳號，另建一個全新的 Apps Script 專案。
2. 只加入 dist-gas/public 發布包，絕對不要加入 Owner.gs。
3. 在公開專案的 Script Properties 設定以下四個值，與私人專案一致：
   - WORKPULSE_ADMIN_EMAIL、WORKPULSE_ALLOWED_DOMAIN
   - WORKPULSE_SHEET_ID、WORKPULSE_FOLDER_ID
4. 部署 → 新增部署 → 網頁應用程式。執行身分選管理者自己，訪問對象依組織政策設定；若要無 Google 登入的使用者可使用，該訪問設定必須允許匿名存取（可能受到 Workspace 管理政策限制）。
5. 用取得的 /exec 網址驗證選姓名、填寫多項工作、儲存、歷史讀取及跨月報表。
6. Google Sheets 不要開放「任何人可編輯」，由後端以管理者身分存取即可。

## 5. 部署私人管理網站

1. 在私人專案部署為網頁應用程式，執行身分選「存取網頁應用程式的使用者」，訪問對象限制「只有自己」或等效私有存取控制。
2. 管理者本人登入私人 /exec 網址，允許 Google 授權後，才會出現管理員控制台。
3. 新增使用者後，確認公開網站可以重新同步選到新姓名。
4. 刪除工作日誌時，需要先確認，再輸入「刪除」。後端確認真實管理帳號、日期與版本，並保留 Audit 邏輯刪除紀錄。
5. 用其他帳號或匿名視窗測試私人網址，必須拒絕操作；公開網站也不應能呼叫 Owner.gs 任何端點。

兩個 Apps Script 專案的 Script Properties 不會自動共用。注意不要把私人 Google Drive 的控制表 ID 填成公司的正式 ID。

## 6. 舊單一試算表的備份遷移

1. 停用舊版的寫入入口，避免搬移中途又產生新資料。
2. 管理者先完整複製控制試算表，確認備份 Journal ID、日期與資料版本一致。
3. 在私人 Apps Script 的 Script Properties 設定 WORKPULSE_BACKUP_SHEET_ID 為備份工作簿 ID，不能與控制表 ID 相同。
4. 執行 workPulseInitialize。若已有舊日誌，應顯示需要備份遷移的錯誤，不會偷偷清空。
5. 執行 workPulseMigrateLegacy。系統會按日期複製 Journals、Tasks、Requests 與相應 Audit 到月檔，成功後才啟用月度儲存。
6. 核對 MonthIndex、每月件數、跨月查詢及 Excel 匯出。舊控制表資料保留，不會直接刪除。
7. 不得手動修改 schemaVersion 或 monthlyStorage 來跳過檢查。

## 7. 正式上線前驗收

- [ ] 所有 Drive 檔案擁有者都是 hello.murui.lab@xicloudpay.com.tw
- [ ] public 發布包沒有 Owner.gs、舊 Code.gs 或 Review.gs
- [ ] 管理員私人網頁只有公司管理者能登入及操作
- [ ] 2026-11 與 2026-12 由首次儲存自動各建立一份原生 Google Sheets
- [ ] 重複儲存同個月不會新增第二個同名檔，查詢空月份不建檔
- [ ] 跨月報表正確，邏輯刪除的日誌不會出現在一般查詢
- [ ] 資料更新有版本衝突保護，刪除有兩次確認及 Audit
- [ ] 無廣泛共用 Google Sheets 編輯權限
- [ ] 真實多人同時填寫、斷線恢復、手機與桌面版型、資料備份及效能完成驗收

## 8. 尚未完成的部分

目前未能使用公司管理者的真實 Google Drive 連線建立檔案，也沒有正式的 Apps Script /exec 網址；這些步驟必須在公司帳號授權後執行。程式測試不等於真實 Workspace 網域政策與授權驗收。

下一批優先處理公司實際部署驗收、資料備份恢復、配額與大資料量效能。GitHub Pages 仍是本機演示入口，不會直接寫進 Google Drive。
