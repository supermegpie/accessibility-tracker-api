import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// GET /api/businesses - return all saved businesses
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM businesses ORDER BY created_at DESC LIMIT 50'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// POST /api/businesses - save a business to the database
router.post('/', async (req: Request, res: Response) => {
  try {
    const { google_place_id, name, address, latitude, longitude, business_type } = req.body;

    // Check if business already exists
    const existing = await pool.query(
      'SELECT * FROM businesses WHERE google_place_id = $1',
      [google_place_id]
    );

    if (existing.rows.length > 0) {
      res.json({ message: 'Business already saved', business: existing.rows[0] });
      return;
    }

    const result = await pool.query(
      `INSERT INTO businesses 
        (google_place_id, name, address, latitude, longitude, business_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [google_place_id, name, address, latitude, longitude, business_type]
    );

    res.status(201).json({ message: 'Business saved!', business: result.rows[0] });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to save business' });
  }
});

export default router;

// GET /api/businesses/filter - filter businesses by score and type
router.get('/filter', async (req: Request, res: Response) => {
  try {
    const { minScore, businessType } = req.query;

    let query = 'SELECT * FROM businesses WHERE 1=1';
    const params: any[] = [];

    if (minScore && Number(minScore) > 0) {
      params.push(Number(minScore));
      query += ` AND overall_accessibility_score >= $${params.length}`;
    }

    if (businessType && businessType !== 'all') {
      params.push(businessType);
      query += ` AND business_type = $${params.length}`;
    }

    query += ' ORDER BY overall_accessibility_score DESC NULLS LAST';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to filter businesses' });
  }
});
