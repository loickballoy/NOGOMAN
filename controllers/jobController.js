import pool from '../db/index.js';

export const createJob = async (req, res) => {
  const { title, description, location, max_worker } = req.body;
  const user = req.user;

  if (user.role !== 'FARMER') {
    return res.status(403).json({ message: 'Seuls les FARMER peuvent créer des jobs.' });
  }

  if (!title || !description || !location) {
    return res.status(400).json({ message: 'Tous les champs sont requis.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO jobs (title, description, location, farmer_id, max_workers)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [title, description, location, user.id, max_worker || 1]
    );

    res.status(201).json({ message: 'Job créé avec succès.', job: result.rows[0] });
  } catch (err) {
    console.error('Erreur createJob:', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

export const getAllJobs = async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          jobs.id, title, description, jobs.location, status, jobs.created_at,
          users.name AS farmer_name
        FROM jobs
        JOIN users ON users.id = jobs.farmer_id
        WHERE status = 'OPEN'
        ORDER BY created_at DESC
      `);
  
      res.status(200).json({ jobs: result.rows });
    } catch (err) {
      console.error('Erreur getAllJobs:', err.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
};

export const closeJob = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    const result = await pool.query('SELECT * FROM jobs WHERE id = $1 AND farmer_id = $2', [id, user.id]);

    if (result.rows.length === 0) {
      return res.status(403).json({ message: 'Job introuvable ou non autorisé.' });
    }

    await pool.query(`UPDATE jobs SET status = 'ASSIGNED' WHERE id = $1`, [id]);

    res.status(200).json({ message: 'Job clôturé manuellement.' });
  } catch (err) {
    console.error('Erreur closeJob:', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

export const completeJob = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    // Vérifie que le job existe et appartient au fermier
    const job = await pool.query(
      'SELECT * FROM jobs WHERE id = $1 AND farmer_id = $2',
      [id, user.id]
    );

    if (job.rows.length === 0) {
      return res.status(403).json({ message: 'Ce job ne vous appartient pas ou n’existe pas.' });
    }

    // Mise à jour
    await pool.query(
      'UPDATE jobs SET status = $1 WHERE id = $2',
      ['COMPLETED', id]
    );

    res.status(200).json({ message: 'Job marqué comme terminé.' });
  } catch (err) {
    console.error('Erreur completeJob:', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};