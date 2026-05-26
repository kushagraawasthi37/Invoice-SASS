import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// ── Driver selection ──────────────────────────────────────────────────────────
//
// Production (Render): use SendGrid HTTP API — Render's free tier blocks all
//   outbound SMTP (ports 25 / 465 / 587) at the network level, so nodemailer
//   cannot connect regardless of credentials or timeout settings.
//
// Local dev / no SendGrid key: fall back to nodemailer with Gmail SMTP, which
//   works fine from a developer machine.

type Driver = 'sendgrid' | 'nodemailer' | 'none';

function resolveDriver(): Driver {
  if (env.SENDGRID_API_KEY) return 'sendgrid';
  if (env.SMTP_USER && env.SMTP_PASS)  return 'nodemailer';
  return 'none';
}

const driver = resolveDriver();

// ── SendGrid init ─────────────────────────────────────────────────────────────
if (driver === 'sendgrid') {
  sgMail.setApiKey(env.SENDGRID_API_KEY!);
  logger.info('Email driver: SendGrid');
}

// ── Nodemailer init (dev fallback) ────────────────────────────────────────────
const smtpTransport = driver === 'nodemailer'
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 10_000,
      greetingTimeout:    5_000,
      socketTimeout:     15_000,
    })
  : null;

if (smtpTransport) {
  smtpTransport.verify()
    .then(() => logger.info('Email driver: nodemailer (SMTP ready)', { user: env.SMTP_USER }))
    .catch((err: unknown) => logger.warn('SMTP verify failed', { err }));
}

if (driver === 'none') {
  logger.warn('Email driver: none — set SENDGRID_API_KEY or SMTP_USER/SMTP_PASS');
}

// ── Core send ─────────────────────────────────────────────────────────────────
async function send(to: string, subject: string, html: string): Promise<void> {
  const from = `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`;

  if (driver === 'sendgrid') {
    await sgMail.send({ to, from, subject, html });
    logger.debug('Email sent via SendGrid', { to, subject });
    return;
  }

  if (driver === 'nodemailer' && smtpTransport) {
    const info = await smtpTransport.sendMail({ from, to, subject, html });
    logger.debug('Email sent via SMTP', { to, subject, messageId: info.messageId });
    return;
  }

  logger.warn('Email not sent — no driver configured', { to, subject });
}

// ── Templates ─────────────────────────────────────────────────────────────────
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
