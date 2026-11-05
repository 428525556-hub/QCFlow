import fs from "node:fs/promises";
import path from "node:path";
import COS from "cos-nodejs-sdk-v5";

function parseArgs(argv) {
  const args = { apply: false, runDir: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--apply") args.apply = true;
    else if (value === "--run-dir") args.runDir = argv[++index] ?? "";
    else throw new Error(`未知参数：${value}`);
  }
  if (!args.runDir) throw new Error("必须提供 --run-dir <备份运行目录>");
  return args;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  if (rows.length === 0) return [];

  const headers = rows[0];
  return rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
  );
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const types = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain"
  };
  return types[extension] ?? "application/octet-stream";
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少环境变量：${name}`);
  return value;
}

function bucketEnv(bucket) {
  if (bucket === "inspection-photos") return requiredEnv("COS_BUCKET_INSPECTION_PHOTOS");
  if (bucket === "order-attachments") return requiredEnv("COS_BUCKET_ORDER_ATTACHMENTS");
  throw new Error(`未知 bucket：${bucket}`);
}

function publicBaseUrl(bucket) {
  const name =
    bucket === "inspection-photos"
      ? "COS_INSPECTION_PHOTOS_BASE_URL"
      : "COS_ORDER_ATTACHMENTS_BASE_URL";
  const configured = process.env[name]?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  return `https://${bucketEnv(bucket)}.cos.${requiredEnv("COS_REGION")}.myqcloud.com`;
}

function encodePath(objectPath) {
  return objectPath
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = path.resolve(args.runDir);
  const manifestPath = path.join(runDir, "storage-manifest.csv");
  const manifest = parseCsv(await fs.readFile(manifestPath, "utf8")).filter(
    (row) => row.status === "ok"
  );
  if (manifest.length === 0) throw new Error("storage-manifest.csv 中没有可迁移文件");

  const storageRoot = path.resolve(runDir, "storage");
  const results = [];

  for (const row of manifest) {
    const expectedSize = Number(row.size);
    const source = path.resolve(storageRoot, row.bucket, ...row.path.split("/"));
    if (!source.startsWith(`${storageRoot}${path.sep}`)) {
      throw new Error(`文件路径越界：${row.bucket}/${row.path}`);
    }

    const stat = await fs.stat(source);
    if (!stat.isFile() || stat.size !== expectedSize) {
      throw new Error(`本地文件缺失或大小不一致：${row.bucket}/${row.path}`);
    }

    results.push({
      bucket: row.bucket,
      path: row.path,
      size: stat.size,
      source,
      status: args.apply ? "pending" : "verified"
    });
  }

  if (!args.apply) {
    console.log(`DRY RUN：已验证 ${results.length} 个文件，未上传任何对象。`);
    console.log("确认后使用 --apply 执行上传。");
    return;
  }

  const client = new COS({
    SecretId: requiredEnv("COS_SECRET_ID"),
    SecretKey: requiredEnv("COS_SECRET_KEY"),
    Timeout: 60_000,
    KeepAlive: true
  });
  const region = requiredEnv("COS_REGION");

  for (const row of results) {
    const bucket = row.bucket;
    const key = row.path.replace(/^\/+/, "");
    try {
      await client.putObject({
        Bucket: bucketEnv(bucket),
        Region: region,
        Key: key,
        Body: await fs.readFile(row.source),
        ContentType: contentType(row.path),
        CacheControl: "public, max-age=3600"
      });
      const head = await client.headObject({
        Bucket: bucketEnv(bucket),
        Region: region,
        Key: key
      });
      if (Number(head.headers?.["content-length"] ?? 0) !== row.size) {
        throw new Error("COS 返回的文件大小与本地不一致");
      }
      row.url = `${publicBaseUrl(bucket)}/${encodePath(key)}`;
      row.status = "uploaded";
    } catch (error) {
      row.status = "failed";
      row.error = error instanceof Error ? error.message : "unknown error";
    }
  }

  const reportPath = path.join(runDir, "cos-migration-report.csv");
  const header = "bucket,path,size,url,status,error";
  const lines = results.map((row) =>
    [row.bucket, row.path, row.size, row.url, row.status, row.error].map(csvCell).join(",")
  );
  await fs.writeFile(reportPath, [header, ...lines].join("\n"), "utf8");

  const failed = results.filter((row) => row.status !== "uploaded");
  console.log(`COS 迁移完成：${results.length - failed.length}/${results.length}，报告：${reportPath}`);
  if (failed.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "迁移失败");
  process.exitCode = 1;
});
