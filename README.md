# 工具箱

對外公開的網頁工具，透過 GitHub Pages 部署：<https://shulingmarketing-svg.github.io/toolbox/>

也可以直接用瀏覽器開啟各個 HTML 檔使用。

## 英文學習工具

- `english-quiz-tool.html` — 英文測驗練習（TOEIC & PTE），依選擇的考試類型、題型、難度、題數，由 Claude AI 即時出題並批改
- `toeic700-learning-plan.html` — TOEIC 700 六個月衝刺計畫，含分階段學習主題、每週節奏、AI 出題測驗、考試技巧整理

這兩個工具在瀏覽器端直接呼叫 Anthropic API 出題，**需要使用者自備 Anthropic API Key**：

1. 打開工具，點右上角齒輪圖示 ⚙ 開啟設定
2. 貼上你的 API Key（可於 [console.anthropic.com](https://console.anthropic.com/settings/keys) 申請）
3. Key 只會存在瀏覽器的 `localStorage`，直接從瀏覽器送往 Anthropic API，不會經過任何第三方伺服器

**自建題庫（累積出過的題目）**：每次 AI 出題後，題目會自動存進瀏覽器 `localStorage` 的個人題庫。之後開始測驗時會優先從題庫抽符合條件的題目，題庫不夠才會呼叫 AI 補足並存入題庫——題庫夠大之後甚至不需要每次都呼叫 API。題庫完全存在本機瀏覽器，換裝置或清除瀏覽器資料就會重新開始累積；設定頁面可以「清空題庫」重新開始。

## ESG AI 智能成熟度診斷系統

- `esg-ai-diagnostic.html` — V1.0 基礎版（純前端，可直接用瀏覽器開啟）
- `esg-ai-diagnostic-v1.1.html` — V1.1 顧問級版本（題目權重模型、GRI/IFRS S1/S2 對應、利害關係人模組、雙重重大性矩陣、產業差異化權重，並串接後端儲存填答紀錄）

### 後端（儲存填答紀錄與報告）

V1.1 版本會將每次診斷的填答資料與報告摘要存入 SQLite 資料庫，並提供歷史紀錄查詢。

```bash
cd server
npm install
npm start
```

伺服器啟動後造訪 `http://localhost:3000/esg-ai-diagnostic-v1.1.html` 即可使用（靜態頁面與 API 同源，由 Express 託管）。若直接以檔案方式開啟 HTML（無後端），診斷功能仍可正常使用，僅「查看歷史紀錄」與資料儲存功能無法運作。

API：
- `POST /api/submissions` 儲存一筆診斷紀錄
- `GET /api/submissions` 取得歷史紀錄列表
- `GET /api/submissions/:id` 取得單筆紀錄詳情

## 大心整合行銷 — AI 行銷管理系統（作品集）

- `daxin-marketing.html` — 前端（總覽、客戶資料庫、Onboarding、訓練資料、產出文章、季度戰役、內容排程、收益與交付、CRM、管理員共 10 大模組，含會員登入/註冊/忘記密碼）
- `daxin-marketing/worker.js` — Cloudflare Worker：D1 資料庫 REST API + 會員認證（PBKDF2 雜湊、Session Token）+ Claude API 代理
- `daxin-marketing/schema.sql` — Cloudflare D1 資料庫結構與虛構示範種子資料（含會員、Session、忘記密碼申請表）
- `daxin-marketing/DEPLOY.md` — 完整部署教學（D1 → Worker → Pages → 會員系統初始化）

直接開啟 `daxin-marketing.html` 即為 **Demo 模式**（會先看到登入閘門，可點「以訪客瀏覽」直接體驗，示範資料存在瀏覽器記憶體，重新整理會還原）。要接上真實資料庫與 Claude API，依 `daxin-marketing/DEPLOY.md` 部署 D1 + Worker 後，將 `daxin-marketing.html` 內的 `API_BASE` 填上 Worker 網址即可切換為連線模式。總管理員的設定方式見 DEPLOY.md 第 4 步。

> 作品集說明：系統內的品牌（山嵐茶坊、毛孩日常、小樹書房）皆為虛構示範資料。

## 會員抽獎工具

- `raffle-tool.html` — 純前端抽獎工具，直接用瀏覽器開啟即可使用，資料不會上傳到任何伺服器

功能：

1. 匯入 Excel（.xlsx / .xls）或 CSV 會員名單，系統自動嘗試辨識「姓名」「電話」「Email」欄位（可手動調整對應）
2. 每筆會員資料自動建立會員編號；姓名為必填，電話與 Email 至少需有一項有值才具抽獎資格，缺姓名或電話與 Email 都缺則標示不合格、不列入抽獎
3. 可新增多個獎項，各自設定：獎項名稱、名額數量、抽獎條件（依 Excel 中任意欄位設定等於／不等於／包含／大於等於／小於等於／空值／非空值等條件，需符合所有條件才可參加該獎項抽獎）
4. 可設定「同一位會員整場只能中獎一次」，依獎項設定順序依序抽出
5. 使用瀏覽器 `crypto.getRandomValues` 做隨機抽取，抽出的會員編號＋姓名會列在結果中，並可匯出中獎名單為 Excel
6. 提供「下載範例 Excel」按鈕，可下載欄位格式範例
