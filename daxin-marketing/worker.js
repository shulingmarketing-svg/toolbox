/**
 * 大心整合行銷 — Cloudflare Worker v2（含會員系統）
 *
 * 部署需求：
 *   1. D1 綁定，binding 名稱 = DB
 *   2. Secret：ANTHROPIC_API_KEY
 *   3. Secret（可選）：REGISTER_CODE — 設定後，註冊需輸入此邀請碼，防止陌生人註冊
 *
 * 認證規則：
 *   - /api/auth/* 不需登入
 *   - 其他所有 /api/* 都需要 Header: Authorization: Bearer <token>
 *   - 刪除類 API 需在 body 額外附上 username + password 二次確認
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });

const uid = (p) => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- 密碼雜湊（PBKDF2-SHA256，10 萬次迭代） ---------- */
const bufToHex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const hexToBuf = (hex) => new Uint8Array(hex.match(/.{2}/g).map(h => parseInt(h, 16)));

async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBuf(saltHex), iterations: 100000 }, key, 256);
  return bufToHex(bits);
}
const randomHex = (bytes) => bufToHex(crypto.getRandomValues(new Uint8Array(bytes)));

/* ---------- 認證輔助 ---------- */
async function getSessionUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.is_admin, s.expires_at FROM sessions s
     JOIN users u ON u.id = s.user_id WHERE s.token = ?`).bind(token).first();
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token=?").bind(token).run();
    return null;
  }
  return row;
}

async function verifyCredentials(env, username, password) {
  if (!username || !password) return null;
  const user = await env.DB.prepare("SELECT * FROM users WHERE username=?").bind(username).first();
  if (!user) return null;
  const hash = await hashPassword(password, user.salt);
  return hash === user.password_hash ? user : null;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      /* ==================== 認證 API（免登入） ==================== */
      if (path === "/api/auth/register" && method === "POST") {
        const b = await request.json();
        const email = (b.email || "").trim().toLowerCase();
        const username = (b.username || "").trim();
        const password = b.password || "";
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Email 格式不正確" }, 400);
        if (username.length < 3) return json({ error: "帳號至少 3 個字元" }, 400);
        if (password.length < 8) return json({ error: "密碼至少 8 個字元" }, 400);
        if (env.REGISTER_CODE && b.register_code !== env.REGISTER_CODE)
          return json({ error: "邀請碼錯誤，請向管理者索取" }, 403);

        const dup = await env.DB.prepare("SELECT id FROM users WHERE username=? OR email=?")
          .bind(username, email).first();
        if (dup) return json({ error: "帳號或 Email 已被註冊" }, 409);

        const salt = randomHex(16);
        const hash = await hashPassword(password, salt);
        const id = uid("u");
        await env.DB.prepare("INSERT INTO users (id,email,username,password_hash,salt) VALUES (?,?,?,?,?)")
          .bind(id, email, username, hash, salt).run();
        return json({ ok: true, message: "註冊成功，請登入" }, 201);
      }

      if (path === "/api/auth/login" && method === "POST") {
        const b = await request.json();
        const user = await verifyCredentials(env, (b.username || "").trim(), b.password || "");
        if (!user) return json({ error: "帳號或密碼錯誤" }, 401);
        const token = randomHex(32);
        const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
        await env.DB.prepare("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)")
          .bind(token, user.id, expires).run();
        return json({ token, username: user.username, email: user.email, is_admin: !!user.is_admin, expires_at: expires });
      }

      // 忘記密碼：留下申請單，等總管理員人工重設
      if (path === "/api/auth/forgot" && method === "POST") {
        const b = await request.json();
        const q = (b.identifier || "").trim().toLowerCase();
        if (!q) return json({ error: "請輸入帳號或 Email" }, 400);
        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE lower(username)=? OR lower(email)=?").bind(q, q).first();
        if (user) {
          await env.DB.prepare(
            "INSERT INTO password_resets (id,user_id,username,email) VALUES (?,?,?,?)")
            .bind(uid("pr"), user.id, user.username, user.email).run();
        }
        // 不論帳號是否存在都回同樣訊息，避免被試探帳號
        return json({ ok: true, message: "已通知總管理員。重設完成後，管理員會以 Email 通知你新密碼。" });
      }

      if (path === "/api/auth/logout" && method === "POST") {
        const auth = request.headers.get("Authorization") || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
        if (token) await env.DB.prepare("DELETE FROM sessions WHERE token=?").bind(token).run();
        return json({ ok: true });
      }

      /* ==================== 以下所有 API 都需要登入 ==================== */
      const me = await getSessionUser(request, env);
      if (!me) return json({ error: "未登入或登入已過期，請重新登入", auth_required: true }, 401);

      if (path === "/api/auth/me" && method === "GET") return json(me);

      /* ---------- 管理員專用 API ---------- */
      if (path.startsWith("/api/admin/")) {
        if (!me.is_admin) return json({ error: "需要總管理員權限" }, 403);

        if (path === "/api/admin/users" && method === "GET") {
          const { results } = await env.DB.prepare(
            "SELECT id,email,username,is_admin,created_at FROM users ORDER BY created_at").all();
          return json(results);
        }
        if (path === "/api/admin/resets" && method === "GET") {
          const { results } = await env.DB.prepare(
            "SELECT * FROM password_resets WHERE status='pending' ORDER BY requested_at").all();
          return json(results);
        }
        if (path === "/api/admin/reset-password" && method === "POST") {
          const b = await request.json();
          if ((b.new_password || "").length < 8) return json({ error: "新密碼至少 8 個字元" }, 400);
          const target = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(b.user_id).first();
          if (!target) return json({ error: "找不到此使用者" }, 404);
          const salt = randomHex(16);
          const hash = await hashPassword(b.new_password, salt);
          await env.DB.prepare("UPDATE users SET password_hash=?, salt=? WHERE id=?")
            .bind(hash, salt, target.id).run();
          // 強制該使用者所有裝置重新登入
          await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(target.id).run();
          // 該使用者所有待處理申請標記完成
          await env.DB.prepare(
            "UPDATE password_resets SET status='done', handled_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='pending'")
            .bind(target.id).run();
          return json({ ok: true, username: target.username, email: target.email,
            notify_hint: `請手動寄 Email 至 ${target.email}，通知使用者新密碼。` });
        }
        const dismissMatch = path.match(/^\/api\/admin\/resets\/([\w-]+)\/dismiss$/);
        if (dismissMatch && method === "POST") {
          await env.DB.prepare(
            "UPDATE password_resets SET status='dismissed', handled_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(dismissMatch[1]).run();
          return json({ ok: true });
        }
        return json({ error: "找不到此管理員 API" }, 404);
      }

      /* ---------- 備份：完整資料庫匯出（不含密碼雜湊） ---------- */
      if (path === "/api/backup" && method === "GET") {
        const dump = { exported_at: new Date().toISOString(), exported_by: me.username };
        for (const t of ["clients", "brand_profiles", "content_items", "campaigns", "crm_pipeline"]) {
          dump[t] = (await env.DB.prepare(`SELECT * FROM ${t}`).all()).results;
        }
        dump.users = (await env.DB.prepare("SELECT id,email,username,is_admin,created_at FROM users").all()).results;
        dump.password_resets = (await env.DB.prepare("SELECT * FROM password_resets").all()).results;
        return json(dump);
      }

      /* ---------- 客戶 ---------- */
      if (path === "/api/clients" && method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM clients ORDER BY created_at").all();
        return json(results);
      }
      if (path === "/api/clients" && method === "POST") {
        const b = await request.json();
        const id = uid("c");
        await env.DB.prepare(
          `INSERT INTO clients (id,company_name,brand_name,industry,monthly_fee,case_scale,data_completeness,timeline_status,tags)
           VALUES (?,?,?,?,?,?,?,?,?)`
        ).bind(id, b.company_name, b.brand_name || "", b.industry || "", b.monthly_fee || 0,
               b.case_scale || "中案", b.data_completeness || 0, b.timeline_status || "一般排程",
               JSON.stringify(b.tags || [])).run();
        await env.DB.prepare("INSERT INTO brand_profiles (client_id) VALUES (?)").bind(id).run();
        return json({ id }, 201);
      }
      const clientMatch = path.match(/^\/api\/clients\/([\w-]+)$/);
      if (clientMatch && method === "PATCH") {
        const b = await request.json();
        const allowed = ["company_name","brand_name","industry","monthly_fee","case_scale","data_completeness","timeline_status","tags"];
        const sets = [], vals = [];
        for (const k of allowed) if (k in b) { sets.push(`${k}=?`); vals.push(k==="tags"?JSON.stringify(b[k]):b[k]); }
        if (!sets.length) return json({ error: "沒有可更新的欄位" }, 400);
        vals.push(clientMatch[1]);
        await env.DB.prepare(`UPDATE clients SET ${sets.join(",")} WHERE id=?`).bind(...vals).run();
        return json({ ok: true });
      }
      if (clientMatch && method === "DELETE") {
        const b = await request.json();
        if (!(await verifyCredentials(env, b.username, b.password)))
          return json({ error: "帳號或密碼驗證失敗，無法刪除" }, 403);
        const cid = clientMatch[1];
        // 連動刪除：內容、戰役、品牌 DNA、客戶主檔
        await env.DB.prepare("DELETE FROM content_items WHERE client_id=?").bind(cid).run();
        await env.DB.prepare("DELETE FROM campaigns WHERE client_id=?").bind(cid).run();
        await env.DB.prepare("DELETE FROM brand_profiles WHERE client_id=?").bind(cid).run();
        await env.DB.prepare("DELETE FROM clients WHERE id=?").bind(cid).run();
        return json({ ok: true, deleted: cid });
      }

      /* ---------- 品牌 DNA ---------- */
      const profileMatch = path.match(/^\/api\/profiles\/([\w-]+)$/);
      if (profileMatch && method === "GET") {
        const row = await env.DB.prepare("SELECT * FROM brand_profiles WHERE client_id=?")
          .bind(profileMatch[1]).first();
        return row ? json(row) : json({ error: "找不到此客戶的品牌資料" }, 404);
      }
      if (profileMatch && method === "PUT") {
        const b = await request.json();
        await env.DB.prepare(
          `UPDATE brand_profiles SET positioning=?,target_audience=?,content_pillars=?,competitors=?,
           writing_restrictions=?,regulation_notes=?,platform_preferences=? WHERE client_id=?`
        ).bind(b.positioning || "", b.target_audience || "", b.content_pillars || "", b.competitors || "",
               b.writing_restrictions || "", b.regulation_notes || "", b.platform_preferences || "",
               profileMatch[1]).run();
        return json({ ok: true });
      }

      /* ---------- 內容項目 ---------- */
      if (path === "/api/content" && method === "GET") {
        const cid = url.searchParams.get("client_id");
        const q = cid
          ? env.DB.prepare("SELECT * FROM content_items WHERE client_id=? ORDER BY scheduled_date").bind(cid)
          : env.DB.prepare("SELECT * FROM content_items ORDER BY scheduled_date");
        const { results } = await q.all();
        return json(results);
      }
      if (path === "/api/content" && method === "POST") {
        const b = await request.json();
        const id = uid("ct");
        await env.DB.prepare(
          `INSERT INTO content_items (id,client_id,campaign_id,title,platform,status,content_body,business_goal,scheduled_date,published_date,value_ntd,next_step)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(id, b.client_id, b.campaign_id || null, b.title, b.platform || "FB+IG",
               b.status || "草稿中", b.content_body || "", b.business_goal || "",
               b.scheduled_date || null, b.published_date || null, b.value_ntd || 0, b.next_step || "").run();
        return json({ id }, 201);
      }
      const contentMatch = path.match(/^\/api\/content\/([\w-]+)$/);
      if (contentMatch && method === "PATCH") {
        const b = await request.json();
        const allowed = ["client_id","title","platform","status","content_body","business_goal","scheduled_date","published_date","value_ntd","next_step"];
        const sets = [], vals = [];
        for (const k of allowed) if (k in b) { sets.push(`${k}=?`); vals.push(b[k]); }
        if (!sets.length) return json({ error: "沒有可更新的欄位" }, 400);
        vals.push(contentMatch[1]);
        await env.DB.prepare(`UPDATE content_items SET ${sets.join(",")} WHERE id=?`).bind(...vals).run();
        return json({ ok: true });
      }
      if (contentMatch && method === "DELETE") {
        const b = await request.json();
        if (!(await verifyCredentials(env, b.username, b.password)))
          return json({ error: "帳號或密碼驗證失敗，無法刪除" }, 403);
        await env.DB.prepare("DELETE FROM content_items WHERE id=?").bind(contentMatch[1]).run();
        return json({ ok: true });
      }

      /* ---------- 季度戰役 ---------- */
      if (path === "/api/campaigns" && method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM campaigns").all();
        return json(results);
      }
      if (path === "/api/campaigns" && method === "POST") {
        const b = await request.json();
        const id = uid("cp");
        await env.DB.prepare("INSERT INTO campaigns (id,client_id,quarter,theme,budget) VALUES (?,?,?,?,?)")
          .bind(id, b.client_id, b.quarter || "", b.theme || "", b.budget || 0).run();
        return json({ id }, 201);
      }
      const campMatch = path.match(/^\/api\/campaigns\/([\w-]+)$/);
      if (campMatch && method === "DELETE") {
        const b = await request.json();
        if (!(await verifyCredentials(env, b.username, b.password)))
          return json({ error: "帳號或密碼驗證失敗，無法刪除" }, 403);
        await env.DB.prepare("DELETE FROM campaigns WHERE id=?").bind(campMatch[1]).run();
        return json({ ok: true });
      }

      /* ---------- CRM ---------- */
      if (path === "/api/crm" && method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM crm_pipeline ORDER BY created_at").all();
        return json(results);
      }
      if (path === "/api/crm" && method === "POST") {
        const b = await request.json();
        const id = uid("crm");
        await env.DB.prepare(
          `INSERT INTO crm_pipeline (id,company_name,contact_name,contact_title,contact_method,stage,follow_up_status,next_contact_date,deal_value,marketing_need,owner,priority,notes)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(id, b.company_name, b.contact_name || "", b.contact_title || "", b.contact_method || "",
               b.stage || "新名單", b.follow_up_status || "待首次聯繫", b.next_contact_date || null,
               b.deal_value || 0, b.marketing_need || "", b.owner || "", b.priority || "一般",
               b.notes || "").run();
        return json({ id }, 201);
      }
      const crmMatch = path.match(/^\/api\/crm\/([\w-]+)$/);
      if (crmMatch && method === "PATCH") {
        const b = await request.json();
        const allowed = ["stage","follow_up_status","next_contact_date","deal_value","owner","priority","notes"];
        const sets = [], vals = [];
        for (const k of allowed) if (k in b) { sets.push(`${k}=?`); vals.push(b[k]); }
        if (!sets.length) return json({ error: "沒有可更新的欄位" }, 400);
        vals.push(crmMatch[1]);
        await env.DB.prepare(`UPDATE crm_pipeline SET ${sets.join(",")} WHERE id=?`).bind(...vals).run();
        return json({ ok: true });
      }
      if (crmMatch && method === "DELETE") {
        const b = await request.json();
        if (!(await verifyCredentials(env, b.username, b.password)))
          return json({ error: "帳號或密碼驗證失敗，無法刪除" }, 403);
        await env.DB.prepare("DELETE FROM crm_pipeline WHERE id=?").bind(crmMatch[1]).run();
        return json({ ok: true });
      }

      /* ---------- AI 產出文章 ---------- */
      if (path === "/api/generate" && method === "POST") {
        const b = await request.json();
        const profile = await env.DB.prepare("SELECT * FROM brand_profiles WHERE client_id=?")
          .bind(b.client_id).first();
        const client = await env.DB.prepare("SELECT * FROM clients WHERE id=?")
          .bind(b.client_id).first();
        if (!profile || !client) return json({ error: "找不到客戶或品牌資料" }, 404);

        const use = b.use_data || { ta: true, competitors: true, regulation: true, social: true };
        let brandContext = `品牌定位：${profile.positioning}\n內容支柱：${profile.content_pillars}\n寫作限制：${profile.writing_restrictions}`;
        if (use.ta) brandContext += `\n目標客群：${profile.target_audience}`;
        if (use.competitors) brandContext += `\n競品環境：${profile.competitors}`;
        if (use.regulation) brandContext += `\n法規護欄：${profile.regulation_notes}`;
        if (use.social) brandContext += `\n平台偏好：${profile.platform_preferences}`;

        const systemPrompt =
`你是「大心整合行銷」的資深文案，負責品牌「${client.brand_name || client.company_name}」。
請嚴格依據以下品牌底層資料撰寫，絕不可摻入其他品牌的資訊：
${brandContext}

寫作鐵則：
1. 嚴格遵守法規護欄中的禁用詞，警戒詞需以安全替代寫法呈現。
2. 語感自然有溫度，像真人小編，不要有 AI 腔。
3. 依平台調整格式（${b.platform || "FB+IG"}）。
4. 商業目的：${b.business_goal || "建立信任"}；目標對象：${b.target_audience_line || "主要 TA"}。
5. 文章架構：${b.structure || "Hook → Problem → Agitate → Solution → CTA"}。`;

        const userPrompt =
`主題／產品：${b.topic || "（未指定，請依季度活動主軸發想）"}
季度活動：${b.campaign_theme || "本季主軸"}
補充限制：${b.extra_constraints || "無"}
輸出格式：${b.output_format === "outline" ? "先列文章骨架（各段落重點），再附上完整可執行的 AI Prompt" : "完整貼文文案，含 hashtag 與 CTA"}`;

        const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 2000,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
          }),
        });
        const aiData = await aiRes.json();
        if (!aiRes.ok) return json({ error: "Claude API 錯誤", detail: aiData }, 502);

        const text = (aiData.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");

        const id = uid("ct");
        await env.DB.prepare(
          `INSERT INTO content_items (id,client_id,title,platform,status,content_body,business_goal,scheduled_date,value_ntd,next_step)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).bind(id, b.client_id, b.topic || "AI 產出草稿", b.platform || "FB+IG", "草稿中",
               text, b.business_goal || "", b.scheduled_date || null, b.value_ntd || 0,
               "完成初稿後送審").run();

        return json({ id, content: text });
      }

      return json({ error: "找不到此 API 路徑" }, 404);
    } catch (err) {
      return json({ error: "伺服器錯誤", detail: String(err) }, 500);
    }
  },
};
