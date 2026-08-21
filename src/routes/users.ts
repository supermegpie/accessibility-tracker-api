import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// Save or update a user when they log in
router.post('/', async (req: Request, res: Response) => {
  try {
    const { firebase_uid, email, display_name } = req.body;

    if (!firebase_uid || !email) {
      res.status(400).json({ error: 'firebase_uid and email are required' });
      return;
    }

    //insert if new, update email/name if existing
    const result = await pool.query(
      `INSERT INTO users (firebase_uid, email, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (firebase_uid)
       DO UPDATE SET email = $2, display_name = $3
       RETURNING *`,
      [firebase_uid, email, display_name || email.split('@')[0]]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to save user' });
  }
});

//Find a user by firebase_uid
router.get('/:firebaseUid', async (req: Request, res: Response) => {
  try {
    const { firebaseUid } = req.params;
    const result = await pool.query(
      'SELECT * FROM users WHERE firebase_uid = $1',
      [firebaseUid]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;
