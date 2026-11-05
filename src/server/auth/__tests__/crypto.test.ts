import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  createSessionToken,
  hashInviteCode,
  hashPassword,
  verifyPassword,
  verifySessionToken
} from "../crypto.ts";

test("scrypt 密码哈希可验证且不保存明文", async () => {
  const stored = await hashPassword("correct horse battery staple");
  assert.ok(stored.startsWith("scrypt$"));
  assert.equal(stored.includes("correct horse battery staple"), false);
  assert.equal(await verifyPassword("correct horse battery staple", stored), true);
  assert.equal(await verifyPassword("wrong password", stored), false);
});

test("邀请码哈希与服务端既有十六进制 SHA-256 口径一致", () => {
  const normalized = "ABCDEF123456";
  const expected = createHash("sha256").update(normalized).digest("hex");
  assert.equal(hashInviteCode("abcd-ef12-3456"), expected);
});

test("JWT 可验证、拒绝篡改并拒绝过期令牌", () => {
  const secret = "x".repeat(40);
  const expiresAt = new Date(Date.now() + 60_000);
  const token = createSessionToken({
    userId: "11111111-1111-4111-8111-111111111111",
    email: "user@example.com",
    sessionId: "22222222-2222-4222-8222-222222222222",
    expiresAt,
    secret
  });

  const claims = verifySessionToken(token, secret);
  assert.equal(claims?.sub, "11111111-1111-4111-8111-111111111111");
  assert.equal(claims?.sid, "22222222-2222-4222-8222-222222222222");
  assert.equal(verifySessionToken(`${token}x`, secret), null);
  assert.equal(verifySessionToken(token, `${secret}x`), null);

  const expired = createSessionToken({
    userId: "11111111-1111-4111-8111-111111111111",
    email: "user@example.com",
    sessionId: "22222222-2222-4222-8222-222222222222",
    expiresAt: new Date(Date.now() - 60_000),
    secret
  });
  assert.equal(verifySessionToken(expired, secret), null);
});
