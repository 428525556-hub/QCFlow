"use client";

import { useCurrentProfile } from "@/components/AuthGuard";
import { type Language, useLanguage } from "@/components/LanguageProvider";
import { isAdminEmail } from "@/lib/security";
import { getCurrentUser, signOut as signOutUser } from "@/src/api/userApi";
import { clsx } from "clsx";
import { BriefcaseBusiness, CalendarDays, Eye, Home, Languages, ListChecks, LogOut, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const staffNav = [
  { href: "/", labelKey: "navHome", icon: Home },
  { href: "/workbench", labelKey: "navWorkbench", icon: BriefcaseBusiness },
  { href: "/orders", labelKey: "navOrders", icon: ListChecks },
  { href: "/calendar", labelKey: "navCalendar", icon: CalendarDays }
];

const languageLabels: Record<Language, string> = {
  zh: "中",
  en: "EN",
  ja: "日"
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";
  const profile = useCurrentProfile();
  const { language, setLanguage, t } = useLanguage();
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (isLogin) return;
    getCurrentUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, [isLogin]);

  const nav = useMemo(() => {
    if (profile?.role === "client") return [{ href: "/client", labelKey: "navClient", icon: Eye }];
    if (isAdminEmail(email)) {
      return [
        { href: "/", labelKey: "navHome", icon: Home },
        { href: "/workbench", labelKey: "navWorkbench", icon: BriefcaseBusiness },
        { href: "/orders", labelKey: "navOrders", icon: ListChecks },
        { href: "/admin/invites", labelKey: "navAdmin", icon: ShieldCheck }
      ];
    }
    return staffNav;
  }, [email, profile]);

  if (isLogin) return <>{children}</>;

  async function signOut() {
    await signOutUser();
    router.replace("/login");
  }

  function cycleLanguage() {
    setLanguage(language === "zh" ? "en" : language === "en" ? "ja" : "zh");
  }

  return (
    <div className="min-h-screen bg-blue-50 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded border border-line bg-white">
              <Image src="/shuoyu-logo.jpg" alt="SHUOYU" fill sizes="40px" className="object-cover" priority />
            </span>
            <div className="min-w-0">
              <p className="text-base font-black leading-tight tracking-normal">QCFlow</p>
              <p className="truncate text-xs text-slate-500">{t("appSubtitle")}</p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={cycleLanguage}
              className="inline-flex h-10 items-center justify-center gap-1 rounded border border-line bg-white px-2 text-xs font-black text-slate-700 shadow-panel"
              aria-label={t("language")}
              title={t("language")}
            >
              <Languages size={16} />
              {languageLabels[language]}
            </button>
            <button type="button" onClick={signOut} className="inline-flex h-10 w-10 items-center justify-center rounded border border-line bg-white text-slate-600 shadow-panel" aria-label={t("logout")} title={t("logout")}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 md:pb-10">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white md:hidden">
        <div className="grid grid-cols-4">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={clsx("flex min-h-[64px] flex-col items-center justify-center gap-1 px-1 text-xs font-bold", active ? "text-machine" : "text-slate-500")}>
                <Icon size={21} />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
