export type InspectionType = "normal" | "xray" | "field";
export type Priority = "普通" | "加急" | "特急";
export type RiskLevel = "green" | "yellow" | "red" | "overload";
export type UrgencyLevel = "P0" | "P1" | "P2" | "P3";
export type SubmitStatus = "pending" | "ready" | "paused";

export interface ScheduleUnit {
  id: string;
  orderId: string;
  poNumber: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  submittedQuantity: number;
  inspectedCompleted: number;
  alreadyScheduled: number;
  earliestDate: string | null;
  preferredDeadline: string | null;
  hardDeadline: string | null;
  inspectionType: InspectionType;
  priority: Priority;
  assignedTeamId: string | null;
  styleFactor: number;
  submitStatus: SubmitStatus;
}

export interface Team {
  id: string;
  name: string;
  enabled: boolean;
  standardDailyCapacity: number;
  baselineMembers: number;
  currentMembers: number;
  maxDailyCapacity: number;
  dailyHours: number;
  inspectionTypes: InspectionType[];
  capacityFactors: Record<string, number>;
  sortOrder?: number;
}

export interface TeamException {
  isWorking: boolean;
  workHours: number | null;
  factor: number | null;
}

export interface CalendarDay {
  isWorkDay: boolean;
  workHours: number | null;
  teamExceptions: Record<string, TeamException>;
}

export interface ExistingAssignment {
  unitId: string | null;
  teamId: string | null;
  date: string;
  type: InspectionType;
  plannedQuantity: number;
  completedQuantity: number;
  locked: boolean;
  styleFactor?: number;
}

export interface TaskExplanation {
  deadlineChain: { earliest: string | null; preferred: string | null; hard: string | null };
  targetDate: string | null;
  latestAcceptable: string | null;
  urgency: UrgencyLevel;
  overload: boolean;
  remainingQty: number;
  workdaysRemaining: number | null;
  teamDailyCapacity: number;
  priority: Priority;
  submittedQuantity: number;
  reasonCodes: string[];
  bufferDays: number | null;
  projectedDate: string | null;
  riskLevel: RiskLevel;
}

export interface Assignment {
  unitId: string;
  orderId: string;
  poNumber: string;
  sku: string;
  color: string;
  size: string;
  inspectionType: InspectionType;
  scheduledDate: string;
  teamId: string | null;
  plannedQuantity: number;
  priority: Priority;
  explanation: TaskExplanation;
  source: "auto" | "manual";
  remark?: string | null;
}

export interface UnassignedUnit {
  unitId: string;
  orderId: string;
  remaining: number;
  reason: string;
  note?: string;
  projectedDelayDays: number;
}

export interface Warning {
  level: RiskLevel;
  unitId?: string;
  date?: string;
  teamId?: string;
  message: string;
}

export interface DailyLoad {
  date: string;
  teamId: string;
  plannedUnits: number;
  capacityUnits: number;
  utilization: number;
}

export interface ProjectedCompletion {
  projectedDate: string | null;
  bufferDays: number | null;
  riskLevel: RiskLevel;
}

export interface ScheduleRunResult {
  assignments: Assignment[];
  unassigned: UnassignedUnit[];
  warnings: Warning[];
  dailyLoads: DailyLoad[];
  projectedCompletions: Record<string, ProjectedCompletion>;
}

export interface ScheduleRunInput {
  units: ScheduleUnit[];
  teams: Team[];
  calendar: Record<string, CalendarDay>;
  existingAssignments: ExistingAssignment[];
  today: string;
  horizonDays?: number;
  leadWorkdays?: number;
  bufferWorkdays?: number;
}
