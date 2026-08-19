# QCFlow 自动检品排程模块设计方案 v2（待确认版）

> 状态：设计稿 v2，尚未编码。整体架构沿用 v1，本版按反馈补齐 8 项要求。
> 第一阶段范围：自动计算 + 今日计划 + 产能统计 + 三层 Deadline 风险预警 + 人工调整 + 手动锁定 + 自动重新排程 + 紧急插单（预览→确认）+ 排程解释 + 送检登记。
> 第二阶段范围：AI 到货/返检预测、排程模拟对比、甘特图、消息通知。

---

## 1. 现状盘点

### 1.1 已有能力

| 模块 | 现状 |
| --- | --- |
| 订单 | `orders` 聚合字段 + `order_items` 明细（po/sku/color/size/数量/入库量），支持软删除、回收站 |
| 入库 | `orders/order_items.inbound_quantity` 累计，`unboxing_records` 开箱记录 |
| 检品 | `inspection_records`（缺陷记录，分 normal/xray/field）+ `reinspection_records`（返检转良） |
| 出货 | `reservation_cartons` / `shipment_cartons` / `dispatch_records` |
| 报告 | 订单报告 / 客户门户 / PDF / Excel 导出 |
| 权限 | `user_profiles`：admin / staff / client / field_inspector，RLS 已收敛到 `staff_shared_access.sql` |

### 1.2 与需求的差距

1. 没有「班组 / 产能」概念，5000 双/天无处配置；
2. 没有「排程任务」表，无法表达"今天检什么、检多少、哪个班负责"；
3. 没有「计划 vs 实际完成」分离模型，无法回答"计划 3000 实际 2600 差异 400"；
4. 订单缺少：预计可检日期、预约送货日期、优先级、检品标准、指定班组、送检数量、款式产能系数；
5. 没有节假日 / 加班 / 停工 / 请假的工作日历；
6. 没有排程审计与排程解释（无法回答"为什么排在这一天"）；
7. 没有独立可测试的排程算法。

---

## 2. 核心设计决策

| # | 决策 | 说明 |
| --- | --- | --- |
| D1 | 排程单位 = `order_items` 明细（款号/颜色/尺码） | 满足"款式级排程"；订单级展示由明细汇总；同一订单可拆多任务、跨班组、跨日期 |
| D2 | 计划与实际完成彻底分离 | `inspection_schedule.planned_quantity` 只表示计划；实际完成追加写入 `schedule_progress_records`，绝不覆盖计划；差异 = 计划 − 累计完成，自动进入后续排程 |
| D3 | 三层时间约束 | 预计可检日期（Earliest Start）≤ 排程日期 ≤ 预约送货日期（Preferred Deadline，优先保证）≤ 最终出货日期（Hard Deadline，硬上限） |
| D4 | 产能 = 标准产能单位制 | 班组可用产能 = 标准日产能 × 人员系数 × 工时系数 × 例外系数；任务消耗 = 数量 × 款式系数 ÷ 检品类型系数；不同类型/款式可统一比较 |
| D5 | 实际可检数量硬约束 | 排程数量不得超过「已送检数量 − 已检数量 − 已排程未完成量」；订单总数 ≠ 当天可检数量 |
| D6 | 排程引擎纯 TypeScript | `src/services/scheduling/` 纯函数、零框架依赖、可单测；Supabase 只做读写 |
| D7 | 批量写库用 plpgsql 事务函数 | 保持 anon key + RLS 模型，不引入 service role 密钥；函数内部校验角色并单事务执行 |
| D8 | 手动锁定 | 管理员可锁定任务（`locked=true`），自动重排不修改、不删除锁定任务，且其产能占用被计入 |
| D9 | 紧急插单两阶段 | 先 dry-run 预览（缺口、受影响订单、顺延任务、新风险），管理员确认后再应用；应用后插单任务为手动+特急+锁定 |
| D10 | 排程解释快照 | 每个自动任务生成时保存 `explanation`（Deadline、剩余量、剩余工作日、班组产能、优先级、实际可检量、原因链），可追溯"为什么排在这一天" |
| D11 | 返检保持简单 | 返检任务仅支持人工创建（`source='manual'` + remark 标注），计入对应检品类型产能，不做自动预测 |

---

## 3. 数据模型

### 3.1 数量口径概念对照

