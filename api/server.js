const { getServerResources, sendCommand, getAccount, setPower } = require("./ptero");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin"); // ✅ 一定要有

const app = express();

// ✅ only allow these two origins
const allowlist = new Set([
  "https://taotaotaoki1208.github.io",
  "http://localhost:3000",
]);

const corsOptions = {
  origin: (origin, cb) => {
    // allow non-browser requests (Render health checks / curl)
    if (!origin) return cb(null, true);
    if (allowlist.has(origin)) return cb(null, true);
    return cb(new Error("CORS blocked: " + origin));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  maxAge: 86400,
};

// ✅ CORS before routes
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());
const crypto = require("crypto");
const dgram = require("dgram");

function getMasterKey32() {
  const b64 = process.env.OPSCENTER_MASTER_KEY_B64 || "";

  let key;
  try {
    key = Buffer.from(b64, "base64");
  } catch {
    throw new Error("OPSCENTER_MASTER_KEY_B64 不是有效 base64");
  }

  // ✅ 這行要放在 Buffer.from 後面
  console.log("[ENV] MASTER KEY bytes =", key.length);

  if (key.length !== 32) {
    throw new Error("OPSCENTER_MASTER_KEY_B64 解出來必須是 32 bytes");
  }
  return key;
}
function decryptText(enc) {
  const key = getMasterKey32(); // 你已經有 getMasterKey32()
  const [ivB64, tagB64, dataB64] = String(enc || "").split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("encrypted 格式不正確");

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString("utf8");
}

async function getUserPteroToken(admin, uid) {
  const snap = await admin.firestore().collection("opscenter_users").doc(uid).get();
  const enc = snap.data()?.pteroKey?.encrypted;
  if (!enc) {
    const err = new Error("尚未綁定 Pterodactyl API Key");
    err.code = "PTERO_KEY_NOT_SET";
    throw err;
  }
  return decryptText(enc);
}

function loadFirebaseServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
    const jsonText = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_B64,
      "base64"
    ).toString("utf-8");
    return JSON.parse(jsonText);
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
  throw new Error(
    "缺少 FIREBASE_SERVICE_ACCOUNT_B64（Render 必填）"
  );
}

