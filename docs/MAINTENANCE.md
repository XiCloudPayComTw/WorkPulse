# WorkPulse 營運維護 v0.14.0


## v0.14.0 — 營運維護第一階段

- 基於 PR #19 已合併且 Pages CI 成功的 main b6f8f9031319e50b18f92077585ccd05d274ac2e；分支 feat/workpulse-v0.14.0-maintenance。不自動 Merge。
- 私人管理員控制台：按月查閱控制表當月／指定月份檔 Audit（合併後最多 100 筆）、已刪除日誌唯讀清單（最多 100 筆）。不返回日誌全文、不修改既有資料。公共封包無私人 API。
- 持有者限定單檔 Drive 原生副本：明確配置 WORKPULSE_BACKUP_FOLDER_ID，檢查持有者、私人分享及編輯／檢視權限，拒絕同營運資料夾；控制表或指定月份各自備份，requestId 防重複命名，來源與副本工作表／列數比對僅作初步檢查。非原子跨檔快照；建議暫停填寫再執行。未操作真實公司 Drive。
- 公開與私人 Apps Script 是不同專案，ScriptLock 不跨專案，不能宣稱全域多人互斥。刪除仍是稽核標記；直接恢復至正式資料、跨專案寫入序列化、自動排程及完整還原演練留 v0.14.1，禁止自動覆寫正式資料。詳見 [MAINTENANCE.md](MAINTENANCE.md)。
- 薪資仍僅 Excel、本機下載手動存 Drive。

## 備份前設定

由公司資料持有者建立一個獨立、未分享的 My Drive 資料夾，於私人管理 Apps Script 的 Script Properties 設定 `WORKPULSE_BACKUP_FOLDER_ID`。不要放在公開／共用父資料夾。使用資料持有帳號登入私人入口；維護人員可查詢稽核，但不允許建立備份。按月份查閱操作紀錄，再選擇控制表或指定月份建立副本。副本保留原始資料，包括歷史紀錄，需限制權限。

## 還原演練（人工，非正式還原）

先停止相關寫入，核對控制表與月份檔的備份時間、MonthIndex、Journals、Tasks、Requests、Audit、Meta、Attendance、AttendanceSettings；複製到獨立測試資料夾與測試部署，不指向正式資料 ID。比對逐筆資料與關聯，測試工作日誌、出勤及版本。禁止直接用副本覆寫正式表。原始控制表的 MonthIndex 仍指向正式檔案，必須在測試副本重新設定索引。單檔列數比對不是完整性驗證；未經實機驗收不視為可災難復原。Google Workspace 版仍須公司授權及實測。

- 響應式：900px 以下出勤明細採逐日卡片，桌面保留完整表格；底部導航均分、44px 以上主要觸控區、16px 表單、safe-area 與浮動提示位置調整；原本手機隱藏會計與法規區的決策維持。Chrome 加驗導航無溢出、觸控高度與輸入字級；iOS/Android 鍵盤、旋轉與觸控仍需實機驗證。

- 備份新增模擬 Drive 複製成功、同 requestId 重試、拒絕額外分享者及正式索引不變測試。GAS viewport 同步 viewport-fit=cover。備份權限驗證不能代替實際 Drive 管理員檢查（含父層分享）。稽核 selected: 人員僅代表選取的姓名，不能當成登入身分證明。


## v0.14.1 — 定期備份、內容核對與復原準備

- 基於 PR #20 已合併、Pages CI 通過的 main fff629f5f163f96bc854a6e2029b99fcaca9f6ba，分支 feat/workpulse-v0.14.1-backup-recovery，不自動 Merge。
- 每日備份排程：僅由資料持有者登入私人 Apps Script 編輯器執行 workPulseInstallDailyBackup，先配置私人 WORKPULSE_BACKUP_FOLDER_ID；03:00–04:00 台北時間為預設觸發區間（Google 調度非精準分鐘）。控制表、已存在的當月、上月及每日輪替一個較舊月份；未自動刪除備份。每日日期與目標作命名去重；同日重試若來源已變動，拒絕宣稱驗證成功。管理員可看到最近一次結果；移除用 workPulseRemoveDailyBackup。私人封包額外 script.scriptapp scope，公開封包不增加。
- 備份核對已由列數提升為已知 schema 欄位的儲存格值前後比對（最多 250000 格），非公式／格式／ACL 完整驗證、非跨檔原子快照；來源變動拒絕確認，不自動刪副本。觸發器需符合已登記 UID 及持有者 effective account。未安裝真實觸發器、未操作公司 Drive。
- 管理員可查閱已刪除日誌快照、檢查同人同日正式紀錄衝突、下載 JSON 人工核對；不變更正式資料，不自動解除刪除標記。跨專案寫入互斥未完成，直接復原與完整還原演練移至 v0.15.0 的正式環境驗收前置；普通使用者以姓名選取並非登入驗證。
- 月份與跨月報表以 journalId 建立 task index，避免每份日誌掃描全部工作明細；保留 revision 過濾及原有查詢上限，無真實大型資料量基準測試。
- 使用者確認將所有行動版提升納入正式路線，見 [ROADMAP.md](ROADMAP.md)。工作日誌及出勤正式保存仍使用公司 Drive 原生分月 Sheets；GitHub Pages 本機版不會自動上傳。薪資只在下載 Excel 處理。
