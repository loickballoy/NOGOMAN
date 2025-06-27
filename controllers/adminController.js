import pool from '../db/index.js';

export const getAllUsers = async (req, res) => {
  try {
    const users = await pool.query('SELECT id, email, name, role, location, created_at FROM users');
    res.status(200).json(users.rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur récupération users' });
  }
};

export const getAllJobs = async (req, res) => {
  try {
    const jobs = await pool.query(`
      SELECT j.id, j.title, j.status, j.max_workers, j.location, u.name AS farmer_name
      FROM jobs j
      JOIN users u ON j.farmer_id = u.id
      ORDER BY j.created_at DESC
    `);
    res.status(200).json(jobs.rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur récupération jobs' });
  }
};

export const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.status(200).json({ message: 'Utilisateur supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur suppression utilisateur' });
  }
};

export const completeJobManually = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      `UPDATE jobs SET status = 'COMPLETED' WHERE id = $1`,
      [id]
    );
    res.status(200).json({ message: 'Job marqué comme COMPLETED' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur update job' });
  }
};

export const suspendUser = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      `UPDATE users SET status = 'SUSPENDED' WHERE id = $1`,
      [id]
    );
    res.status(200).json({ message: 'Utilisateur suspendu' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur suspension user' });
  }
};

export const unsuspendUser = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      `UPDATE users SET status = 'ACTIVE' WHERE id = $1`,
      [id]
    );
    res.status(200).json({ message: 'Utilisateur réactivé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur réactivation user' });
  }
};