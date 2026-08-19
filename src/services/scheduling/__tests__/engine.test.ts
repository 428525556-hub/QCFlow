import assert from "node:assert/strict";
import { test } from "node:test";

import { runSchedule } from "../engine.ts";
import type { CalendarDay, InspectionType, Priority, ScheduleUnit, SubmitStatus, Team } from "../types.ts";

const TODAY = "2026-08-19"; // 周三
const TOMORROW = "2026-08-20";
const DELIVERY_20D = "2026-09-08"; // 20 天后
const TARGET_20D = "2026-08-28"; // 9/8 前第 7 个工作日

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: "team-1",
    name: "一班",
    enabled: true,
    standardDailyCapacity: 5000,
    baselineMembers: 10,
    currentMembers: 10,
    maxDailyCapacity: 6000,
    dailyHours: 8,
    inspectionTypes: ["normal", "xray", "field"],
    capacityFactors: { normal: 1, xray: 0.8, field: 0.7 },
    sortOrder: 0,
    ...overrides
  };
}

function makeUnit(overrides: Partial<ScheduleUnit> = {}): ScheduleUnit {
  return {
    id: "item-1",
    orderId: "order-1",
    poNumber: "PO001",
    sku: "A001",
    color: "黑色",
    size: "L",
    quantity: 5000,
    submittedQuantity: 5000,
    inspectedCompleted: 0,
    alreadyScheduled: 0,
    earliestDate: TODAY,
    preferredDeadline: DELIVERY_20D,
    hardDeadline: DELIVERY_20D,
    inspectionType: "normal",
    priority: "普通",
    assignedTeamId: null,
    styleFactor: 1,
    submitStatus: "ready",
    ...overrides
  };
}

function run(units: ScheduleUnit[], teams: Team[] = [makeTeam()], calendar: Record<string, CalendarDay> = {}, existing: Parameters<typeof runSchedule>[0]["existingAssignments"] = []) {
  return runSchedule({ units, teams, calendar, existingAssignments: existing, today: TODAY });
}

function assignmentByUnit(result: ReturnType<typeof runSchedule>, unitId: string) {
  return result.assignments.filter((assignment) => assignment.unitId === unitId);
}

// ---------- 基础能力 ----------

test("正常订单：提前约 7 个工作日完成（送货 9/8 → 目标 8/28）", () => {
  const result = run([makeUnit()]);
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].scheduledDate, TARGET_20D);
  assert.equal(result.assignments[0].plannedQuantity, 5000);
  assert.equal(result.assignments[0].explanation.targetDate, TARGET_20D);
  assert.equal(result.assignments[0].explanation.latestAcceptable, "2026-09-07");
  assert.equal(result.assignments[0].explanation.urgency, "P3");
  assert.equal(result.projectedCompletions["item-1"].riskLevel, "green");
  assert.equal(result.unassigned.length, 0);
});

test("产能冲突拆分：目标日已有 3000 → 自动向更早一天补 2000", () => {
  const result = run([makeUnit()], [makeTeam()], {}, [
    { unitId: "other", teamId: "team-1", date: TARGET_20D, type: "normal", plannedQuantity: 3000, completedQuantity: 0, locked: false }
  ]);
  const onTarget = result.assignments.find((assignment) => assignment.scheduledDate === TARGET_20D);
  const onEarlier = result.assignments.find((assignment) => assignment.scheduledDate === "2026-08-27");
  assert.equal(onTarget?.plannedQuantity, 2000);
  assert.equal(onEarlier?.plannedQuantity, 3000);
  assert.equal(onEarlier?.explanation.reasonCodes.includes("capacity_split"), true);
});

