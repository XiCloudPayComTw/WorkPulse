# v0.15.0 Google Drive 正式部署前置清單

本版本是可部署程式與前置檢查，並非已正式上線。既有 [DEPLOYMENT_V080.md](DEPLOYMENT_V080.md) 的建檔與兩套發布包程序仍適用，但匿名訪問建議由本文件正式模式取代。

## 公司控制與設定

1. 由公司指定持有者（非私人 Gmail）登入，確認帳戶復原及 MFA 由公司治理；如需更換原帳號，先規劃擁有權及 Apps Script 觸發器轉移。維持 My Drive 方案；Shared Drive 暫不相容。
2. npm run gas:build；私人 admin 及員工 public 各自獨立 Apps Script 專案，先用測試資料夾與測試部署。私人編輯器設定 WORKPULSE_ADMIN_EMAIL、WORKPULSE_ALLOWED_DOMAIN，執行 workPulseInitialize 初始化，兩套設定相同 WORKPULSE_SHEET_ID 與 WORKPULSE_FOLDER_ID。不得將正式資料指向測試部署。WORKPULSE_OPERATOR_EMAIL 若使用需符合私人存取與公司授權政策。
3. 兩套專案均設定 WORKPULSE_ACCESS_MODE=domain；員工入口執行身分為公司持有者、限制公司網域訪問；私人入口執行身分為存取者且只授權管理者。若 active email 因 Workspace 政策無法取得，拒絕存取，不得為求正常使用擅改 legacy。網域登入仍不限制使用者選擇其他員工姓名；若公司要求每人只能查閱自己資料，必須另作身份對應和伺服器授權，不能只隱藏 UI。公開包不含 Owner API。
4. 建立獨立私人備份資料夾 WORKPULSE_BACKUP_FOLDER_ID，私人編輯器執行 workPulseInstallDailyBackup，由持有者核對最近執行與實際副本。執行 workPulseDeploymentCheck，逐一查看 checks；configurationPassed 並不等同 productionVerified，後者刻意永遠 false。逐檔核對月份索引、權限、父層共用及備份。

## 停寫與維護

在私人編輯器以持有者身分執行 workPulsePauseFieldWrites，確認兩套新版都使用同一控制表且日誌與出勤寫入拒絕、保留草稿；停用舊部署入口並人工核對 Apps Script 執行紀錄、其他管理員及手動 Sheet 編輯均停止。至少 10 分鐘只是保守等待門檻，不是全域鎖。此時可進行邏輯刪除及獨立備份演練；直接還原正式資料仍未支援。完成後執行 workPulseResumeFieldWrites，再由員工入口驗證儲存，待同步原始請求仍需人工核對後重送。勿在停寫狀態備份後直接將控制表副本當正式檔案使用。

## 正式驗收（全部待公司實測）

- [ ] 公司資料持有者、維護及離職交接權限；確認 Drive 共享政策。
- [ ] 兩個員工帳號登入、外部帳號與匿名拒絕、管理員端點隔離；確認共用選姓名風險可接受，否則先實作個別授權。
- [ ] 跨裝置日誌、出勤、月檔、版本衝突，確認 private 端不能提交日常紀錄；停寫、重送、管理員設定競爭及舊部署停用。
- [ ] 每日備份副本及還原至獨立測試檔案，確認控制表索引不再指向正式檔案，逐筆比較資料；不覆寫正式資料。
- [ ] 手機 Safari/Chrome、橫向、鍵盤、弱網、Excel 真實重算及手動存檔。
- [ ] GitHub Pages 的既有本機資料先以原有 JSON 匯出保存。未提供自動遷移正式 Sheets，須另行核對人員及日期，不能把本機資料視為已同步。

未完成上述前不得對公司宣稱正式上線。


## v0.15.1 — Google Drive 驗收工具與本機移轉準備

- 基於已合併 PR #22/#23、main Pages CI 通過的 c93c440bbe23361264f0ce2880c75f461febee94；分支 feat/workpulse-v0.15.1-drive-verification，不自動 Merge。Google Drive／Sheets 唯一雲端方案，Firebase 取消不變。
- 私人編輯器 workPulseVerifyMonthFiles()：逐批核對最多 12 個索引月檔（預設最新），驗證持有者與私人分享初步條件、索引唯一、月份標籤、6 個分頁及表頭；回傳各表資料列數與 nextFromMonth；設定 WORKPULSE_VERIFY_FROM_MONTH 繼續舊月份。唯讀，不創檔、不改表，不代表完整資料一致性或還原驗收。
- 本機展示版手機／桌面提示新增「下載移轉封包」：保存已儲存日誌、工作明細、員工、專案、類型及全月份出勤；不取未提交草稿、不自動上傳、不包含薪資或未知出勤欄位；缺人員、重複與 demo ID 提醒，使用既有日誌格式正規化。非原始資料無損備份，仍須保留原 JSON、逐筆核對人員對應及資料；尚無自動匯入正式庫。資料應由公司私下保存。
- 弱網路：待同步區提示其他人員待處理筆數、可下載目前人員未確認的原始請求 JSON 供人工核對，原 requestId／revision 保留；不自動重送、不宣稱已儲存，不取代 sessionStorage／IndexedDB。窄手機按鈕重排為可觸控全寬與雙欄。
- 公司實際 Google Workspace 尚未授權，未建立真實資料或排程，個別員工身份授權、備份還原、跨裝置與真實手機驗收仍待完成；v0.15.2 優先完成公司部署及安全驗收，v0.16.0 進階離線與 PWA。不得把本機展示版當正式雲端。

操作：先在本機展示版下載移轉封包並保管；由公司管理者建立測試環境。私人編輯器執行 workPulseDeploymentCheck，再執行 workPulseVerifyMonthFiles；逐批核對 nextFromMonth，勿將檢查成功當作正式驗收。


## v0.15.2 — 正式資料移轉預檢

- 基於已合併 PR #24、Pages CI 通過的 main c1b0fa108b8d55a686604abcfede585c93b21d71，分支 feat/workpulse-v0.15.2-migration-preflight，不自動 Merge。
- 私人管理入口新增本機移轉封包預檢（最多 10 MB）：瀏覽器只保留來源人員識別、日期、紀錄類型與範例／重複標記，不保留完整工作內容；手動對應有效正式人員，預設不對應。展示範例、未對應及映射後同人同日重複項目排除；每次選一月份、最多 500 筆。正式人員名單以管理控制台資料為準，後端再次驗證。
- wpOwnerMigrationPreflight 僅資料持有者雙重身分驗證，唯讀；只接收 kind/date/employeeId，不接收完整工作內容。檢查當下已存在紀錄、曾刪除日誌及未找到現有紀錄；不建檔、不修改、不匯入、不保證查詢後狀態不變。核對結果可下載私人 JSON；無自動寫回及無自動覆蓋。前端清除可釋放暫存識別資料，重新整理即消失。
- Google Drive／Sheets 唯一雲端方案，Firebase 已取消。實際公司授權、備份、還原、跨裝置及真實手機驗收尚未完成；不聲稱已正式部署。個別員工身分隔離仍須由公司確認需求；維持選姓名工作流程，不新增主管審核。下一個可獨立開發批次 v0.16.0 進階離線，正式部署驗收可並行於公司授權後執行。

操作：私人控制台載入人員名單後，選擇本機移轉封包、逐人對應、選擇月份並執行唯讀預檢。下載結果後比對原始封包及實際正式資料。未找到紀錄也不代表可直接匯入，仍須核對資料內容與版本，禁止自動覆寫。正式環境驗收須由公司持有者實際執行。
