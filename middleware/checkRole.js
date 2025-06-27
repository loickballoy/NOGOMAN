import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

export const checkRole = (requiredRole) => {
    return (req, res, next) => {
      if (req.user?.role !== requiredRole) {
        return res.status(403).json({ message: `Accès réservé au rôle : ${requiredRole}` });
      }
      next();
    };
  };