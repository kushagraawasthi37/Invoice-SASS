import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { PaymentRequiredError } from './errorHandler';
import { FREE_PDF_LIMIT } from '../config/stripe';
import { prisma } from '../config/database';

export function requirePro(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const sub = req.user.workspace.subscription;
  if (!sub || sub.plan === 'FREE') {
    next(new PaymentRequiredError('This feature requires a Pro subscription'));
    return;
  }
  if (sub.status !== 'ACTIVE' && sub.status !== 'TRIALING') {
    next(new PaymentRequiredError('Your subscription is not active'));
    return;
  }
  next();
}

export async function checkPdfLimit(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const sub = req.user.workspace.subscription;
  const isPro = sub && sub.plan !== 'FREE' && (sub.status === 'ACTIVE' || sub.status === 'TRIALING');

  if (isPro) {
    next();
    return;
  }

  const workspaceId = req.user.workspace.id;
  const usage = await prisma.usageTracking.findUnique({ where: { workspaceId } });

  // Monthly reset: if current calendar month differs from resetAt, reset counter
  const now = new Date();
  const resetAt = usage?.resetAt ?? new Date(0);
  if (
    now.getFullYear() !== resetAt.getFullYear() ||
    now.getMonth() !== resetAt.getMonth()
  ) {
    await prisma.usageTracking.upsert({
      where: { workspaceId },
      update: { pdfDownloads: 0, resetAt: now },
      create: { workspaceId, pdfDownloads: 0, resetAt: now },
    });
    next();
    return;
  }

  const downloads = usage?.pdfDownloads ?? 0;

  if (downloads >= FREE_PDF_LIMIT) {
    next(
      new PaymentRequiredError(
        `You've used all ${FREE_PDF_LIMIT} free PDF downloads this month. Upgrade to Pro for unlimited downloads.`,
      ),
    );
    return;
  }

  next();
}
