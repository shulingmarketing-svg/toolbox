-- =========================================================
-- 大心整合行銷 AI 行銷管理系統 — Cloudflare D1 Schema
-- 執行方式: npx wrangler d1 execute daxin-marketing --file=schema.sql
-- =========================================================

DROP TABLE IF EXISTS clients;
DROP TABLE IF EXISTS brand_profiles;
DROP TABLE IF EXISTS content_items;
DROP TABLE IF EXISTS campaigns;
DROP TABLE IF EXISTS crm_pipeline;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS password_resets;

-- 客戶／品牌主表（模組 2、3）
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  brand_name TEXT,
  industry TEXT,
  monthly_fee INTEGER DEFAULT 0,
  case_scale TEXT DEFAULT '中案',
  data_completeness INTEGER DEFAULT 0,
  timeline_status TEXT DEFAULT '一般排程',
  tags TEXT DEFAULT '[]',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 品牌 DNA / 訓練資料（模組 2、4）
CREATE TABLE brand_profiles (
  client_id TEXT PRIMARY KEY REFERENCES clients(id),
  positioning TEXT DEFAULT '',
  target_audience TEXT DEFAULT '',
  content_pillars TEXT DEFAULT '',
  competitors TEXT DEFAULT '',
  writing_restrictions TEXT DEFAULT '',
  regulation_notes TEXT DEFAULT '',
  platform_preferences TEXT DEFAULT ''
);

-- 內容項目主表（模組 5、6、7、8 共用同一張表）
CREATE TABLE content_items (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  campaign_id TEXT,
  title TEXT NOT NULL,
  platform TEXT DEFAULT 'FB+IG',
  status TEXT DEFAULT '草稿中',
  content_body TEXT DEFAULT '',
  business_goal TEXT DEFAULT '',
  scheduled_date TEXT,
  published_date TEXT,
  value_ntd INTEGER DEFAULT 0,
  next_step TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 季度戰役（模組 6）
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  quarter TEXT,
  theme TEXT,
  budget INTEGER DEFAULT 0
);

-- CRM 名單（模組 9）
CREATE TABLE crm_pipeline (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_title TEXT,
  contact_method TEXT,
  stage TEXT DEFAULT '新名單',
  follow_up_status TEXT DEFAULT '待首次聯繫',
  next_contact_date TEXT,
  deal_value INTEGER DEFAULT 0,
  marketing_need TEXT,
  owner TEXT,
  priority TEXT DEFAULT '一般',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 會員資料表
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,   -- PBKDF2-SHA256 雜湊，非明文
  salt TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0,    -- 1 = 總管理員
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 忘記密碼申請表（通知管理員人工處理）
CREATE TABLE password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  email TEXT,
  status TEXT DEFAULT 'pending',   -- pending / done / dismissed
  requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
  handled_at TEXT
);

-- 登入 Session 表（Token 有效 7 天）
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);

-- =========================================================
-- 種子資料（虛構示範品牌，作品集展示用）
-- =========================================================

INSERT INTO clients (id,company_name,brand_name,industry,monthly_fee,case_scale,data_completeness,timeline_status,tags) VALUES
('c-shanlan','山嵐茶業有限公司','山嵐茶坊','茶葉・茶飲',30000,'中案',85,'一般排程','["高山茶","冷泡茶","職人焙火","送禮"]'),
('c-maohai','毛孩日常有限公司','毛孩日常','寵物用品',25000,'中案',80,'一般排程','["天然零食","訂閱制","貓狗","社群"]'),
('c-xiaoshu','小樹文化有限公司','小樹書房','親子教育・繪本',20000,'小案',78,'一般排程','["親子共讀","繪本訂閱","3-8 歲","週末活動"]');

