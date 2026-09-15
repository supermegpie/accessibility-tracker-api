import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

//Get all businesses that have been saved to the tracker (GET)
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT b.*,
        (SELECT COUNT(DISTINCT tag) 
         FROM reviews r, unnest(r.tags) AS tag 
         WHERE r.business_id = b.id) as verified_features_count
      FROM businesses b
      ORDER BY created_at DESC LIMIT 50
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database query failed' });
  }
});

//Save a new business when a user clicks "Rate & Review" (POST)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { google_place_id, name, address, latitude, longitude, business_type } = req.body;

    //Check if business already exists to avoid duplicates
    const existing = await pool.query(
      'SELECT * FROM businesses WHERE google_place_id = $1',
      [google_place_id]
    );

    // if it's already saved just return the existing record
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

//Filter saved businesses by minimum score, disability category, and business type
router.get('/filter', async (req: Request, res: Response) => {
  try {
    const { minScore, businessType, category } = req.query;

    //Map disability category to the correct score column
    const categoryColMap: Record<string, string> = {
      mobility: 'mobility_accessibility_score',
      vision: 'vision_accessibility_score',
      hearing: 'hearing_accessibility_score',
      sensory: 'sensory_accessibility_score',
    };

    const scoreCol = category && category !== 'all' && categoryColMap[category as string]
      ? categoryColMap[category as string]
      : 'overall_accessibility_score';

    let query = `
      SELECT b.*,
        (SELECT COUNT(DISTINCT tag) 
         FROM reviews r, unnest(r.tags) AS tag 
         WHERE r.business_id = b.id) as verified_features_count
      FROM businesses b WHERE 1=1`;

    const params: any[] = [];

    if (minScore && Number(minScore) > 0) {
      params.push(Number(minScore));
      // Use overall_accessibility_score if it exists, otherwise use google_rating
      query += ` AND (
        COALESCE(b.${scoreCol}, b.google_rating) IS NOT NULL
        AND COALESCE(b.${scoreCol}, b.google_rating) >= $${params.length}
      )`;
    }

    if (businessType && businessType !== 'all') {
      params.push(businessType);
      query += ` AND b.business_type = $${params.length}`;
    }

    query += ` ORDER BY b.${scoreCol} DESC NULLS LAST`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to filter businesses' });
  }
});

// GET /api/businesses/nearby — get reviewed businesses near a location sorted by distance and score
router.get('/nearby', async (req: Request, res: Response) => {
  try {
    const { lat, lng, limit = 10 } = req.query;

    if (!lat || !lng) {
      res.status(400).json({ error: 'lat and lng are required' });
      return;
    }

    const result = await pool.query(
      `SELECT * FROM (
        SELECT b.*,
          (SELECT COUNT(DISTINCT tag) FROM reviews r, unnest(r.tags) AS tag WHERE r.business_id = b.id) as verified_features_count,
          (SELECT COUNT(*) FROM reviews WHERE business_id = b.id) as review_count,
          (SELECT comment FROM reviews WHERE business_id = b.id ORDER BY created_at DESC LIMIT 1) as latest_comment,
          (SELECT display_name FROM users u JOIN reviews r ON r.firebase_uid = u.firebase_uid WHERE r.business_id = b.id ORDER BY r.created_at DESC LIMIT 1) as latest_reviewer,
          (3959 * acos(
            LEAST(1.0, cos(radians($1::float)) * cos(radians(latitude::float)) *
            cos(radians(longitude::float) - radians($2::float)) +
            sin(radians($1::float)) * sin(radians(latitude::float)))
          )) AS distance_miles
        FROM businesses b
        WHERE overall_accessibility_score IS NOT NULL
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
      ) sub
      ORDER BY (distance_miles * 0.4) + ((5 - overall_accessibility_score) * 0.6)
      LIMIT $3`,
      [lat, lng, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch nearby businesses' });
  }
});

export default router;
