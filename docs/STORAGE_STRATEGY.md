# WorkPulse 公司資料儲存決策（2026-11-26，v0.15.0 起）

使用者已確認 Google Drive／Google Sheets 為唯一雲端資料架構；取消 Firebase Firestore，無 Firebase 專案、憑證、排程、資料傳輸或付費方案。GitHub Pages 仍是本機展示版，不代表已同步。公司控制的 My Drive 帳號保存 WorkPulse_Control、WorkPulse_YYYY-MM 及獨立私人備份資料夾。公司帳號前綴不影響所有權，但公司須掌握復原、MFA 與離職交接，不共用密碼；由公司授權管理者保管。Shared Drive 是未實作的另一種 Drive 持有方式，現有 getOwner 檢查不相容，不得直接搬移。

每日 Apps Script 備份保留控制表、當月、上月及輪替歷史月份；未設定自動刪除，應定期核對容量及備份成功。建議另定期保存獨立離線公司副本，並定期演練還原。薪資僅本機 Excel、手動私人 Drive 保存，不進一般日誌資料庫。

正式部署及驗收依 [DEPLOYMENT_V015.md](DEPLOYMENT_V015.md)。未操作公司真實 Drive，未安裝排程；公司須先登入及授權。舊 Firebase 評估由 Git 歷史保存，不再納入路線。
