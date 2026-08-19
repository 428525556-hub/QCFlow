import assert from "node:assert/strict";
import { test } from "node:test";

import { runSchedule } from "../engine.ts";
import type { CalendarDay, InspectionType, Priority, ScheduleUnit, SubmitStatus, Team } from "../types.ts";

const TODAY = "2026-08-19"; // 周三

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
    earliestDate: "2026-08-19",
    preferredDeadline: "2026-08-24",
    hardDeadline: "2026-08-25",
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

test("基础倒排：剩余 5000 / 日产能 5000 → 全部落在预约送货日期当天", () => {
  const result = run([makeUnit()]);
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].scheduledDate, "2026-08-24");
  assert.equal(result.assignments[0].plannedQuantity, 5000);
  assert.equal(result.assignments[0].explanation.projectedDate, "2026-08-24");
  assert.equal(result.assignments[0].explanation.workdaysRemaining, 4); // 8/19,20,21,24
  assert.equal(result.assignments[0].explanation.deadlineChain.hard, "2026-08-25");
  assert.equal(result.projectedCompletions["item-1"].riskLevel, "green");
});

test("产能冲突拆分：当日已有 3000 → 自动向前一天补 2000", () => {
  const result = run([makeUnit({ earliestDate: "2026-08-19" })], [makeTeam()], {}, [
    { unitId: "other", teamId: "team-1", date: "2026-08-24", type: "normal", plannedQuantity: 3000, completedQuantity: 0, locked: false }
  ]);
  const dates = result.assignments.map((assignment) => assignment.scheduledDate).sort();
  assert.deepEqual(dates, ["2026-08-21", "2026-08-24"]);
  const on24 = result.assignments.find((assignment) => assignment.scheduledDate === "2026-08-24");
  const on21 = result.assignments.find((assignment) => assignment.scheduledDate === "2026-08-21");
  assert.equal(on24?.plannedQuantity, 2000);
  assert.equal(on21?.plannedQuantity, 3000);
  const splitAssignment = result.assignments.find((assignment) => assignment.scheduledDate === "2026-08-21");
  assert.equal(splitAssignment?.explanation.reasonCodes.includes("capacity_split"), true);
});

test("Earliest Start 约束：不得早于预计可检日期", () => {
  const result = run([makeUnit({ earliestDate: "2026-08-24", preferredDeadline: "2026-08-24" })]);
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].scheduledDate, "2026-08-24");
  assert.equal(result.assignments[0].plannedQuantity, 5000);

  const overflow = run([makeUnit({ earliestDate: "2026-08-24", preferredDeadline: "2026-08-24", hardDeadline: "2026-08-25", quantity: 12000, submittedQuantity: 12000 })]);
  assert.equal(overflow.unassigned.length, 1);
  assert.equal(overflow.unassigned[0].projectedDelayDays, 1); // 8/26 一个工作日可补 2000
  assert.equal(overflow.projectedCompletions["item-1"].riskLevel, "red");
});

test("实际可检数量约束：订单 5000、已送检 1800 → 最多排 1800", () => {
  const result = run([makeUnit({ submittedQuantity: 1800 })]);
  const total = result.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0);
  assert.equal(total, 1800);
  assert.equal(result.unassigned.length, 0);
  assert.equal(result.assignments[0].explanation.reasonCodes.includes("arrival_limited"), true);
});

test("优先级：硬延期 > 特急 > 普通", () => {
  const overdue = makeUnit({ id: "overdue", orderId: "o-overdue", earliestDate: "2026-08-17", preferredDeadline: null, hardDeadline: "2026-08-18", priority: "普通" });
  const urgent = makeUnit({ id: "urgent", orderId: "o-urgent", earliestDate: "2026-08-20", preferredDeadline: "2026-08-24", hardDeadline: "2026-08-25", priority: "特急" });
  const normal = makeUnit({ id: "normal", orderId: "o-normal", earliestDate: "2026-08-20", preferredDeadline: "2026-08-24", hardDeadline: "2026-08-25", priority: "普通" });
  const result = run([normal, urgent, overdue]);

  const overdueAssignments = assignmentByUnit(result, "overdue");
  const urgentAssignments = assignmentByUnit(result, "urgent");
  const normalAssignments = assignmentByUnit(result, "normal");
  assert.equal(overdueAssignments.length, 1);
  assert.equal(overdueAssignments[0].scheduledDate, "2026-08-18");
  assert.equal(urgentAssignments.length, 1);
  assert.equal(urgentAssignments[0].scheduledDate, "2026-08-24");
  assert.equal(normalAssignments.length, 1);
  assert.equal(normalAssignments[0].scheduledDate, "2026-08-21");
});

