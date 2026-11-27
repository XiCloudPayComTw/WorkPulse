# WorkPulse v0.24.0｜三檔案安裝快速手冊

適用單一公司網域 Apps Script 入口，取代舊版兩專案安裝教學。**先 TEST，通過公司驗收再部署正式環境。** 程式 CI 通過不代表已完成 Workspace 授權、登入、備份或上線驗收。

## 安裝前確認

你需要指定的公司資料持有帳號、該帳號可使用的 Google Apps Script 及 My Drive、可登入 GitHub 的帳號。不需要本機 Node.js、Firebase、額外資料庫或每日備份排程。公司 Workspace 管理員若限制 Apps Script 或 OAuth，應請公司管理員核准，不可繞過限制。Shared Drive 所有權不在目前支援範圍。禁止提供密碼、OAuth token、正式 Drive ID 或私人網址給公開儲存庫。

```mermaid
flowchart LR
 A[合併版本 CI 通過] --> B[下載三檔 ZIP]
 B --> C[匯入 TEST 專案]
 C --> D[唯讀預檢與授權]
 D --> E[初始化]
 E --> F[單入口部署]
 F --> G[公司實測驗收]
```

## 1｜下載發布包

1. 開啟 [GitHub Actions](https://github.com/XiCloudPayComTw/WorkPulse/actions)，選擇已合併版本在 main 的完整成功 run；確認版本、commit 及執行分支。
2. 在 run 頁面下方 Artifacts 點擊 workpulse-gas-unified-<run_id>-<run_attempt>，登入 GitHub 後下載 ZIP 並解壓。這是程式包，絕不包含公司資料或憑證。
3. 確認只有 Code.gs、Index.html、appsscript.json 三個檔案。不要使用 Pages artifact 或 GitHub 原始碼 ZIP。保留下載日期、版本、run 與 commit。
4. Artifact 保存 30 天，過期可在已核對的 commit 本機執行 npm run gas:build（Node.js >=20），使用 dist-gas/unified；不要執行任意分支的程式。

## 2｜沿用既有 Apps Script TEST

開啟 [Apps Script](https://script.google.com/home)，以指定持有者登入，使用現有 WorkPulse — Admin TEST；如果已經有正式資料，先停止並選擇獨立 TEST 專案。專案設定：時區 Asia/Taipei、V8、顯示 appsscript.json。

| 指令碼屬性 | 值 |
|---|---|
| WORKPULSE_ADMIN_EMAIL | 指定持有者的完整公司 email |
| WORKPULSE_ALLOWED_DOMAIN | 公司網域，不含 @ |
| WORKPULSE_ACCESS_MODE | domain |

首次空白測試不要設定 WORKPULSE_SHEET_ID、WORKPULSE_FOLDER_ID、WORKPULSE_BACKUP_FOLDER_ID；初始化／備份中心會建立。不要設定 WORKPULSE_OPERATOR_EMAIL（單入口目前不支援委派管理）。WORKPULSE_OFFLINE_SCOPE 選用；若要啟用持久草稿，使用每個環境獨立的 16–80 位英數／底線／連字號；不可共用 TEST 與正式 scope。

在編輯器逐一貼入完整檔案：

| 發布包 | Apps Script 操作 |
|---|---|
| Code.gs | 預設 Code.gs（若名稱為程式碼，改名 Code）全部取代 |
| Index.html | 檔案 + → HTML → 名稱 Index → 全部貼上 |
| appsscript.json | 原有資訊清單全部取代 |

若曾匯入舊雙入口，先保存舊程式，移除確認為舊版的重複 .gs/.html；不要混裝。若任何檔案儲存失敗，停止，重新核對完整內容，不截斷 Index.html。三檔全部儲存。

## 3｜Google 授權與唯讀預檢

在編輯器上方函式選單選 workPulseInitializationCheck → 執行。首次 Google OAuth 會要求授權；核對登入帳號與程式來源。試算表、Drive、電子郵件驗證及選用排程管理是資訊清單內宣告的 scopes；Drive 權限較廣，只核准公司已審核的自有程式。若 Google 提示需管理員核准或不明風險，停止並詢問公司 Workspace 管理員，不要降低安全設定。

新版已將預檢摘要直接寫入 Apps Script「執行記錄」，不必新增函式。確認 `canInitialize: true`，且 `required: true` 的檢查都為 `ok: true`。`backupFolder` 未設定時可為非必要待辦。摘要僅顯示檢查名稱與狀態，不包含帳號、檔案 ID 或原始錯誤詳情。必要項目失敗時先核對對應屬性與權限；需要詳細資訊可使用偵錯模式檢視 `report`，勿公開私人內容。若身分檢查直接拋錯，勿反覆初始化。

## 4｜建立測試資料庫

選 workPulseInitialize → 執行一次。至專案設定檢查系統已寫入 WORKPULSE_SHEET_ID 和 WORKPULSE_FOLDER_ID，前往同一公司 My Drive 核對 WorkPulse 資料夾及 WorkPulse_Control 試算表，驗證擁有者及共用權限；Meta 應為 schemaVersion=4、monthlyStorage=enabled。不要手動修改 Meta 或把 TEST ID 複製到正式專案。此時尚未寫入月檔；首次日誌／出勤正式儲存才會建立相應月份。若初始化中途失敗，先核對已建檔與屬性，不要刪除 ID 後盲目重試。

## 5｜建立單一網站入口

部署 → 新增部署 → 類型：網頁應用程式。描述記錄 TEST 與版本。執行身分選「我」（指定公司持有者），可存取者選公司網域（選項文字依 Workspace 政策而異）。**不要選匿名或任何人。** 若沒有公司網域選項，停止並確認 Workspace 方案及管理政策。

部署後保存 /exec 網址（非 /dev）。使用持有者登入，應看到管理員控制台；一般公司同仁使用同一網址，應只能進入工作功能。使用外部帳號及未登入視窗核對拒絕；active email 無法驗證時停止，不改 legacy。公司須正式同意「公司同仁可選其他姓名」的現有規則，這不是員工個別資料隔離。不要讓員工共用主持有者帳密。

### v0.24.1 啟動異常修正（既有 TEST）

若 v0.24.0 已部署但停在 Logo 且 Console 顯示 document.write SyntaxError，待 v0.24.1 PR 合併並核對成功 main CI，下載新版 unified 三檔 ZIP。此批 Code.gs、appsscript.json 未改，只需將既有 TEST 的 Index.html 完整替換並儲存；管理部署作業 → 編輯既有部署 → 新版本 → 部署。保持公司網域、指定持有者及原 /exec，勿重初始化或更改五項屬性。重新開啟並確認雲端版及管理台；仍失敗時私下記錄 Console、版本，不能當作驗收通過。CI 模擬 iframe 不能取代真實 Workspace。

## 6｜測試，不急著正式開放

管理員控制台新增一位明確命名的測試人員，再從另一個公司帳號／裝置填寫合成工作日誌與出勤；重新讀取、確認日期、人員、工時、月檔及版本。備份中心 → 更新備份清單 → 建立／確認私人備份資料夾。測試停寫、全部備份、下載報告、核對 Drive 副本、恢復寫入及獨立還原比對。另驗收弱網、手機日期欄位、Excel 開啟與重算。

完整必要條件依 [正式驗收矩陣](ACCEPTANCE_V021.md)（單入口以本文件為準）；全部實測通過、公司持有者簽認，才能建立獨立正式環境並再次核對正式設定。未測試就是未驗收。

## 7｜日後更新，網址不必重建

下載已驗證新版三檔；先於 TEST 專案更新並驗收。正式更新前由持有者通知停寫、確認執行停止並完成備份，保存舊部署版本及發布包；替換正式專案三檔，部署 → 管理部署作業 → 編輯既有網頁應用程式 → 新版本 → 部署。通常同一部署保留 /exec 網址；實際仍要確認登入與寫入，並在核對完成後恢復。不要重新初始化既有控制表，不要新增第二個同時寫入正式資料的入口。

出錯時維持停寫、保存待同步與備份，確認舊版本 schema 相容，於 TEST 驗證後才回退到既有部署的已知可用版本；禁止用備份直接覆寫正式庫。詳見 [管理員手冊](ADMIN_GUIDE_V024.md)。
