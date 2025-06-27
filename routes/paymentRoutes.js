import express from 'express';
import { createCheckoutSession } from '../controllers/paymentController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/pay/:id', authenticateToken, createCheckoutSession);

export default router;