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
