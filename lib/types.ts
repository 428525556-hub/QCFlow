export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type OrderStatus = "未开始" | "检品中" | "已完成";

export type InspectionStage = "normal" | "xray" | "field";
export type InspectionPlan = "normal" | "xray" | "both" | "field";
export type SubmitStatus = "pending" | "ready" | "paused";
export type SchedulePriority = "普通" | "加急" | "特急";
export type ScheduleTaskStatus = "待开始" | "进行中" | "已完成" | "部分完成" | "延期" | "已取消" | "已调整";

export type DefectType = string;

export type DefectGroup = {
  group: string;
  items: string[];
};

export type UserRole = "admin" | "staff" | "client" | "field_inspector";

export type UserProfile = {
  id: string;
  created_at: string;
  email: string;
  role: UserRole;
  customer_name: string | null;
};

export type Order = {
  id: string;
  created_at: string;
  deleted_at: string | null;
  user_id: string;
  order_type: "reservation" | "inbound";
  customer_name: string;
  factory_name: string;
  po_number: string;
  sku: string;
  inbound_date: string | null;
  shipping_date: string | null;
  inspection_plan: InspectionPlan;
  reservation_remark: string | null;
  color: string;
  size: string;
  quantity: number;
  inbound_quantity: number;
  delivery_date: string | null;
  estimated_inspection_date: string | null;
  inspection_standard: string | null;
  priority: SchedulePriority;
  assigned_team_id: string | null;
  status: OrderStatus;
};

export type OrderItem = {
  id: string;
  created_at: string;
  order_id: string;
  user_id: string;
  po_number: string;
  sku: string;
  color: string;
  size: string;
  carton_count: number;
  quantity_per_carton: number;
  quantity: number;
  inbound_quantity: number;
  estimated_inspection_date: string | null;
  submitted_quantity: number;
  submit_status: SubmitStatus;
  style_factor: number;
};

export type ReservationCarton = {
  id: string;
  created_at: string;
  order_id: string;
  user_id: string;
  carton_no: string;
  remark: string | null;
};

export type ReservationCartonItem = {
  id: string;
  created_at: string;
  reservation_carton_id: string;
  order_id: string;
  user_id: string;
  po_number: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
};

export type OrderAttachment = {
  id: string;
  created_at: string;
  order_id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  file_path: string;
  mime_type: string | null;
  file_size: number | null;
};

export type ShipmentCarton = {
  id: string;
  created_at: string;
  order_id: string;
  user_id: string;
  carton_no: string;
  remark: string | null;
};

export type ShipmentItem = {
  id: string;
  created_at: string;
  carton_id: string;
  order_id: string;
  user_id: string;
  po_number: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
};

export type DispatchRecord = {
  id: string;
  created_at: string;
  order_id: string;
  user_id: string;
  total_cartons: number;
  total_quantity: number;
  expected_quantity: number;
  is_full_dispatch: boolean;
  shortage_detail: string | null;
  vehicle_plate: string | null;
  remark: string | null;
  vehicle_photo_url: string | null;
  vehicle_photo_path: string | null;
  carton_photo_url: string | null;
  carton_photo_path: string | null;
  container_photo_url: string | null;
  container_photo_path: string | null;
};

export type UnboxingRecord = {
  id: string;
  created_at: string;
  order_id: string;
  user_id: string;
  carton_no: string;
  po_number: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  shortage_quantity: number;
  remark: string | null;
  photo_url: string | null;
  photo_path: string | null;
};

export type InspectionRecord = {
  id: string;
  created_at: string;
  order_id: string;
  user_id: string;
  inspection_stage: InspectionStage;
  color: string | null;
  size: string | null;
  defect_type: DefectType;
  quantity: number;
  remark: string | null;
  photo_url: string | null;
  photo_path: string | null;
};

export type ReinspectionRecord = {
  id: string;
  created_at: string;
  order_id: string;
  source_record_id: string;
  user_id: string;
  inspection_stage: InspectionStage;
  defect_type: DefectType;
  color: string | null;
  size: string | null;
  passed_quantity: number;
  failed_quantity: number;
  remark: string | null;
};

export type InspectionTeam = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  work_start_time: string | null;
  work_end_time: string | null;
  daily_hours: number;
  standard_daily_capacity: number;
  baseline_members: number;
  current_members: number;
  max_daily_capacity: number;
  inspection_types: string[];
  capacity_factors: Record<string, number>;
  enabled: boolean;
  sort_order: number;
};

export type StyleCategory = {
  id: string;
  created_at: string;
  name: string;
  factor: number;
  remark: string | null;
  enabled: boolean;
};

export type ProductionCalendarEntry = {
  id: string;
  created_at: string;
  date: string;
  is_work_day: boolean;
  work_hours: number | null;
  remark: string | null;
};

