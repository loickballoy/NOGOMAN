import express from 'express';
import { getAllUsers, getAllJobs, deleteUser, completeJobManually, suspendUser, unsuspendUser} from '../controllers/adminController.js';
import { authenticateToken } from '../middleware/auth.js';
import { isAdmin } from '../middleware/isAdmin.js';

const router = express.Router();

router.get('/users', authenticateToken, isAdmin, getAllUsers);
router.get('/jobs', authenticateToken, isAdmin, getAllJobs);
router.delete('/users/:id', authenticateToken, isAdmin, deleteUser);
router.patch('/jobs/:id/complete', authenticateToken, isAdmin, completeJobManually);
router.patch('/users/:id/suspend', authenticateToken, isAdmin, suspendUser);
router.patch('/users/:id/unsuspend', authenticateToken, isAdmin, unsuspendUser);

export default router;