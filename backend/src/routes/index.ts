import { Router } from 'express';
import authRoutes from './auth.routes';
import invoiceRoutes from './invoice.routes';
import templateRoutes from './template.routes';
import paymentRoutes from './payment.routes';
import settingsRoutes from './settings.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/templates', templateRoutes);
router.use('/payments', paymentRoutes);
router.use('/settings', settingsRoutes);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
