import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env, isEmailConfigured } from "@/lib/config";

/**
 * Transactional email over SMTP (Gmail app password by default — see
 * .env.example). The transporter is created lazily and reused across sends.
 */

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  if (!isEmailConfigured) {
    transporter = null;
    return null;
  }
  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    // 465 = implicit TLS; 587 negotiates STARTTLS automatically.
    secure: env.smtpPort === 465,
    auth: { user: env.smtpUser, pass: env.smtpPass },
  });
  return transporter;
}

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendResult> {
  const transport = getTransporter();
  if (!transport || !env.emailFrom) {
    return { ok: false, error: "Email is not configured (SMTP_* env vars missing)." };
  }
  try {
    await transport.sendMail({
      from: env.emailFrom,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "SMTP send failed.",
    };
  }
}
