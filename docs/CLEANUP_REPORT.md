# QCFlow 清理审计报告（第一阶段：审计，未删除任何数据）

> 日期：2026-08-27　范围：服务器资源 + 数据库 + 工程代码
> 原则：不改变业务逻辑/数据库结构/UI；第一阶段只审计不删除；所有删除待确认后执行

## 一、安全边界（备份与回滚点）

- Git 分支：`main`，当前 commit：`697f7b2`（总单管理 + 批量删除）
- 工作区：**无未提交修改**（干净）
- 回滚点：全部历史 commit 完整保留；`.git` 仅 1.0MB，无巨型文件
- 部署：国内服务器 `124.221.179.150:8443`（Docker 容器 `qcflow` + `qcflow-pg`）
- 环境变量：`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`（.env.local，未入库）；`VERCEL_OIDC_TOKEN` 为 Vercel 遗留、本地无用
- Vercel：仍保留旧部署（非当前生产，未删除）

## 二、数据库审计（需你运行 SQL 后回填精确数据）

> 已准备 [supabase/cleanup_audit.sql](/C:/Users/pc/Documents/Codex/2026-07-07/qcflow-next-js-app-router-typescript/supabase/cleanup_audit.sql)，在 Supabase SQL Editor 运行后把输出发我，即可回填本报告并进入删除确认阶段。

### 已确认的结构（来自 schema.sql + migrations + production_schema.sql）

- 业务表（21+ 张）：orders、order_items、reservation_cartons、reservation_carton_items、order_attachments、shipment_cartons、shipment_items、dispatch_records、inspection_records、reinspection_records、unboxing_records、registration_invites、user_profiles、inspection_teams、style_categories、production_calendar、team_work_exceptions、inspection_schedule、schedule_progress_records、schedule_change_logs、shipment_batches
- 函数（8 个）：create_order_with_items、schedule_assert_staff、schedule_current_email、apply_schedule_run、record_schedule_progress、apply_manual_adjust、apply_schedule_insert、rollover_schedule
- RLS：业务表均启用，策略按角色（admin/staff/client/field_inspector）
- 外键：子表对 orders 均为 `ON DELETE CASCADE`
- 已知索引：排程模块齐全；orders 仅主键 + 部分索引（正式 Schema 已补 status/po_number/customer_name/shipping_date 等）

### 待 SQL 回填的项

1. 各表实际行数、orders 软删除数/有效数/时间范围
2. 孤立数据（order_items / 检品 / 复检 / 开箱 / 装箱 / 出货 / 附件 等子表找不到父订单的数量）
3. 明显测试数据（customer/po/sku 含 test、demo、测试、示例、纯数字订单号等）——**只列出，删除需你确认**
4. Storage bucket 文件数、总容量、最后修改时间、顶层目录分布

## 三、Storage 审计

- Bucket：`inspection-photos`、`order-attachments`（代码中 STORAGE_BUCKETS）
- 当前无法用匿名 key 枚举 bucket 文件，需运行审计 SQL 第 9–11 节获取：
  - 各 bucket 文件数/容量/时间
  - 顶层目录分布（用于判断孤儿文件）
  - 数据库有引用但 Storage 文件缺失的数量
- 判断原则：**无法判断归属的文件一律不删**

## 四、工程代码审计

- 工作区源码 125 个文件；**未发现无引用源码文件**（除 Next.js 约定的 app/layout.tsx）
- **发现 1 个无引用组件**：`components/ui/Card.tsx`（全项目 0 处 import）→ 属于 A 类可安全删除
- 组件复用情况：Button/Badge/Modal/Skeleton/EmptyState/Spinner 均在用；StatusBadge 与 ui/Badge 用途不同（均保留）
- 无重复组件、无重复 API 路由；27 个 API 路由全部被页面使用
- 无 console.log / debugger / TODO 残留（仅日志系统正常输出）；`tmp/` 下本地调试脚本已 gitignore，不影响仓库
- `scripts/` 下 3 个 Python 检品报告调试工具为开发工具，建议保留或移到 tools/
- 疑似死导出：`orderService.ts` 部分函数仅内部使用（如 sumRecoveredQuantity），非死代码；细粒度导出审计归入第二阶段

## 五、依赖审计

全部 8 个 dependencies + 9 个 devDependencies 均被实际引用，**没有无用依赖**：

| 依赖 | 用途 | 结论 |
| --- | --- | --- |
| @supabase/supabase-js | 数据/认证/存储 | 保留 |
| exceljs | Excel 导入解析 | 保留 |
| jspdf | 检品报告 PDF | 保留 |
| lucide-react / clsx | 图标/样式 | 保留 |
| next / react / react-dom | 框架 | 保留 |
| tailwind/postcss/autoprefixer/typescript/eslint 等 | 构建工具链 | 保留 |

