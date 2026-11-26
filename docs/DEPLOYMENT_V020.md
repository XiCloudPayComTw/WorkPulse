# WorkPulse v0.20.0 正式部署手冊

本文件是現行優先部署流程；較早 DEPLOYMENT_V080.md 的匿名存取建議不得用於正式環境。程式已備妥，尚未操作公司 Google Drive。請勿將 GitHub Pages 展示版當正式入口。

## 1. 環境與所有權

由公司指定持有者使用公司管理的 Google 帳號登入，確認帳號復原、MFA、離職交接及公司授權；不要共用密碼。現有架構使用公司管理 My Drive，不支援 Shared Drive 的擁有者判定。先建立獨立測試環境（兩個 Apps Script 專案、獨立資料夾、控制表及備份資料夾）；正式環境再建立另一組，不能共用測試資料或 offline scope。公司若要求員工僅能存取自己的資料，須先實作伺服器身分授權；現行 domain 只確認網域，仍可選擇其他姓名。

## 2. 建置與首次私人初始化

在已合併且 CI 通過的版本執行 npm ci（如專案有 lockfile；否則依 package.json 安裝）及 npm run verify。將 dist-gas/admin 的全部檔案加入新建私人 Apps Script 專案，包含 appsscript.json；不要混入 legacy 檔案。確認 Asia/Taipei 時區。於專案設定輸入以下指令碼屬性（下表是占位符，勿直接照貼假值）。

| 屬性 | 私人 admin | 員工 public |
|---|---|---|
| WORKPULSE_ADMIN_EMAIL | 公司指定持有者 email | 相同 |
| WORKPULSE_ALLOWED_DOMAIN | 公司網域（無 @） | 相同 |
| WORKPULSE_ACCESS_MODE | domain | domain |
| WORKPULSE_SHEET_ID | 首次留空，初始化回傳 | 初始化取得的同一 ID |
| WORKPULSE_FOLDER_ID | 首次留空，或指定已驗證私人資料夾 | 同一 ID |
| WORKPULSE_BACKUP_FOLDER_ID | 獨立私人備份資料夾 ID | 不設定 |
| WORKPULSE_OPERATOR_EMAIL | 選用，須屬公司網域及符合權限政策 | 如使用，須與私人版一致 |
| WORKPULSE_OFFLINE_SCOPE | 不設定 | 選用 16–80 ASCII 英數／底線／連字號；每個部署環境獨立 |

1. 先執行 workPulseInitializationCheck（唯讀）。核對 checks 與 canInitialize；未設定備份與 domain 是正式上線待辦，勿忽略。若已有控制表，先備份並核對確為本系統；舊資料或表頭異常勿強制初始化。若既有 ID 指向別的環境、資料夾共用、父層共用或來源不確定，立即停止。
2. 由指定公司持有者單獨執行 workPulseInitialize，授權 Sheets/Drive。正常返回 controlId/folderId；它會建立或重用控制表與資料夾，不會自動建立每月檔案。將結果私下記錄，勿貼到 GitHub 或公開訊息。失敗後先核對已建立的檔案及屬性，不要任意清空 ID 或反覆建立；沒有全域交易保證。
3. 確認 Google Drive 中控制表及資料夾實際擁有者與父層權限，檢查 Meta schemaVersion=4、monthlyStorage=enabled。若舊控制表已有未遷移工作日誌，使用既有備份遷移程序；勿手改 Meta 或直接覆寫。

## 3. 兩套入口與備份

私人專案部署為網頁應用程式，執行身分為存取使用者，存取限制持有者（若額外授權維護者須驗證實際 Drive 權限與政策）。員工專案只放 dist-gas/public，執行身分為公司持有者，限制公司網域；核對兩套控制表及資料夾 ID 完全一致、domain 設定一致。以測試員工登入；若 active email 無法取得，停止，不降級 legacy。私人入口管理員新增至少一位測試人員。

在私人專案指定獨立備份資料夾後，持有者執行 workPulseInstallDailyBackup；核對 Apps Script 觸發條件（台灣 03:00–04:00 時段）、實際執行及產生的副本。不能因已登記觸發器便視為已備份。每日備份包含控制表、當月與上月（若存在）及輪替一個更舊月份，不是每日全歷史原子快照。無自動刪除。定期保留公司獨立副本並演練復原。

私人管理控制台的「正式部署準備度」或編輯器 workPulseDeploymentCheck 均為唯讀；configurationPassed 不代表已驗收。使用 workPulseVerifyMonthFiles 分批核對月份文件。注意 Apps Script 只能查看目前帳號可見的觸發器；須人工排除舊專案、其他持有者與重複部署。正式資料切換前先停用舊入口、檢查執行中的寫入。

## 4. v0.21.0 驗收閘門（均未實測）

- [ ] 公司持有者與交接；測試／正式環境隔離、兩套屬性及實際部署設定一致。
- [ ] 公司員工登入、外部與匿名拒絕、公開包無私人端點、公司確認選姓名模式的資料存取風險。
- [ ] 兩裝置日誌與出勤、同人同日修訂、版本衝突、月份索引、弱網手動重送、停寫及恢復。
- [ ] 既有展示版先下載移轉封包，私人預檢逐筆核對，不自動匯入或覆寫。
- [ ] 每日備份實際成功、權限與內容檢查、還原至獨立測試檔並重新對應索引；禁止直接覆寫正式資料。
- [ ] iOS/Android、桌面、Excel 開啟與重算，薪資維持本機手動保存。
- [ ] 記錄實際驗收日期、結果、負責人；任何未通過或未測試的必要項目都不得標為正式上線。

若部署失敗，保留既有資料及備份，停止新入口；必要時按既有停寫程序處理。回退應重新部署經核對相容的版本，不得以備份覆寫正式庫。後續更新雙方發布包時均須核對版本與停寫時機。