| 概念 | 定义 | 数据落点 |
| --- | --- | --- |
| 订单数量 | 明细预订总量 | `order_items.quantity` |
| 已入库数量 | 实际到货累计 | `order_items.inbound_quantity`（已有） |
| 已送检数量 | 已具备检品条件、可进入排程的数量 | `order_items.submitted_quantity`（新增） |
| 已检数量 | 该明细在对应检品类型上已检过（吞吐量） | 首次由 `inspection_records/reinspection_records` 推导；之后由 `schedule_progress_records` 累计为准（取两者较大值兜底） |
| 剩余待检 | 订单数量 − 已检数量 | 计算值 |
| 剩余可检数量 | 排程允许的最大未排量 | `min(剩余待检, submitted_quantity − 已检 − 已排程未完成)` |

### 3.2 现有表新增字段

**`orders` 新增：**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `delivery_date` | date | 预约送货日期（Preferred Deadline） |
| `estimated_inspection_date` | date | 预计可检日期（Earliest Start） |
| `inspection_standard` | text | 检品标准（如 AQL 2.5），仅展示 |
| `priority` | text default '普通' | 普通 / 加急 / 特急，check 约束 |
| `assigned_team_id` | uuid → inspection_teams | 指定检品班组，可空 |
| `direct_ship` | boolean default false | 直接出货：标记后不参与检品排程 |

> `shipping_date`（出货日期）继续作为 **Hard Deadline**；`inbound_date`（来货日期）不变。

**`order_items` 新增：**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `estimated_inspection_date` | date | 明细级 Earliest Start，为空时回退订单级 |
| `submitted_quantity` | integer default 0 | 已送检数量（≥0；默认策略见 §9 待确认 4） |
| `style_factor` | numeric default 1.0 | 款式产能系数（普通款 1.0 / 复杂款 1.3 / 特殊检品 1.5，可配置） |
| `submit_status` | text default 'pending' | 送检状态：pending 待送检 / ready 可送检 / paused 暂停送检（引擎只排 ready） |

约束：`submitted_quantity <= quantity`；引擎内部再取 `min(submitted_quantity, inbound_quantity)`。

**送检规则（已确认，2026-08-19 修订）**：
- 入库更新时 `submitted_quantity` 自动同步为 `min(入库数量, 订单数量)`，且 `submit_status` **自动置为 `ready`（可送检）**，直接可参与排程；
- 新建明细默认 `submit_status='pending'`（待送检）、数量 0；一旦发生入库即自动变为可送检；
- 管理员可随时人工调整 `submitted_quantity` 与 `submit_status`（待送检/可送检/暂停送检）；
- 标记 `direct_ship`（直接出货）的订单完全不参与排程引擎。

### 3.3 新增表（7 张）

**① `inspection_teams` 检品班组**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `name` | text unique | 如：检品一班 |
| `work_start_time` / `work_end_time` | time | 工作时间（展示用） |
| `daily_hours` | numeric default 8 | 每日工作小时（加班在例外里覆盖） |
| `standard_daily_capacity` | integer | 满编标准日产能（如 5000） |
| `baseline_members` | integer default 1 | 标准产能对应的基准人数 |
| `current_members` | integer default 0 | 当前人员数量 |
| `max_daily_capacity` | integer | 最大日产能（加班/临时增员上限） |
| `inspection_types` | text[] default {normal} | 可检品类：normal / xray / field |
| `capacity_factors` | jsonb default {"normal":1,"xray":0.8,"field":0.7} | 检品类型效率系数 |
| `enabled` | boolean default true | 是否启用 |
| `sort_order` | integer default 0 | 展示排序 |

**② `style_categories` 款式系数配置**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `name` | text unique | 普通款 / 复杂款 / 特殊检品 |
| `factor` | numeric > 0 | 1.0 / 1.3 / 1.5 |
| `remark` | text | |
| `enabled` | boolean default true | |

预置种子数据 3 条（可改可删）；`order_items.style_factor` 为落库快照，选款式类别时复制。

