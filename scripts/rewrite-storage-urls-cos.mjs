import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

function parseArgs(argv) {
  const args = { apply: false, runDir: "", oldBase: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--apply") args.apply = true;
    else if (value === "--run-dir") args.runDir = argv[++index] ?? "";
    else if (value === "--old-base") args.oldBase = argv[++index] ?? "";
    else throw new Error(`未知参数：${value}`);
  }
  if (!args.runDir) throw new Error("必须提供 --run-dir <备份运行目录>");
  if (!args.oldBase) throw new Error("必须通过 --old-base 或 NEXT_PUBLIC_SUPABASE_URL 提供旧存储域名");
  args.oldBase = args.oldBase.replace(/\/+$/, "");
  return args;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少环境变量：${name}`);
  return value.replace(/\/+$/, "");
}

function encodePath(objectPath) {
  return objectPath
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function readTable(runDir, table) {
  const content = await fs.readFile(path.join(runDir, "db", `${table}.json`), "utf8");
  const rows = JSON.parse(content);
  return Array.isArray(rows) ? rows : [];
}

function proxyUrl(bucket, objectPath) {
  const query = new URLSearchParams({ bucket, path: objectPath.replace(/^\/+/, "") });
  return `/api/storage/object?${query.toString()}`;
}

function resolveNewUrl(oldUrl, objectPath, oldBase) {
  if (!oldUrl || !objectPath) return null;
  if (oldUrl.startsWith(`${oldBase}/storage/v1/object/public/inspection-photos/`)) {
    return proxyUrl("inspection-photos", objectPath);
  }
  if (oldUrl.startsWith(`${oldBase}/storage/v1/object/public/order-attachments/`)) {
    return proxyUrl("order-attachments", objectPath);
  }
  return null;
}

function collectUpdates(rows, oldBase, definition) {
  const updates = [];
  let unknown = 0;
  for (const row of rows) {
    for (const field of definition.fields) {
      const oldUrl = row[field.url];
      const objectPath = row[field.path];
      if (!oldUrl && !objectPath) continue;
      const newUrl = resolveNewUrl(oldUrl, objectPath, oldBase);
      if (!newUrl) {
        unknown += 1;
        continue;
      }
      if (newUrl !== oldUrl) {
        updates.push({ id: row.id, field: field.url, oldUrl, newUrl });
      }
    }
  }
  return { updates, unknown };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const definitions = [
    {
      table: "inspection_records",
      fields: [{ url: "photo_url", path: "photo_path" }]
    },
    {
      table: "unboxing_records",
      fields: [{ url: "photo_url", path: "photo_path" }]
    },
    {
      table: "order_attachments",
      fields: [{ url: "file_url", path: "file_path" }]
    },
    {
      table: "dispatch_records",
      fields: [
        { url: "vehicle_photo_url", path: "vehicle_photo_path" },
        { url: "carton_photo_url", path: "carton_photo_path" },
        { url: "container_photo_url", path: "container_photo_path" }
      ]
    }
  ];

  const plans = [];
  for (const definition of definitions) {
    const rows = await readTable(args.runDir, definition.table);
    plans.push({ definition, ...collectUpdates(rows, args.oldBase, definition) });
  }

  const totalUpdates = plans.reduce((sum, plan) => sum + plan.updates.length, 0);
  const totalUnknown = plans.reduce((sum, plan) => sum + plan.unknown, 0);
  console.log(`DRY RUN：计划更新 ${totalUpdates} 个 URL，无法识别 ${totalUnknown} 个。`);
  for (const plan of plans) {
    console.log(`${plan.definition.table}: ${plan.updates.length} 个，未识别 ${plan.unknown} 个`);
  }
  if (!args.apply) {
    console.log("未连接数据库。确认后使用 --apply 执行更新。");
    return;
  }
  if (totalUnknown > 0) {
    throw new Error("存在无法识别的旧存储 URL，已中止，未修改数据库");
  }

  const client = new Client({ connectionString: requiredEnv("DATABASE_URL") });
  await client.connect();
  try {
    await client.query("begin");
    for (const plan of plans) {
      for (const update of plan.updates) {
        await client.query(
          `update public.${plan.definition.table}
           set ${update.field} = $1
           where id = $2 and ${update.field} = $3`,
          [update.newUrl, update.id, update.oldUrl]
        );
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }

  console.log(`COS URL 更新完成：${totalUpdates} 个。`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "URL 重写失败");
  process.exitCode = 1;
});
