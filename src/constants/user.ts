import type { UserRole } from "@/src/types";

export const USER_ROLES: UserRole[] = ["admin", "staff", "client"];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "管理员",
  staff: "员工",
  client: "客户"
};

export const SUPER_ADMIN_EMAIL = "shuoyuqc@163.com";

