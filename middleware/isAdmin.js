import dotenv from 'dotenv';
dotenv.config();

export const isAdmin = (req, res, next) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Accès réservé à l’administrateur.' });
    }
    next();
  };