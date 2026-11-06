import fs from "node:fs/promises";
import crypto from "node:crypto";
import pg from "pg";

function readEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
  );
}

function cookieFrom(response) {
  const value = response.headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie") ?? "";
  return value.split(";")[0];
}

async function request(baseUrl, path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.cookie) headers.Cookie = options.cookie;
  let body = options.form;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
    redirect: "manual"
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // 非 JSON 响应由调用方通过状态码判断。
  }
  return { status: response.status, json, cookie: cookieFrom(response) };
}

function expectStatus(results, name, response, expected) {
  const pass = response.status === expected;
  results.push({ name, status: response.status, expected, pass });
}

const env = readEnv(await fs.readFile("deploy/staging/.env.staging", "utf8"));
const baseUrl = "http://127.0.0.1:9443";
const stamp = Date.now();
const emails = {
  client: `qcflow-client-smoke-${stamp}@example.com`,
  field: `qcflow-field-smoke-${stamp}@example.com`
};
const password = crypto.randomBytes(24).toString("base64url");
const inviteIds = [];
const userIds = [];
const results = [];

try {
  const adminLogin = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: { email: env.STAGING_ADMIN_EMAIL, password: env.STAGING_ADMIN_PASSWORD }
  });
  if (adminLogin.status !== 200 || !adminLogin.cookie) throw new Error("管理员登录失败");

  const ordersResponse = await request(baseUrl, "/api/orders", { cookie: adminLogin.cookie });
  const orders = ordersResponse.json?.data ?? [];
  const scopedOrder = orders[0];
  const otherOrder = orders.find((order) => order.customer_name !== scopedOrder?.customer_name);
  if (!scopedOrder || !otherOrder) throw new Error("权限测试至少需要两个客户的订单");

  const clientInvite = await request(baseUrl, "/api/auth/invites", {
    method: "POST",
    cookie: adminLogin.cookie,
    body: { role: "client", customer_name: scopedOrder.customer_name, days: 1 }
  });
  if (clientInvite.status !== 201) throw new Error(`客户邀请码创建失败：HTTP ${clientInvite.status}`);
  inviteIds.push(clientInvite.json.data.invite.id);

  const clientRegister = await request(baseUrl, "/api/auth/register", {
    method: "POST",
    body: { email: emails.client, password, inviteCode: clientInvite.json.data.code }
  });
  if (clientRegister.status !== 201 || !clientRegister.cookie) throw new Error(`客户账号创建失败：HTTP ${clientRegister.status}`);
  userIds.push(clientRegister.json.data.user.id);

  const clientOrders = await request(baseUrl, "/api/orders", { cookie: clientRegister.cookie });
  const clientOrdersScoped = (clientOrders.json?.data ?? []).every(
    (order) => order.customer_name === scopedOrder.customer_name
  );
  expectStatus(results, "客户订单列表范围", { status: clientOrdersScoped ? 200 : 403 }, 200);
  expectStatus(
    results,
    "客户读取本客户订单详情",
    await request(baseUrl, `/api/orders/${scopedOrder.id}`, { cookie: clientRegister.cookie }),
    200
  );
  expectStatus(
    results,
    "客户读取其他客户订单详情",
    await request(baseUrl, `/api/orders/${otherOrder.id}`, { cookie: clientRegister.cookie }),
    403
  );
  expectStatus(
    results,
    "客户读取本客户检品记录",
    await request(baseUrl, `/api/inspections?orderId=${scopedOrder.id}`, { cookie: clientRegister.cookie }),
    200
  );
  expectStatus(
    results,
    "客户读取其他客户检品记录",
    await request(baseUrl, `/api/inspections?orderId=${otherOrder.id}`, { cookie: clientRegister.cookie }),
    403
  );
  expectStatus(
    results,
    "客户读取其他客户二次检品记录",
    await request(baseUrl, `/api/reinspections?orderId=${otherOrder.id}`, { cookie: clientRegister.cookie }),
    403
  );
  expectStatus(
    results,
    "客户创建订单",
    await request(baseUrl, "/api/orders", { method: "POST", cookie: clientRegister.cookie, body: {} }),
    403
  );
  const uploadForm = new FormData();
  uploadForm.append("file", new Blob(["blocked"], { type: "text/plain" }), "blocked.txt");
  uploadForm.append("bucket", "order-attachments");
  uploadForm.append("path", `${clientRegister.json.data.user.id}/blocked.txt`);
  expectStatus(
    results,
    "客户上传文件",
    await request(baseUrl, "/api/uploads", { method: "POST", cookie: clientRegister.cookie, form: uploadForm }),
    403
  );
  expectStatus(
    results,
    "客户访问管理员邀请码",
    await request(baseUrl, "/api/auth/invites", { cookie: clientRegister.cookie }),
    403
  );

  const fieldInvite = await request(baseUrl, "/api/auth/invites", {
    method: "POST",
    cookie: adminLogin.cookie,
    body: { role: "field_inspector", customer_name: scopedOrder.customer_name, days: 1 }
  });
  if (fieldInvite.status !== 201) throw new Error(`外勤邀请码创建失败：HTTP ${fieldInvite.status}`);
  inviteIds.push(fieldInvite.json.data.invite.id);

  const fieldRegister = await request(baseUrl, "/api/auth/register", {
    method: "POST",
    body: { email: emails.field, password, inviteCode: fieldInvite.json.data.code }
  });
  if (fieldRegister.status !== 201 || !fieldRegister.cookie) throw new Error(`外勤账号创建失败：HTTP ${fieldRegister.status}`);
  userIds.push(fieldRegister.json.data.user.id);

  const fieldOrders = await request(baseUrl, "/api/orders", { cookie: fieldRegister.cookie });
  const fieldOrdersScoped = (fieldOrders.json?.data ?? []).every(
    (order) => order.inspection_plan === "field"
  );
  expectStatus(results, "外勤订单列表仅含 field", { status: fieldOrdersScoped ? 200 : 403 }, 200);
  expectStatus(
    results,
    "外勤读取普通订单详情",
    await request(baseUrl, `/api/orders/${scopedOrder.id}`, { cookie: fieldRegister.cookie }),
    403
  );
  expectStatus(
    results,
    "外勤创建普通检品记录",
    await request(baseUrl, "/api/inspections", {
      method: "POST",
      cookie: fieldRegister.cookie,
      body: { order_id: scopedOrder.id, inspection_stage: "normal" }
    }),
    403
  );
  expectStatus(
    results,
    "外勤访问管理员邀请码",
    await request(baseUrl, "/api/auth/invites", { cookie: fieldRegister.cookie }),
    403
  );

  for (const result of results) {
    console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}: ${result.status}（预期 ${result.expected}）`);
  }
  if (results.some((result) => !result.pass)) process.exitCode = 1;
} finally {
  const databaseUrl = new URL(env.STAGING_DATABASE_URL);
  databaseUrl.hostname = "127.0.0.1";
  databaseUrl.port = "5433";
  const client = new pg.Client({ connectionString: databaseUrl.toString() });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(
      "delete from public.registration_invites where used_by_email = any($1::text[]) or id = any($2::uuid[])",
      [Object.values(emails), inviteIds]
    );
    await client.query("delete from public.users where email = any($1::text[])", [Object.values(emails)]);
    await client.query("commit");
    const users = await client.query(
      "select count(*)::int as n from public.users where email = any($1::text[])",
      [Object.values(emails)]
    );
    const invites = await client.query(
      "select count(*)::int as n from public.registration_invites where id = any($1::uuid[])",
      [inviteIds]
    );
    console.log(`cleanup_users=${users.rows[0].n}`);
    console.log(`cleanup_invites=${invites.rows[0].n}`);
    if (users.rows[0].n !== 0 || invites.rows[0].n !== 0) process.exitCode = 1;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
