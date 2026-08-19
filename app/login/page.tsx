"use client";

import { ADMIN_EMAIL, hashInviteCode, isAdminEmail, normalizeEmail } from "@/lib/security";
import { getValidRegistrationInvite, resendSignupConfirmation, signInWithPassword, signUpWithProfile, updateRegistrationInvite, upsertUserProfile } from "@/src/api/userApi";
import type { RegistrationInvite, UserRole } from "@/lib/types";
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
  const adminAccount = isAdminEmail(normalizedEmail);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await signInWithPassword(normalizedEmail, password);
    if (error) setMessage(error.message);
    setLoading(false);
  }

  async function validateInvite() {
    const codeHash = await hashInviteCode(inviteCode);
    const { data, error } = await getValidRegistrationInvite(codeHash, new Date().toISOString());

    if (error) {
      setMessage(`${error.message}。请确认 Supabase 已执行最新邀请码 SQL。`);
      return null;
    }
    if (!data) {
      setMessage("邀请码无效、已过期或已被使用，请联系管理员重新生成。");
      return null;
    }
    return data as RegistrationInvite;
  }

  async function signUp() {
    setLoading(true);
    setMessage("");

    if (!normalizedEmail || !password) {
      setMessage("请先填写邮箱和密码。");
      setLoading(false);
      return;
    }

    const invite = adminAccount ? null : await validateInvite();
    if (!adminAccount && !invite) {
      setLoading(false);
      return;
    }

    const role = (adminAccount ? "admin" : invite?.role ?? "staff") as UserRole;
    const customerName = role === "client" || role === "field_inspector" ? invite?.customer_name ?? "" : null;
    const { data, error } = await signUpWithProfile(normalizedEmail, password, {
      role,
      customer_name: customerName
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (invite) {
      await updateRegistrationInvite(invite.id, {
        used_at: new Date().toISOString(),
        used_by_email: normalizedEmail,
        used_by_user_id: data.user?.id ?? null
      });
    }

    if (data.user) {
      await upsertUserProfile({
        id: data.user.id,
        email: normalizedEmail,
        role,
        customer_name: customerName
      });
    }

    setMessage(role === "client" ? "客户账号已创建。登录后只能查看自己的订单和报告。" : role === "field_inspector" ? "出差检品账号已创建。登录后只能查看指定客户的出差检品。" : "账号已创建，请登录进入系统。");
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
            <input id="password" type="password" className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={6} required placeholder="••••••" />
          </div>

          <label className="label mt-4 block" htmlFor="invite">
            注册邀请码
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-canvas/60 px-3 focus-within:border-machine focus-within:ring-4 focus-within:ring-machine/15">
            <KeyRound size={17} className="text-steel" />
            <input id="invite" type="text" className="w-full bg-transparent py-2.5 text-sm uppercase outline-none placeholder:text-slate-400" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder={adminAccount ? "管理员账号可不填" : "注册必填"} />
          </div>
          <p className="mt-2 text-xs text-steel">管理员账号：{ADMIN_EMAIL}。员工和客户都需要管理员生成的邀请码才能创建账号。</p>

          {message && (
            <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p>{needsEmailConfirmation ? "邮箱还没有验证，请先打开确认邮件。" : message}</p>
              {needsEmailConfirmation && (
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
            <button type="button" disabled={loading || !email || !password || (!adminAccount && !inviteCode)} onClick={signUp} className="secondary-btn">
              创建账号
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