export type TeamWorkException = {
  id: string;
  created_at: string;
  team_id: string;
  date: string;
  is_working: boolean;
  work_hours: number | null;
  capacity_factor: number | null;
  remark: string | null;
};

export type InspectionScheduleTask = {
  id: string;
  created_at: string;
  updated_at: string;
  order_id: string;
  order_item_id: string | null;
  inspection_type: InspectionStage;
  scheduled_date: string;
  team_id: string | null;
  planned_quantity: number;
  priority: SchedulePriority;
  status: ScheduleTaskStatus;
  source: "auto" | "manual";
  locked: boolean;
  run_id: string | null;
  completed_quantity: number;
  explanation: Record<string, unknown> | null;
  remark: string | null;
};

export type ScheduleProgressRecord = {
  id: string;
  created_at: string;
  task_id: string;
  user_id: string | null;
  user_email: string | null;
  quantity: number;
  record_date: string;
  remark: string | null;
};

export type ScheduleChangeLog = {
  id: string;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  run_id: string | null;
  order_id: string | null;
  order_item_id: string | null;
  reason: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
};

export type RegistrationInvite = {
  id: string;
  created_at: string;
  created_by_user_id: string | null;
  created_by_email: string;
  code_hash: string;
  role: "staff" | "client" | "field_inspector";
  customer_name: string | null;
  active: boolean;
  expires_at: string;
  used_at: string | null;
  used_by_email: string | null;
  used_by_user_id: string | null;
};

