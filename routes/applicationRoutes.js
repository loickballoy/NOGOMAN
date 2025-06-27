import express from 'express';
import { applyToJob, getJobApplications, updateApplicationStatus, getMyApplications, getAcceptedJobs } from '../controllers/applicationController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/:id/apply', authenticateToken, applyToJob);
router.get('/:id/applications', authenticateToken, getJobApplications);
router.patch('/application/:id/status', authenticateToken, updateApplicationStatus);
router.get('/me/applications', authenticateToken, getMyApplications);
router.get('/me/accepted-jobs', authenticateToken, getAcceptedJobs);

export default router;