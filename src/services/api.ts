import { auth } from "./firebase";
// ✅ Production: set VITE_API_BASE to your backend URL (e.g. https://api.example.com)
const API_BASE = import.meta.env.VITE_API_BASE || "";


/**
 * 統一產生帶 Firebase Token 的 headers
 */
async function authHeaders(extra?: Record<string, string>) {
  const user = auth.currentUser;
  if (!user) throw new Error("尚未登入");

  const token = await user.getIdToken();

  return {
    Authorization: `Bearer ${token}`,
    ...(extra || {}),
  };
}

/**
 * GET API（有帶 Token）
 */
class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function parseJsonSafe(text: string) {
  try { return JSON.parse(text); } catch { return {}; }
}

export async function apiGet(path: string) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(API_BASE + path, { headers: await authHeaders() });
  const text = await res.text();
  const data: any = parseJsonSafe(text);

  if (!res.ok) {
    throw new ApiError(
      data?.error || text || "API 錯誤",
      res.status,
      data?.code
    );
  }
  return data;
}

export async function apiPost(path: string, body?: any, method: "POST" | "PUT" = "POST") {
  const res = await fetch(API_BASE + path, {
    method,
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data: any = parseJsonSafe(text);

  if (!res.ok) {
    throw new ApiError(
      data?.error || text || "API 錯誤",
      res.status,
      data?.code
    );
  }
  return data;
}

export type { ApiError };