test("Earliest Start 约束 + 时间紧迫压缩到送货前 1 个工作日", () => {
  // 最早可检就是送货当天 → 只能排当天，红色预警（需集中排班）
  const result = run([makeUnit({ earliestDate: "2026-08-24", preferredDeadline: "2026-08-24", hardDeadline: "2026-08-24" })]);
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].scheduledDate, "2026-08-24");
  assert.equal(result.projectedCompletions["item-1"].riskLevel, "red");

  // 12000 双只剩一天可排 → 超负荷
  const overflow = run([makeUnit({ earliestDate: "2026-08-24", preferredDeadline: "2026-08-24", hardDeadline: "2026-08-24", quantity: 12000, submittedQuantity: 12000 })]);
  assert.equal(overflow.unassigned.length, 1);
  assert.equal(overflow.unassigned[0].reason, "overload");
  assert.equal(overflow.unassigned[0].projectedDelayDays, 2);
  assert.equal(overflow.projectedCompletions["item-1"].riskLevel, "overload");
});

test("实际可检数量约束：订单 5000、已送检 1800 → 最多排 1800", () => {
  const result = run([makeUnit({ submittedQuantity: 1800 })]);
  const total = result.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0);
  assert.equal(total, 1800);
  assert.equal(result.unassigned.length, 0);
  assert.equal(result.assignments[0].explanation.reasonCodes.includes("arrival_limited"), true);
});

test("优先级：已过送货 > P0 当天 > P1 明天 > P3 正常", () => {
  const overdue = run([makeUnit({ id: "overdue", orderId: "o-overdue", earliestDate: "2026-08-17", preferredDeadline: "2026-08-18", hardDeadline: "2026-08-18" })]);
  assert.equal(assignmentByUnit(overdue, "overdue")[0].scheduledDate, TODAY); // 已过送货日 → 从今天正排
  assert.equal(overdue.projectedCompletions["overdue"].riskLevel, "red");

  const p0 = run([makeUnit({ id: "p0", orderId: "o-p0", preferredDeadline: TODAY, hardDeadline: TODAY })]);
  assert.equal(assignmentByUnit(p0, "p0")[0].scheduledDate, TODAY);
  assert.equal(assignmentByUnit(p0, "p0")[0].explanation.urgency, "P0");

  const combined = run([
    makeUnit({ id: "p3", orderId: "o-p3" }),
    makeUnit({ id: "p1", orderId: "o-p1", preferredDeadline: TOMORROW, hardDeadline: TOMORROW })
  ]);
  assert.equal(assignmentByUnit(combined, "p1")[0].scheduledDate, TODAY); // 送货前 1 个工作日
  assert.equal(assignmentByUnit(combined, "p1")[0].explanation.urgency, "P1");
  assert.equal(assignmentByUnit(combined, "p3")[0].scheduledDate, TARGET_20D);
  assert.equal(assignmentByUnit(combined, "p3")[0].explanation.urgency, "P3");
});

test("周末/节假日跳过，补班日可用", () => {
  const result = run([makeUnit({ quantity: 15000, submittedQuantity: 15000 })]);
  const dates = result.assignments.map((assignment) => assignment.scheduledDate).sort();
  assert.deepEqual(dates, ["2026-08-26", "2026-08-27", TARGET_20D]);
  assert.equal(result.unassigned.length, 0);

  const holiday = run([makeUnit({ quantity: 15000, submittedQuantity: 15000 })], [makeTeam()], {
    "2026-08-27": { isWorkDay: false, workHours: null, teamExceptions: {} }
  });
  const holidayDates = holiday.assignments.map((assignment) => assignment.scheduledDate).sort();
  assert.deepEqual(holidayDates, ["2026-08-25", "2026-08-26", TARGET_20D]);
});

test("班组休息：当日产能为 0，任务前移", () => {
  const result = run(
    [makeUnit()],
    [makeTeam()],
    { [TARGET_20D]: { isWorkDay: true, workHours: null, teamExceptions: { "team-1": { isWorking: false, workHours: null, factor: null } } } }
  );
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].scheduledDate, "2026-08-27");
});

test("加班：10 小时 → 产能 = 5000 × 10/8 = 6250", () => {
  const result = run(
    [makeUnit({ quantity: 6250, submittedQuantity: 6250 })],
    [makeTeam({ maxDailyCapacity: 7000 })],
    { [TARGET_20D]: { isWorkDay: true, workHours: null, teamExceptions: { "team-1": { isWorking: true, workHours: 10, factor: null } } } }
  );
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].scheduledDate, TARGET_20D);
  assert.equal(result.assignments[0].plannedQuantity, 6250);
});