export type Database = {
  public: {
    Tables: {
      user_profiles: {
        Row: UserProfile;
        Insert: Omit<UserProfile, "created_at"> & { created_at?: string };
        Update: Partial<Omit<UserProfile, "id" | "created_at">>;
        Relationships: [];
      };
      orders: {
        Row: Order;
        Insert: Omit<Order, "id" | "created_at" | "deleted_at" | "delivery_date" | "estimated_inspection_date" | "inspection_standard" | "priority" | "assigned_team_id"> & {
          id?: string;
          created_at?: string;
          deleted_at?: string | null;
          delivery_date?: string | null;
          estimated_inspection_date?: string | null;
          inspection_standard?: string | null;
          priority?: SchedulePriority;
          assigned_team_id?: string | null;
        };
        Update: Partial<Omit<Order, "id" | "created_at" | "user_id">>;
        Relationships: [];
      };
      order_items: {
        Row: OrderItem;
        Insert: Omit<OrderItem, "id" | "created_at" | "carton_count" | "quantity_per_carton" | "estimated_inspection_date" | "submitted_quantity" | "submit_status" | "style_factor"> & {
          id?: string;
          created_at?: string;
          carton_count?: number;
          quantity_per_carton?: number;
          estimated_inspection_date?: string | null;
          submitted_quantity?: number;
          submit_status?: SubmitStatus;
          style_factor?: number;
        };
        Update: Partial<Omit<OrderItem, "id" | "created_at" | "user_id">>;
        Relationships: [];
      };
      reservation_cartons: {
        Row: ReservationCarton;
        Insert: Omit<ReservationCarton, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<ReservationCarton, "id" | "created_at" | "user_id">>;
        Relationships: [];
      };
      reservation_carton_items: {
        Row: ReservationCartonItem;
        Insert: Omit<ReservationCartonItem, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<ReservationCartonItem, "id" | "created_at" | "user_id">>;
        Relationships: [];
      };
      order_attachments: {
        Row: OrderAttachment;
        Insert: Omit<OrderAttachment, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<OrderAttachment, "id" | "created_at" | "user_id">>;
        Relationships: [];
      };
      shipment_cartons: {
        Row: ShipmentCarton;
        Insert: Omit<ShipmentCarton, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<ShipmentCarton, "id" | "created_at" | "user_id">>;
        Relationships: [];
      };
      shipment_items: {
        Row: ShipmentItem;
        Insert: Omit<ShipmentItem, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<ShipmentItem, "id" | "created_at" | "user_id">>;
        Relationships: [];
      };
      dispatch_records: {
        Row: DispatchRecord;
        Insert: Omit<DispatchRecord, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<DispatchRecord, "id" | "created_at" | "user_id">>;
        Relationships: [];
      };
      unboxing_records: {
        Row: UnboxingRecord;
        Insert: Omit<UnboxingRecord, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<UnboxingRecord, "id" | "created_at" | "user_id">>;
        Relationships: [];
      };
      inspection_records: {
        Row: InspectionRecord;
        Insert: Omit<InspectionRecord, "id" | "created_at" | "inspection_stage" | "color" | "size"> & {
          id?: string;
          created_at?: string;
          inspection_stage?: InspectionStage;
          color?: string | null;
          size?: string | null;
        };
        Update: Partial<Omit<InspectionRecord, "id" | "created_at" | "user_id">>;
        Relationships: [];
      };
      reinspection_records: {
        Row: ReinspectionRecord;
        Insert: Omit<ReinspectionRecord, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<ReinspectionRecord, "id" | "created_at" | "user_id">>;
        Relationships: [];
      };
      registration_invites: {
        Row: RegistrationInvite;
        Insert: Omit<RegistrationInvite, "id" | "created_at" | "active" | "used_at" | "used_by_email" | "used_by_user_id"> & {
          id?: string;
          created_at?: string;
          active?: boolean;
          used_at?: string | null;
          used_by_email?: string | null;
          used_by_user_id?: string | null;
        };
        Update: Partial<Omit<RegistrationInvite, "id" | "created_at" | "code_hash">>;
        Relationships: [];
      };
      inspection_teams: {
        Row: InspectionTeam;
        Insert: Omit<InspectionTeam, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<InspectionTeam, "id" | "created_at">>;
        Relationships: [];
      };
      style_categories: {
        Row: StyleCategory;
        Insert: Omit<StyleCategory, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<StyleCategory, "id" | "created_at">>;
        Relationships: [];
      };
      production_calendar: {
        Row: ProductionCalendarEntry;
        Insert: Omit<ProductionCalendarEntry, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<ProductionCalendarEntry, "id" | "created_at">>;
        Relationships: [];
      };
      team_work_exceptions: {
        Row: TeamWorkException;
        Insert: Omit<TeamWorkException, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<TeamWorkException, "id" | "created_at">>;
        Relationships: [];
      };
      inspection_schedule: {
        Row: InspectionScheduleTask;
        Insert: Omit<InspectionScheduleTask, "id" | "created_at" | "updated_at" | "completed_quantity" | "status"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          completed_quantity?: number;
          status?: ScheduleTaskStatus;
        };
        Update: Partial<Omit<InspectionScheduleTask, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      schedule_progress_records: {
        Row: ScheduleProgressRecord;
        Insert: Omit<ScheduleProgressRecord, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<ScheduleProgressRecord, "id" | "created_at">>;
        Relationships: [];
      };
      schedule_change_logs: {
        Row: ScheduleChangeLog;
        Insert: Omit<ScheduleChangeLog, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<ScheduleChangeLog, "id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_order_with_items: {
        Args: { order_payload: Json; item_payload: Json };
        Returns: string;
      };
      apply_schedule_run: {
        Args: { payload: Json };
        Returns: Json;
      };
      record_schedule_progress: {
        Args: { payload: Json };
        Returns: Json;
      };
      apply_manual_adjust: {
        Args: { payload: Json };
        Returns: Json;
      };
      apply_schedule_insert: {
        Args: { payload: Json };
        Returns: Json;
      };
      rollover_schedule: {
        Args: { payload: Json };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export const normalDefectGroups: DefectGroup[] = [
  {
    group: "危害",
    items: ["异物混入", "异物突起", "钉/针/虫等", "危害其他"]
  },
  {
    group: "帮面和附件",
    items: ["污れ/脏污", "皱/起皱", "伤痕/破损", "左右色差", "色落/色ムラ", "缝制不良/脱线", "形状不良", "饰品不良", "功能性不良", "拉链/扣具不良", "魔术贴/橡筋不良"]
  },
  {
    group: "中底和内里",
    items: ["中底浮起", "内里破损", "商标不良", "中敷污れ", "线头/缝制不良", "中底其他"]
  },
  {
    group: "大底/插跟/贴合",
    items: ["大底皱/伤痕", "接地不稳定", "接着不良/开胶", "底/跟左右高低", "鞋头左右差", "左右尺码差", "底材污れ", "リフト/跟天不良"]
  },
  {
    group: "包装及表示不良",
    items: ["吊牌不良", "外箱不良", "防霉片不良", "定箱不良", "表示错误", "包装破损"]
  },
  {
    group: "常用补充",
    items: ["色差", "尺寸", "左右脚", "脏污", "开胶", "脱线", "备注其他"]
  }
];

export const xrayDefectGroups: DefectGroup[] = [
  {
    group: "X光/検針",
    items: [
      "コンベア検針機反応",
      "ヒ｜ル芯不良",
      "中底シャンク不良",
      "ヒ｜ル釘打不良",
      "異物混入釘、タッス、線状金属物",
      "その他鉄粉、雑質、飾り不良、欠片混入"
    ]
  }
];

export const defectGroups = normalDefectGroups;
export const defectTypes: DefectType[] = Array.from(new Set(normalDefectGroups.flatMap((group) => group.items)));
export const xrayDefectTypes: DefectType[] = Array.from(new Set(xrayDefectGroups.flatMap((group) => group.items)));
