const COLLECTION = "opscenter_maintenance_state";
const DOC_ID = "global"; // 單一伺服器就用 global，未來多伺服器再改成 serverId

function docRef(admin) {
  return admin.firestore().collection(COLLECTION).doc(DOC_ID);
}

async function getState(admin) {
  const snap = await docRef(admin).get();
  if (!snap.exists) {
    return {
      mode: "NORMAL", // NORMAL | MAINTENANCE
      updatedAt: null,
      updatedBy: null,
    };
  }
  const d = snap.data() || {};
  return {
    mode: d.mode || "NORMAL",
    updatedAt: d.updatedAt ? d.updatedAt.toDate?.() || null : null,
    updatedBy: d.updatedBy || null,
  };
}

// 用 transaction 防止同時點兩次造成重複啟動
async function trySetMaintenance(admin, { toMode, operator }) {
  const ref = docRef(admin);
  return await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? (snap.data()?.mode || "NORMAL") : "NORMAL";

    if (toMode === "MAINTENANCE" && cur === "MAINTENANCE") {
      return { ok: false, reason: "ALREADY_MAINTENANCE", cur };
    }
    if (toMode === "NORMAL" && cur === "NORMAL") {
      return { ok: false, reason: "ALREADY_NORMAL", cur };
    }

    tx.set(
      ref,
      {
        mode: toMode,
        updatedBy: operator || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true, from: cur, to: toMode };
  });
}

module.exports = { getState, trySetMaintenance };