## 六、构建与缓存审计

### 本地

- `.next/`：592.8 MB（含构建缓存，可重新生成）→ 可清理（重新 build 即恢复）
- `node_modules/`：380 MB（可 pnpm install 重新生成）→ 可清理（一般不删，占工作区空间）
- `tsconfig.tsbuildinfo` / 日志：极小，可清理

### 服务器（重点，约可释放 4–5 GB）

- **28 个悬空 Docker 镜像**（`<none>`）：约 **2.45 GB 可回收**
- **5 个已退出容器**（历史构建残留）：约 **2.1 GB 可回收**
- 无用旧基础镜像：`node:20-alpine`（194MB，已不再使用，Node 22 已替换）
- 运行中容器 `qcflow` 内 `.next/cache`：236 MB（镜像内缓存，可优化 Dockerfile 排除）
- `/root/deploy` 旧部署包 v1–v10：约 14 MB（仅保留最新即可）
- 磁盘当前 61%（23G/40G），清理后预计可回到 ~45%

## 七、Git 审计

- `.gitignore` 覆盖 .env*、node_modules、.next、tmp、work、outputs 等 ✓
- 未发现 .env/密钥/证书被提交；`.env.local` 未入库
- Git 历史最大文件仅 148KB（pnpm-lock.yaml），无巨型文件，**无需重写历史**

## 八、性能与查询审计

- `GET /api/orders`：`select("*")` 无分页（当前数据量下可接受；订单量大后需加分页/筛选）——记录为优化项，非本次删除范围
- 订单列表/总单管理：一次请求获取数据、前端分组，无 N+1
- Realtime（orders 实时刷新）：orders 页面 useEffect 正确清理，无泄漏
- 图片：上传前压缩（maxSide 1280 / quality 0.68）✓；列表页不加载原图
- 索引建议（第二阶段与删除无关，可确认后补）：orders(status)、orders(po_number)、orders(customer_name)、orders(shipping_date)、order_items(order_id) 等（正式 Schema 已有，Supabase 实际待 SQL 确认）

## 九、清理分类

### A. 可以安全删除（无需改业务逻辑）

| 项目 | 说明 | 释放 |
| --- | --- | --- |
| 服务器悬空 Docker 镜像（28 个） | `docker image prune -f` | ~2.45 GB |
| 服务器已退出容器（5 个） | `docker container prune -f` | ~2.1 GB |
| 旧基础镜像 node:20-alpine | 已不再使用 | 194 MB |
| /root/deploy 旧部署包 v1–v9 | 保留最新即可 | ~13 MB |
| components/ui/Card.tsx | 全项目 0 引用 | 极小 |
| 本地 .next 缓存 / tsbuildinfo / 日志 | 可重新生成 | ~590 MB（本地） |

### B. 建议删除，但需要你确认

| 项目 | 说明 |
| --- | --- |
| 数据库明显测试数据 | 运行审计 SQL 第 8 节列出后，由你确认删除 |
| 孤立数据库记录 | 审计 SQL 第 7 节确认后处理 |
| 孤立 Storage 文件 | 审计 SQL 第 9–10 节确认后处理 |
| 容器内 .next/cache（Dockerfile 优化） | 改 Dockerfile 排除缓存层，需重新构建 |

### C. 不建议删除

orders / order_items / 检品 / 复检 / 开箱 / 装箱 / 出货 / 排程 / user_profiles / RLS 策略 / 核心依赖 / public 资源（logo、报告模板）

### D. 高风险项目（先不动）

1. 任何带业务记录（检品/出货/装箱/附件/排程）的订单删除——已有批量删除保护机制
2. Storage 文件删除——需逐文件判断归属，无法判断的不删
3. Git 历史重写——当前无需
4. RLS 调整——不做
5. Vercel 旧部署——未删除

## 十、第二阶段执行顺序（等你确认后）

1. 服务器 Docker 清理（镜像/容器/旧镜像/旧包）→ 记录删除前后数量与空间
2. 代码删除（Card.tsx）→ lint / test / build 验证
3. 确认后的测试数据 / 孤立数据 / 孤立 Storage 文件 → 每步记录数量
4. Dockerfile 优化（排除 .next/cache）→ 重新构建部署
5. 最终生产验证（lint / build / test + 登录/订单/检品/总单/排班冒烟）

## 下一步

请先运行 [supabase/cleanup_audit.sql](/C:/Users/pc/Documents/Codex/2026-07-07/qcflow-next-js-app-router-typescript/supabase/cleanup_audit.sql) 并把输出发我；同时确认是否允许我先执行 **A 类（服务器 Docker 清理 + Card.tsx）** 的安全清理。
