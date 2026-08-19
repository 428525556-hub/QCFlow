"use client";

import { useCurrentProfile } from "@/components/AuthGuard";
import { type Language, useLanguage } from "@/components/LanguageProvider";
import { isAdminEmail } from "@/lib/security";
import { getCurrentUser, signOut as signOutUser } from "@/src/api/userApi";
import { clsx } from "clsx";
import { BriefcaseBusiness, CalendarClock, ChevronDown, Eye, Home, Languages, ListChecks, LogOut, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const staffNav = [
  { href: "/", labelKey: "navHome", icon: Home, iconColor: "#0071E3" },
  { href: "/workbench", labelKey: "navWorkbench", icon: BriefcaseBusiness, iconColor: "#5856D6" },
  { href: "/orders", labelKey: "navOrders", icon: ListChecks, iconColor: "#34C759" },
  { href: "/schedule/today", labelKey: "navSchedule", icon: CalendarClock, iconColor: "#FF9F0A" }
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLogin) return;
    getCurrentUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, [isLogin]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const nav = useMemo(() => {
    if (profile?.role === "client") return [{ href: "/client", labelKey: "navClient", icon: Eye, iconColor: "#0071E3" }];
    if (profile?.role === "field_inspector") return [{ href: "/field", labelKey: "navField", icon: BriefcaseBusiness, iconColor: "#AF52DE" }];
    if (isAdminEmail(email)) {
      return [
        { href: "/", labelKey: "navHome", icon: Home, iconColor: "#0071E3" },
        { href: "/workbench", labelKey: "navWorkbench", icon: BriefcaseBusiness, iconColor: "#5856D6" },
        { href: "/orders", labelKey: "navOrders", icon: ListChecks, iconColor: "#34C759" },
        { href: "/schedule/today", labelKey: "navSchedule", icon: CalendarClock, iconColor: "#FF9F0A" },
        { href: "/admin/invites", labelKey: "navAdmin", icon: ShieldCheck, iconColor: "#FF3B30" }
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

  const avatarText = (email || profile?.email || "?").slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-white/75 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3 px-4 landscape:pl-28">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-line bg-white">
              <Image src="/shuoyu-logo.jpg" alt="SHUOYU" fill sizes="32px" className="object-cover" priority />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold leading-tight tracking-tight">QCFlow</span>
              <span className="block truncate text-[11px] leading-tight text-steel">{t("appSubtitle")}</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={cycleLanguage}
              className="icon-btn h-9 w-9"
              aria-label={t("language")}
              title={t("language")}
            >
              <Languages size={17} />
            </button>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex h-9 items-center gap-1.5 rounded-[10px] px-1.5 transition-all duration-150 ease-out hover:bg-black/5 active:scale-[0.98]"
                aria-label="用户菜单"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-machine text-xs font-bold text-white">{avatarText}</span>
                <ChevronDown size={14} className="text-steel" />
              </button>
              {menuOpen && (
                <div className="dialog-enter absolute right-0 top-11 w-56 rounded-xl border border-line/80 bg-white p-1.5 shadow-dialog">
                  <div className="px-3 py-2">
                    <p className="truncate text-[13px] font-semibold">{email || profile?.email || ""}</p>
                    <p className="text-[11px] text-steel">{profile?.role ?? ""}</p>
                  </div>
                  <button
                    type="button"
                    onClick={signOut}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-danger transition-colors duration-150 hover:bg-danger/10"
                  >
                    <LogOut size={15} />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main key={pathname} className="page-enter mx-auto max-w-[1600px] px-4 pb-24 pt-5 landscape:pb-10 landscape:pl-28">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line/60 bg-white/90 backdrop-blur landscape:inset-x-auto landscape:inset-y-0 landscape:left-0 landscape:z-40 landscape:w-28 landscape:flex-col landscape:border-r landscape:border-t-0">
        <div className="grid grid-cols-4 landscape:flex landscape:flex-col landscape:justify-center landscape:gap-1 landscape:p-2">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium transition-all duration-150 ease-out landscape:min-h-14 landscape:w-full landscape:flex-row landscape:justify-center landscape:gap-2.5 landscape:px-3 landscape:text-[15px] landscape:font-bold",
                  active ? "bg-machine/10 text-machine" : "text-steel hover:bg-black/5 hover:text-ink"
                )}
              >
                <Icon size={20} className="landscape:h-[22px] landscape:w-[22px]" style={{ color: item.iconColor }} />
                <span className="whitespace-nowrap">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
