import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

//GET all community reviews for a specific business
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

// Save a new accessibility review submitted by a user (POST)
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
      comment
    } = req.body;

    //Find average of all scores to get the overall accessibility rating
    const overall_score = (
      mobility_score +
      sensory_score +
      service_score +
      restroom_score +
      parking_score
    ) / 5;

    // Save the review to DB
    const result = await pool.query(
      `INSERT INTO reviews 
        (business_id, firebase_uid, mobility_score, sensory_score, service_score, restroom_score, parking_score, overall_score, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [business_id, firebase_uid, mobility_score, sensory_score, service_score, restroom_score, parking_score, overall_score, comment]
    );

    //Update the business overall accessibility score with new review added
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