const serviceAccount = loadFirebaseServiceAccount();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// --- Auth middleware：驗證 Firebase ID Token ---
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer (.+)$/);

    if (!match) {
      return res.status(401).json({ ok: false, error: "缺少 Authorization: Bearer <token>" });
    }

    const idToken = match[1];
    const decoded = await admin.auth().verifyIdToken(idToken);

    // 把使用者資訊掛到 req.user 供後面使用
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      name: decoded.name || null,
    };

    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Token 驗證失敗或已過期" });
  }
}
async function requirePteroKey(req, res, next) {
  try {
    const token = await getUserPteroKey(admin, req.user.uid);
    if (!token) {
      return res.status(412).json({
        ok: false,
        error: "此帳號尚未綁定 Pterodactyl API Key",
        code: "PTERO_KEY_NOT_SET",
      });
    }
    req.pteroToken = token;
    next();
  } catch (e) {
  console.error("[PTERO KEY LOAD ERROR]", e);

  if (String(e?.message || "").includes("unable to authenticate data")) {
    return res.status(412).json({
      ok: false,
      error: "已綁定的 Pterodactyl Key 無法解密（可能更換了 MASTER KEY），請重新綁定",
      code: "PTERO_KEY_NEEDS_REBIND",
    });
  }

  return res.status(500).json({ ok: false, error: "讀取使用者 Pterodactyl Key 失敗" });
}
}
// ===== Minecraft Query (UDP) - no extra libs =====
function mcQuery(host, port, timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket("udp4");
    const sessionId = Buffer.from([0x01, 0x02, 0x03, 0x04]);

    const cleanup = (err, data) => {
      try { client.close(); } catch {}
      if (err) reject(err);
      else resolve(data);
    };

    const timer = setTimeout(() => cleanup(new Error("MC_QUERY_TIMEOUT")), timeoutMs);

    // 1) handshake: FE FD 09 + sessionId
    const handshake = Buffer.concat([
      Buffer.from([0xfe, 0xfd, 0x09]),
      sessionId,
    ]);

    client.once("error", (e) => {
      clearTimeout(timer);
      cleanup(e);
    });

    client.once("message", (msg) => {
      // handshake response: 09 + sessionId + token ascii \0
      // token starts at offset 5
      const tokenStr = msg.toString("utf8", 5).trim().replace(/\0/g, "");
      const token = parseInt(tokenStr, 10);
      if (!Number.isFinite(token)) {
        clearTimeout(timer);
        return cleanup(new Error("MC_QUERY_BAD_TOKEN"));
      }

      // 2) basic stat request: FE FD 00 + sessionId + token(4 bytes BE)
      const tokenBuf = Buffer.alloc(4);
      tokenBuf.writeInt32BE(token, 0);

      const statReq = Buffer.concat([
        Buffer.from([0xfe, 0xfd, 0x00]),
        sessionId,
        tokenBuf,
      ]);

      // next message should be stat response
      client.once("message", (msg2) => {
        clearTimeout(timer);

        // response format: 00 + sessionId + key\0value\0key\0value\0...\0\0
        // start parsing after 5 bytes
        const payload = msg2.slice(5).toString("utf8");
        const parts = payload.split("\0").filter(Boolean);

        const kv = {};
        for (let i = 0; i + 1 < parts.length; i += 2) {
          kv[parts[i]] = parts[i + 1];
        }

        const numplayers = Number(kv.numplayers ?? kv.numPlayers ?? 0);
        const maxplayers = Number(kv.maxplayers ?? kv.maxPlayers ?? 0);

        cleanup(null, {
          online: Number.isFinite(numplayers) ? numplayers : 0,
          max: Number.isFinite(maxplayers) ? maxplayers : 0,
          raw: kv,
        });
      });

      client.send(statReq, port, host, (err) => {
        if (err) {
          clearTimeout(timer);
          cleanup(err);
        }
      });
    });

    client.send(handshake, port, host, (err) => {
      if (err) {
        clearTimeout(timer);
        cleanup(err);
      }
    });
  });
}
// Firestore collection (統一用一個)
const USERS_COL = "opscenter_users";

async function getUserPteroMeta(admin, uid) {
  const snap = await admin.firestore().collection(USERS_COL).doc(uid).get();
  const data = snap.exists ? snap.data() : null;

  const enc = data?.pteroKey?.encrypted || null;
  const updatedAt = data?.pteroKey?.updatedAt || null;
  const last4 = data?.pteroKey?.last4 || null;

  return {
    bound: !!enc,
    updatedAt,
    last4,
  };
}

async function upsertUserPteroKey(admin, uid, token) {
  const encrypted = encryptText(token);
  const last4 = token.slice(-4);
  const now = admin.firestore.FieldValue.serverTimestamp();

  await admin.firestore().collection(USERS_COL).doc(uid).set(
    {
      pteroKey: {
        encrypted,
        last4,
        updatedAt: now,
      },
    },
    { merge: true }
  );

  // 回傳 meta（不回明文）
  return { bound: true, last4 };
}

// AES-256-GCM
const ENC_ALGO = "aes-256-gcm";
const ENC_KEY = Buffer.from(process.env.PTERO_KEY_SECRET, "hex"); // 32 bytes
const IV_LENGTH = 12;

function encryptText(plain) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENC_ALGO, ENC_KEY, iv);

  let encrypted = cipher.update(plain, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted,
  ].join(".");
}

