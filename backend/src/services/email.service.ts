import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// ── Transporter factory ────────────────────────────────────────────────────────
//
// Use `service: 'gmail'` over manual host/port because:
//   - It selects port 465 (SSL/TLS) automatically — more reliable on cloud hosts
//     than port 587 (STARTTLS), which can time out on Render's infrastructure
//   - No risk of mismatched `secure` flag
//
// Timeouts are mandatory for production: without them a stalled SMTP connection
// hangs the request indefinitely (Render's default request timeout will kill it,
// but the node process keeps the socket open until process restart).

function createTransporter(): Transporter {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    logger.warn('SMTP credentials not configured — emails will not be sent (jsonTransport active)');
    return nodemailer.createTransport({ jsonTransport: true });
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    connectionTimeout: 10_000,
    greetingTimeout:   5_000,
    socketTimeout:     15_000,
  });
}

const transporter = createTransporter();

// Verify SMTP config at startup so misconfiguration surfaces immediately in logs.
// Non-fatal: a verify failure logs a warning but does not crash the server.
if (env.SMTP_USER && env.SMTP_PASS) {
  transporter.verify()
    .then(() => logger.info('SMTP ready', { user: env.SMTP_USER }))
    .catch((err: unknown) =>
      logger.warn('SMTP verify failed — check credentials and App Password', { err }),
    );
}

// ── Core send helper ───────────────────────────────────────────────────────────
// Throws on failure so call-site .catch() handlers in auth.service.ts work.
async function send(to: string, subject: string, html: string): Promise<void> {
  const info = await transporter.sendMail({
    from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM}>`,
    to,
    subject,
    html,
  });
  logger.debug('Email sent', { to, subject, messageId: info.messageId });
}

// ── Email templates ────────────────────────────────────────────────────────────
export const emailService = {
  async sendVerification(email: string, name: string, token: string): Promise<void> {
    const url = `${env.FRONTEND_URL}/verify-email?token=${token}`;
    await send(
      email,
      'Verify your InvoiceFlow email',
      `<p>Hi ${name},</p>
       <p>Click below to verify your email address:</p>
       <a href="${url}" style="background:#2c5f2e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0;">Verify Email</a>
       <p>This link expires in 24 hours.</p>
       <p>If you didn't sign up, ignore this email.</p>`,
    );
  },

  async sendPasswordReset(email: string, name: string, token: string): Promise<void> {
    const url = `${env.FRONTEND_URL}/reset-password?token=${token}`;
    await send(
      email,
      'Reset your InvoiceFlow password',
      `<p>Hi ${name},</p>
       <p>Click below to reset your password. This link expires in 1 hour.</p>
       <a href="${url}" style="background:#2c5f2e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0;">Reset Password</a>
       <p>If you didn't request this, ignore this email.</p>`,
    );
  },

  async sendInvoiceEmail(
    to: string,
    invoiceNumber: string,
    providerName: string,
    pdfUrl: string,
  ): Promise<void> {
    await send(
      to,
      `Invoice ${invoiceNumber} from ${providerName}`,
      `<p>Please find your invoice <strong>${invoiceNumber}</strong> attached.</p>
       <p>You can download it here: <a href="${pdfUrl}">Download Invoice PDF</a></p>
       <p>Thank you,<br>${providerName}</p>`,
    );
  },

  async sendWelcome(email: string, name: string): Promise<void> {
    await send(
      email,
      'Welcome to InvoiceFlow',
      `<p>Hi ${name},</p>
       <p>Welcome to InvoiceFlow! You're ready to create NDIS-compliant invoices.</p>
       <a href="${env.FRONTEND_URL}/dashboard" style="background:#2c5f2e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0;">Go to Dashboard</a>`,
    );
  },
};