test("款式系数：复杂款 1.3 → 1 双消耗 1.3 单位", () => {
  const result = run([makeUnit({ styleFactor: 1.3 })]);
  const total = result.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0);
  assert.equal(total, 5000);
  const onTarget = result.assignments.find((assignment) => assignment.scheduledDate === TARGET_20D);
  assert.equal(onTarget?.plannedQuantity, Math.floor(5000 / 1.3));
  const load = result.dailyLoads.find((item) => item.date === TARGET_20D);
  assert.ok(load && load.utilization >= 0.9999);
});

test("黄色预警：无法提前 7 个工作日，但可在送货前 1 个工作日完成", () => {
  const result = run([makeUnit({ earliestDate: TODAY, preferredDeadline: "2026-08-24", hardDeadline: "2026-08-25", quantity: 12000, submittedQuantity: 12000 })]);
  assert.equal(result.unassigned.length, 0);
  assert.equal(result.projectedCompletions["item-1"].riskLevel, "yellow");
  assert.equal(result.projectedCompletions["item-1"].projectedDate, "2026-08-21");
  assert.equal(assignmentByUnit(result, "item-1")[0].explanation.urgency, "P2");
});

test("红色预警：需要非常集中排班才能完成", () => {
  const result = run([makeUnit({ earliestDate: TODAY, preferredDeadline: "2026-08-24", hardDeadline: "2026-08-25", quantity: 16000, submittedQuantity: 16000 })]);
  assert.equal(result.unassigned.length, 0);
  assert.equal(result.projectedCompletions["item-1"].riskLevel, "red");
  assert.equal(result.projectedCompletions["item-1"].projectedDate, "2026-08-24");
});

test("超负荷：即使全部产能也无法在送货前完成", () => {
  const result = run([makeUnit({ earliestDate: TODAY, preferredDeadline: TOMORROW, hardDeadline: TOMORROW, quantity: 20000, submittedQuantity: 20000 })]);
  assert.equal(result.unassigned.length, 1);
  assert.equal(result.unassigned[0].reason, "overload");
  assert.equal(result.unassigned[0].remaining, 10000);
  assert.equal(result.unassigned[0].projectedDelayDays, 2);
  assert.equal(result.projectedCompletions["item-1"].riskLevel, "overload");
});

test("手动锁定：锁定任务保留且占用产能", () => {
  const result = run([makeUnit()], [makeTeam()], {}, [
    { unitId: "locked-unit", teamId: "team-1", date: TARGET_20D, type: "normal", plannedQuantity: 3000, completedQuantity: 0, locked: true }
  ]);
  const onTarget = result.assignments.find((assignment) => assignment.scheduledDate === TARGET_20D);
  const onEarlier = result.assignments.find((assignment) => assignment.scheduledDate === "2026-08-27");
  assert.equal(onTarget?.plannedQuantity, 2000);
  assert.equal(onEarlier?.plannedQuantity, 3000);
  assert.equal(result.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0), 5000);
});

test("计划/完成分离：已检 2600 → 剩余 2400 进入排程；可检上限再约束", () => {
  const result = run([makeUnit({ quantity: 3000, inspectedCompleted: 2600 })]);
  const total = result.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0);
  assert.equal(total, 400);

  const capLimited = run([makeUnit({ quantity: 3000, inspectedCompleted: 2600, alreadyScheduled: 300, submittedQuantity: 3000 })]);
  const capTotal = capLimited.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0);
  assert.equal(capTotal, 100);
});

test("配置冲突：预计可检日期晚于送货日期", () => {
  const result = run([makeUnit({ earliestDate: "2026-08-30", preferredDeadline: "2026-08-25", hardDeadline: "2026-08-25" })]);
  assert.equal(result.unassigned.length, 1);
  assert.equal(result.unassigned[0].reason, "config_conflict");
});

