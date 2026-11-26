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

## 6. 不必在本機安裝 Node.js 的下載方法

GitHub Actions 的 check 通過後，該 run 的 Artifacts 區域會有 workpulse-gas-unified-<run_id>-<run_attempt> ZIP（保留 30 天，登入 GitHub 才可下載）。只選已合併版本且完整 CI 通過的 run；解壓後即三個部署檔案，不必自己執行建置。過期時可重新以原始碼執行 gas:build。發布包沒有公司帳號密碼、Script Properties、資料庫或授權憑證。


## v0.23.0 — 手動備份與復原中心

- 基於已合併且 CI 全綠的 PR #32/#33，main 3f7ab28f39934735c0d0744c9668f3d2d6e90fe8，分支 feat/workpulse-v0.23.0-manual-backup；不自動 Merge。單一入口及三檔發布保留。
- 管理員中心提供明確確認後建立/重用獨立私人 WorkPulse_Backups 資料夾、讀取已索引月份、停寫及恢復。全部備份逐檔（控制表＋當下索引所有月份），須停寫、人工確認舊入口及執行已停止；每檔前與完成後核對月份清單及同一停寫時間，鎖內核對停寫 token。若失敗停止，保留同一 requestId，核對 Drive 後手動續傳；不自動重送。進度僅頁面記憶，關閉/重載不繼續，下載結果保留請求識別碼。未完成批次不可直接恢復，需下載紀錄、人工核對後重載並恢復。非整庫原子快照；外部手動修改或舊部署仍需人工防範。現有單檔複製額外核對來源私人權限與索引。
- 管理員可逐檔下載 JSON 資料值（250000 儲存格、150萬字元上限），不含公式/格式、清空 monthlyWage/overtimePay 欄位，其他資料仍屬私人含人員識別與索引 ID；不可直接匯入，不是完整備份。月檔復原預檢由 UI 輸入兩份私人、非現行正式索引的月檔 ID，沿用唯讀值比對，不寫回、不 remap；其他環境的索引須人工核對，控制表整庫演練仍需人工。自動排程維持選用。
- 新增四個持有者限定 RPC，更新公開函式清單及拒絕測試。合成資料測試資料夾、停寫 token、JSON 薪資欄位清空、逐檔失敗續傳；原有完整性、PWA、IndexedDB 及響應式測試保留。未授權或操作公司 Drive，未實測 Apps Script/手機。下一批 v0.24.0 安裝及操作手冊；正式 v1.0.0 需實際驗收。