function decryptText(payload) {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");

  const decipher = crypto.createDecipheriv(ENC_ALGO, ENC_KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(dataB64, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
// === Maintenance state (Firestore) ===
const STATE_COL = "opscenter_state";
const MAINT_DOC = "maintenance";

async function getState(admin) {
  const ref = admin.firestore().collection(STATE_COL).doc(MAINT_DOC);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : null;

  return {
    mode: data?.mode || "NORMAL",            // "NORMAL" | "MAINTENANCE"
    operator: data?.operator || null,
    updatedAt: data?.updatedAt || null,
  };
}

// 原子化切換狀態：避免重複點造成流程重入
async function trySetMaintenance(admin, { toMode, operator }) {
  const ref = admin.firestore().collection(STATE_COL).doc(MAINT_DOC);

  try {
    const result = await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? snap.data() : {};
      const curMode = current?.mode || "NORMAL";

      if (curMode === toMode) {
        return { ok: false, reason: "ALREADY", current: curMode };
      }

      tx.set(
        ref,
        {
          mode: toMode,
          operator: operator || "unknown",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return { ok: true, from: curMode, to: toMode };
    });

    return result;
  } catch (e) {
    console.error("[MAINT STATE TX ERROR]", e);
    return { ok: false, reason: "TX_FAILED" };
  }
}
// --- Routes ---
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "minecraft-ops-center-api" });
});

// 測試：需要登入才看得到
app.get("/api/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});
// 查詢：是否已綁定（不回傳明文 key）
app.get("/api/ptero-key", requireAuth, async (req, res) => {
  try {
    const meta = await getUserPteroMeta(admin, req.user.uid);
    return res.json({ ok: true, ...meta });
  } catch (e) {
    console.error("[PTERO KEY GET ERROR]", e);
    return res.status(500).json({ ok: false, error: e?.message || "讀取 ptero key 狀態失敗" });
  }
});
// 綁定/更新 key（只收一次，不回傳明文）
app.put("/api/ptero-key", requireAuth, async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ ok: false, error: "缺少 token" });
    if (!token.startsWith("ptlc_")) return res.status(400).json({ ok: false, error: "必須是 ptlc_ 開頭" });

    const meta = await upsertUserPteroKey(admin, req.user.uid, token);
    return res.json({ ok: true, ...meta });
  } catch (e) {
    console.error("[PTERO KEY PUT ERROR]", e);
    return res.status(500).json({ ok: false, error: e?.message || "ptero key 綁定失敗" });
  }
});