**③ `inspection_schedule` 排程任务**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `created_at` / `updated_at` | timestamptz | |
| `order_id` | uuid → orders | 冗余，便于按订单查 |
| `order_item_id` | uuid → order_items | 排程单位（允许空，兼容无明细历史数据） |
| `inspection_type` | text | normal / xray / field |
| `scheduled_date` | date | 计划日期 |
| `team_id` | uuid → inspection_teams | 负责班组 |
| `planned_quantity` | integer | 计划数量（>0，创建后不可被完成流程覆盖） |
| `priority` | text default '普通' | 普通 / 加急 / 特急 |
| `status` | text default '待开始' | 待开始 / 进行中 / 已完成 / 部分完成 / 延期 / 已取消 / 已调整 |
| `source` | text default 'auto' | auto（自动）/ manual（手动，含返检、紧急插单） |
| `locked` | boolean default false | 手动锁定，自动重排不修改 |
| `run_id` | uuid | 自动排程/插单批次号 |
| `explanation` | jsonb | 排程解释快照（§4.11） |
| `remark` | text | |

`completed_quantity` 的权威来源是 `schedule_progress_records` 求和（计划与完成彻底分离）；为查询性能，任务表可保留一个缓存列，由事务函数在每次打卡/结转时同步维护，业务代码不得直接写它。

索引：`(scheduled_date)`、`(order_item_id)`、`(team_id, scheduled_date)`、`(status)`。

**④ `schedule_progress_records` 排程进度（实际完成）**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `created_at` | timestamptz | 打卡时间 |
| `task_id` | uuid → inspection_schedule | 关联任务 |
| `user_id` / `user_email` | | 录入人 |
| `quantity` | integer > 0 | 本次实际完成双数（追加式，不改历史） |
| `record_date` | date | 实际完成所属日期（默认当天，可补录） |
| `remark` | text | |

约束：单任务累计完成 ≤ `planned_quantity`（事务函数内校验）。任务差异 = `planned_quantity − Σ progress`。

**⑤ `schedule_change_logs` 排程审计**

`id / created_at / user_id / user_email / action（auto_replan / manual_adjust / progress_update / lock / unlock / insert_urgent / rollover / cancel）/ run_id / order_id / order_item_id / reason / before_data jsonb / after_data jsonb`

回答"这个订单为什么从 8/20 调到 8/22？""这次插单影响了谁？"。

**⑥ `production_calendar` 公司工作日历**

`id / date unique / is_work_day boolean / work_hours numeric(空=默认8) / remark`

默认规则：周一至周五工作、周六周日休息，日历条目覆盖（法定节假日停工、补班上班、全厂加班）。

**⑦ `team_work_exceptions` 班组例外**

`id / team_id → inspection_teams / date / is_working boolean / work_hours numeric(空=班组默认) / capacity_factor numeric(空=1，请假 0.8 等) / remark`，`unique(team_id, date)`

覆盖：班组休息、加班、请假、临时增员/减员。

### 3.4 RLS 策略

| 表 | 读 | 写 |
| --- | --- | --- |
| `inspection_teams` | staff / admin | admin |
| `style_categories` | staff / admin | admin |
| `inspection_schedule` | staff / admin | staff / admin（批量操作走事务函数） |
| `schedule_progress_records` | staff / admin | 仅事务函数写入 |
| `production_calendar` / `team_work_exceptions` | staff / admin | admin |
| `schedule_change_logs` | admin | 仅事务函数写入 |

沿用 `staff_shared_access.sql` 收敛模式，同步更新 `schema.sql`。

### 3.5 事务函数（plpgsql，SECURITY DEFINER，函数内校验角色）

| 函数 | 用途 |
| --- | --- |
| `apply_schedule_run(payload jsonb)` | 自动重排：旧 auto 任务标"已调整" → 插入新任务 → 写审计，单事务 |
| `record_schedule_progress(payload jsonb)` | 进度打卡：校验 `Σprogress + 本次 ≤ planned_quantity` → 追加记录 → 更新任务状态/缓存 → 写审计 |
| `apply_manual_adjust(payload jsonb)` | 人工调整/锁定/解锁：修改任务 + 锁定 + 写 before/after 审计 |
| `apply_schedule_insert(payload jsonb)` | 紧急插单确认：插入特急任务 + 受影响 auto 任务顺延 + 写审计，单事务 |
| `rollover_schedule(payload jsonb)` | 滚动结转：过期未完成任务标记延期/部分完成，剩余量进入排程池 |

### 3.6 迁移文件

`supabase/migrations/202608190001_schedule_module.sql`：

1. `orders` / `order_items` 加字段（`add column if not exists`，不动现有数据）；
2. 建 7 张新表 + 索引 + RLS + 种子数据（style_categories 3 条）；
3. 建 5 个事务函数（含函数内角色校验，revoke public、grant authenticated）；
4. 同步更新 `schema.sql` 与 `staff_shared_access.sql`。

