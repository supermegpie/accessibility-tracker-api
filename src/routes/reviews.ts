import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// Fetch all community reviews for a specific business
router.get('/:businessId', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const result = await pool.query(
      'SELECT * FROM reviews WHERE business_id = $1 ORDER BY created_at DESC',
      [businessId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Save a new accessibility review submitted by a user
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      business_id,
      firebase_uid,
      mobility_score,
      sensory_score,
      service_score,
      restroom_score,
      parking_score,
      comment,
      tags
    } = req.body;

    // Average all five category scores to get the overall accessibility rating
    const overall_score = (
      mobility_score +
      sensory_score +
      service_score +
      restroom_score +
      parking_score
    ) / 5;

    // Write the review to the database
    const result = await pool.query(
      `INSERT INTO reviews 
        (business_id, firebase_uid, mobility_score, sensory_score, service_score, restroom_score, parking_score, overall_score, comment, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [business_id, firebase_uid, mobility_score, sensory_score, service_score, restroom_score, parking_score, overall_score, comment, tags || []]
    );

    // Recalculate and update the business score now that a new review has been added
    await pool.query(
      `UPDATE businesses 
       SET overall_accessibility_score = (
         SELECT AVG(overall_score) FROM reviews WHERE business_id = $1
       )
       WHERE id = $1`,
      [business_id]
    );

    res.status(201).json({ message: 'Review submitted!', review: result.rows[0] });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

export default router;
