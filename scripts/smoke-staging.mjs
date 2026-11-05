import fs from "node:fs/promises";
import crypto from "node:crypto";
import COS from "cos-nodejs-sdk-v5";

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

async function jsonResponse(response) {
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error?.message || `HTTP ${response.status}`);
  return body.data;
}

const env = readEnv(await fs.readFile("deploy/staging/.env.staging", "utf8"));
const baseUrl = "http://127.0.0.1:9443";
let uploadedPath = "";

try {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: env.STAGING_ADMIN_EMAIL,
      password: env.STAGING_ADMIN_PASSWORD
    })
  });
  const login = await jsonResponse(loginResponse);
  const setCookie = loginResponse.headers.getSetCookie?.()[0] ?? loginResponse.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  if (!cookie) throw new Error("登录响应没有会话 Cookie");

  const session = await jsonResponse(
    await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } })
  );
  const orders = await jsonResponse(
    await fetch(`${baseUrl}/api/orders`, { headers: { Cookie: cookie } })
  );

  const objectPath = `${login.user.id}/healthcheck/${crypto.randomUUID()}.txt`;
  const form = new FormData();
  form.append("file", new Blob(["qcflow-staging-storage-ok"], { type: "text/plain" }), "healthcheck.txt");
  form.append("bucket", "order-attachments");
  form.append("path", objectPath);
  const upload = await jsonResponse(
    await fetch(`${baseUrl}/api/uploads`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: form
    })
  );
  uploadedPath = upload.path;

  const proxyResponse = await fetch(`${baseUrl}${upload.url}`, { headers: { Cookie: cookie } });
  const proxyBody = await proxyResponse.text();
  if (!proxyResponse.ok || proxyBody.trim() !== "qcflow-staging-storage-ok") {
    throw new Error(
      `私有对象代理读取失败：HTTP ${proxyResponse.status}，长度 ${proxyBody.length}，内容 ${JSON.stringify(proxyBody.slice(0, 80))}`
    );
  }

  console.log(`login=${login.user.email}`);
  console.log(`role=${session.profile.role}`);
  console.log(`orders=${orders.length}`);
  console.log("private_storage_proxy=ok");
} finally {
  if (uploadedPath) {
    const client = new COS({
      SecretId: env.STAGING_COS_SECRET_ID,
      SecretKey: env.STAGING_COS_SECRET_KEY
    });
    await client.deleteObject({
      Bucket: env.STAGING_COS_BUCKET_ORDER_ATTACHMENTS,
      Region: env.STAGING_COS_REGION,
      Key: uploadedPath
    });
    console.log("cos_cleanup=ok");
  }
}