test("缺少 Deadline：送货/出货均未设置", () => {
  const result = run([makeUnit({ preferredDeadline: null, hardDeadline: null })]);
  assert.equal(result.unassigned.length, 1);
  assert.equal(result.unassigned[0].reason, "missing_deadline");
});

test("一单多款 + 跨班组溢出", () => {
  const team1 = makeTeam({ id: "team-1", name: "一班", standardDailyCapacity: 3000, maxDailyCapacity: 3000 });
  const team2 = makeTeam({ id: "team-2", name: "二班", standardDailyCapacity: 5000, maxDailyCapacity: 5000 });
  const black = makeUnit({ id: "black", orderId: "order-1", quantity: 3000, assignedTeamId: "team-1" });
  const white = makeUnit({ id: "white", orderId: "order-1", poNumber: "PO001", sku: "A002", color: "白色", quantity: 3000, assignedTeamId: "team-1" });
  const result = run([black, white], [team1, team2]);

  const blackAssignments = assignmentByUnit(result, "black");
  const whiteAssignments = assignmentByUnit(result, "white");
  assert.equal(blackAssignments.length, 1);
  assert.equal(blackAssignments[0].teamId, "team-1");
  assert.equal(whiteAssignments.length, 1);
  assert.equal(whiteAssignments[0].teamId, "team-2");
  assert.equal(whiteAssignments[0].explanation.reasonCodes.includes("overflow_team"), true);
});

test("紧急插单预览：特急优先占用目标日产能，原有订单提前", () => {
  const baseUnit = makeUnit({ id: "base", orderId: "o-base" });
  const urgentUnit = makeUnit({ id: "urgent", orderId: "o-urgent", priority: "特急" });

  const before = run([baseUnit]);
  const after = run([baseUnit, urgentUnit]);

  assert.equal(before.projectedCompletions["base"].projectedDate, TARGET_20D);
  assert.equal(after.projectedCompletions["base"].projectedDate, "2026-08-27");
  const urgentAssignments = assignmentByUnit(after, "urgent");
  assert.equal(urgentAssignments[0].scheduledDate, TARGET_20D);
  assert.equal(urgentAssignments[0].plannedQuantity, 5000);
});

test("排程解释：字段与分配结果一致", () => {
  const result = run([makeUnit({ submittedQuantity: 4000 })]);
  const explanation = result.assignments[0].explanation;
  assert.equal(explanation.submittedQuantity, 4000);
  assert.equal(explanation.remainingQty, 5000);
  assert.equal(explanation.teamDailyCapacity, 5000);
  assert.equal(explanation.deadlineChain.preferred, DELIVERY_20D);
  assert.equal(explanation.targetDate, TARGET_20D);
  assert.equal(explanation.latestAcceptable, "2026-09-07");
  assert.equal(explanation.overload, false);
  assert.ok(explanation.reasonCodes.length > 0);
});

test("滚动结转口径：过期任务剩余量通过 alreadyScheduled 进入池子", () => {
  const result = run([
    makeUnit({ id: "roll", quantity: 3000, inspectedCompleted: 2600, alreadyScheduled: 0 })
  ]);
  const total = result.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0);
  assert.equal(total, 400);
});

test("预警与日产能利用率", () => {
  const result = run([makeUnit()], [makeTeam({ maxDailyCapacity: 6000 })], {}, [
    { unitId: "other", teamId: "team-1", date: TARGET_20D, type: "normal", plannedQuantity: 4500, completedQuantity: 0, locked: false }
  ]);
  const load = result.dailyLoads.find((item) => item.date === TARGET_20D);
  assert.ok(load && load.utilization > 0.9);
  assert.ok(result.warnings.some((warning) => warning.level === "yellow" && warning.date === TARGET_20D));
});

test("暂停送检：不参与排程并标记原因", () => {
  const result = run([makeUnit({ submitStatus: "paused" as SubmitStatus })]);
  assert.equal(result.unassigned.length, 1);
  assert.equal(result.unassigned[0].reason, "paused");
  assert.equal(result.assignments.length, 0);
});

