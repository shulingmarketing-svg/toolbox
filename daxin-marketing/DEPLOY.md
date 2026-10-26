# 大心整合行銷系統 — 部署教學

三個檔案的角色：

| 檔案 | 角色 | 部署位置 |
|---|---|---|
| `daxin-marketing.html`（repo 根目錄） | 前端（9 大模組介面 + 會員登入/管理員） | Cloudflare Pages |
| `daxin-marketing/worker.js` | 後端 API + 會員認證 + Claude API 代理 | Cloudflare Workers |
| `daxin-marketing/schema.sql` | 資料庫結構 + 種子資料（含會員表） | Cloudflare D1 |

架構：Pages 放前端、Worker 當代理、API Key 存 Secret，多了一個 D1 資料庫。v2 版本新增會員登入系統（註冊／登入／忘記密碼／總管理員）。

---

## 第 0 步：先在本機預覽（不用部署）

直接雙擊打開 `daxin-marketing.html` 就能看到完整系統，此時是 **Demo 模式**——會先看到登入閘門，可點「以訪客瀏覽（Demo）」直接進入，內建三個虛構示範品牌（山嵐茶坊、毛孩日常、小樹書房），所有功能都能點，資料存在瀏覽器記憶體，重新整理會還原。先確認介面符合需求，再往下部署。

---

## 第 1 步：建立 D1 資料庫

**Dashboard 方式（推薦，免安裝）：**
1. 登入 dash.cloudflare.com → 左側「Storage & Databases」→「D1 SQL Database」
2. 點「Create Database」，名稱填 `daxin-marketing`
3. 建立後進入資料庫 →「Console」分頁
4. 把 `daxin-marketing/schema.sql` 的內容全部貼進去執行
5. 執行完到「Tables」分頁確認出現 8 張表：clients、brand_profiles、content_items、campaigns、crm_pipeline、users、password_resets、sessions

> `schema.sql` 不內建任何帳號。總管理員的設定方式見第 4 步。

---

## 第 2 步：部署 Worker

1. Dashboard → 「Workers & Pages」→「Create」→「Create Worker」
2. 名稱建議：`daxin-api`（網址會是 `daxin-api.你的帳號.workers.dev`）
3. 點「Deploy」先建立，再點「Edit Code」
4. 把 `daxin-marketing/worker.js` 內容全部貼上，覆蓋原本的程式碼 → Deploy

### 綁定 D1 資料庫
1. Worker 頁面 →「Settings」→「Bindings」→「Add」→「D1 Database」
2. Variable name 填 `DB`（一定要是 DB，程式碼裡用這個名字）
3. 選擇剛建立的 `daxin-marketing` → Save

### 設定 API Key（Secret）
1. 同樣在「Settings」→「Variables and Secrets」→「Add」
2. Type 選 **Secret**，名稱填 `ANTHROPIC_API_KEY`
3. 值貼上你的 Anthropic API Key（console.anthropic.com 取得）
4. Save and Deploy

### 設定註冊邀請碼（建議）
再新增一個 Secret：名稱 `REGISTER_CODE`，值自訂（例如 `daxin2026`）。
設定後，任何人要註冊帳號都必須輸入這個邀請碼——防止知道網址的陌生人自行註冊進入系統。
你把邀請碼私下告訴員工即可。不設定此 Secret 則任何人都能註冊。

> 提醒：你的 Anthropic 帳戶需要有 API credit。

### 驗證 Worker
瀏覽器打開 `https://daxin-api.你的帳號.workers.dev/api/clients`，未帶登入 token 應回傳「未登入或登入已過期」——這代表認證機制正常運作。

---

## 第 3 步：部署前端到 Pages

1. 打開 `daxin-marketing.html`，找到最上方 script 裡這一行：
   ```js
   const API_BASE = "";
   ```
   改成你的 Worker 網址：
   ```js
   const API_BASE = "https://daxin-api.你的帳號.workers.dev";
   ```
