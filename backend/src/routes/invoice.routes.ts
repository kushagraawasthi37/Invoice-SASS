import { Router } from 'express';
import { invoiceController } from '../controllers/invoice.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkPdfLimit } from '../middleware/subscription.middleware';
import { pdfLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate as never);

router.get('/stats', invoiceController.getStats as never);
router.get('/', invoiceController.list as never);
router.post('/', invoiceController.create as never);
router.get('/:id', invoiceController.getById as never);
router.put('/:id', invoiceController.update as never);
router.delete('/:id', invoiceController.delete as never);
router.post('/:id/duplicate', invoiceController.duplicate as never);
router.post('/:id/pdf', pdfLimiter, checkPdfLimit as never, invoiceController.generatePdf as never);

export default router;
