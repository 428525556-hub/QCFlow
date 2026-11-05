"use client";

import { ADMIN_EMAIL, normalizeEmail } from "@/lib/security";
import {
  isLocalAuthBackend,
  registerWithInvite,
  requestPasswordReset,
  resendSignupConfirmation,
  signInWithPassword
} from "@/src/api/userApi";
import { KeyRound, Lock, Mail } from "lucide-react";
import Image from "next/image";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const normalizedEmail = normalizeEmail(email);
  const needsEmailConfirmation = message.toLowerCase().includes("email not confirmed");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await signInWithPassword(normalizedEmail, password);
    if (error) setMessage(error.message);
    setLoading(false);
  }

  async function signUp() {
    setLoading(true);
    setMessage("");

    if (!normalizedEmail || !password || !inviteCode.trim()) {
      setMessage("请先填写邮箱、密码和注册邀请码。");
      setLoading(false);
      return;
    }

    const { data, error } = await registerWithInvite(normalizedEmail, password, inviteCode);

    if (error || !data) {
      setMessage(error?.message ?? "创建账号失败");
      setLoading(false);
      return;
    }

    const role = data.profile?.role;
    setMessage(
      role === "client"
        ? "客户账号已创建，登录后只能查看自己的订单和报告。"
        : role === "field_inspector"
          ? "出差检品账号已创建，登录后只能查看指定客户的出差检品。"
          : "账号已创建，正在进入系统。"
    );
    setLoading(false);
  }

  async function resendConfirmation() {
    if (!normalizedEmail) return;
    setLoading(true);
    setMessage("");
    const { error } = await resendSignupConfirmation(normalizedEmail);
    setMessage(error ? error.message : "确认邮件已重新发送，请打开邮箱完成验证。");
    setLoading(false);
  }

  async function forgotPassword() {
    if (!normalizedEmail) {
      setMessage("请先填写登录邮箱。");
      return;
    }
    setLoading(true);
    setMessage("");
    const { error } = await requestPasswordReset(normalizedEmail);
    setMessage(error ? error.message : "如果该邮箱存在，密码重置邮件会在几分钟内发送。");
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-canvas px-5 py-8">
      <div className="mx-auto flex min-h-[88vh] max-w-md flex-col justify-center">
        <div className="mb-8 text-center">
          <div className="relative mx-auto mb-5 h-16 w-16 overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
            <Image src="/shuoyu-logo.jpg" alt="SHUOYU" fill sizes="64px" className="object-cover" priority />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">QCFlow</h1>
          <p className="mt-2 text-sm text-steel">鞋服检品订单、现场记录与报告管理。</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-line/80 bg-white p-6 shadow-dialog">
          <label className="label" htmlFor="email">
            邮箱
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-canvas/60 px-3 focus-within:border-machine focus-within:ring-4 focus-within:ring-machine/15">
            <Mail size={17} className="text-steel" />
            <input id="email" type="email" className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@example.com" />
          </div>

          <label className="label mt-4 block" htmlFor="password">
            密码
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-canvas/60 px-3 focus-within:border-machine focus-within:ring-4 focus-within:ring-machine/15">
            <Lock size={17} className="text-steel" />
            <input id="password" type="password" className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={8} required placeholder="至少 8 位" />
          </div>

          <label className="label mt-4 block" htmlFor="invite">
            注册邀请码
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-canvas/60 px-3 focus-within:border-machine focus-within:ring-4 focus-within:ring-machine/15">
            <KeyRound size={17} className="text-steel" />
            <input id="invite" type="text" className="w-full bg-transparent py-2.5 text-sm uppercase outline-none placeholder:text-slate-400" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="已有账号无需填写" />
          </div>
          <p className="mt-2 text-xs text-steel">管理员账号：{ADMIN_EMAIL}。新员工和新客户都需要管理员生成的邀请码。</p>

          {message && (
            <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p>{needsEmailConfirmation ? "邮箱还没有验证，请先打开确认邮件。" : message}</p>
              {needsEmailConfirmation && !isLocalAuthBackend() && (
                <button type="button" onClick={resendConfirmation} disabled={loading || !email} className="mt-3 text-sm font-semibold text-machine">
                  重发确认邮件
                </button>
              )}
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button type="submit" disabled={loading} className="primary-btn">
              登录
            </button>
            <button type="button" disabled={loading || !email || !password || !inviteCode.trim()} onClick={signUp} className="secondary-btn">
              创建账号
            </button>
          </div>
          {isLocalAuthBackend() && (
            <button
              type="button"
              onClick={forgotPassword}
              disabled={loading || !email}
              className="mt-3 w-full text-center text-xs font-semibold text-machine"
            >
              忘记密码 / 首次设置密码
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