2. Dashboard →「Workers & Pages」→「Create」→「Pages」→「Upload assets」
3. 專案名稱例如 `daxin-marketing` → 把改好的 `daxin-marketing.html`（可重新命名為 `index.html`）拖進去上傳 → Deploy
4. 打開 `daxin-marketing.pages.dev`，會先看到登入畫面，代表已切換為連線模式

---

## 第 4 步：首次使用（會員系統）

**設定總管理員**：先在網站「註冊」分頁建立自己的帳號，再到 D1 的 Console 執行：
```sql
UPDATE users SET is_admin = 1 WHERE username = '你的帳號';
```
重新登入後，側欄會多出「模組 10 管理員」。

**忘記密碼流程**：
1. 使用者在登入頁點「忘記密碼？」→ 輸入帳號或 Email → 送出申請
2. 總管理員登入後，「管理員」頁會列出待處理申請
3. 管理員點「重設密碼」→ 輸入新密碼 → 確認（該使用者所有裝置會被強制登出）
4. 系統顯示該使用者的 Email，**由管理員手動寄信**告知新密碼（系統不會自動寄信）

**一般員工使用流程**：
1. 打開網站會先看到**登入畫面**——首次使用切到「註冊」分頁
2. 填 Email、帳號（≥3 字）、密碼（≥8 字）、邀請碼（若有設定）→ 註冊
3. 回到「登入」分頁登入，即進入系統。登入狀態保留 7 天
4. 密碼以 PBKDF2 加鹽雜湊存放，資料庫內**沒有明文密碼**（所以忘記密碼無法查回，只能請管理員重設，請妥善保管）
5. 側欄有「登出」和「⬇ 下載完整備份」——備份會匯出所有品牌、內容、CRM 與會員清單（不含密碼）成 JSON 檔，建議每週下載一次存電腦

**刪除資料的規則**：所有刪除（內容、CRM、戰役、品牌）都會跳出確認視窗，必須輸入你的**帳號＋密碼**驗證通過才會執行。刪除品牌會連同該品牌所有內容一併刪除，無法復原。

---

## 第 5 步：驗收清單

- [ ] 註冊 → 登入 → 重新整理頁面仍是登入狀態
- [ ] 模組 3「建立新客戶」新增一筆 → 模組 2 出現新品牌卡
- [ ] 模組 4「訓練資料」填寫並儲存 → 重新整理後資料還在（代表 D1 寫入成功）
- [ ] 模組 5「產出文章」按生成 → 右側出現 Claude 產出的初稿（代表 API Key 與餘額正常）
- [ ] 產出後到模組 7「內容排程」→ 該篇以「草稿中」出現
- [ ] 模組 6 看板用「狀態流轉」下拉把某篇改成「已發布」→ 模組 8 收益流水帳同步更新（驗證三模組共用同一張表）
- [ ] 刪除一筆測試內容：輸入錯誤密碼應被拒絕，正確密碼才刪除成功
- [ ] 側欄「下載完整備份」能下載 JSON 檔
- [ ] 總管理員帳號登入可看到「模組 10 管理員」，一般帳號則看不到

---

## 常見問題

**Q：模組 5 生成失敗，顯示 API 錯誤？**
多半是 Anthropic API credit 不足，到 console.anthropic.com → Billing 加值（最低 $5 USD）。

**Q：前端顯示「無法連線 Worker API」？**
檢查 `API_BASE` 是否填對（要含 `https://`、結尾不要有斜線），以及 Worker 是否已 Deploy。

**Q：想限制只有自己公司能用？**
註冊邀請碼（`REGISTER_CODE`）是第一道防線。更進一步可把 `worker.js` 裡 `Access-Control-Allow-Origin` 從 `*` 改成你的 Pages 網域。

---

## 之後的擴充方向（規格書已排除、日後再做）

- 廣告後台 API 串接（GA4 / Meta Ads）
- 社群自動發文
- 管理員自動寄送密碼重設 Email（目前為手動告知）
- AI 資料完整度自動計算（目前是手動欄位）
