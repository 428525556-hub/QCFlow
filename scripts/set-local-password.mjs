import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const { Client } = pg;
const scrypt = promisify(scryptCallback);

function parseArgs(argv) {
  const args = { email: "", passwordEnv: "STAGING_ADMIN_PASSWORD", apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--apply") args.apply = true;
    else if (value === "--email") args.email = argv[++index] ?? "";
    else if (value === "--password-env") args.passwordEnv = argv[++index] ?? "";
    else throw new Error(`未知参数：${value}`);
  }
  if (!args.email) throw new Error("必须提供 --email");
  if (!args.passwordEnv) throw new Error("必须提供 --password-env");
  return args;
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const n = 16384;
  const r = 8;
  const p = 1;
  const derived = await scrypt(password, salt, 64, {
    N: n,
    r,
    p,
    maxmem: 64 * 1024 * 1024
  });
  return `scrypt$${n}$${r}$${p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const password = process.env[args.passwordEnv];
  if (!password || password.length < 12) {
    throw new Error(`环境变量 ${args.passwordEnv} 缺失或少于 12 位`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("缺少 DATABASE_URL");

  const email = args.email.trim().toLowerCase();
  if (!args.apply) {
    console.log(`DRY RUN：将为 ${email} 设置本地密码。`);
    return;
  }

  const passwordHash = await hashPassword(password);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("begin");
    const result = await client.query(
      `update public.users
       set password_hash = $2,
           email_verified_at = coalesce(email_verified_at, now()),
           failed_login_attempts = 0,
           locked_until = null,
           updated_at = now()
       where email = $1
       returning id`,
      [email, passwordHash]
    );
    if (result.rows.length === 0) throw new Error("目标账号不存在，请先导入用户资料");
    await client.query(
      "update public.auth_sessions set revoked_at = coalesce(revoked_at, now()) where user_id = $1",
      [result.rows[0].id]
    );
    await client.query("commit");
    console.log(`本地密码已设置：${email}`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "设置密码失败");
  process.exitCode = 1;
});
