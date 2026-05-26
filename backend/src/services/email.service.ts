import sgMail from '@sendgrid/mail';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Trim all email-related env values — copy-paste into Render dashboard can
// silently introduce leading/trailing whitespace that causes 400 Bad Request.
const FROM_EMAIL = env.EMAIL_FROM.trim();
const FROM_NAME  = env.EMAIL_FROM_NAME.trim();

if (!env.SENDGRID_API_KEY) {
  logger.warn('SENDGRID_API_KEY not set — emails will not be sent');
} else {
  sgMail.setApiKey(env.SENDGRID_API_KEY.trim());
  logger.info('Email driver: SendGrid', { from: FROM_EMAIL });
}

type SgError = Error & {
  code?: number;
  response?: { body?: { errors?: Array<{ message: string; field?: string }> } };
};

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!env.SENDGRID_API_KEY) {
    logger.warn('Email skipped — no SENDGRID_API_KEY', { to, subject });
    return;
  }
  try {
    await sgMail.send({ to, from: { name: FROM_NAME, email: FROM_EMAIL }, subject, html });
    logger.debug('Email sent', { to, subject });
  } catch (raw: unknown) {
    const err = raw as SgError;
    // Log SendGrid's field-level errors so the real cause is visible in Render logs
    logger.error('SendGrid send failed', {
      to,
      from: FROM_EMAIL,
      subject,
      statusCode: err.code,
      sgErrors: err.response?.body?.errors ?? [],
      message: err.message,
    });
    throw err;
  }
}

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
       <p>Download: <a href="${pdfUrl}">Download Invoice PDF</a></p>
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
