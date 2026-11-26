# WorkPulse v0.22.0｜三檔案安裝

本文件優先於舊雙入口部署手冊。先用已合併且 CI 通過的版本，在公司指定持有帳號建立的獨立測試專案操作。不要共用測試與正式資料庫，不使用 GitHub Pages 當正式入口。

## 1. 建置

Node.js >=20，專案根目錄執行 `npm run gas:build`。只用 `dist-gas/unified` 中的 Code.gs、Index.html、appsscript.json。既有 Admin TEST 預設 Code.gs 可以覆蓋；新增 HTML 檔名 Index（系統附加 .html）；覆蓋既有 appsscript.json。若曾匯入其他 .gs，先備份舊程式並移除舊版重複函式，不可混裝。原始 `apps-script` 不是發布包。保留既有屬性：WORKPULSE_ADMIN_EMAIL、WORKPULSE_ALLOWED_DOMAIN、WORKPULSE_ACCESS_MODE=domain。不要設定 WORKPULSE_OPERATOR_EMAIL；單入口只支援主持有者管理。其他 ID 首次留空，已指定則先核對環境。所有 ID 私下保存。

## 2. 授權與初始化

先執行 workPulseInitializationCheck 並確認 Google 官方授權視窗的帳號及 scopes，核對 canInitialize；缺少備份資料夾不阻止空白初始化，但錯誤權限或設定會阻止。再由主持有者執行 workPulseInitialize，確認控制表與資料夾擁有權、Meta、Script Properties。記錄結果而非反覆初始化。既有資料須備份，不任意清空屬性或修改 Meta。

## 3. 單一部署

部署為網頁應用程式，執行身分「我」（指定持有者），存取限公司網域，切勿選匿名。只有一個 /exec 網址，持有者登入出現管理員控制台；一般已驗證公司員工只出現工作功能。若真實 Workspace 無法取得 active email，停止，不降級 legacy，也不把一般員工升為管理者。公司須接受已驗證同仁能選其他姓名；若要求個別資料隔離需另開發。先新增測試人員，再依 ACCEPTANCE_V021.md 測試跨裝置、衝突、出勤、手機與 Excel。若從舊雙入口遷移，停用舊入口並確認沒有進行中寫入再切換，避免跨專案鎖競爭；不得同時寫入。

## 4. 手動備份

不必安裝每日觸發器。定期在 Google Drive 由持有者複製控制表及所需全部月檔，存入獨立私人備份資料夾，核對權限、版本、內容與月份。建議每週及重要變更前備份，依公司可接受資料損失期間調整。控制表索引仍指向原始月檔，還原演練必須在獨立測試環境重新對應月檔，禁止覆寫正式資料。既有管理台逐檔備份可選用：設定 WORKPULSE_BACKUP_FOLDER_ID，須是不同私人資料夾；不需觸發器。自動排程仍選用（manifest 保留 script.scriptapp scope），已啟用舊排程者先人工核對實際觸發器；不會自動移除。手動備份中心完整功能規劃 v0.23.0。備份/還原及所有正式驗收均須實測，configurationPassed 不是 productionVerified。

## 5. 日後更新

先備份及停寫，重新建置三檔、更新同一測試專案，驗收後再更新正式部署版本。不得混裝兩包。回退必須確認 schema 相容、停用新入口後才啟用經驗證的舊入口。舊雙包與原部署手冊保留作回退參考。
