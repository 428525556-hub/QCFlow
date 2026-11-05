import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const TABLE_DEFINITIONS = [
  {
    name: "user_profiles",
    columns: ["id", "created_at", "email", "role", "customer_name"]
  },
  {
    name: "inspection_teams",
    columns: [
      "id", "created_at", "updated_at", "name", "work_start_time", "work_end_time",
      "daily_hours", "standard_daily_capacity", "baseline_members", "current_members",
      "max_daily_capacity", "inspection_types", "capacity_factors", "enabled", "sort_order"
    ]
  },
  {
    name: "style_categories",
    columns: ["id", "created_at", "name", "factor", "remark", "enabled"]
  },
  {
    name: "production_calendar",
    columns: ["id", "created_at", "date", "is_work_day", "work_hours", "remark"]
  },
  {
    name: "team_work_exceptions",
    columns: ["id", "created_at", "team_id", "date", "is_working", "work_hours", "capacity_factor", "remark"]
  },
  {
    name: "orders",
    columns: [
      "id", "created_at", "deleted_at", "user_id", "order_type", "customer_name",
      "factory_name", "po_number", "sku", "inbound_date", "shipping_date",
      "shipping_date_tbd", "inspection_plan", "reservation_remark", "color", "size",
      "quantity", "inbound_quantity", "delivery_date", "estimated_inspection_date",
      "inspection_standard", "priority", "assigned_team_id", "direct_ship", "status"
    ]
  },
  {
    name: "order_items",
    columns: [
      "id", "created_at", "order_id", "user_id", "po_number", "sku", "color", "size",
      "carton_count", "quantity_per_carton", "quantity", "inbound_quantity",
      "estimated_inspection_date", "submitted_quantity", "submit_status", "style_factor"
    ]
  },
  {
    name: "reservation_cartons",
    columns: ["id", "created_at", "order_id", "user_id", "carton_no", "remark"]
  },
  {
    name: "reservation_carton_items",
    columns: ["id", "created_at", "reservation_carton_id", "order_id", "user_id", "po_number", "sku", "color", "size", "quantity"]
  },
  {
    name: "order_attachments",
    columns: ["id", "created_at", "order_id", "user_id", "file_name", "file_url", "file_path", "mime_type", "file_size"]
  },
  {
    name: "inspection_records",
    columns: ["id", "created_at", "order_id", "user_id", "defect_type", "quantity", "remark", "photo_url", "photo_path", "inspection_stage", "color", "size"]
  },
  {
    name: "reinspection_records",
    columns: ["id", "created_at", "order_id", "source_record_id", "user_id", "inspection_stage", "defect_type", "color", "size", "passed_quantity", "failed_quantity", "remark"]
  },
  {
    name: "unboxing_records",
    columns: ["id", "created_at", "order_id", "user_id", "carton_no", "po_number", "sku", "color", "size", "quantity", "shortage_quantity", "remark", "photo_url", "photo_path"]
  },
  {
    name: "shipment_cartons",
    columns: ["id", "created_at", "order_id", "user_id", "carton_no", "remark"]
  },
  {
    name: "shipment_items",
    columns: ["id", "created_at", "carton_id", "order_id", "user_id", "po_number", "sku", "color", "size", "quantity"]
  },
  {
    name: "dispatch_records",
    columns: [
      "id", "created_at", "order_id", "user_id", "total_cartons", "total_quantity",
      "expected_quantity", "is_full_dispatch", "shortage_detail", "vehicle_plate",
      "remark", "vehicle_photo_url", "vehicle_photo_path", "carton_photo_url",
      "carton_photo_path", "container_photo_url", "container_photo_path"
    ]
  },
  {
    name: "registration_invites",
    columns: [
      "id", "created_at", "created_by_user_id", "created_by_email", "code_hash", "active",
      "expires_at", "used_at", "used_by_email", "used_by_user_id", "role", "customer_name"
    ]
  },
  {
    name: "inspection_schedule",
    columns: [
      "id", "created_at", "updated_at", "order_id", "order_item_id", "inspection_type",
      "scheduled_date", "team_id", "planned_quantity", "priority", "status", "source",
      "locked", "run_id", "completed_quantity", "explanation", "remark"
    ]
  },
  {
    name: "schedule_progress_records",
    columns: ["id", "created_at", "task_id", "user_id", "user_email", "quantity", "record_date", "remark"]
  },
  {
    name: "schedule_change_logs",
    columns: ["id", "created_at", "user_id", "user_email", "action", "run_id", "order_id", "order_item_id", "reason", "before_data", "after_data"]
  },
  {
    name: "shipment_batches",
    columns: ["id", "created_at", "updated_at", "customer_name", "shipping_date", "batch_no", "remark"]
  }
];

const USER_REFERENCES = [
  ["orders", ["user_id"]],
  ["order_items", ["user_id"]],
  ["reservation_cartons", ["user_id"]],
  ["reservation_carton_items", ["user_id"]],
  ["order_attachments", ["user_id"]],
  ["inspection_records", ["user_id"]],
  ["reinspection_records", ["user_id"]],
  ["unboxing_records", ["user_id"]],
  ["shipment_cartons", ["user_id"]],
  ["shipment_items", ["user_id"]],
  ["dispatch_records", ["user_id"]],
  ["registration_invites", ["created_by_user_id", "used_by_user_id"]],
  ["schedule_progress_records", ["user_id"]],
  ["schedule_change_logs", ["user_id"]]
];

