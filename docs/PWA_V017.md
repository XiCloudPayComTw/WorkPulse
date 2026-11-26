# WorkPulse PWA 與安裝操作


## v0.17.0 — PWA 外殼與安裝體驗

- 基於 PR #27 已合併且完整 CI 通過的 main d1fd260164a6d42b18895dbb4cc329eaae06bcc1，分支 feat/workpulse-v0.17.0-pwa-shell；不自動 Merge。
- 僅 GitHub Pages 靜態 build 生成 relative manifest、192/512 PNG、maskable 512、Apple 180 圖示及 Service Worker，支援 /WorkPulse/ 子目錄。來源開發頁面及兩套 GAS 不註冊 Service Worker；GAS 只顯示瀏覽器捷徑說明。
- 首次連線預載固定靜態清單，依內容雜湊版本及 SHA-256 驗證，安裝失敗不啟用部分快取。只攔截同 origin、固定清單 GET／根或 index 導覽；不快取 API、登入回應、公司資料、查詢參數或任意請求。舊 worker 仍服務舊版；不 skipWaiting、不強制重整，待所有舊視窗關閉後新 worker 接管，清除同 scope 舊快取。離線重新啟動僅展示版，既有本機資料仍依瀏覽器儲存規則。
- 安裝提示使用 beforeinstallprompt（若支援），其餘提供 Safari/Chrome/Edge 手動說明；standalone 模式，非原生 App，實際安裝按鈕與啟動畫面由 OS/browser 決定。保留 safe-area 與手機功能限制。新版下載提示不強制刷新。
- 增加建置與原生 Chrome 子目錄測試：快取完整、未知路徑不寫入、來源伺服器回 503 時重新載入日誌表單。這是模擬來源不可用，不是實機飛航模式或 OS 安裝驗收。保留 60 項響應式及 IndexedDB 原生測試。
- 正式 Apps Script iframe 無本專案控制的同 origin worker URL／scope，不能直接套用 Pages worker；仍須雲端驗證，已開啟頁面的 opt-in IndexedDB 草稿與手動重送不變。不自動改為匿名代理、外部 API 或雙主庫。公司正式 Google Drive 未操作，Firebase 取消。下一批 v0.18.0 全站效能穩定性，v1.0.0 正式部署與驗收。

## 實機驗收清單

- 首次連線打開 GitHub Pages，等靜態外殼已準備；用 Chrome/Edge 安裝或 Safari 分享加入主畫面（如有選項）。
- 關閉再開、飛航模式啟動，核對本機展示版與工作日誌／出勤、歷史；再次連線仍不會自動同步公司資料。
- 升級後開舊視窗填草稿；核對不會強制重整，保存後關閉所有視窗再重開，新版才接管。
- Android Chrome、iOS Safari、桌面 Chrome/Edge 實際安裝、啟動、鍵盤、橫向及儲存保留政策需人工驗收。移除捷徑不保證清除資料；清除網站資料可能移除本機日誌。先匯出再操作。
- 正式員工入口只提供捷徑，仍需先連線登入；公司資料以 Drive 保存。不得將 Pages 連結發給員工作為正式儲存入口。

- PR #28 修正（實機 iOS 回報）：日期欄位超出卡片。手機 `.form-group` 單欄 minmax(0,1fr)，原生 date/month/time/datetime-local 欄位明確 border-box、inline-size、min/max width、移除 WebKit 原生外觀及內部 value/edit 置中最小尺寸，保留原生選擇器與 16px 字體；Chrome 全路由檢查可見日期／月份／時間欄位矩形是否超出 form-group／卡片，不只量整頁 scrollWidth。實際 iOS Safari 仍需確認。
- PR #28 原 CI 163/163 通過，但原生 PWA probe `FAIL offline: wait timed out`。靜態 worker 導覽快取 key 明確去除 hash fragment，測試改為來源 503 後建立新的 iframe 文件（非沿用舊已載入 app 或 hash-only navigation），保留指定 entry 路由、controller、表單及本機提示的驗證；若失敗回傳 URL、標題、body 片段供診斷。原生 IndexedDB 和 60 項響應式測試保留，未確認新 CI 通過前勿 Merge。
