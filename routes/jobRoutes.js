import express from 'express';
import { createJob, getAllJobs, closeJob, completeJob } from '../controllers/jobController.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkRole } from '../middleware/checkRole.js';

const router = express.Router();

router.post('/', authenticateToken, checkRole('FARMER'), createJob);
router.get('/', getAllJobs)
router.patch('/:id/close', authenticateToken, checkRole('FARMER'), closeJob);
router.patch('/:id/complete', authenticateToken, checkRole('FARMER'), completeJob);

export default router;