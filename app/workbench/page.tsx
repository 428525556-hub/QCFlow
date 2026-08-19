"use client";

import { useCurrentProfile } from "@/components/AuthGuard";
import { useLanguage } from "@/components/LanguageProvider";
import { isAdminEmail } from "@/lib/security";
import {
  Archive,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Factory,
  FileText,
  PackageCheck,
  PackageOpen,
  PackagePlus,
  PackageSearch,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Truck
} from "lucide-react";
import Link from "next/link";

const groups = [
  {
    titleKey: "planning",
    roleKey: "planningRole",
    descriptionKey: "planningDesc",
    actions: [
      { href: "/reservations/new", labelKey: "reservationInspection", icon: PackageSearch },
      { href: "/calendar", labelKey: "shippingCalendar", icon: CalendarDays }
    ]
  },
  {
    titleKey: "scheduling",
    roleKey: "schedulingRole",
    descriptionKey: "schedulingDesc",
    actions: [
      { href: "/schedule/today", labelKey: "scheduleToday", icon: CalendarClock },
      { href: "/schedule/plan", labelKey: "schedulePlan", icon: CalendarRange },
      { href: "/schedule/teams", labelKey: "scheduleTeams", icon: Factory }
    ]
  },
  {
    titleKey: "warehouse",
    roleKey: "warehouseRole",
    descriptionKey: "warehouseDesc",
    actions: [
      { href: "/orders/new", labelKey: "inboundOrder", icon: PackagePlus },
      { href: "/unbox", labelKey: "unboxingRecord", icon: PackageOpen }
    ]
  },
  {
    titleKey: "onsiteQc",
    roleKey: "inspector",
    descriptionKey: "onsiteDesc",
    actions: [
      { href: "/orders", labelKey: "startInspection", icon: ClipboardList },
      { href: "/field", labelKey: "fieldInspection", icon: BriefcaseBusiness },
      { href: "/orders", labelKey: "xrayInspection", icon: ScanLine },
      { href: "/orders", labelKey: "reinspection", icon: RefreshCw }
    ]
  },
  {
    titleKey: "shippingReport",
    roleKey: "shippingRole",
    descriptionKey: "shippingDesc",
    actions: [
      { href: "/ship", labelKey: "cartonPacking", icon: PackageCheck },
      { href: "/dispatch", labelKey: "dispatchShipping", icon: Truck },
      { href: "/orders/manage", labelKey: "totalOrders", icon: Archive },
      { href: "/orders", labelKey: "reportEntry", icon: FileText }
    ]
  }
];

export default function WorkbenchPage() {
  const profile = useCurrentProfile();
  const { t } = useLanguage();
  const canManageInvites = isAdminEmail(profile?.email ?? "") || profile?.role === "admin";

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[13px] font-semibold text-steel">QCFlow Workbench</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("workbenchTitle")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-steel">{t("workbenchIntro")}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <article
            key={group.titleKey}
            className="rounded-2xl border border-line/80 bg-white p-5 shadow-soft transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-raised"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-steel">{t(group.roleKey)}</p>
                <h2 className="mt-1 text-[17px] font-semibold tracking-tight">{t(group.titleKey)}</h2>
              </div>
              <span className="rounded-md bg-canvas px-2 py-0.5 text-[11px] font-medium text-steel">{t("workflow")}</span>
            </div>
            <p className="min-h-10 text-[13px] leading-6 text-steel">{t(group.descriptionKey)}</p>
            <div className="mt-4 grid grid-cols-2 gap-1">
              {group.actions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={`${group.titleKey}-${action.labelKey}`}
                    href={action.href}
                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-ink transition-all duration-150 ease-out hover:bg-machine/10 hover:text-machine active:scale-[0.98]"
                  >
                    <Icon size={16} className="shrink-0 text-steel" />
                    <span className="truncate">{t(action.labelKey)}</span>
                  </Link>
                );
              })}
            </div>
          </article>
        ))}
      </section>

      {canManageInvites && (
        <section className="flex items-center justify-between gap-3 rounded-2xl border border-line/80 bg-white p-5 shadow-soft">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-steel">{t("administrator")}</p>
            <h2 className="mt-1 text-[17px] font-semibold tracking-tight">{t("accountAccess")}</h2>
            <p className="mt-1 text-[13px] text-steel">{t("inviteDesc")}</p>
          </div>
          <Link href="/admin/invites" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-machine px-4 text-sm font-semibold text-white shadow-soft transition-all duration-150 ease-out hover:bg-primary-dark active:scale-[0.98]">
            <ShieldCheck size={16} />
            {t("navAdmin")}
          </Link>
        </section>
      )}
    </div>
  );
}
