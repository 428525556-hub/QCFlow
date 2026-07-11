"use client";

import { useCurrentProfile } from "@/components/AuthGuard";
import { useLanguage } from "@/components/LanguageProvider";
import { isAdminEmail } from "@/lib/security";
import {
  Archive,
  CalendarDays,
  ClipboardList,
  FileText,
  PackageOpen,
  PackageCheck,
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
    <div className="space-y-5">
      <section className="rounded border border-blue-900 bg-blue-950 p-5 text-white">
        <p className="text-sm font-bold text-sky-300">{t("workbenchEyebrow")}</p>
        <h1 className="mt-2 text-3xl font-black tracking-normal">{t("workbenchTitle")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">{t("workbenchIntro")}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <article key={group.titleKey} className="panel p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-machine">{t(group.roleKey)}</p>
                <h2 className="mt-1 text-xl font-black text-blue-950">{t(group.titleKey)}</h2>
              </div>
              <span className="rounded bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{t("workflow")}</span>
            </div>
            <p className="min-h-10 text-sm leading-6 text-slate-600">{t(group.descriptionKey)}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {group.actions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link key={`${group.titleKey}-${action.labelKey}`} href={action.href} className="secondary-btn justify-start">
                    <Icon size={18} />
                    {t(action.labelKey)}
                  </Link>
                );
              })}
            </div>
          </article>
        ))}
      </section>

      {canManageInvites && (
        <section className="panel p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-machine">{t("administrator")}</p>
              <h2 className="mt-1 text-xl font-black text-blue-950">{t("accountAccess")}</h2>
              <p className="mt-1 text-sm text-slate-600">{t("inviteDesc")}</p>
            </div>
            <Link href="/admin/invites" className="primary-btn shrink-0">
              <ShieldCheck size={18} />
              {t("navAdmin")}
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
