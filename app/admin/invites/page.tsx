"use client";

import { ADMIN_EMAIL, createInviteCode, formatInviteCode, hashInviteCode, isAdminEmail } from "@/lib/security";
import { getCurrentUser, getRegistrationInvites, insertRegistrationInvite, updateRegistrationInvite } from "@/src/api/userApi";
import type { RegistrationInvite } from "@/lib/types";
import { Copy, KeyRound, Plus, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function AdminInvitesPage() {
  const [userEmail, setUserEmail] = useState("");
  const [invites, setInvites] = useState<RegistrationInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [days, setDays] = useState(7);
  const [accountRole, setAccountRole] = useState<"staff" | "client">("staff");
  const [customerName, setCustomerName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [message, setMessage] = useState("");

  const isAdmin = useMemo(() => isAdminEmail(userEmail), [userEmail]);

  async function load() {
    setLoading(true);
    setMessage("");

    const { data: userResult } = await getCurrentUser();
    const email = userResult.user?.email ?? "";
    setUserEmail(email);

    if (!isAdminEmail(email)) {
      setLoading(false);
      return;
    }

    const { data, error } = await getRegistrationInvites();
    if (error) setMessage(`${error.message}。请确认 Supabase 已执行最新邀请码 SQL。`);
    setInvites((data ?? []) as RegistrationInvite[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createInvite() {
    setCreating(true);
    setMessage("");
    setNewCode("");

    const { data: userResult } = await getCurrentUser();
    const user = userResult.user;
    if (!user || !isAdminEmail(user.email)) {
      setMessage("当前账号没有管理员权限。");
      setCreating(false);
      return;
    }
    if (accountRole === "client" && !customerName.trim()) {
      setMessage("客户账号必须填写客户名称，并且要和订单里的客户名称完全一致。");
      setCreating(false);
      return;
    }

    const code = createInviteCode();
    const codeHash = await hashInviteCode(code);
    const expiresAt = new Date(Date.now() + Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await insertRegistrationInvite({
      created_by_user_id: user.id,
      created_by_email: ADMIN_EMAIL,
      code_hash: codeHash,
      role: accountRole,
      customer_name: accountRole === "client" ? customerName.trim() : null,
      expires_at: expiresAt
    });

    if (error) {
      setMessage(`${error.message}。请确认 Supabase 已执行最新邀请码 SQL。`);
      setCreating(false);
      return;
    }

    setNewCode(formatInviteCode(code));
    await load();
    setCreating(false);
  }

  async function revokeInvite(invite: RegistrationInvite) {
    const ok = window.confirm("确定停用这个邀请码吗？");
    if (!ok) return;

    const { error } = await updateRegistrationInvite(invite.id, { active: false });
    if (error) {
      setMessage(error.message);
      return;
    }
    setInvites((current) => current.map((item) => (item.id === invite.id ? { ...item, active: false } : item)));
  }

  async function copyCode() {
    if (!newCode) return;
    await navigator.clipboard.writeText(newCode);
    setMessage("邀请码已复制，可以发给对方。");
  }

  if (loading) return <div className="panel p-5 text-sm text-slate-500">正在检查管理员权限...</div>;

  if (!isAdmin) {
    return (
      <div className="panel p-5">
        <div className="mb-3 inline-flex items-center gap-2 rounded bg-red-50 px-3 py-1 text-sm font-black text-red-700">
          <ShieldCheck size={16} />
          无权限
        </div>
        <h1 className="text-2xl font-black text-blue-950">管理员邀请码</h1>
        <p className="mt-2 text-sm text-slate-600">只有 {ADMIN_EMAIL} 可以生成注册邀请码。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-900">
          <ShieldCheck size={14} />
          最高权限
        </div>
        <h1 className="text-2xl font-black tracking-normal text-blue-950">注册邀请码</h1>
        <p className="mt-1 text-sm text-blue-700">员工和客户注册都必须填写这里生成的一次性加密邀请码。</p>
      </div>

      {message && <p className="rounded bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800">{message}</p>}

      <section className="panel p-4">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-machine" />
          <h2 className="text-lg font-black text-blue-950">生成新邀请码</h2>
        </div>

        <label className="mt-4 block space-y-1">
          <span className="label">账号类型</span>
          <select className="field" value={accountRole} onChange={(event) => setAccountRole(event.target.value as "staff" | "client")}>
            <option value="staff">员工账号：可以使用后台功能</option>
            <option value="client">客户账号：只能查看自己的订单和报告</option>
          </select>
        </label>

        {accountRole === "client" && (
          <label className="mt-4 block space-y-1">
            <span className="label">客户名称</span>
            <input className="field" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="必须和订单里的客户名称完全一致" />
          </label>
        )}

        <label className="mt-4 block space-y-1">
          <span className="label">有效天数</span>
          <input className="field" type="number" min={1} max={90} value={days} onChange={(event) => setDays(Number(event.target.value))} />
        </label>

        <button type="button" onClick={createInvite} disabled={creating} className="primary-btn mt-4 w-full">
          <Plus size={18} />
          {creating ? "生成中" : "生成邀请码"}
        </button>

        {newCode && (
          <div className="mt-4 rounded border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs font-bold text-blue-700">只显示这一次，请复制后发给对方</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 rounded bg-white px-3 py-2 text-lg font-black text-blue-950">{newCode}</code>
              <button type="button" onClick={copyCode} className="inline-flex h-11 w-11 items-center justify-center rounded border border-line bg-white text-blue-700">
                <Copy size={18} />
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-black text-blue-950">邀请码记录</h2>
        {invites.length === 0 && <div className="panel p-4 text-sm text-slate-500">还没有生成过邀请码。</div>}
        {invites.map((invite) => {
          const expired = new Date(invite.expires_at).getTime() < Date.now();
          const status = invite.used_at ? "已使用" : !invite.active ? "已停用" : expired ? "已过期" : "可使用";
          return (
            <article key={invite.id} className="panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-blue-950">{status}</p>
                  <p className="mt-1 text-sm text-slate-500">账号类型：{invite.role === "client" ? `客户 ${invite.customer_name ?? ""}` : "员工"}</p>
                  <p className="mt-1 text-sm text-slate-500">过期时间：{new Date(invite.expires_at).toLocaleString("zh-CN")}</p>
                  {invite.used_by_email && <p className="mt-1 text-sm text-slate-500">使用账号：{invite.used_by_email}</p>}
                </div>
                {!invite.used_at && invite.active && !expired && (
                  <button type="button" onClick={() => revokeInvite(invite)} className="inline-flex h-10 w-10 items-center justify-center rounded border border-red-200 text-red-700">
                    <XCircle size={18} />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
