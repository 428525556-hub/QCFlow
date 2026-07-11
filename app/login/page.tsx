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
    const customerName = role === "client" ? invite?.customer_name ?? "" : null;
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

    setMessage(role === "client" ? "客户账号已创建。登录后只能查看自己的订单和报告。" : "账号已创建，请登录进入系统。");
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
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-white">
      <div className="mx-auto flex min-h-[88vh] max-w-md flex-col justify-center">
        <div className="mb-8">
          <div className="relative mb-5 h-20 w-20 overflow-hidden rounded border border-slate-700 bg-white shadow-2xl">
            <Image src="/shuoyu-logo.jpg" alt="SHUOYU" fill sizes="80px" className="object-cover" priority />
          </div>
          <h1 className="text-4xl font-black tracking-normal">QCFlow</h1>
          <p className="mt-3 text-slate-300">鞋服检品订单、现场记录与报告管理。</p>
        </div>

        <form onSubmit={submit} className="rounded border border-slate-700 bg-slate-900 p-5 shadow-2xl">
          <label className="label text-slate-200" htmlFor="email">
            邮箱
          </label>
          <div className="mt-2 flex items-center gap-2 rounded border border-slate-700 bg-slate-950 px-3">
            <Mail size={18} className="text-slate-400" />
            <input id="email" type="email" className="w-full bg-transparent py-3 text-white outline-none" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </div>

          <label className="label mt-4 block text-slate-200" htmlFor="password">
            密码
          </label>
          <div className="mt-2 flex items-center gap-2 rounded border border-slate-700 bg-slate-950 px-3">
            <Lock size={18} className="text-slate-400" />
            <input id="password" type="password" className="w-full bg-transparent py-3 text-white outline-none" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={6} required />
          </div>

          <label className="label mt-4 block text-slate-200" htmlFor="invite">
            注册邀请码
          </label>
          <div className="mt-2 flex items-center gap-2 rounded border border-slate-700 bg-slate-950 px-3">
            <KeyRound size={18} className="text-slate-400" />
            <input id="invite" type="text" className="w-full bg-transparent py-3 uppercase text-white outline-none" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder={adminAccount ? "管理员账号可不填" : "注册必填"} />
          </div>
          <p className="mt-2 text-xs text-slate-400">管理员账号：{ADMIN_EMAIL}。员工和客户都需要管理员生成的邀请码才能创建账号。</p>

          {message && (
            <div className="mt-4 rounded bg-slate-800 px-3 py-2 text-sm text-slate-200">
              <p>{needsEmailConfirmation ? "邮箱还没有验证，请先打开确认邮件。" : message}</p>
              {needsEmailConfirmation && (
                <button type="button" onClick={resendConfirmation} disabled={loading || !email} className="mt-3 text-sm font-black text-safety">
                  重发确认邮件
                </button>
              )}
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="submit" disabled={loading} className="primary-btn bg-safety text-slate-950">
              登录
            </button>
            <button type="button" disabled={loading || !email || !password || (!adminAccount && !inviteCode)} onClick={signUp} className="secondary-btn border-slate-700 bg-slate-900 text-white">
              创建账号
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