// 測試 key 是否有效：用已綁定的 key 呼叫 /account
app.post("/api/ptero-key/test", requireAuth, requirePteroKey, async (req, res) => {
  try {
    const data = await getAccount(req.pteroToken);
    // data.attributes.email / username 等（依 Pterodactyl 版本略不同）
    return res.json({ ok: true, account: data?.attributes || null });
  } catch (e) {
    const status = e?.response?.status || null;
    const detail = e?.response?.data || null;

    console.error("[PTERO KEY TEST ERROR]", status, detail || e);
    return res.status(400).json({
      ok: false,
      error: "Key 測試失敗（可能 Key 無效或權限不足）",
      debug: { httpStatus: status, detail },
    });
  }
});
app.post("/api/discord/announce", requireAuth, async (req, res) => {
  try {
    const token = process.env.DISCORD_BOT_TOKEN;
    const channelId = process.env.DISCORD_CHANNEL_ID;

    if (!token) {
      return res.status(500).json({ ok: false, error: "缺少 DISCORD_BOT_TOKEN" });
    }
    if (!channelId) {
      return res.status(500).json({ ok: false, error: "缺少 DISCORD_CHANNEL_ID" });
    }

    const { title, reason, message, remindKick } = req.body || {};
    const operator = req.user?.email || req.user?.uid || "unknown";

    // 組公告文字（你可以依喜好改格式）
    let content = `**${title || "📢 伺服器公告"}**\n`;
    if (reason) content += `🛠️ 原因：${reason}\n`;
    if (message) content += `${message}\n`;
    if (remindKick) content += `⚠️ 請玩家盡快下線，避免資料異常。\n`;
    content += `\n— Ops Center (${operator})`;

    const axios = require("axios");

    // Discord REST: create message
    const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
    const resp = await axios.post(
      url,
      { content },
      {
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10_000,
      }
    );

    return res.json({ ok: true, discordMessageId: resp.data?.id || null });
  } catch (e) {
    const status = e?.response?.status || 500;
    const detail = e?.response?.data || null;
    console.error("[DISCORD ANNOUNCE ERROR]", status, detail || e);

    // 常見錯誤提示更清楚
    if (status === 401) {
      return res.status(500).json({ ok: false, error: "Discord Bot Token 無效（401）。請重置並更新 .env" });
    }
    if (status === 403) {
      return res.status(500).json({ ok: false, error: "Bot 沒有該頻道權限（403）。請確認 View/Send Messages 權限" });
    }
    if (status === 404) {
      return res.status(500).json({ ok: false, error: "頻道不存在或 Bot 看不到（404）。請確認 DISCORD_CHANNEL_ID 與權限" });
    }
    if (status === 429) {
      return res.status(500).json({ ok: false, error: "Discord Rate Limit（429）。請稍後再試" });
    }

    return res.status(500).json({ ok: false, error: "Discord 公告發送失敗", debug: { status, detail } });
  }
});
app.get("/api/status", requireAuth, requirePteroKey, async (req, res) => {
  try {
    const serverId = process.env.PTERO_SERVER_ID;
    const data = await getServerResources(serverId, req.pteroToken);

    // Pterodactyl client API resources 通常會有 current_state / resources
    const attr = data?.attributes;
    const state = attr?.current_state || "unknown";
    const r = attr?.resources || {};
 // --- Minecraft online players via Query (UDP) ---
let playersOnline = null;
let maxPlayers = null;

try {
  const queryHost = process.env.MC_QUERY_HOST || "127.0.0.1";
  const queryPort = Number(process.env.MC_QUERY_PORT || 25565);

  const q = await mcQuery(queryHost, queryPort, 1200);
  playersOnline = q.online;
  maxPlayers = q.max;
} catch (e) {
  // Query 失敗不要讓整個 /api/status 500，維持 null 就好
  console.log("[MC_QUERY] failed:", e.message);
}
      res.json({
      ok: true,
      server: {
        status: state,
        playersOnline,  // ✅ 真實
        maxPlayers,     // ✅ 真實
      },
      stats: {
        cpu: r.cpu_absolute ?? null,
        memoryBytes: r.memory_bytes ?? null,
        diskBytes: r.disk_bytes ?? null,
        uptime: r.uptime ?? null,
      },
    });
  } catch (e) {
  const status = e?.response?.status;
  const data = e?.response?.data;

  console.error("[PTERO ERROR]", status, data || e);

  return res.status(500).json({
    ok: false,
    error: "Pterodactyl 查詢失敗",
    debug: {
      httpStatus: status || null,
      detail: data || null,
    },
  });
}
});
app.post("/api/power/start", requireAuth, requirePteroKey, async (req, res) => {
  try {
    await setPower(process.env.PTERO_SERVER_ID, "start", req.pteroToken);
    return res.json({ ok: true });
  } catch (e) {
    const status = e?.response?.status || null;
    const detail = e?.response?.data || null;
    console.error("[PTERO POWER start ERROR]", status, detail || e);
    return res.status(500).json({ ok: false, error: "啟動伺服器失敗", debug: { httpStatus: status, detail } });
  }
});