---

## 4. 排程算法

### 4.1 位置与形态

```
src/services/scheduling/
  types.ts      输入/输出类型（含 explanation、risk、projectedCompletions）
  calendar.ts   工作日判断（周末/节假日/加班/班组例外）
  capacity.ts   班组日产能与任务消耗（标准产能单位）
  engine.ts     主引擎（三层 Deadline 倒排分配）
  risk.ts       红/橙/黄/绿预警与缓冲天数
  explain.ts    排程解释快照生成
  __tests__/    单元测试（Vitest）
```

零 Next.js / Supabase 依赖。

### 4.2 输入模型

```ts
type ScheduleUnit = {
  id: string;                     // order_item_id
  orderId: string;
  poNumber: string; sku: string; color: string; size: string;
  quantity: number;               // 订单数量
  submittedQuantity: number;      // 已送检数量
  inspectedCompleted: number;     // 已检数量（该类型）
  alreadyScheduled: number;       // 已排程未完成量 = Σ(open 任务 planned − Σprogress)
  earliestDate: string;           // Earliest Start（预计可检日期）
  preferredDeadline: string | null;  // 预约送货日期
  hardDeadline: string | null;    // 最终出货日期（shipping_date）；为空则回退用 preferred，两者皆空标记配置缺失
  inspectionType: "normal" | "xray" | "field";
  priority: "普通" | "加急" | "特急";
  assignedTeamId: string | null;
  styleFactor: number;            // 款式系数
};

type Team = {
  id: string; name: string; enabled: boolean;
  standardDailyCapacity: number; baselineMembers: number; currentMembers: number;
  maxDailyCapacity: number; dailyHours: number;
  inspectionTypes: string[]; capacityFactors: Record<string, number>;
};

type CalendarDay = {
  isWorkDay: boolean;
  workHours: number | null;                              // 公司级覆盖
  teamExceptions: Map<string, { isWorking: boolean; workHours: number | null; factor: number | null }>;
};

type ExistingAssignment = {
  unitId: string; teamId: string; date: string; type: string;
  plannedQuantity: number; completedQuantity: number; locked: boolean;
};
```

### 4.3 数量口径（引擎第 1 步）

```text
remainingToInspect = quantity − inspectedCompleted(type)
alreadyScheduled  = Σ open 任务 planned_quantity − Σ 其进度
availableCap      = submittedQuantity − inspectedCompleted − alreadyScheduled   // 实际可检硬约束
toSchedule        = min(remainingToInspect, availableCap)
```

> `inspectedCompleted(type)` 取「进度记录累计」与「检品记录推导（入库 − 最终未过）」两者较大值：推导值保证首次排程不漏检，进度记录保证现场口径不被覆盖。

### 4.4 三层时间约束

| 层级 | 字段 | 规则 |
| --- | --- | --- |
| Earliest Start | `estimated_inspection_date` | 排程日期不得早于它；货物未到不得排 |
| Preferred Deadline | `delivery_date` | 主要完成目标，倒排起点；不满足时显示风险+缓冲，不直接判延期 |
| Hard Deadline | `shipping_date` | 硬上限，**绝对不能超过**；超过 = 红色延期 |

异常：`earliestDate > hardDeadline` → 配置冲突，红色，需人工处理。

### 4.5 产能模型

```text
班组日可用产能（标准单位）
  = standard_daily_capacity
    × (current_members / baseline_members)        // 人员/班组因素
    × (actual_hours / 8)                           // 实际工作小时（含加班）
    × exception_factor                             // 班组例外（请假 0.8 等）
  上限：max_daily_capacity × (actual_hours / 8)    // 加班/增员封顶

任务消耗（标准单位）
  = planned_quantity × style_factor ÷ capacity_factors[inspection_type]
  例：普通款 normal：1 双 = 1 单位；复杂款 normal：1 双 = 1.3 单位；普通款 xray（系数 0.8）：1 双 = 1.25 单位

利用率 = Σ任务消耗 ÷ 班组日可用产能
```

系数全部可配置（班组、检品类型、款式类别），第一阶段使用默认值，后续按实际数据校准。

### 4.6 优先级排序

