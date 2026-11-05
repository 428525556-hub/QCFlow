"use client";

import { resetPassword } from "@/src/api/userApi";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password !== confirmation) {
      setMessage("两次输入的密码不一致。");
      return;
    }
    setLoading(true);
    const { error } = await resetPassword(token, password);
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setCompleted(true);
    setMessage("密码已重置，请使用新密码登录。");
  }

  return (
    <main className="min-h-screen bg-canvas px-5 py-8">
      <div className="mx-auto flex min-h-[88vh] max-w-md flex-col justify-center">
        <form onSubmit={submit} className="rounded-2xl border border-line/80 bg-white p-6 shadow-dialog">
          <h1 className="text-2xl font-semibold tracking-tight">重置密码</h1>
          <p className="mt-2 text-sm text-steel">重置链接有效期为 30 分钟，且只能使用一次。</p>

          <label className="label mt-5 block" htmlFor="password">
            新密码
          </label>
          <input
            id="password"
            className="field mt-2"
            type="password"
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <label className="label mt-4 block" htmlFor="confirmation">
            再次输入
          </label>
          <input
            id="confirmation"
            className="field mt-2"
            type="password"
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />

          {message && <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</p>}

          <button type="submit" disabled={loading || !token || completed} className="primary-btn mt-6 w-full">
            {loading ? "提交中" : completed ? "已完成" : "设置新密码"}
          </button>
          {!token && <p className="mt-3 text-sm text-danger">链接缺少重置令牌，请重新申请。</p>}
          <Link href="/login" className="mt-4 block text-center text-sm font-semibold text-machine">
            返回登录
          </Link>
        </form>
      </div>
    </main>
  );
}
