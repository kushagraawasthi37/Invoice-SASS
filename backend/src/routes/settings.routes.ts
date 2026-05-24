import { Router } from 'express';
import { settingsController, upload } from '../controllers/settings.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate as never);

router.get('/workspace', settingsController.get as never);
router.put('/workspace', settingsController.update as never);
router.post('/workspace/logo', upload.single('logo'), settingsController.uploadLogo as never);
router.get('/profile', settingsController.getProfile as never);
router.put('/profile', settingsController.updateProfile as never);

export default router;
