const { encryptText, decryptText } = require("./cryptoUtil");

const COLLECTION = "opscenter_user_ptero"; // Firestore collection 名稱
const cache = new Map(); // uid -> { token, expMs, meta }

function maskLast4(token) {
  if (!token) return null;
  return token.slice(-4);
}

function isLikelyPteroClientKey(token) {
  // 多數 Pterodactyl client key 是 ptlc_ 開頭（但不要卡太死）
  return typeof token === "string" && token.length >= 20;
}

function getDocRef(admin, uid) {
  return admin.firestore().collection(COLLECTION).doc(uid);
}

async function upsertUserPteroKey(admin, uid, token) {
  if (!isLikelyPteroClientKey(token)) {
    throw new Error("Key 格式不正確（長度不足或非字串）");
  }

  const encrypted = encryptText(token);
  const docRef = getDocRef(admin, uid);

  await docRef.set(
    {
      ...encrypted,
      last4: maskLast4(token),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // 更新 cache（給 5 分鐘）
  cache.set(uid, {
    token,
    expMs: Date.now() + 5 * 60 * 1000,
    meta: { last4: maskLast4(token) },
  });

  return { last4: maskLast4(token) };
}

async function getUserPteroKey(admin, uid) {
  // cache hit
  const c = cache.get(uid);
  if (c && c.expMs > Date.now()) return c.token;

  const snap = await getDocRef(admin, uid).get();
  if (!snap.exists) return null;

  const data = snap.data();
  if (!data?.enc_b64 || !data?.iv_b64 || !data?.tag_b64) return null;

  const token = decryptText({
    enc_b64: data.enc_b64,
    iv_b64: data.iv_b64,
    tag_b64: data.tag_b64,
  });

  cache.set(uid, {
    token,
    expMs: Date.now() + 5 * 60 * 1000,
    meta: { last4: data.last4 || maskLast4(token) },
  });

  return token;
}

async function getUserPteroMeta(admin, uid) {
  const snap = await getDocRef(admin, uid).get();
  if (!snap.exists) return { configured: false };

  const d = snap.data() || {};
  return {
    configured: Boolean(d.enc_b64 && d.iv_b64 && d.tag_b64),
    last4: d.last4 || null,
    updatedAt: d.updatedAt ? d.updatedAt.toDate?.() || null : null,
  };
}

module.exports = { upsertUserPteroKey, getUserPteroKey, getUserPteroMeta };
