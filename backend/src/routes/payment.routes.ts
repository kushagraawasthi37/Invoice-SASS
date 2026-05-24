import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import { paymentController } from '../controllers/payment.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Stripe webhooks need raw body
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  paymentController.webhook,
);

router.use(authenticate as never);

router.get('/subscription', paymentController.getSubscription as never);
router.post('/checkout', paymentController.createCheckout as never);
router.post('/portal', paymentController.createPortal as never);

export default router;