test("X线类型系数 0.8：1 双消耗 1.25 单位", () => {
  const result = run([makeUnit({ inspectionType: "xray" as InspectionType, quantity: 4000, submittedQuantity: 4000 })]);
  const total = result.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0);
  assert.equal(total, 4000);
  const load = result.dailyLoads.find((item) => item.date === TARGET_20D);
  assert.ok(load && load.plannedUnits === 5000);
});

test("优先级列参与排程解释", () => {
  const result = run([makeUnit({ priority: "加急" as Priority })]);
  assert.equal(result.assignments[0].explanation.priority, "加急");
  assert.equal(result.assignments[0].priority, "加急");
});

// ---------- 验收测试 ----------

test("验收1：正常订单（送货 20 天后 5000 双）→ 提前约 7 个工作日完成", () => {
  const result = run([makeUnit()]);
  assert.equal(result.unassigned.length, 0);
  const assignment = result.assignments[0];
  assert.equal(assignment.scheduledDate, TARGET_20D);
  assert.equal(result.projectedCompletions["item-1"].riskLevel, "green");
});

test("验收2：大订单 15000 双 → 自动拆分多个工作日", () => {
  const result = run([makeUnit({ quantity: 15000, submittedQuantity: 15000 })]);
  assert.equal(result.assignments.length, 3);
  assert.equal(result.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0), 15000);
  const dates = new Set(result.assignments.map((assignment) => assignment.scheduledDate));
  assert.equal(dates.size, 3);
});

test("验收3：紧急订单（2 天后送货 5000 双）→ 标记紧急，排到送货前 1 个工作日", () => {
  const result = run([makeUnit({ preferredDeadline: TOMORROW, hardDeadline: TOMORROW })]);
  const assignment = assignmentByUnit(result, "item-1")[0];
  assert.equal(assignment.scheduledDate, TODAY); // 送货 8/20 前 1 个工作日 = 8/19
  assert.equal(assignment.explanation.urgency, "P1");
  assert.equal(result.projectedCompletions["item-1"].riskLevel, "yellow");
});

test("验收4：当天送货 → 进入今日紧急任务（P0）", () => {
  const result = run([makeUnit({ preferredDeadline: TODAY, hardDeadline: TODAY })]);
  const assignment = assignmentByUnit(result, "item-1")[0];
  assert.equal(assignment.scheduledDate, TODAY);
  assert.equal(assignment.explanation.urgency, "P0");
});

test("验收5：产能不足（剩余 20000，2 个工作日，日产能 5000）→ 超负荷", () => {
  const result = run([makeUnit({ preferredDeadline: TOMORROW, hardDeadline: TOMORROW, quantity: 20000, submittedQuantity: 20000 })]);
  assert.equal(result.unassigned.length, 1);
  assert.equal(result.unassigned[0].reason, "overload");
  assert.equal(result.projectedCompletions["item-1"].riskLevel, "overload");
});

test("验收6：已完成数量（总 10000 已检 7000）→ 只排 3000", () => {
  const result = run([makeUnit({ quantity: 10000, inspectedCompleted: 7000, submittedQuantity: 10000 })]);
  const total = result.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0);
  assert.equal(total, 3000);
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].scheduledDate, TARGET_20D);
});

test("验收7：人工调整不覆盖（锁定任务保留且占用产能）", () => {
  const result = run([makeUnit()], [makeTeam()], {}, [
    { unitId: "manual", teamId: "team-1", date: TARGET_20D, type: "normal", plannedQuantity: 3000, completedQuantity: 0, locked: true }
  ]);
  const onTarget = result.assignments.find((assignment) => assignment.scheduledDate === TARGET_20D);
  assert.equal(onTarget?.plannedQuantity, 2000); // 锁定 3000 不动，自动只补 2000
  assert.equal(result.assignments.some((assignment) => assignment.unitId === "manual"), false);
});
