import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../types';
import { stripeService } from '../services/stripe.service';
import { prisma } from '../config/database';
import { PLANS } from '../config/stripe';

export const paymentController = {
  async createCheckout(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { plan } = z.object({
        plan: z.enum(['PRO_MONTHLY', 'PRO_YEARLY']),
      }).parse(req.body);

      const url = await stripeService.createCheckoutSession(
        req.user.workspace.id,
        req.user.email,
        req.user.name,
        plan,
      );

      res.json({ success: true, data: { url } });
    } catch (err) {
      next(err);
    }
  },

  async createPortal(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const url = await stripeService.createPortalSession(req.user.workspace.id);
      res.json({ success: true, data: { url } });
    } catch (err) {
      next(err);
    }
  },

  async getSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const sub = await prisma.subscription.findUnique({
        where: { workspaceId: req.user.workspace.id },
      });
      const usage = await prisma.usageTracking.findUnique({
        where: { workspaceId: req.user.workspace.id },
      });

      res.json({
        success: true,
        data: {
          subscription: sub,
          usage,
          plans: PLANS,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async webhook(req: Request, res: Response, next: NextFunction) {
    try {
      const signature = req.headers['stripe-signature'] as string;
      await stripeService.handleWebhook(req.body as Buffer, signature);
      res.json({ received: true });
    } catch (err) {
      next(err);
    }
  },
};
