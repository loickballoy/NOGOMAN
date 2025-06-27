import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../db/index.js';
import dotenv from 'dotenv';
dotenv.config();

const VALID_ROLES = ['FARMER', 'WORKER', 'ADMIN'];



export const signup = async (req, res) => {
  const { email, password, role, name, phone, location } = req.body;

  // Vérification des champs obligatoires
  if (!email || !password || !role || !name || !phone || !location) {
    return res.status(400).json({ message: 'Tous les champs sont obligatoires.' });
  }

  // Vérification du rôle
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ message: 'Rôle invalide. Doit être FARMER ou WORKER.' });
  }

  try {
    // Vérifie si l'utilisateur existe déjà
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'Email déjà utilisé.' });
    }

    // Hash du mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insertion de l'utilisateur
    const result = await pool.query(
      `INSERT INTO users (email, password, role, name, phone, location)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, role, name, phone, location`,
      [email, hashedPassword, role, name, phone, location]
    );

    const newUser = result.rows[0];

    // Création du token
    const token = jwt.sign({ id: newUser.id, role: newUser.role }, process.env.JWT_SECRET, {
      expiresIn: '1d'
    });

    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Stocke ce token dans une table verification_tokens
    await pool.query(
      `INSERT INTO verification_tokens (user_id, token) VALUES ($1, $2)`,
      [newUser.id, verificationToken]
    );

    // Envoie un email
    const verificationLink = `http://localhost:3000/verify-email?token=${verificationToken}`;
    sendVerificationEmail(newUser.email, verificationLink); // fonction à créer

    res.status(201).json({ token, user: newUser });
  } catch (err) {
    console.error('Erreur dans signup :', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

export const login = async (req, res) => {
    const { email, password } = req.body;
  
    // Vérifie que les champs sont présents
    if (!email || !password) {
      return res.status(400).json({ message: 'Email et mot de passe obligatoires.' });
    }
  
    try {
      // Recherche de l'utilisateur
      const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      const user = userResult.rows[0];
  
      if (!user) {
        return res.status(401).json({ message: 'Identifiants incorrects.' });
      }
  
      // Comparaison des mots de passe
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Identifiants incorrects.' });
      }
  
      // Génère le token JWT
      const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: '1d'
      });
  
      // Supprime le mot de passe de la réponse
      delete user.password;
  
      res.status(200).json({ token, user });
    } catch (err) {
      console.error('Erreur dans login :', err.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  };
  