function parseArgs(argv) {
  const args = { apply: false, runDir: "", target: "", allowProduction: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--apply") args.apply = true;
    else if (value === "--allow-production") args.allowProduction = true;
    else if (value === "--run-dir") args.runDir = argv[++index] ?? "";
    else if (value === "--target") args.target = argv[++index] ?? "";
    else throw new Error(`未知参数：${value}`);
  }
  if (!args.runDir) throw new Error("必须提供 --run-dir <备份运行目录>");
  return args;
}

async function readJson(filePath) {
  const value = JSON.parse(await fs.readFile(filePath, "utf8"));
  return Array.isArray(value) ? value : [];
}

function pickColumns(rows, columns) {
  return rows.map((row) =>
    Object.fromEntries(columns.filter((column) => Object.hasOwn(row, column)).map((column) => [column, row[column]]))
  );
}

function buildInsert(table, rows) {
  if (rows.length === 0) return null;
  const columns = Object.keys(rows[0]);
  if (columns.length === 0) throw new Error(`${table} 没有可导入字段`);
  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.length !== columns.length || columns.some((column) => !(column in row))) {
      throw new Error(`${table} 的字段集合不一致`);
    }
  }
  const values = [];
  const tuples = rows.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(row[column]);
      return `$${values.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  return {
    text: `insert into public.${table} (${columns.map((column) => `"${column}"`).join(", ")}) values ${tuples.join(", ")}`,
    values
  };
}

function normalizeUsers(profiles) {
  const users = profiles.map((profile) => ({
    id: profile.id,
    created_at: profile.created_at,
    email: String(profile.email ?? "").trim().toLowerCase(),
    disabled: false
  }));
  const ids = new Set();
  const emails = new Set();
  for (const user of users) {
    if (!user.id || !user.email) throw new Error("user_profiles 中存在缺少 id 或 email 的记录");
    if (ids.has(user.id)) throw new Error("user_profiles 中存在重复 id");
    if (emails.has(user.email)) throw new Error("user_profiles 中存在重复邮箱");
    ids.add(user.id);
    emails.add(user.email);
  }
  return users;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = path.resolve(args.runDir);
  const dbDir = path.join(runDir, "db");
  const tableRows = new Map();

  for (const definition of TABLE_DEFINITIONS) {
    tableRows.set(definition.name, await readJson(path.join(dbDir, `${definition.name}.json`)));
  }

  const profiles = tableRows.get("user_profiles");
  const users = normalizeUsers(profiles);
  const userIds = new Set(users.map((user) => user.id));
  let missingUserReferences = 0;
  for (const [table, fields] of USER_REFERENCES) {
    for (const row of tableRows.get(table)) {
      for (const field of fields) {
        if (row[field] && !userIds.has(row[field])) missingUserReferences += 1;
      }
    }
  }

  console.log(`迁移预检：${TABLE_DEFINITIONS.length} 张业务表，${users.length} 个用户资料`);
  for (const definition of TABLE_DEFINITIONS) {
    console.log(`${definition.name}: ${tableRows.get(definition.name).length}`);
  }
  console.log(`缺失的用户外键引用：${missingUserReferences}`);
  if (missingUserReferences > 0) {
    throw new Error("存在无法映射到 user_profiles 的用户 ID，已中止");
  }

  if (!args.apply) {
    console.log("DRY RUN：未连接数据库。确认目标后使用 --target staging --apply。");
    return;
  }
  if (args.target !== "staging" && args.target !== "production") {
    throw new Error("--apply 必须指定 --target staging 或 --target production");
  }
  if (args.target === "production" && !args.allowProduction) {
    throw new Error("生产导入必须额外提供 --allow-production");
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("缺少 DATABASE_URL");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const targets = ["users", ...TABLE_DEFINITIONS.map((definition) => definition.name)];
    for (const table of targets) {
      const result = await client.query(`select count(*)::int as count from public.${table}`);
      if (result.rows[0].count !== 0) {
        throw new Error(`目标表 public.${table} 非空，已中止，未写入任何数据`);
      }
    }

    await client.query("begin");
    const userInsert = buildInsert(
      "users",
      users.map(({ id, created_at, email, disabled }) => ({ id, created_at, email, disabled }))
    );
    if (userInsert) await client.query(userInsert.text, userInsert.values);

    for (const definition of TABLE_DEFINITIONS) {
      const rows = pickColumns(tableRows.get(definition.name), definition.columns);
      const statement = buildInsert(definition.name, rows);
      if (statement) await client.query(statement.text, statement.values);
    }

    for (const table of targets) {
      const expected = table === "users" ? users.length : tableRows.get(table).length;
      const actual = Number((await client.query(`select count(*)::int as count from public.${table}`)).rows[0].count);
      if (actual !== expected) throw new Error(`${table} 导入后行数不一致：${actual}/${expected}`);
    }
    await client.query("commit");

    const report = {
      importedAt: new Date().toISOString(),
      target: args.target,
      users: users.length,
      tables: Object.fromEntries(TABLE_DEFINITIONS.map((definition) => [definition.name, tableRows.get(definition.name).length]))
    };
    await fs.writeFile(path.join(runDir, `pg-import-${args.target}.json`), JSON.stringify(report, null, 2));
    console.log(`导入完成：${args.target}，共 ${users.length + TABLE_DEFINITIONS.reduce((sum, definition) => sum + tableRows.get(definition.name).length, 0)} 行。`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "数据导入失败");
  process.exitCode = 1;
});
