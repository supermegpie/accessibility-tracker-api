import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

//Get elevator info for specific station
router.get('/station', async (req: Request, res: Response) => {
  try {
    const { station_name, city } = req.query;

    if (!station_name) {
      res.status(400).json({ error: 'Station name is required' });
      return;
    }

    const result = await pool.query(
      `SELECT * FROM elevator_info 
       WHERE station_name ILIKE $1
       ${city ? 'AND city ILIKE $2' : ''}
       ORDER BY created_at DESC`,
      city ? [`%${station_name}%`, `%${city}%`] : [`%${station_name}%`]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch elevator info' });
  }
});

//Get all elevator info for a city
router.get('/city', async (req: Request, res: Response) => {
  try {
    const { city } = req.query;

    if (!city) {
      res.status(400).json({ error: 'City is required' });
      return;
    }

    const result = await pool.query(
      `SELECT * FROM elevator_info 
       WHERE city ILIKE $1
       ORDER BY station_name, created_at DESC`,
      [`%${city}%`]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch elevator info' });
  }
});

//Submit new elevator info from user response (POST)
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      station_name,
      transit_line,
      city,
      entrance_location,
      notes,
      is_working,
      firebase_uid
    } = req.body;

    if (!station_name || !firebase_uid) {
      res.status(400).json({ error: 'Station name and user ID are required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO elevator_info 
        (station_name, transit_line, city, entrance_location, notes, is_working, firebase_uid)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [station_name, transit_line, city, entrance_location, notes, is_working ?? true, firebase_uid]
    );

    res.status(201).json({ message: 'Elevator info submitted!', entry: result.rows[0] });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to submit elevator info' });
  }
});

//Get most recent elevator info, grouped by specific station
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const { city } = req.query;

    const result = await pool.query(
      `SELECT 
        station_name,
        transit_line,
        city,
        COUNT(*) as contribution_count,
        MAX(created_at) as last_updated,
        BOOL_AND(is_working) as all_working,
        (array_agg(entrance_location ORDER BY created_at DESC))[1] as latest_entrance,
        (array_agg(notes ORDER BY created_at DESC))[1] as latest_notes
       FROM elevator_info
       ${city ? 'WHERE city ILIKE $1' : ''}
       GROUP BY station_name, transit_line, city
       ORDER BY station_name`,
      city ? [`%${city}%`] : []
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch elevator summary' });
  }
});

export default router;
