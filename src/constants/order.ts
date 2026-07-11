import type { InspectionPlan, OrderStatus } from "@/src/types";

export const ORDER_STATUSES: OrderStatus[] = ["未开始", "检品中", "已完成"];

export const ORDER_TYPES = {
  reservation: "reservation",
  inbound: "inbound"
} as const;

export const INSPECTION_PLANS: InspectionPlan[] = ["normal", "xray", "both"];

export const INSPECTION_PLAN_LABELS: Record<InspectionPlan, string> = {
  normal: "检品",
  xray: "X线",
  both: "检品 + X线"
};