```text
1. hardDeadline < 今天            // 硬性延期，最优先
2. preferredDeadline < 今天       // 送货已过但出货未过
3. preferredDeadline 从近到远
4. 订单优先级：特急 > 加急 > 普通
5. earliestDate 近者优先
6. 数量大者优先
```

不按订单创建时间排序。

### 4.7 主流程（倒排）

> 2026-08-19 修订：排班目标改为「提前完成计划」。正常订单以「送货/出货前第 7 个工作日」为目标完成日（leadWorkdays=7，按工作日倒推，跳过周末/节假日）；无法提前 7 个工作日完成的订单自动压缩，最晚完成日 = 送货前 1 个工作日（bufferWorkdays=1）；当天送货订单进入「今日紧急检品」（P0）。风险等级：正常（≤目标完成日）/ 黄色（目标日后、≤送货前1工作日）/ 红色（需集中排班，≤送货日）/ 超负荷（送货日前无法完成）。优先级：已过送货 > P0 当天送货 > P1 明天送货 > P2 无法提前7天 > P3 正常（同层级按目标日近者、订单优先级、工作量/产能风险排序）。

1. 按 §4.3 计算每个 unit 的 `toSchedule`，过滤软删除/已完成/已取消订单与 `toSchedule <= 0`；
2. 按 §4.6 排序；
3. 逐 unit：
   - 从 `preferredDeadline` 当天开始向前（更早日期）逐日分配，直至 `earliestDate`；
   - 若在 `earliestDate` 之前排不完，则从 `preferredDeadline` 次日开始向后（更晚日期，≤ `hardDeadline`）延伸，任务标记"送货预警"（橙）；
   - 指定班组优先，产能不足可溢出到其他合格班组并记录 `overflowFromTeam`；
   - 每日分配量 = `min(unit 剩余, 班组当日剩余可用产能(折算单位))`；
   - 记录每个分配日的 explanation 要素（§4.11）；
4. 若延伸到 `hardDeadline` 仍排不完 → 进入 `unassigned`（红，预计延期天数 = 继续正推所需工作日）；
5. 输出：

```ts
type ScheduleRunResult = {
  assignments: Assignment[];        // 含 explanation
  unassigned: UnassignedUnit[];     // 原因 + 预计延期天数
  warnings: Warning[];              // red / orange / yellow / green
  dailyLoad: Map<date, Map<teamId, { plannedUnits: number; capacityUnits: number; utilization: number }>>;
  projectedCompletions: Map<unitId, { projectedDate: string; bufferDays: number; riskLevel: RiskLevel }>;
};
```

### 4.8 风险预警（红 / 橙 / 黄 / 绿）

| 级别 | 条件 | 提示 |
| --- | --- | --- |
| 红 | 预计完成日 > hardDeadline | "无法按时完成，当前产能不足"，显示预计延期天数（完成日 − hardDeadline） |
| 橙 | 预计完成日 > preferredDeadline 且 ≤ hardDeadline | "无法满足预约送货日期，距离最终出货还有 X 天缓冲"，显示缓冲天数 |
| 黄 | 都能按时完成，但未来某日利用率 > 90% | 提示该日产能紧张及涉及订单 |
| 绿 | 正常 | — |

### 4.9 人工调整与手动锁定

- 管理员可修改未来任务的日期/班组/数量/优先级；修改必须填写原因，写 before/after 审计；
- 修改后该任务 `source='manual'`、`locked=true`，仅对该 `order_item_id` 的未锁定任务局部重算；
- 进行中/已完成任务：`planned_quantity` 不可改（防止覆盖历史计划），可改班组/日期需谨慎并审计；
- 锁定/解锁操作单独记审计（action=lock/unlock）；
- 自动重新排程时：已完成/已取消任务跳过，锁定任务保留并计入产能占用，仅重算未锁定 auto 任务。

### 4.10 自动重新排程与滚动结转

**自动重新排程**（页面按钮）：
1. 读取未完成订单明细、班组产能、日历、已检量、已排程量、三层 Deadline；
2. 引擎重算 → 生成 `run_id` → `apply_schedule_run` 单事务写入（旧 auto 标"已调整"、插入新任务、写审计）；
3. 绝不破坏已完成的检品记录、已完成/锁定的排程任务。

