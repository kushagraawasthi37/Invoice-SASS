import { Router } from 'express';
import multer from 'multer';
import { templateController } from '../controllers/template.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authenticate as never);

router.get('/', templateController.list as never);
router.post('/upload', upload.single('pdf'), templateController.upload as never);
router.get('/:id', templateController.getById as never);
router.get('/:id/analysis', templateController.getAnalysis as never);
router.post('/:id/correct-mapping', templateController.correctMapping as never);
router.post('/:id/reanalyze', templateController.reanalyze as never);
router.put('/:id', templateController.update as never);
router.delete('/:id', templateController.delete as never);

export default router;
