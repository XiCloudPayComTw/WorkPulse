# WorkPulse v0.25.0｜共用存取碼 TEST 更新

> v0.25.1 固定人員模式請先讀 [最新規格及更新步驟](ACCESS_V0251.md)。不再使用舊自助新增流程。

先確認本版本 PR 已由使用者合併且 main CI 全數通過，下載該次 unified ZIP。現有 TEST 保留原五項 Script Properties、schema 4、私人 Drive、原 ID；不要重初始化。

1. 核對現有 TEST 私人控制表及資料夾、備份、無進行中的寫入，保留已知可用 v0.24.1 版本。在原 Apps Script 專案替換新版三檔 Code.gs、Index.html、appsscript.json（manifest scope 未預期改變），儲存。管理部署作業 → 編輯原部署 → 新版本，先保持原 domain/執行者設定，驗證持有者管理控制台正常。
2. 持有者私下用可信安全亂數工具產生兩組獨立值：WORKPULSE_SHARED_ACCESS_CODE（24–128 字元 base64url）、WORKPULSE_SESSION_SIGNING_KEY（43–128 字元 base64url）。禁止使用短 PIN、示範值、重用秘密；不要傳聊天、GitHub、網址、截圖或日誌。TEST/正式不同秘密。於私人 Script Properties 設定；保留原五項，先不要變更模式。
3. 確認公司 Workspace 允許以持有者執行且存取者為「任何人」（含未登入）；無此選項或未獲公司批准則保持 domain，不繞過。核准後才將 TEST 的 WORKPULSE_ACCESS_MODE 改成 shared-code 並更新原部署存取權，保持以指定持有者執行。若失敗，恢復 domain 和受限部署設定；勿重初始化。
4. 未登入視窗開原 /exec，應只出現公司碼頁且無員工/紀錄；錯碼拒絕、正碼後才選擇或新增合成人員。重新開啟確認登入及姓名記憶，測試切換、日誌、出勤、跨裝置、登出、到期與輪替。儲存受限可能需重新輸入。公司碼最長記憶 30 天。
5. 指定持有者用 Google 登入，核對管理台及 active/effective 雙驗證；若匿名部署無法取得 active email，拒絕管理，不使用共用碼或 effective email 代替。評估同一 GAS 專案的受限管理部署或回退 domain。普通員工不可呼叫任何管理 RPC。實際 Workspace 尚待驗收。
6. 輪替任一秘密撤銷所有舊 session。5 分鐘 10 次失敗全域上限可能被阻斷；由管理員核對，不繞過。登出清除當頁與本機記憶，其他已開頁可能仍有有效憑證；共用裝置使用後清除網站資料。共用碼不是個人身分隔離，已知碼者可選其他姓名讀寫，需公司確認。匿名員工使用獨立分頁暫存，不支援 IndexedDB 持久副本；不是備份。

完成 A01–A17、備份/復原與公司核准前，勿投入真實正式資料或宣稱上線。參閱 ACCESS_V025.md、ACCEPTANCE_V021.md、ADMIN_GUIDE_V024.md。