**滚动结转**：
- 打开今日计划/排程总览时自动执行 `rollover_schedule`：日期已过且未完成任务 → 状态"延期/部分完成"，剩余量（计划 − 累计完成）进入排程池，下次重排生成后续任务；
- 原任务及其进度记录全部保留，新任务在 explanation/remark 中标注"承接 X 任务剩余 400 双"。

### 4.11 紧急插单（两阶段）

**预览（dry-run）**：管理员输入（订单明细/手建任务、数量、检品类型、Deadline）→ 引擎将插单按"特急 + Earliest Start=今天"插入并重算，输出：

```ts
type InsertPreview = {
  canFit: boolean;
  capacityGap: number;                       // 排不下时明确缺口数量
  suggestedDates: string[];                  // 建议日期
  impactedUnits: Array<{
    unitId: string;
    beforeProjected: string | null;          // 插单前预计完成日
    afterProjected: string | null;           // 插单后预计完成日
    newRisk: RiskLevel;                       // 是否产生新的 Deadline 风险
  }>;
  shiftedTasks: Array<{ taskId: string; fromDate: string; toDate: string }>;
  summary: { delayedOrders: number; newRedRisks: number; newOrangeRisks: number };
};
```

**应用（确认后）**：`apply_schedule_insert` 单事务：插入紧急任务（manual + 特急 + locked + run_id）+ 受影响 auto 任务顺延 + 审计。不满足则只返回缺口，不落库。

### 4.12 排程解释（Explanation）

每个自动任务创建时保存快照：

```ts
type TaskExplanation = {
  deadlineChain: { earliest: string; preferred: string | null; hard: string };
  remainingQty: number;
  workdaysRemaining: number;
  teamDailyCapacity: number;                 // 折算标准单位
  priority: string;
  submittedQuantity: number;                 // 实际可检数量
  reasonCodes: string[];                     // earliest_start / deadline_driven / capacity_split / arrival_limited / overflow_team / urgent_insert / rollover
  bufferDays: number;                        // hard − projected
  projectedDate: string;
  riskLevel: RiskLevel;
};
```

UI 提供"为什么排在这一天"展开/抽屉，重新排程后旧任务的解释快照随审计保留。

### 4.13 边界情况覆盖

| 场景 | 处理 |
| --- | --- |
| 周末 / 法定节假日 / 临时停工 | production_calendar |
| 班组休息 / 请假 / 加班 / 临时增减产能 | team_work_exceptions |
| 临时增加班组 | 班组管理新增后重新排程 |
| 货物未到 / 分批到货 | `submitted_quantity` 硬约束；未送检不排 |
| 订单延期 / 客户提前交货 | 改 deadline 后重排；硬延期置顶，送货预警橙色 |
| 订单取消 | 软删除/状态完成 → 自动取消未完成任务 |
| 部分完成 | 计划 3000 / 完成 2600 / 差异 400：任务保留，进度追加，剩余自动结转 |
| 返检 | 仅人工创建任务（source=manual + remark），计 normal 产能，不自动预测 |
| 紧急插单 | 预览缺口与影响 → 确认后应用，插单锁定 |
| 一单多款 / 一款多色 / 跨班组 | 明细级 unit + 引擎可拆分到多日多班组 |
| 送货可满足但产能紧张 | 黄（利用率 >90%） |
| 送货不满足、出货有缓冲 | 橙 + 缓冲天数 |

---

## 5. 页面结构

### 5.1 页面清单

| 路由 | 页面 | 权限 |
| --- | --- | --- |
| `/schedule/today` | 今日检品计划（核心页面） | staff / admin |
| `/schedule/plan` | 排程总览（未来 N 天、人工调整、锁定、自动重排、紧急插单、送检登记、审计 Tab） | staff / admin（审计 Tab 仅 admin） |
| `/schedule/teams` | 班组与产能管理（班组 CRUD + 款式系数 + 工作日历 + 班组例外） | admin |

### 5.2 今日检品计划页

顶部指标卡：

| 今日计划 | 今日已完成 | 今日差异 | 今日可用产能 | 产能利用率 | 紧急订单 | 延期/送货预警 |
| --- | --- | --- | --- | --- | --- | --- |
| 12,500 双 | 2,600 双 | 9,900 双 | 13,000 双 | 96.2% | 2 | 1 |

按班组任务表：

| 班组 | 订单 | 款号 | 颜色 | 计划 | 已完成 | 差异 | Deadline（三层） | 状态 | 操作 |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| 一班 | PO001 | A001 | 黑色 | 3,000 | 2,600 | 400 | 送货 8/20 · 出货 8/22 | 部分完成 | 打卡 |

