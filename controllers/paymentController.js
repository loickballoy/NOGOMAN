import Stripe from 'stripe';
import dotenv from 'dotenv';
import pool from '../db/index.js';
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createCheckoutSession = async (req, res) => {
    const user = req.user;
    const jobId = req.params.id;
  
    if (user.role !== 'FARMER') {
      return res.status(403).json({ message: 'Seuls les FARMER peuvent payer des jobs.' });
    }
  
    try {
      // Vérifie que le job existe et est assigné
      const jobRes = await pool.query('SELECT * FROM jobs WHERE id = $1 AND farmer_id = $2 AND status = $3', [jobId, user.id, 'ASSIGNED']);
      const job = jobRes.rows[0];
  
      if (!job) {
        return res.status(404).json({ message: 'Job introuvable ou non payable.' });
      }
  
      // Définir le prix arbitraire (à personnaliser)
      const amount = 5000; // 50.00€ en centimes
  
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: job.title,
                description: job.description
              },
              unit_amount: amount
            },
            quantity: 1
          }
        ],
        metadata: {
          job_id: job.id,
          farmer_id: user.id
        },
        success_url: 'http://localhost:3000/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'http://localhost:3000/cancel'
      });
  
      res.status(200).json({ url: session.url });
    } catch (err) {
      console.error('Erreur Stripe:', err.message);
      res.status(500).json({ message: 'Erreur création session Stripe.' });
    }
  };

  