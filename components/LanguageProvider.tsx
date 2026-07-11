"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Language = "zh" | "en" | "ja";

type Dictionary = Record<string, Record<Language, string>>;

const dictionary: Dictionary = {
  appSubtitle: { zh: "鞋服检品管理", en: "Footwear & Apparel QC", ja: "靴・アパレル検品管理" },
  logout: { zh: "退出登录", en: "Sign out", ja: "ログアウト" },
  language: { zh: "语言", en: "Language", ja: "言語" },
  navHome: { zh: "首页", en: "Home", ja: "ホーム" },
  navWorkbench: { zh: "工作台", en: "Work", ja: "作業台" },
  navOrders: { zh: "订单", en: "Orders", ja: "注文" },
  navCalendar: { zh: "日历", en: "Calendar", ja: "日程" },
  navClient: { zh: "客户", en: "Client", ja: "顧客" },
  navAdmin: { zh: "权限", en: "Access", ja: "権限" },

  workbenchEyebrow: { zh: "QCFlow Workbench", en: "QCFlow Workbench", ja: "QCFlow 作業台" },
  workbenchTitle: { zh: "全流程工作台", en: "Full Process Workbench", ja: "全工程作業台" },
  workbenchIntro: {
    zh: "按岗位进入对应环节，手机端底部只保留核心入口，具体操作都集中在这里。",
    en: "Open each workflow by role. The mobile bottom bar stays simple, and detailed actions are grouped here.",
    ja: "担当ごとに必要な工程へ入れます。スマホ下部は主要入口だけにし、細かい操作はここに集約します。"
  },
  workflow: { zh: "流程", en: "Flow", ja: "工程" },
  planning: { zh: "计划预约", en: "Planning", ja: "予定" },
  planningRole: { zh: "跟单 / 计划", en: "Merchandising / Planning", ja: "営業管理 / 計画" },
  planningDesc: {
    zh: "先录入客户总订单，后续入库会自动对比已到货和未到货数量。",
    en: "Enter the customer order first, then inbound quantities are compared against the remaining balance.",
    ja: "先に顧客の総注文を登録し、入庫後に到着済みと未到着数量を自動比較します。"
  },
  reservationInspection: { zh: "预约检品", en: "Reserve QC", ja: "検品予約" },
  shippingCalendar: { zh: "出货日历", en: "Shipping Calendar", ja: "出荷日程" },
  warehouse: { zh: "仓库到货", en: "Warehouse Arrival", ja: "倉庫入荷" },
  warehouseRole: { zh: "仓库 / 收货", en: "Warehouse / Receiving", ja: "倉庫 / 受入" },
  warehouseDesc: {
    zh: "货到以后做入库和开箱记录，缺少数量可以拍照留底。",
    en: "Record inbound and unboxing after goods arrive. Shortage photos can be kept as evidence.",
    ja: "入荷後に入庫と開梱記録を行い、不足がある場合は写真で記録できます。"
  },
  inboundOrder: { zh: "订单入库", en: "Inbound Order", ja: "注文入庫" },
  unboxingRecord: { zh: "开箱记录", en: "Unboxing", ja: "開梱記録" },
  onsiteQc: { zh: "现场检品", en: "On-site QC", ja: "現場検品" },
  inspector: { zh: "检品员", en: "Inspector", ja: "検品員" },
  onsiteDesc: {
    zh: "普通检品、X光检品和二次检品分开处理，最终报告会自动扣除返修转良数量。",
    en: "Normal QC, X-ray QC, and reinspection are handled separately. Final reports deduct repaired pass quantities.",
    ja: "通常検品、X線検品、二次検品を分けて処理し、最終報告では修理後の良品数を自動控除します。"
  },
  startInspection: { zh: "开始检品", en: "Start QC", ja: "検品開始" },
  xrayInspection: { zh: "X线检品", en: "X-ray QC", ja: "X線検品" },
  reinspection: { zh: "二次检品", en: "Reinspection", ja: "二次検品" },
  shippingReport: { zh: "出货报告", en: "Shipment & Reports", ja: "出荷・報告" },
  shippingRole: { zh: "出货 / 管理", en: "Shipping / Management", ja: "出荷 / 管理" },
  shippingDesc: {
    zh: "按箱号整理出货明细，查看订单报告和最终汇总。",
    en: "Organize shipment details by carton, and review order reports and final summaries.",
    ja: "箱番ごとに出荷明細を整理し、注文報告と最終集計を確認します。"
  },
  cartonShipping: { zh: "出货装箱", en: "Carton Shipping", ja: "出荷梱包" },
  cartonPacking: { zh: "装箱", en: "Packing", ja: "梱包" },
  dispatchShipping: { zh: "出货", en: "Dispatch", ja: "出荷" },
  totalOrders: { zh: "总订单", en: "All Orders", ja: "総注文" },
  reportEntry: { zh: "报告入口", en: "Reports", ja: "報告入口" },
  administrator: { zh: "管理员", en: "Administrator", ja: "管理者" },
  accountAccess: { zh: "账号权限", en: "Account Access", ja: "アカウント権限" },
  inviteDesc: {
    zh: "员工和客户注册前，需要先在这里生成邀请码。",
    en: "Generate invite codes here before staff or clients register.",
    ja: "社員や顧客が登録する前に、ここで招待コードを発行します。"
  },

  orderList: { zh: "订单列表", en: "Order List", ja: "注文一覧" },
  orderListDesc: {
    zh: "按客户分类，实时同步入库、检品、X光和二次检品结果。",
    en: "Grouped by customer, with live inbound, QC, X-ray, and reinspection results.",
    ja: "顧客別に分類し、入庫・検品・X線・二次検品の結果をリアルタイムで同期します。"
  },
  inbound: { zh: "入库", en: "Inbound", ja: "入庫" },
  orderHint: {
    zh: "通过数量按“已入库数量 - 最终未过数量”自动计算；二次检品转良会自动扣减最终未过。",
    en: "Passed quantity is calculated as inbound quantity minus final failed quantity. Reinspection pass quantities reduce final failures.",
    ja: "合格数は「入庫数 - 最終不合格数」で自動計算されます。二次検品で良品になった数は最終不合格から控除されます。"
  },
  loading: { zh: "正在加载...", en: "Loading...", ja: "読み込み中..." },
  noInboundOrders: { zh: "还没有入库订单。", en: "No inbound orders yet.", ja: "入庫注文はまだありません。" },
  orderCount: { zh: "个订单", en: "orders", ja: "件の注文" },
  normalFinalFailed: { zh: "检品最终未过", en: "QC final failed", ja: "検品最終不合格" },
  xrayFinalFailed: { zh: "X光最终未过", en: "X-ray final failed", ja: "X線最終不合格" },
  reservedInbound: { zh: "预约 / 已入", en: "Reserved / Inbound", ja: "予約 / 入庫済" },
  inboundDate: { zh: "入库", en: "Inbound", ja: "入庫" },
  notInbound: { zh: "未入库", en: "Not inbound", ja: "未入庫" },
  normalInspection: { zh: "普通检品", en: "Normal QC", ja: "通常検品" },
  xrayQc: { zh: "X光检品", en: "X-ray QC", ja: "X線検品" },
  recheckPassed: { zh: "二检转良", en: "Repaired pass", ja: "二検良品化" },
  passed: { zh: "通过", en: "Passed", ja: "合格" },
  failed: { zh: "未过", en: "Failed", ja: "不合格" },
  reservedInboundFull: { zh: "预约 / 已入库", en: "Reserved / Inbound", ja: "予約 / 入庫済" },
  baseQuantity: { zh: "统计基数", en: "Base Qty", ja: "基準数" },
  factory: { zh: "工厂", en: "Factory", ja: "工場" },
  shippingDate: { zh: "出货日期", en: "Shipping Date", ja: "出荷日" },
  sku: { zh: "番号", en: "Style No.", ja: "品番" },
  colorSize: { zh: "颜色 / 尺码", en: "Color / Size", ja: "色 / サイズ" },
  inspect: { zh: "检品", en: "QC", ja: "検品" },
  xray: { zh: "X光", en: "X-ray", ja: "X線" },
  recheck: { zh: "二检", en: "Recheck", ja: "二検" },
  shipping: { zh: "出库", en: "Ship", ja: "出庫" },
  report: { zh: "报告", en: "Report", ja: "報告" }
};

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("zh");

  useEffect(() => {
    const saved = window.localStorage.getItem("qcflow-language");
    if (saved === "zh" || saved === "en" || saved === "ja") setLanguageState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : language === "ja" ? "ja" : "en";
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage(nextLanguage) {
        setLanguageState(nextLanguage);
        window.localStorage.setItem("qcflow-language", nextLanguage);
      },
      t(key) {
        return dictionary[key]?.[language] ?? dictionary[key]?.zh ?? key;
      }
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}