每行操作：打卡（录入本次实际完成双数）、查看解释（为什么排今天）、标记状态；差异自动显示并进入后续排程。

### 5.3 排程总览页

- 日期 × 班组视图：每日每班任务、利用率（>90% 黄、>100% 红）；
- 每个 unit 显示风险色（红/橙/黄/绿）+ 缓冲天数 + 预计完成日；
- 任务行操作：修改（日期/班组/数量/优先级 + 原因）、锁定/解锁、查看解释抽屉、查看进度明细；
- 顶部按钮：**自动重新排程**（二次确认 + 影响范围）、**紧急插单**（预览→确认）、**送检登记**；
- 审计 Tab：时间 / 操作人 / 动作 / 原因 / before→after 对比。

### 5.4 送检登记

- 排程总览页按订单明细"送检"（录入本次送检双数，累计到 `submitted_quantity`）；
- 订单管理页显示并允许调整已送检数量、送检状态（待送检/可送检/暂停送检）、款式系数；
- 入库更新自动同步 `submitted_quantity`（数量跟随入库），但状态保持待送检，需管理员确认后才可排程；
- 未送检/暂停部分显示为"不可排"原因（reason_code=arrival_limited / paused）。

### 5.5 入口与 i18n

- 工作台新增"排程排产"分组：今日检品计划、排程总览、班组产能管理；
- 手机底部导航：首页 / 工作台 / 订单 / 排程（日历保留在工作台入口）；
- 新页面文案补齐 zh / en / ja 字典。

---

