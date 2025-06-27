import express from 'express';
import { signup , login } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);

// Route protégée par token
router.get('/me', authenticateToken, (req, res) => {
    res.status(200).json({
      message: '✅ Accès autorisé',
      user: req.user
    });
  });

router.get('/verify-email', async (req, res) => {
    const { token } = req.query;
  
    try {
      const result = await pool.query(
        'SELECT user_id FROM verification_tokens WHERE token = $1',
        [token]
      );
  
      if (result.rows.length === 0) {
        return res.status(400).json({ message: 'Token invalide ou expiré' });
      }
  
      const userId = result.rows[0].user_id;
  
      await pool.query('UPDATE users SET email_verified = true WHERE id = $1', [userId]);
      await pool.query('DELETE FROM verification_tokens WHERE user_id = $1', [userId]);
  
      res.status(200).json({ message: 'Email vérifié avec succès' });
    } catch (err) {
      console.error('Erreur vérification email :', err.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

export default router;