test("周末/节假日跳过，补班日可用", () => {
  const result = run([makeUnit({ earliestDate: "2026-08-20", preferredDeadline: "2026-08-24", hardDeadline: "2026-08-25", quantity: 15000, submittedQuantity: 15000 })]);
  const dates = new Set(result.assignments.map((assignment) => assignment.scheduledDate));
  assert.deepEqual(dates, new Set(["2026-08-20", "2026-08-21", "2026-08-24"]));
  assert.equal(result.unassigned.length, 0);

  const holiday = run(
    [makeUnit({ earliestDate: "2026-08-20", preferredDeadline: "2026-08-24", hardDeadline: "2026-08-25", quantity: 15000, submittedQuantity: 15000 })],
    [makeTeam()],
    { "2026-08-21": { isWorkDay: false, workHours: null, teamExceptions: {} } }
  );
  const holidayDates = new Set(holiday.assignments.map((assignment) => assignment.scheduledDate));
  assert.deepEqual(holidayDates, new Set(["2026-08-20", "2026-08-24", "2026-08-25"]));
  assert.equal(holiday.projectedCompletions["item-1"].riskLevel, "orange");
});

test("班组休息：当日产能为 0，任务前移", () => {
  const result = run(
    [makeUnit({ earliestDate: "2026-08-19" })],
    [makeTeam()],
    { "2026-08-24": { isWorkDay: true, workHours: null, teamExceptions: { "team-1": { isWorking: false, workHours: null, factor: null } } } }
  );
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].scheduledDate, "2026-08-21");
});

test("加班：10 小时 → 产能 = 5000 × 10/8 = 6250", () => {
  const result = run(
    [makeUnit({ quantity: 6250, submittedQuantity: 6250, earliestDate: "2026-08-19" })],
    [makeTeam({ maxDailyCapacity: 7000 })],
    { "2026-08-24": { isWorkDay: true, workHours: null, teamExceptions: { "team-1": { isWorking: true, workHours: 10, factor: null } } } }
  );
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].scheduledDate, "2026-08-24");
  assert.equal(result.assignments[0].plannedQuantity, 6250);
});

test("款式系数：复杂款 1.3 → 1 双消耗 1.3 单位", () => {
  const result = run([makeUnit({ styleFactor: 1.3 })]);
  const total = result.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0);
  assert.equal(total, 5000);
  const on24 = result.assignments.find((assignment) => assignment.scheduledDate === "2026-08-24");
  assert.equal(on24?.plannedQuantity, Math.floor(5000 / 1.3));
  const load = result.dailyLoads.find((item) => item.date === "2026-08-24");
  assert.ok(load && load.utilization >= 0.9999);
});

test("三层 Deadline：送货排不完但出货前完成 → 橙色 + 缓冲天数", () => {
  const result = run([makeUnit({ earliestDate: "2026-08-21", preferredDeadline: "2026-08-24", hardDeadline: "2026-08-28", quantity: 12000, submittedQuantity: 12000 })]);
  assert.equal(result.unassigned.length, 0);
  assert.equal(result.projectedCompletions["item-1"].riskLevel, "orange");
  assert.equal(result.projectedCompletions["item-1"].projectedDate, "2026-08-25");
  assert.equal(result.projectedCompletions["item-1"].bufferDays, 3);
  const missed = result.assignments.find((assignment) => assignment.scheduledDate === "2026-08-25");
  assert.ok(missed && missed.explanation.reasonCodes.includes("preferred_missed"));
});

test("出货前排不完 → 红色 + 预计延期工作日", () => {
  const result = run([makeUnit({ earliestDate: "2026-08-21", preferredDeadline: "2026-08-24", hardDeadline: "2026-08-25", quantity: 16000, submittedQuantity: 16000 })]);
  assert.equal(result.unassigned.length, 1);
  assert.equal(result.unassigned[0].reason, "capacity");
  assert.equal(result.unassigned[0].remaining, 1000);
  assert.equal(result.unassigned[0].projectedDelayDays, 1);
  assert.equal(result.projectedCompletions["item-1"].riskLevel, "red");
});

test("手动锁定：锁定任务保留且占用产能", () => {
  const result = run([makeUnit({ earliestDate: "2026-08-19" })], [makeTeam()], {}, [
    { unitId: "locked-unit", teamId: "team-1", date: "2026-08-24", type: "normal", plannedQuantity: 3000, completedQuantity: 0, locked: true }
  ]);
  const on24 = result.assignments.find((assignment) => assignment.scheduledDate === "2026-08-24");
  const on21 = result.assignments.find((assignment) => assignment.scheduledDate === "2026-08-21");
  assert.equal(on24?.plannedQuantity, 2000);
  assert.equal(on21?.plannedQuantity, 3000);
  assert.equal(result.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0), 5000);
});

