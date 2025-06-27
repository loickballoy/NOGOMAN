import pool from '../db/index.js';

export const applyToJob = async (req, res) => {
  const worker = req.user;
  const jobId = req.params.id;
  const { message } = req.body;

  if (worker.role !== 'WORKER') {
    return res.status(403).json({ message: 'Seuls les WORKER peuvent postuler à un job.' });
  }

  try {
    // Vérifie que le job existe et est encore ouvert
    const jobResult = await pool.query('SELECT * FROM jobs WHERE id = $1 AND status = $2', [jobId, 'OPEN']);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ message: 'Job introuvable ou fermé.' });
    }

    // Vérifie que ce worker n'a pas déjà postulé
    const existing = await pool.query(
      'SELECT * FROM applications WHERE job_id = $1 AND worker_id = $2',
      [jobId, worker.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Vous avez déjà postulé à ce job.' });
    }

    // Crée la candidature
    const result = await pool.query(
      `INSERT INTO applications (job_id, worker_id, message)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [jobId, worker.id, message || null]
    );

    res.status(201).json({ message: 'Candidature envoyée.', application: result.rows[0] });
  } catch (err) {
    console.error('Erreur applyToJob:', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

export const getJobApplications = async (req, res) => {
    const user = req.user;
    const jobId = req.params.id;
  
    if (user.role !== 'FARMER') {
      return res.status(403).json({ message: 'Accès réservé aux FARMER' });
    }
  
    try {
      // Vérifie que le job appartient au FARMER connecté
      const jobCheck = await pool.query('SELECT * FROM jobs WHERE id = $1 AND farmer_id = $2', [jobId, user.id]);
      if (jobCheck.rows.length === 0) {
        return res.status(403).json({ message: 'Ce job ne vous appartient pas.' });
      }
  
      // Récupère les candidatures
      const result = await pool.query(`
        SELECT applications.*, users.name AS worker_name, users.phone AS worker_phone
        FROM applications
        JOIN users ON users.id = applications.worker_id
        WHERE applications.job_id = $1
        ORDER BY applications.created_at DESC
      `, [jobId]);
  
      res.status(200).json({ applications: result.rows });
    } catch (err) {
      console.error('Erreur getJobApplications:', err.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  };

export const updateApplicationStatus = async (req, res) => {
    const user = req.user;
    const appId = req.params.id;
    const { status } = req.body;
  
    if (user.role !== 'FARMER') {
      return res.status(403).json({ message: 'Accès réservé aux FARMER' });
    }
  
    if (!['ACCEPTED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ message: 'Statut invalide' });
    }
  
    try {
      // Vérifie que la candidature existe et appartient à un de ses jobs
      const result = await pool.query(`
        SELECT applications.*, jobs.farmer_id
        FROM applications
        JOIN jobs ON jobs.id = applications.job_id
        WHERE applications.id = $1
      `, [appId]);
  
      const app = result.rows[0];
  
      if (!app || app.farmer_id !== user.id) {
        return res.status(403).json({ message: 'Candidature non trouvée ou non autorisée.' });
      }
  
      // Mise à jour
      const update = await pool.query(
        'UPDATE applications SET status = $1 WHERE id = $2 RETURNING *',
        [status, appId]
      );

      if (status === 'ACCEPTED') {
        // Compter le nombre d’acceptés sur ce job
        const countAccepted = await pool.query(`
          SELECT COUNT(*) FROM applications
          WHERE job_id = $1 AND status = 'ACCEPTED'
        `, [app.job_id]);
      
        const acceptedCount = parseInt(countAccepted.rows[0].count);
      
        if (acceptedCount >= app.max_workers) {
          await pool.query(`
            UPDATE jobs SET status = 'ASSIGNED' WHERE id = $1
          `, [app.job_id]);
        }
      }
  
      res.status(200).json({ message: `Candidature ${status.toLowerCase()}.`, application: update.rows[0] });
    } catch (err) {
      console.error('Erreur updateApplicationStatus:', err.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  };

export const getMyApplications = async (req, res) => {
  const user = req.user;

  if (user.role !== 'WORKER') {
    return res.status(403).json({ message: 'Accès réservé aux WORKER' });
  }

  try {
    const result = await pool.query(`
      SELECT 
        applications.*, 
        jobs.title, jobs.location, jobs.description, jobs.created_at AS job_created
      FROM applications
      JOIN jobs ON jobs.id = applications.job_id
      WHERE applications.worker_id = $1
      ORDER BY applications.created_at DESC
    `, [user.id]);

    res.status(200).json({ applications: result.rows });
  } catch (err) {
    console.error('Erreur getMyApplications:', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

export const getAcceptedJobs = async (req, res) => {
  const user = req.user;

  if (user.role !== 'WORKER') {
    return res.status(403).json({ message: 'Accès réservé aux WORKER' });
  }

  try {
    const result = await pool.query(`
      SELECT 
        jobs.*, 
        applications.status,
        users.name AS farmer_name
      FROM applications
      JOIN jobs ON jobs.id = applications.job_id
      JOIN users ON users.id = jobs.farmer_id
      WHERE applications.worker_id = $1
        AND applications.status = 'ACCEPTED'
      ORDER BY jobs.created_at DESC
    `, [user.id]);

    res.status(200).json({ jobs: result.rows });
  } catch (err) {
    console.error('Erreur getAcceptedJobs:', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};
