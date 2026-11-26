# 公司資料所有權及備份選項（2026-11-26）
目前 GitHub Pages 本機資料不等於公司正式資料庫。正式模式使用公司原生 Google Sheets，既有私人持有者與排程尚待實際授權驗收。建議公司管理帳號或 Workspace Shared Drive（若方案支援）；Shared Drive 檔案歸團隊，現有 My Drive getOwner 及私人資料夾檢查並不相容，需重新設計與測試 ACL、部署身份、備份。至少兩名公司授權管理者、個人帳號僅維護權限、離職可撤銷。不可共用密碼，啟用 MFA。Apps Script 觸發器須以公司控制的執行身分重新安裝驗收。

可選第二份備份：公司組織下 Firebase/Google Cloud 專案（非個人獨占），Cloud Firestore Spark 標準免費 1 GiB、每日 50k 讀取、20k 寫入、20k 刪除、每月 10 GiB 對外傳輸；原生排程備份、還原、PITR、Cloud Functions、Cloud Storage 需計費方案。Apps Script 外部排程可透過驗證 OAuth 2.0 / IAM 寫入結構化快照，不開放公開讀寫，不把憑證放前端或 GitHub。按記錄版本保存、去重、分批及完成 manifest/校驗；每筆最大 1 MiB，避免整月單文件；不永久保存每日完整副本，採保留期限及每月獨立可攜匯出，必須測量實際資料量、讀寫額度並驗收還原。備份與主庫同供應商並非真正異地隔離，另定期下載加密的 JSON/CSV 或公司 NAS/異地離線副本。薪資只在會計 Excel 私人檔，不納入一般備份。

本批僅評估，不建立 Firebase 專案、不傳輸公司資料、不切換主庫、不啟用計費。正式選擇由公司確認後納入 v0.15.0 部署前置。若既有 Workspace 可滿足所有權需求，優先保持 Sheets 主庫以降低遷移成本；若未來需要多人交易、個別帳號或大規模資料，可評估 Firestore 主庫重新設計，而非雙主庫。

官方：https://firebase.google.com/docs/firestore/pricing
https://firebase.google.com/docs/firestore/use-rest-api
https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
https://support.google.com/a/users/answer/9310351
https://docs.cloud.google.com/resource-manager/docs/creating-managing-organization
