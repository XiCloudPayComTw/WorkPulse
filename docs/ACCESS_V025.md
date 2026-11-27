# WorkPulse v0.25.0｜免 Google 登入方案 A

2026-11-27 使用者確認方案 A。v0.24.1 TEST 已回報啟動成功，完整營運驗收尚未完成。第一批只建立私有安全基礎，尚未開放新 RPC、不是 v0.25.0 可部署版本；保持現有 domain 模式。

## 需求與安全界線

- 唯一管理員為指定公司資料持有者；管理 RPC 始終要求 active/effective 同時符合指定帳號，不接受員工存取碼或姓名作為管理憑證。
- 員工不用登入 Google。首次輸入公司共用存取碼，自行新增或選擇姓名；各頁保留選擇，日後同瀏覽器記憶工作階段與姓名，仍可從右上角切換。儲存受限、清除資料、工作階段到期時需重新驗證；非跨裝置帳號同步。
- 共用碼不是個人身分驗證。知悉存取碼者可選其他人員及讀寫相應工作、出勤，屬互信模式；稽核不得宣稱為已驗證個人。網址與存取碼外流仍有風險。
- GAS 執行者為公司持有者，須經 Workspace 政策允許匿名存取。Google 官方說明 execute-as-me 可能無法取得 active email（https://developers.google.com/apps-script/reference/base/session）；管理員身分不可取得時拒絕，不能用 effective email 取代。必要時評估同一 GAS 專案的受限管理部署，維持同版本、同 ScriptLock 及同資料庫，不新增另一個並行寫入專案。
- 私人 Drive ACL、現有 schema、索引、資料與備份不變。秘密、token 禁止放入 GitHub、URL、日誌、錯誤、備份或草稿。GitHub Pages 保持展示版。

## 分批開發

1. **私有安全基礎（本批）**：SharedAccess.gs 僅 unified 建置。伺服器 HMAC-SHA256 之 30 天 session；須用安全亂數產生獨立至少 24 字元 base64url 存取碼及 43 字元簽章金鑰，格式檢查不等於亂數強度。任一秘密輪替即撤銷舊 session；無效、逾期、竄改 token 或錯誤有效身分拒絕。ScriptLock 保護全域 5 分鐘 10 次失敗上限（匿名無可靠個人識別，可能被惡意阻斷，不能防所有攻擊）。session audit actor 僅匿名工作階段識別。不改 wpFieldMode_、doGet、wpFieldAccess_ 或既有 RPC；shared-code 仍被現行入口拒絕。版本維持 v0.24.1；新增 6 個 Node 測試，CI 待確認。
2. **後端全端點整合（下一批）**：新增最小無資料的登入狀態／token RPC；未驗證 doGet 只提供頁殼，不能讀資料。wpSharedBootstrap、wpSharedLoadMonth、wpSharedSaveJournal、wpSharedQueryReport、wpAttendanceLoad、wpAttendanceSave、wpAttendanceRange 與自助新增人員 RPC 一律先驗證；寫入在鎖內再次驗證及檢查停寫、requestId/revision。自助只新增普通啟用人員，後端核對姓名、重名、數量、去重、稽核，不允許任意 ID、role/email 或編輯停用他人。所有 wpOwner*、初始化、遷移、備份、維護 RPC 仍僅指定管理員。逐一核對維護、停寫門檻、排程、離線 scope、稽核和重送，不能因新 mode 放寬。
3. **前端及發布**：存取碼入口、失效重新驗證、自助姓名選擇與記憶、跨頁、原右上角切換；session 與草稿分離，不在 URL 傳遞、不退回展示版。保留 v0.24.1 GAS ASCII/UTF-8 打包、UI/UX、出勤、備份。前後端齊備、文件與 CI 一致後才提升 v0.25.0。
4. **TEST 實測**：完整拒絕測試通過後，由使用者私下設定秘密；保留 TEST ID，勿初始化。確認 Workspace 匿名選項與管理員身分可用，才變更部署設定；不允許則保持 domain。測試免 Google/無碼拒絕、錯碼限流、正碼、session 記憶及撤銷、直接管理 RPC 拒絕、管理員驗證、姓名新增切換、跨裝置同步、停寫、衝突去重、備份還原。修訂 A01–A17 後實測，未通過不得正式發布。

每批獨立 PR，由使用者手動 Merge。第一批不得變更現有部署、資料庫、存取模式或發布版本。
