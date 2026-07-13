export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type OrderStatus = "未开始" | "检品中" | "已完成";

export type InspectionStage = "normal" | "xray";
export type InspectionPlan = "normal" | "xray" | "both";

export type DefectType = string;

export type DefectGroup = {
  group: string;
  items: string[];
};

export type UserRole = "admin" | "staff" | "client";

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

export type RegistrationInvite = {
  id: string;
  created_at: string;
  created_by_user_id: string | null;
  created_by_email: string;
  code_hash: string;
  role: "staff" | "client";
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
        Insert: Omit<Order, "id" | "created_at" | "deleted_at"> & { id?: string; created_at?: string; deleted_at?: string | null };
        Update: Partial<Omit<Order, "id" | "created_at" | "user_id">>;
        Relationships: [];
      };
      order_items: {
        Row: OrderItem;
        Insert: Omit<OrderItem, "id" | "created_at" | "carton_count" | "quantity_per_carton"> & {
          id?: string;
          created_at?: string;
          carton_count?: number;
          quantity_per_carton?: number;
        };
        Update: Partial<Omit<OrderItem, "id" | "created_at" | "user_id">>;
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
    };
    Views: Record<string, never>;
    Functions: {
      create_order_with_items: {
        Args: { order_payload: Json; item_payload: Json };
        Returns: string;
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
