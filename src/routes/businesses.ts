import { Router, Request, Response } from 'express';
import pool from '../db';  // Your PostgreSQL connection
 
const router = Router();
 
// GET /api/businesses - return all businesses
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
 
export default router;