test("计划/完成分离：已检 2600 → 剩余 2400 进入排程", () => {
  const result = run([makeUnit({ quantity: 3000, inspectedCompleted: 2600 })]);
  const total = result.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0);
  assert.equal(total, 400);

  const withScheduled = run([makeUnit({ quantity: 3000, inspectedCompleted: 2600, alreadyScheduled: 300 })]);
  const scheduledTotal = withScheduled.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0);
  assert.equal(scheduledTotal, 400);

  const capLimited = run([makeUnit({ quantity: 3000, inspectedCompleted: 2600, alreadyScheduled: 300, submittedQuantity: 3000 })]);
  const capTotal = capLimited.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0);
  assert.equal(capTotal, 100);
});

test("配置冲突：预计可检日期晚于最终出货日期", () => {
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

test("紧急插单预览：特急占用 Deadline 当日产能，原有订单前移", () => {
  const baseUnit = makeUnit({ id: "base", orderId: "o-base", earliestDate: "2026-08-20" });
  const urgentUnit = makeUnit({ id: "urgent", orderId: "o-urgent", quantity: 5000, priority: "特急", earliestDate: "2026-08-20" });

  const before = run([baseUnit]);
  const after = run([baseUnit, urgentUnit]);

  assert.equal(before.projectedCompletions["base"].projectedDate, "2026-08-24");
  assert.equal(after.projectedCompletions["base"].projectedDate, "2026-08-21");
  const urgentAssignments = assignmentByUnit(after, "urgent");
  assert.equal(urgentAssignments[0].scheduledDate, "2026-08-24");
  assert.equal(urgentAssignments[0].plannedQuantity, 5000);
});

test("紧急插单产能不足：明确缺口", () => {
  const urgent = makeUnit({ id: "urgent", orderId: "o-urgent", quantity: 16000, submittedQuantity: 16000, priority: "特急", earliestDate: "2026-08-20", preferredDeadline: "2026-08-24", hardDeadline: "2026-08-24" });
  const result = run([urgent]);
  assert.equal(result.unassigned.length, 1);
  assert.equal(result.unassigned[0].remaining, 1000);
});

test("排程解释：字段与分配结果一致", () => {
  const result = run([makeUnit({ submittedQuantity: 4000 })]);
  const explanation = result.assignments[0].explanation;
  assert.equal(explanation.submittedQuantity, 4000);
  assert.equal(explanation.remainingQty, 5000);
  assert.equal(explanation.teamDailyCapacity, 5000);
  assert.equal(explanation.deadlineChain.preferred, "2026-08-24");
  assert.equal(explanation.deadlineChain.hard, "2026-08-25");
  assert.ok(explanation.reasonCodes.length > 0);
});

test("滚动结转口径：过期任务剩余量通过 alreadyScheduled 进入池子", () => {
  const result = run([
    makeUnit({ id: "roll", quantity: 3000, inspectedCompleted: 2600, alreadyScheduled: 0, preferredDeadline: "2026-08-24", hardDeadline: "2026-08-25" })
  ]);
  const total = result.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0);
  assert.equal(total, 400); // 计划 3000 - 完成 2600 = 400 进入后续排程
});

test("红/橙/黄预警与日产能利用率", () => {
  const result = run([makeUnit()], [makeTeam({ maxDailyCapacity: 6000 })], {}, [
    { unitId: "other", teamId: "team-1", date: "2026-08-24", type: "normal", plannedQuantity: 4500, completedQuantity: 0, locked: false }
  ]);
  const load = result.dailyLoads.find((item) => item.date === "2026-08-24");
  assert.ok(load && load.utilization > 0.9);
  assert.ok(result.warnings.some((warning) => warning.level === "yellow" && warning.date === "2026-08-24"));
});

test("暂停送检：不参与排程并标记原因", () => {
  const result = run([makeUnit({ submitStatus: "paused" as SubmitStatus })]);
  assert.equal(result.unassigned.length, 1);
  assert.equal(result.unassigned[0].reason, "paused");
  assert.equal(result.assignments.length, 0);
});

test("X线类型系数 0.8：1 双消耗 1.25 单位", () => {
  const result = run([makeUnit({ inspectionType: "xray" as InspectionType, quantity: 4000 })]);
  const total = result.assignments.reduce((sum, assignment) => sum + assignment.plannedQuantity, 0);
  assert.equal(total, 4000);
  const load = result.dailyLoads.find((item) => item.date === "2026-08-24");
  assert.ok(load && load.plannedUnits === 5000); // 4000 × 1 / 0.8 = 5000 标准单位
});

test("优先级列参与排程解释", () => {
  const result = run([makeUnit({ priority: "加急" as Priority })]);
  assert.equal(result.assignments[0].explanation.priority, "加急");
  assert.equal(result.assignments[0].priority, "加急");
});