app.post("/api/power/stop", requireAuth, requirePteroKey, async (req, res) => {
  try {
    await setPower(process.env.PTERO_SERVER_ID, "stop", req.pteroToken);
    return res.json({ ok: true });
  } catch (e) {
    const status = e?.response?.status || null;
    const detail = e?.response?.data || null;
    console.error("[PTERO POWER stop ERROR]", status, detail || e);
    return res.status(500).json({ ok: false, error: "停止伺服器失敗", debug: { httpStatus: status, detail } });
  }
});
const port = process.env.PORT || 3001;
app.post(
  "/api/command",
  requireAuth,
  requirePteroKey,
  async (req, res) => {
    const { command } = req.body;
    await sendCommand(
      process.env.PTERO_SERVER_ID,
      command,
      req.pteroToken // ← 重點
    );
    res.json({ ok: true });
  }
);
app.post("/api/maintenance/start", requireAuth, requirePteroKey, async (req, res) => {
  const serverId = process.env.PTERO_SERVER_ID;
  const operator = req.user?.email || req.user?.uid || "unknown";

  // 1) 先鎖狀態（避免重複點）
  const lock = await trySetMaintenance(admin, { toMode: "MAINTENANCE", operator });
  if (!lock.ok) {
    return res.status(409).json({ ok: false, error: "維護模式已啟動，無需重複啟動", code: lock.reason });
  }

  try {
    // 2) 真正執行流程
    await sendCommand(
      serverId,
      `say [OpsCenter] ${operator} 啟動維護模式：即將進入維護，請盡快下線。`,
      req.pteroToken
    );
    await sendCommand(serverId, "whitelist on", req.pteroToken);

    return res.json({ ok: true, message: "維護模式已啟動（白名單已開啟）" });
  } catch (e) {
    // 3) 失敗要回滾狀態（避免卡死在 MAINTENANCE）
    await trySetMaintenance(admin, { toMode: "NORMAL", operator: "system-rollback" });
    console.error("[MAINT START ERROR]", e?.response?.status, e?.response?.data || e);
    return res.status(500).json({ ok: false, error: "啟動維護模式失敗（已回滾狀態）" });
  }
});
app.get("/api/discord/messages", requireAuth, async (req, res) => {
  try {
    const token = process.env.DISCORD_BOT_TOKEN;
    const channelId = process.env.DISCORD_CHANNEL_ID;

    if (!token) return res.status(500).json({ ok: false, error: "缺少 DISCORD_BOT_TOKEN" });
    if (!channelId) return res.status(500).json({ ok: false, error: "缺少 DISCORD_CHANNEL_ID" });

    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 50);

    const axios = require("axios");
    const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=${limit}`;

    const resp = await axios.get(url, {
      headers: { Authorization: `Bot ${token}` },
      timeout: 10_000,
    });

    // Discord message -> 前端可用格式
    const messages = (resp.data || []).map((m) => ({
      id: m.id,
      author: m.author?.username || "unknown",
      avatar: m.author?.avatar
        ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png`
        : "",
      content: m.content || "",
      timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
    }));

    return res.json({ ok: true, messages });
  } catch (e) {
    const status = e?.response?.status || 500;
    const detail = e?.response?.data || null;
    console.error("[DISCORD MESSAGES ERROR]", status, detail || e);

    if (status === 401) return res.status(500).json({ ok: false, error: "Bot Token 無效（401）" });
    if (status === 403) return res.status(500).json({ ok: false, error: "Bot 沒有讀取該頻道權限（403）" });
    if (status === 404) return res.status(500).json({ ok: false, error: "頻道不存在或 Bot 看不到（404）" });

    return res.status(500).json({ ok: false, error: "讀取 Discord 訊息失敗", debug: { status, detail } });
  }
});
app.post("/api/maintenance/stop", requireAuth, requirePteroKey, async (req, res) => {
  const serverId = process.env.PTERO_SERVER_ID;
  const operator = req.user?.email || req.user?.uid || "unknown";

  // 1) 先鎖狀態（避免重複點）
  const lock = await trySetMaintenance(admin, { toMode: "NORMAL", operator });
  if (!lock.ok) {
    return res.status(409).json({ ok: false, error: "目前不是維護模式，無需重複關閉", code: lock.reason });
  }

  try {
    // 2) 真正執行流程
    await sendCommand(serverId, "whitelist off", req.pteroToken);
    await sendCommand(
      serverId,
      `say [OpsCenter] ${operator} 維護模式結束：伺服器已恢復正常，歡迎上線。`,
      req.pteroToken
    );

    return res.json({ ok: true, message: "維護模式已結束（白名單已關閉）" });
  } catch (e) {
    // 3) 失敗要回滾狀態（避免卡死在 NORMAL 但白名單仍開）
    await trySetMaintenance(admin, { toMode: "MAINTENANCE", operator: "system-rollback" });
    console.error("[MAINT STOP ERROR]", e?.response?.status, e?.response?.data || e);
    return res.status(500).json({ ok: false, error: "結束維護模式失敗（已回滾狀態）" });
  }
});
app.get("/api/maintenance/status", requireAuth, async (req, res) => {
  try {
    const state = await getState(admin);
    res.json({ ok: true, state });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "讀取維護狀態失敗" });
  }
});
app.listen(port, () => {
  console.log(`[API] listening on http://localhost:${port}`);
});

