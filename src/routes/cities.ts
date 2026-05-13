import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// Pull allv accessibility stats for the dashboard ( filtered by city if provided)
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { city } = req.query;

    //pull one  the ciy name before any comma (e.g. 'Chicago, IL' -> 'Chicago')
    const cityName = city ? (city as string).split(',')[0].trim() : null;
    const cityParam = cityName ? [`%${cityName}%`] : [];
    const cityFilter = cityName ? 'WHERE b.address ILIKE $1' : '';

    const result = await pool.query(`
      SELECT 
        b.business_type,
        COUNT(b.id) as total_businesses,
        ROUND(AVG(b.overall_accessibility_score)::numeric, 2) as avg_overall_score,
        ROUND(AVG(r.mobility_score)::numeric, 2) as avg_mobility,
        ROUND(AVG(r.sensory_score)::numeric, 2) as avg_sensory,
        ROUND(AVG(r.service_score)::numeric, 2) as avg_service,
        ROUND(AVG(r.restroom_score)::numeric, 2) as avg_restroom,
        ROUND(AVG(r.parking_score)::numeric, 2) as avg_parking,
        COUNT(r.id) as total_reviews
      FROM businesses b
      LEFT JOIN reviews r ON r.business_id = b.id
      ${cityFilter}
      GROUP BY b.business_type
      ORDER BY avg_overall_score DESC NULLS LAST
    `, cityParam);

    const overallResult = await pool.query(`
      SELECT
        COUNT(b.id) as total_businesses,
        ROUND(AVG(b.overall_accessibility_score)::numeric, 2) as avg_overall_score,
        ROUND(AVG(r.mobility_score)::numeric, 2) as avg_mobility,
        ROUND(AVG(r.sensory_score)::numeric, 2) as avg_sensory,
        ROUND(AVG(r.service_score)::numeric, 2) as avg_service,
        ROUND(AVG(r.restroom_score)::numeric, 2) as avg_restroom,
        ROUND(AVG(r.parking_score)::numeric, 2) as avg_parking,
        COUNT(r.id) as total_reviews
      FROM businesses b
      LEFT JOIN reviews r ON r.business_id = b.id
      ${cityFilter}
    `, cityParam);

    const topBusinesses = await pool.query(`
      SELECT id, name, address, business_type, overall_accessibility_score
      FROM businesses
      WHERE overall_accessibility_score IS NOT NULL
      ${cityName ? 'AND address ILIKE $1' : ''}
      ORDER BY overall_accessibility_score DESC
      LIMIT 5
    `, cityParam);

    res.json({
      city: cityName || 'All Cities',
      overall: overallResult.rows[0],
      byType: result.rows,
      topBusinesses: topBusinesses.rows
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch city stats' });
  }
});

export default router;