INSERT INTO brand_profiles (client_id,positioning,target_audience,content_pillars,competitors,writing_restrictions,regulation_notes,platform_preferences) VALUES
('c-shanlan','（虛構示範品牌）台灣高山茶專賣，自有茶園契作、職人手工焙火，主打「一年四季都有好茶喝」。從熱泡到冷泡、從自飲到送禮，讓年輕族群也能輕鬆入門。','日常自飲線｜25-40 歲上班族、想戒手搖飲的人
送禮線｜30-55 歲、節慶與商務送禮需求
入門玩家線｜對茶有興趣、想學沖泡的新手','產地與茶園故事、焙火職人、冷泡教學、季節茶單、送禮提案。','連鎖手搖飲、超商瓶裝茶、老字號茶行、日系茶品牌。','不寫療效；以產地、品種、焙火、沖泡方式與生活情境為主；口吻溫和有質感，不過度促銷。','食品廣告不得宣稱療效（如降血脂、助消化、減重）。可寫：產地、品種、焙火程度、風味、沖泡方式。上線前逐句檢查是否出現功效宣稱。','IG：茶湯近拍、冷泡過程 Reels、季節限定。FB：茶園故事、送禮導購。SEO：冷泡茶做法、高山茶入門長文。'),
('c-maohai','（虛構示範品牌）寵物天然零食與用品訂閱品牌，主打成分透明、小批量生產，每月寄送一盒，讓毛孩每個月都有新驚喜。','新手飼主線｜25-35 歲、第一次養貓狗、資訊焦慮
資深飼主線｜30-45 歲、重視成分、願意為品質付費','成分透明、毛孩日常趣味、飼養知識、訂閱開箱、飼主社群互動。','量販寵物店自有品牌、進口寵物零食、寵物電商平台。','不宣稱治療或預防寵物疾病；避免「保證」「100%」等絕對用語；口吻活潑、有梗、貼近飼主日常。','不得宣稱寵物食品具醫療效果。成分與產地需與包裝標示一致。避免使用未經證實的比較性廣告。','IG：毛孩照片、開箱 Reels、互動投票。FB：飼主社群、訂閱優惠。SEO：新手養貓／養狗指南。'),
('c-xiaoshu','（虛構示範品牌）親子共讀繪本訂閱，每月由選書團隊挑選三本繪本，附共讀引導卡，陪家長和孩子建立睡前閱讀習慣。','親子家庭線｜家有 3-8 歲孩子的爸媽、重視陪伴時間
送禮線｜祖父母、親友送孩子的生日與節日禮物','選書理由、共讀技巧、親子日常、繪本作者故事、週末活動。','實體書店童書區、電子繪本 App、其他繪本訂閱服務。','不宣稱提升智力或保證學習成效；強調陪伴與閱讀樂趣；口吻溫暖親切。','避免「提升智商」「贏在起跑點」等誇大或製造焦慮的用語。使用兒童影像需取得家長同意。','FB：家長社群、選書介紹、活動報名。IG：繪本內頁、共讀日常。SEO：繪本推薦、共讀方法文章。');

INSERT INTO campaigns (id,client_id,quarter,theme,budget) VALUES
('cp-sl-q4','c-shanlan','2026-Q4','冬季熱茶 → 年節禮盒預購',0),
('cp-mh-q4','c-maohai','2026-Q4','年末訂閱優惠 → 毛孩聖誕開箱',0),
('cp-xs-q4','c-xiaoshu','2026-Q4','冬季共讀月 → 聖誕繪本禮盒',0);

INSERT INTO content_items (id,client_id,campaign_id,title,platform,status,content_body,business_goal,scheduled_date,published_date,value_ntd,next_step) VALUES
('ct-001','c-shanlan','cp-sl-q4','茶園入冬：焙火職人的一天','FB+IG','已發布','從採收到焙火，帶讀者走一趟茶園的冬天。','建立信任','2026-11-03','2026-11-03',1500,'可認列交付並追蹤成效'),
('ct-002','c-shanlan','cp-sl-q4','三種焙火程度喝起來差在哪','IG','待客戶審核','輕焙、中焙、重焙茶湯對比短影音。','互動增長','2026-11-10',NULL,1800,'等待客戶回覆或催審'),
('ct-003','c-shanlan','cp-sl-q4','冬天也能喝的冷泡茶做法','SEO','草稿中','','導流名單','2026-11-17',NULL,2000,'完成初稿後送審'),
('ct-004','c-shanlan','cp-sl-q4','年節禮盒搶先看','FB+IG','待補資料','禮盒視覺與價格待客戶提供。','轉換營收','2026-11-24',NULL,1500,'向客戶補禮盒素材後再產文'),
('ct-005','c-maohai','cp-mh-q4','這個月的盒子裡有什麼？','IG','已發布','十一月訂閱盒開箱 Reels。','建立信任','2026-11-05','2026-11-05',1200,'可認列交付並追蹤成效'),
('ct-006','c-maohai','cp-mh-q4','年末訂閱優惠倒數','FB+IG','待客戶審核','年訂方案限時優惠。','轉換營收','2026-11-19',NULL,1500,'等待客戶回覆或催審'),
('ct-007','c-xiaoshu','cp-xs-q4','睡前十分鐘：共讀的三個小技巧','Facebook','草稿中','給忙碌爸媽的共讀入門。','建立信任','2026-11-12',NULL,1500,'完成初稿後送審');

INSERT INTO crm_pipeline (id,company_name,contact_name,contact_title,contact_method,stage,follow_up_status,next_contact_date,deal_value,marketing_need,owner,priority,notes) VALUES
('crm-001','山嵐茶業有限公司','王經理','行銷經理','Email','已成交','服務中','2026-11-20',90000,'FB/IG 經營 + SEO 文章','業務 A','高','（示範資料）Q4 年節檔期為重點，禮盒素材待補。'),
('crm-002','小樹文化有限公司','林小姐','品牌窗口','LINE','提案中','提案準備中','2026-11-15',60000,'FB 社群經營','PM B','一般','（示範資料）希望先做三個月試行。');

-- 不內建管理員帳號：部署後先在網站註冊，再於 D1 Console 執行
-- UPDATE users SET is_admin = 1 WHERE username = '你的帳號';
