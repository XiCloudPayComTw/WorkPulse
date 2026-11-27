# WorkPulse v0.26.0｜GitHub Actions TEST 一鍵發布

狀態：#42 已合併，main a516415 CI #45970817070 成功；本批新增發布工具與模擬 API 測試。尚未設定或使用公司 Google OAuth、尚未實際更新 GAS。這不是自動在 Merge 後直接上線，而是使用者 Merge、CI 後手動點 Run workflow，免重複貼三檔。僅 TEST，不支援正式環境、不改資料表、指令碼屬性或初始化。

## 安全界線

Google Apps Script API 的 OAuth script.projects、script.deployments 可管理該授權帳號有權存取的其他指令碼，不是限於這一個 TEST 專案。必須由公司持有者同意、限制 repo/環境寫入權、保護 main、審查 workflow 及所有執行的程式碼；GitHub Environment secrets 不代表權限隔離已完成。若公司不允許，維持手動三檔，不繞過政策。不得分享或提交 client secret、refresh token、指令碼 ID、部署 ID、存取碼或簽章金鑰。撤銷 OAuth 及刪除 secrets 可關閉發布。不得使用個人帳號代替公司持有者或把憑證放到公開 workflow 日誌。

## 一次性設定（公司持有者自行操作）

1. Google Apps Script dashboard https://script.google.com/home/usersettings 啟用 Apps Script API；Google Cloud Console 新建/選用經公司核准的 OAuth 專案並啟用 Apps Script API。參見 https://developers.google.com/apps-script/api/how-tos/enable 。不需改原 GAS 的 Cloud project 或開啟 Execution API。
2. 依公司 OAuth 管理政策設定 consent；若 Workspace 支援 Internal，僅公司帳號授權。建立 Web application OAuth client，授權 redirect URI https://developers.google.com/oauthplayground 。使用 Google 官方 OAuth Playground 的齒輪 Use your own OAuth credentials，填入自己的 client ID/secret，要求下列兩個 scope： https://www.googleapis.com/auth/script.projects 與 https://www.googleapis.com/auth/script.deployments 。由原指定公司持有者授權，交換 authorization code 取得 refresh token（offline access）。若政策拒絕即停止。External/Testing refresh token 常在七天後失效，不以公開發布 OAuth 應用程式來繞過。詳細 https://developers.google.com/identity/protocols/oauth2/web-server 。
3. 原 GAS 專案「專案設定」取得 Script ID；「管理部署作業」選現有 Web app，取得 Deployment ID 與目前部署版本數字（不是 v0.26.0 文字）。標題必須是 WorkPulse — Admin TEST，若不一致先確認，不自動改名或改指向。
4. GitHub Settings → Environments 建立 gas-test，Deployment branches 只允許 main；若方案支援，設定 required reviewers（可由公司另一授權審核者批准）。限制 repo 管理員、分支及 workflow 寫入權限；若無法限制環境分支或無可信審查，勿放入公司秘密。只在此環境 Secrets 增加：
   - GAS_SCRIPT_ID、GAS_DEPLOYMENT_ID
   - GAS_OAUTH_CLIENT_ID、GAS_OAUTH_CLIENT_SECRET、GAS_OAUTH_REFRESH_TOKEN
   環境 Variables 增加 GAS_PROJECT_TITLE=WorkPulse — Admin TEST、GAS_EXPECTED_ACCESS=DOMAIN（原網域限制），若實際已完成共用碼匿名部署，設定 ANYONE_ANONYMOUS；僅本人則 MYSELF。不可用猜測的設定。機制不替使用者變更匿名權限。
5. GitHub Actions → WorkPulse GAS TEST release → Run workflow，branch main，operation preflight，expected_version 填目前部署版本。先跑全套 Node/Chrome/GAS 測試，下載同一次 build artifact；預檢讀取原專案、既有版本與 HEAD，檢查三檔、manifest、URL、權限。無 Google 寫入。若不符（例如尚未發布的編輯器內容或 manifest 差異），停止並私下確認，不強制覆蓋。

## 每次更新

- PR CI 綠燈、使用者手動 Merge；確認 main CI 綠燈。先依原維護規範備份、停寫、確認進行中寫入及排程已停止，無其他人編輯 GAS。HEAD 更新會影響開發模式與觸發器，非完全原子操作。
- Run workflow 選 main、operation release、expected_version 填當前數字版本、confirmation 輸入 RELEASE TEST。先完整 CI，再重驗原專案與版本，替換三檔、核對 HEAD、建立不可變新版本、再次核對既有部署，更新相同 deploymentId、驗證 URL 與 access/executeAs 不變。保留既有 Web app manifest 設定，不自動改 scopes；其餘 manifest 設定差異一律拒絕。
- 若成功，記錄舊/新數字版本、原 /exec 網站開啟並驗證管理員及員工固定人員、日誌/出勤，確認後恢復寫入。不要重初始化或修改 ID。此工具不呼叫 scripts.run、Drive 或 Sheets，也不自動停寫/備份/恢復。
- 失敗或逾時不自動重試/回退；API 可能已提交部分內容，先核對 HEAD、版本、部署，保留停寫。若需回退由持有者在管理部署作業選已知正常舊版本並核對權限；HEAD/觸發器亦須手動回復為一致的已驗證版本，勿任意清除資料。再次預檢前確保 HEAD 等於已部署版本。Google API 無原子跨端點交易，本工具不能防止外部同時編輯。
- 無工作流程授權時可依 ACCESS_V0251.md 手動更新三檔。v0.26.0 暫不做 push/merge 後自動發布，也不部署正式環境。

## 驗收與後續

七項模擬 API Node 測試覆蓋唯讀預檢、同部署更新、錯誤目標/版本/權限/HEAD、manifest 變更及失敗不重送。CI 不等於 Google 實機驗收；需先完成預檢再發布。後續只使用手機網頁加入主畫面（iOS Safari / Android Chrome），不承諾 GAS service worker、冷啟動離線或獨立原生 App。