## 6. API 设计

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/api/schedule/today?date=` | 今日指标 + 按班组任务 + 打卡 + 差异 + 预警 | staff/admin |
| GET | `/api/schedule/plan?from=&days=&teamId=` | 排程窗口：任务、产能占用、利用率、risk、projectedCompletions、explanation | staff/admin |
| GET | `/api/schedule/tasks/:id` | 单任务详情 + explanation + 进度记录明细 | staff/admin |
| PATCH | `/api/schedule/tasks/:id` | 人工调整（日期/班组/数量/优先级 + 原因）+ 锁定/解锁 | staff/admin |
| POST | `/api/schedule/tasks/:id/progress` | 进度打卡（追加式） | staff/admin |
| POST | `/api/schedule/plan/run` | 自动重新排程（run_id + 事务） | staff/admin |
| POST | `/api/schedule/insert/preview` | 紧急插单预览（dry-run，不落库） | staff/admin |
| POST | `/api/schedule/insert` | 紧急插单确认应用（事务） | staff/admin |
| POST | `/api/schedule/rollover` | 手动触发滚动结转 | staff/admin |
| PATCH | `/api/order-items/:id` | 更新 `submitted_quantity` / `style_factor`（校验 ≤ quantity） | staff/admin |
| GET | `/api/schedule/logs?orderId=&runId=` | 审计记录 | admin |
| GET/POST | `/api/schedule/teams` | 班组列表 / 新增 | 读 staff/admin，写 admin |
| PATCH/DELETE | `/api/schedule/teams/:id` | 修改 / 停用 | admin |
| GET/POST/PATCH | `/api/schedule/style-factors` | 款式系数配置 | 读 staff/admin，写 admin |
| GET/POST | `/api/schedule/calendar` | 工作日历（节假日/补班/全厂加班） | 读 staff/admin，写 admin |
| GET/POST/DELETE | `/api/schedule/calendar/exceptions` | 班组例外 | 读 staff/admin，写 admin |

统一沿用 `withApiHandler` + `requireStaffProfile` / 新增 `requireAdminProfile`，错误码与现有 API 一致。

---

## 7. 测试方案（Vitest，新增 devDependency + `pnpm test`）

引擎单测：

1. 基础倒排：剩余 5000 / 日产能 5000 → 全部落在 Preferred Deadline 当天；
2. 产能冲突拆分：当日已有 3000 → 向前一天补 2000；
3. Earliest Start 约束：不得早于预计可检日期；
4. **实际可检数量约束**：订单 5000、已送检 1800 → 最多排 1800；
5. 优先级：硬延期 > 送货过期 > Deadline 近 > 特急 > 加急 > 普通；
6. 周末/节假日跳过，补班日可用；
7. 班组休息 / 请假 / 加班 / 临时增加班组 → 产能变化正确；
8. 指定班组优先 + 溢出跨班组（explanation 含 overflow_team）；
9. 一单多款多色分别排程、跨日跨班组拆分；
10. **三层 Deadline**：送货排不完但出货前完成 → 橙 + 缓冲天数正确；出货前排不完 → 红 + 延期天数正确；
11. **计划/完成分离**：计划 3000，打卡 2600 → 差异 400；再次打卡 400 → 已完成；累计超过计划被拒绝；
12. **款式系数**：复杂款 1.3 → 消耗 1.3 单位/双，利用率正确；
13. 手动锁定任务在自动重排时保留且占用产能；
14. **紧急插单预览**：产能不足时 capacityGap 正确；可排时 impactedUnits / shiftedTasks / newRisks 正确；预览不落库，确认才应用；
15. **排程解释**：explanation 各字段与分配结果一致；
16. 滚动结转：过期任务剩余量进入池子，原任务与进度保留；
17. 红/橙/黄/绿预警判定；
18. 配置冲突：earliestDate > hardDeadline → 红色 + 人工处理提示。

---

## 8. 实施阶段与文件清单

### 阶段一（本次实施）

| 步骤 | 内容 |
| --- | --- |
| 1 | 数据库迁移 SQL + schema.sql + RLS 收敛（7 表、订单字段、5 个事务函数、种子数据） |
| 2 | `src/services/scheduling/*` 引擎 + Vitest 单测 |
| 3 | API 路由 16 个 |
| 4 | 班组/款式系数/工作日历管理页 |
| 5 | 今日检品计划页（指标 + 打卡 + 差异 + 解释） |
| 6 | 排程总览页（人工调整 + 锁定 + 自动重排 + 紧急插单 + 送检登记 + 审计） |
| 7 | 工作台入口 + 底部导航 + i18n |
| 8 | `pnpm typecheck` / `pnpm build` / 页面 200 验证 → 提交推送 |

### 阶段二（后续）

AI 到货/返检预测、排程模拟对比、甘特图、消息通知。

---

## 9. 关键业务规则汇总

1. **三层时间约束**：排程日期 ≥ 预计可检日期；优先保证预约送货日期；最终出货日期是硬上限，绝不超出。
2. **计划与实际分离**：`planned_quantity` 一旦创建即为历史，实际完成只能追加进度记录，禁止覆盖计划；差异 = 计划 − 累计完成。
3. **实际可检数量**：排程绝不超过「已送检 − 已检 − 已排程未完成」；未到货/未送检不排（reason=arrival_limited）。
4. **产能可配置**：班组标准产能、检品类型系数、款式系数、工作小时、人员/班组因素全部可配置，5000 双/天只是默认示例值。
5. **不破坏历史**：自动重排不删除已完成/锁定任务；旧 auto 任务标"已调整"保留；已完成的检品记录永不修改。
6. **手动锁定**：锁定任务自动重排不可变，且其产能占用始终计入。
7. **紧急插单**：先预览缺口与影响，管理员确认后才应用；应用后插单任务手动 + 特急 + 锁定。
8. **可追溯**：所有自动/手动/打卡/插单/结转/锁定动作写 `schedule_change_logs`，每个任务带 explanation 快照。
9. **返检简单**：返检仅人工创建，计对应检品类型产能，不做自动预测。
10. **延期判定**：只有超过最终出货日期才算硬延期；送货不满足但出货前完成 → 橙色预警 + 剩余缓冲天数。

---

## 10. 待确认事项

1. **排程粒度**：按订单明细（款号/颜色/尺码）排程，订单级只做汇总展示；
2. **完成量口径**：现场打卡追加写入进度记录（计划/完成/差异三列展示），首次排程用检品记录推导值初始化；
3. **三层 Deadline**：预计可检（最早）→ 送货（优先）→ 出货（硬上限），送货不满足但有出货缓冲显示橙色+缓冲天数；
4. **送检登记策略（已确认，2026-08-19 修订）**：入库时自动同步 `submitted_quantity` 并自动置为"可送检"，可直接参与排程；管理员可随时调整数量与状态；新增"直接出货"选项，标记订单不进排程；
5. **导航调整**：手机底部导航改为 首页/工作台/订单/排程，日历保留在工作台入口；
6. **返检**：仅人工创建，不做自动预测。
