import "server-only";

import nodemailer from "nodemailer";
import * as tencentcloud from "tencentcloud-sdk-nodejs-ses";
import type { SendEmailRequest } from "tencentcloud-sdk-nodejs-ses/tencentcloud/services/ses/v20201002/ses_models";

import { ApiError } from "@/src/server/errors";

type EmailProvider = "smtp" | "tencent-ses";

function getEmailProvider(): EmailProvider {
  const configured = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (configured === "tencent-ses") return "tencent-ses";
  if (configured === "smtp") return "smtp";
  return process.env.TENCENT_SES_SECRET_ID?.trim() ? "tencent-ses" : "smtp";
}

function baseUrl() {
  const value = process.env.AUTH_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new ApiError("密码重置邮件服务尚未配置", 503, "EMAIL_NOT_CONFIGURED");
  return value;
}

function requireSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!host || !Number.isInteger(port) || port <= 0 || !user || !pass || !from) {
    throw new ApiError("密码重置邮件服务尚未配置", 503, "EMAIL_NOT_CONFIGURED");
  }

  return {
    host,
    port,
    secure: process.env.SMTP_SECURE !== "false",
    auth: { user, pass },
    from,
    baseUrl: baseUrl()
  };
}

function requireTencentSesConfig() {
  const secretId = process.env.TENCENT_SES_SECRET_ID?.trim();
  const secretKey = process.env.TENCENT_SES_SECRET_KEY?.trim();
  const region = process.env.TENCENT_SES_REGION?.trim() || "ap-guangzhou";
  const from = process.env.TENCENT_SES_FROM_EMAIL?.trim();
  const templateId = Number(process.env.TENCENT_SES_TEMPLATE_ID);

  if (
    !secretId ||
    !secretKey ||
    !from ||
    !Number.isInteger(templateId) ||
    templateId <= 0
  ) {
    throw new ApiError("密码重置邮件服务尚未配置", 503, "EMAIL_NOT_CONFIGURED");
  }

  return { secretId, secretKey, region, from, templateId };
}

async function sendWithTencentSes(input: { email: string; token: string }): Promise<void> {
  const config = requireTencentSesConfig();
  const client = new tencentcloud.ses.v20201002.Client({
    credential: { secretId: config.secretId, secretKey: config.secretKey },
    region: config.region,
    profile: { httpProfile: { endpoint: "ses.tencentcloudapi.com" } }
  });
  const request: SendEmailRequest = {
    FromEmailAddress: config.from,
    Destination: [input.email],
    Subject: "QCFlow 密码重置",
    Template: {
      TemplateID: config.templateId,
      TemplateData: JSON.stringify({ reset_token: input.token })
    },
    TriggerType: 1
  };

  try {
    await client.SendEmail(request);
  } catch {
    throw new ApiError("密码重置邮件发送失败，请稍后重试", 503, "EMAIL_SEND_FAILED");
  }
}

async function sendWithSmtp(input: { email: string; token: string }): Promise<void> {
  const config = requireSmtpConfig();
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

export async function sendPasswordResetEmail(input: { email: string; token: string }): Promise<void> {
  if (getEmailProvider() === "tencent-ses") {
    await sendWithTencentSes(input);
    return;
  }
  await sendWithSmtp(input);
}
