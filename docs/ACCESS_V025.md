# WorkPulse v0.25.0｜免 Google 登入方案 A

> 歷史規格：自助新增及切換已被 [v0.25.1 固定人員規格](ACCESS_V0251.md) 取代。

2026-11-27 使用者確認方案 A。v0.24.1 TEST 已回報啟動成功，完整營運驗收尚未完成。第一批 #39 已合併，main CI #45960253370 成功（194/194 Node）；第二批 #40 已合併，main CI #45963121694 成功。第三批前端與 v0.25.0 候選提交；現有 TEST 維持 domain，待 CI、手動合併及實機。

## 需求與安全界線

- 唯一管理員為指定公司資料持有者；管理 RPC 始終要求 active/effective 同時符合指定帳號，不接受員工存取碼或姓名作為管理憑證。
- 員工不用登入 Google。首次輸入公司共用存取碼，自行新增或選擇姓名；各頁保留選擇，日後同瀏覽器記憶工作階段與姓名，仍可從右上角切換。儲存受限、清除資料、工作階段到期時需重新驗證；非跨裝置帳號同步。
- 共用碼不是個人身分驗證。知悉存取碼者可選其他人員及讀寫相應工作、出勤，屬互信模式；稽核不得宣稱為已驗證個人。網址與存取碼外流仍有風險。
- GAS 執行者為公司持有者，須經 Workspace 政策允許匿名存取。Google 官方說明 execute-as-me 可能無法取得 active email（https://developers.google.com/apps-script/reference/base/session）；管理員身分不可取得時拒絕，不能用 effective email 取代。必要時評估同一 GAS 專案的受限管理部署，維持同版本、同 ScriptLock 及同資料庫，不新增另一個並行寫入專案。
- 私人 Drive ACL、現有 schema、索引、資料與備份不變。秘密、token 禁止放入 GitHub、URL、日誌、錯誤、備份或草稿。GitHub Pages 保持展示版。

## 分批開發

1. **私有安全基礎（#39 已合併）**：SharedAccess.gs 僅 unified 建置。伺服器 HMAC-SHA256 之 30 天 session；須用安全亂數產生獨立至少 24 字元 base64url 存取碼及 43 字元簽章金鑰，格式檢查不等於亂數強度。任一秘密輪替即撤銷舊 session；無效、逾期、竄改 token 或錯誤有效身分拒絕。ScriptLock 保護全域 5 分鐘 10 次失敗上限（匿名無可靠個人識別，可能被惡意阻斷，不能防所有攻擊）。session audit actor 僅匿名工作階段識別。不改 wpFieldMode_、doGet、wpFieldAccess_ 或既有 RPC；shared-code 仍被現行入口拒絕。版本維持 v0.24.1；新增 6 個 Node 測試，#39 main CI 已通過。
2. **後端全端點整合（#40 已合併）**：新增最小無資料的登入狀態／token RPC；未驗證 doGet 只提供頁殼，不能讀資料。wpSharedBootstrap、wpSharedLoadMonth、wpSharedSaveJournal、wpSharedQueryReport、wpAttendanceLoad、wpAttendanceSave、wpAttendanceRange 與自助新增人員 RPC 一律先驗證；寫入在鎖內再次驗證及檢查停寫、requestId/revision。自助只新增普通啟用人員，後端核對姓名、重名、數量、去重、稽核，不允許任意 ID、role/email 或編輯停用他人。所有 wpOwner*、初始化、遷移、備份、維護 RPC 仍僅指定管理員。逐一核對維護、停寫門檻、排程、離線 scope、稽核和重送，不能因新 mode 放寬。
3. **前端及發布**：存取碼入口、失效重新驗證、自助姓名選擇與記憶、跨頁、原右上角切換；session 與草稿分離，不在 URL 傳遞、不退回展示版。保留 v0.24.1 GAS ASCII/UTF-8 打包、UI/UX、出勤、備份。前後端齊備、文件與 CI 一致後才提升 v0.25.0。
4. **TEST 實測**：完整拒絕測試通過後，由使用者私下設定秘密；保留 TEST ID，勿初始化。確認 Workspace 匿名選項與管理員身分可用，才變更部署設定；不允許則保持 domain。測試免 Google/無碼拒絕、錯碼限流、正碼、session 記憶及撤銷、直接管理 RPC 拒絕、管理員驗證、姓名新增切換、跨裝置同步、停寫、衝突去重、備份還原。修訂 A01–A17 後實測，未通過不得正式發布。

每批獨立 PR，由使用者手動 Merge。第一批不得變更現有部署、資料庫、存取模式或發布版本。

### 第二批 RPC 合約（#40 已合併）

- `wpAccessStatus()` 僅回傳 `{mode,owner}`，`wpAccessUnlock(code)` 換取 `{token,expiresAt}`。`shared-code` 需明確設定，現有 `domain` 行為不變；匿名 doGet 只提供 HTML 頁殼。
- 七個既有員工 RPC 保留第一參數格式，新增第二參數 token（不放入 payload／離線佇列）。共享模式無 token 只允許 active/effective 雙驗證持有者；有效 token 一律員工角色。`wpSelfCreateEmployee({name,requestId},token)` 僅共享模式有效 token，可新增普通啟用人員；NFKC 正規化、重名（含停用及管理員）、總人員上限 200、拒絕公式型／控制字元姓名、拒絕額外欄位、停寫與去重。伺服器以請求 SHA-256 推導新 ID，保留原請求重送，可在部分寫入後補稽核；不授予編輯／停用權。回傳 `{ok,deduplicated,person:{id,name}}`。
- 日誌／出勤 Requests 保留既有 selected:/attendance: 目標格式以維持完整性核對；Audit 使用 shared: 匿名 session 識別，不記錄 token。共享員工 bootstrap email 及 offlineScope 為空，持久離線暫存先關閉；下一批前端須驗證未認證時不顯示或寫入舊草稿。既有停寫與 10 分鐘刪除門檻保留。部署診斷仍不等於實機驗收。
- 本批不改 package/畫面版本，不改前端、不部署、不設定秘密、不啟用新模式。第三批須接上 RPC、處理到期/登出/清除、更新診斷顯示與驗收；再測匿名及管理員實機身分。新增 6 項整合測試，CI 待確認。

### 第三批前端（候選）

- unified 先以 wpAccessStatus 確認 mode/owner；共享模式新增不含原始 ID 的資料庫 namespace，非憑證。登入前只有驗證頁，沒有員工資料 RPC；成功後首次主動選擇或新增姓名，右上切換保留。獨立 localStorage 保存最長 30 天的 token 與姓名；瀏覽器限制可能無法記憶。token 只附在員工 RPC 第二參數，不在資料 payload、草稿、URL 或 GitHub。過期、撤銷、登出後鎖定頁面，延遲回應不重新開啟；登出清除此頁與本機記憶，不是伺服器撤銷，其他已開分頁可能仍有有效憑證。輪替任一秘密撤銷所有舊憑證。
- 共用模式的草稿、描述建議與待同步資料隔離至資料庫 namespace 的分頁暫存，不開啟 IndexedDB 持久副本，登入前不顯示。未確認寫入仍須人工核對後重送；共用裝置應登出並清除網站資料。原 domain 與持有者驗證、schema、既有 UI 保留。
- 版本 v0.25.0，新增 6 項 Node 測試與 3 種共享存取瀏覽器測試。CI 尚待確認，實際 Workspace 未驗收。下一步依 INSTALL_V025.md 更新原 TEST（不要初始化），先驗證 domain，再確認匿名部署選項及管理員可取得 active email。
