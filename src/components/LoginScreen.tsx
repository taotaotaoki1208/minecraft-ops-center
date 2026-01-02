import React, { useState } from "react";
import { Shield, Lock, Mail } from "lucide-react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../services/firebase";
import { User } from "../types";

interface Props {
  onLogin: (user: User) => void;
}

const LoginScreen: React.FC<Props> = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const buildAvatar = (seed: string) =>
    `https://api.dicebear.com/8.x/bottts/svg?seed=${encodeURIComponent(seed)}`;

  const handleLogin = async () => {
    setErrorMsg("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);

      // 登入即管理員（不需要 role / Firestore）
      onLogin({
        id: cred.user.uid,
        username: cred.user.email || email,
        role: "admin",
        avatar: buildAvatar(cred.user.uid),
      });
    } catch (e: any) {
      setErrorMsg("登入失敗：請確認帳號密碼是否正確。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 border border-gray-700 p-8 rounded-2xl shadow-2xl max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Minecraft 維運中控台</h1>
          <p className="text-gray-400 mt-2">請輸入管理員帳號密碼登入</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-300">Email</label>
            <div className="mt-2 flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2">
              <Mail className="w-4 h-4 text-gray-400" />
              <input
                className="bg-transparent outline-none text-gray-100 w-full"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-300">密碼</label>
            <div className="mt-2 flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2">
              <Lock className="w-4 h-4 text-gray-400" />
              <input
                type="password"
                className="bg-transparent outline-none text-gray-100 w-full"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 p-3 rounded-xl">
              {errorMsg}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 p-3 rounded-xl font-bold transition-colors"
          >
            {loading ? "登入中..." : "登入"}
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-700 text-center">
          <p className="text-xs text-gray-500">僅限管理員登入（無註冊功能）</p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
