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
