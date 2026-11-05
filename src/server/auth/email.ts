import "server-only";

import nodemailer from "nodemailer";

import { ApiError } from "@/src/server/errors";

function requireEmailConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM?.trim() || user;
  const baseUrl = process.env.AUTH_BASE_URL?.trim().replace(/\/+$/, "");

  if (!host || !Number.isInteger(port) || port <= 0 || !user || !pass || !from || !baseUrl) {
    throw new ApiError("密码重置邮件服务尚未配置", 503, "EMAIL_NOT_CONFIGURED");
  }

  return {
    host,
    port,
    secure: process.env.SMTP_SECURE !== "false",
    auth: { user, pass },
    from,
    baseUrl
  };
}

export async function sendPasswordResetEmail(input: { email: string; token: string }): Promise<void> {
  const config = requireEmailConfig();
  const resetUrl = `${config.baseUrl}/login/reset?token=${encodeURIComponent(input.token)}`;
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth
  });

  try {
    await transport.sendMail({
      from: config.from,
      to: input.email,
      subject: "QCFlow 密码重置",
      text: `请在 30 分钟内打开以下链接重置密码：\n${resetUrl}\n\n如果不是你发起的请求，请忽略此邮件。`,
      html: `<p>请在 30 分钟内打开以下链接重置密码：</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>如果不是你发起的请求，请忽略此邮件。</p>`
    });
  } catch {
    throw new ApiError("密码重置邮件发送失败，请稍后重试", 503, "EMAIL_SEND_FAILED");
  }
}
