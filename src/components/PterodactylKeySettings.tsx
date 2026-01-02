import React, { useEffect, useState } from "react";
import { apiGet, apiPost } from "../services/api"; // 你專案裡已有的 helper（你前面貼過）

type Meta = {
  configured: boolean;
  last4?: string | null;
  updatedAt?: string | null;
};

export default function PterodactylKeySettings() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [account, setAccount] = useState<any>(null);

  async function loadMeta() {
    setErr(null);
    setMsg(null);
    try {
      const res = await apiGet("/api/ptero-key");
      // 後端回：{ ok:true, configured, last4, updatedAt }
      setMeta({
        configured: Boolean(res.configured),
        last4: res.last4 ?? null,
        updatedAt: res.updatedAt ?? null,
      });
    } catch (e: any) {
      setErr(e?.message || "讀取綁定狀態失敗");
    }
  }

  useEffect(() => {
    loadMeta();
  }, []);

  async function save() {
    setErr(null);
    setMsg(null);
    setAccount(null);

    const t = tokenInput.trim();
    if (!t) {
      setErr("請輸入 Pterodactyl Client API Key（ptlc_...）");
      return;
    }

    setLoading(true);
    try {
      const res = await apiPost("/api/ptero-key", { token: t }, "PUT");
      setMsg(`已綁定成功（末四碼：${res.last4 || "****"}）`);
      setTokenInput("");
      await loadMeta();
    } catch (e: any) {
      setErr(e?.message || "綁定失敗");
    } finally {
      setLoading(false);
    }
  }

  async function test() {
    setErr(null);
    setMsg(null);
    setAccount(null);

    setTesting(true);
    try {
      const res = await apiPost("/api/ptero-key/test", {}, "POST");
      setMsg("測試成功：Key 可用 ✅");
      setAccount(res.account || null);
    } catch (e: any) {
      setErr(e?.message || "測試失敗（Key 可能無效或權限不足）");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Pterodactyl API Key</h2>
          <p className="mt-1 text-sm text-slate-600">
            每位使用者可綁定自己的 Pterodactyl <span className="font-mono">Client API Key</span>。
            綁定後，維護模式與指令都會使用你的 Key。
          </p>
        </div>

        <div className="text-right text-sm">
          {meta ? (
            meta.configured ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                已綁定（末四碼：{meta.last4 || "????"}）
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                尚未綁定
              </div>
            )
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-slate-600">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              讀取中…
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="text-sm font-medium text-slate-800">
          輸入你的 Client API Key（ptlc_...）
        </label>

        <input
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none focus:border-indigo-400"
          placeholder="ptlc_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />

        <div className="flex flex-wrap gap-2">
          <button
            onClick={save}
            disabled={loading}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "儲存中…" : "儲存綁定"}
          </button>

          <button
            onClick={test}
            disabled={testing || !meta?.configured}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
          >
            {testing ? "測試中…" : "測試 Key"}
          </button>

          <button
            onClick={loadMeta}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            重新整理狀態
          </button>
        </div>

        {msg && (
          <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {msg}
          </div>
        )}

        {err && (
          <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {err}
          </div>
        )}

        {account && (
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-sm font-semibold text-slate-800">Account（測試回傳）</div>
            <pre className="mt-2 overflow-auto text-xs text-slate-700">
{JSON.stringify(account, null, 2)}
            </pre>
          </div>
        )}

        <div className="mt-2 text-xs text-slate-500">
          提醒：請在 Pterodactyl Panel → Account → API Credentials 建立 <b>Client API Key</b>。
        </div>
      </div>
    </div>
  );
}
