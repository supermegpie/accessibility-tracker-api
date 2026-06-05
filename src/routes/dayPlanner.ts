import { Router, Request, Response } from 'express';
import { Client } from '@googlemaps/google-maps-services-js';
import pool from '../db';
import crypto from 'crypto';

const router = Router();
const client = new Client();

const VIBE_STOPS: Record<string, string[]> = {
  'Date Night': ['cocktail bar', 'fine dining restaurant', 'dessert cafe'],
  'Family Day': ['park', 'family restaurant', 'museum'],
  'Adventure': ['outdoor activity', 'cafe', 'sports bar'],
  'Foodie': ['coffee shop', 'restaurant', 'dessert'],
  'Culture & Arts': ['museum', 'art gallery', 'cafe'],
  'Shopping': ['shopping mall', 'cafe', 'restaurant'],
};

//Calculate the distance (miles) between coordinates
function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

//GET /api/day-planner/search
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { city, vibe, stops: customStops } = req.query;

    if (!city || !vibe) {
      res.status(400).json({ error: 'City and vibe are required' });
      return;
    }

    //Get stop types from vibe or custom stops
    const stopTypes = customStops
      ? (customStops as string).split(',').map(s => s.trim())
      : VIBE_STOPS[vibe as string] || VIBE_STOPS['Foodie'];

    //Geocode the city
    const geocodeResponse = await client.geocode({
      params: {
        address: city as string,
        key: process.env.GOOGLE_MAPS_API_KEY as string,
      }
    });

    const cityCenter = geocodeResponse.data.results[0].geometry.location;
    let lastLocation = cityCenter;
    const plannedStops = [];

    for (const stopType of stopTypes) {
      //Search for accessible businesses near the last stop (minimizes rolling/walking distance)
      const placesResponse = await client.textSearch({
        params: {
          query: `${stopType} in ${city}`,
          location: lastLocation,
          radius: 2000,
          key: process.env.GOOGLE_MAPS_API_KEY as string,
        }
      });

      const places = placesResponse.data.results;
      if (places.length === 0) continue;

      //Get details for top 5 candidates to check wheelchair/disability access
      const candidates = places.slice(0, 5);
      let bestPlace = null;
      let bestScore = -1;

      for (const place of candidates) {
        let score = 0;

        //Check Google wheelchair accessible entrance (big factor)
        try {
          const detailsResponse = await client.placeDetails({
            params: {
              place_id: place.place_id!,
              fields: ['wheelchair_accessible_entrance', 'rating', 'opening_hours'],
              key: process.env.GOOGLE_MAPS_API_KEY as string,
            }
          });
          const details = detailsResponse.data.result;
          if ((details as any).wheelchair_accessible_entrance) score += 40;
          if (details.opening_hours?.open_now) score += 10;
        } catch (_e) {
          // ignore detail errors
        }

        //Google rating
        if (place.rating && place.rating >= 4) score += 15;
        else if (place.rating && place.rating >= 3) score += 8;

        //Check community reviews
        const reviewResult = await pool.query(
          `SELECT AVG(overall_score) as avg_score, COUNT(*) as review_count
           FROM reviews r
           JOIN businesses b ON r.business_id = b.id
           WHERE b.google_place_id = $1`,
          [place.place_id]
        );
        const communityScore = reviewResult.rows[0].avg_score;
        const reviewCount = reviewResult.rows[0].review_count;
        if (communityScore >= 4) score += 25;
        else if (communityScore >= 3) score += 12;
        if (reviewCount > 0) score += 10;

        //Give proximity bonus, closer to last stop is better
        const dist = distanceMiles(
          lastLocation.lat, lastLocation.lng,
          place.geometry!.location.lat, place.geometry!.location.lng
        );
        if (dist < 0.25) score += 15;
        else if (dist < 0.5) score += 10;
        else if (dist < 1) score += 5;

        if (score > bestScore) {
          bestScore = score;
          bestPlace = place;
        }
      }

      if (bestPlace) {
        //Get elevator info near the stop
        const elevatorInfo = await pool.query(
          `SELECT station_name, transit_line, entrance_location, notes, is_working
           FROM elevator_info
           WHERE city ILIKE $1
           ORDER BY created_at DESC
           LIMIT 3`,
          [`%${(city as string).split(',')[0]}%`]
        );

        plannedStops.push({
          stop_number: plannedStops.length + 1,
          stop_type: stopType,
          name: bestPlace.name,
          address: bestPlace.formatted_address || bestPlace.vicinity,
          place_id: bestPlace.place_id,
          location: bestPlace.geometry!.location,
          google_rating: bestPlace.rating,
          accessibility_score: bestScore,
          directions_url: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(bestPlace.formatted_address || bestPlace.name || '')}&destination_place_id=${bestPlace.place_id}&travelmode=transit`,
          nearby_elevator_info: elevatorInfo.rows,
        });

        lastLocation = bestPlace.geometry!.location;
      }
    }

    res.json({
      city,
      vibe,
      stops: plannedStops,
    });

  } catch (error) {
    console.error('Day planner error:', error);
    res.status(500).json({ error: 'Failed to generate day plan' });
  }
});

// POST /api/day-planner/share
router.post('/share', async (req: Request, res: Response) => {
  try {
    const { city, vibe, stops } = req.body;
    const share_id = crypto.randomBytes(6).toString('hex');

    await pool.query(
      'INSERT INTO day_plans (share_id, city, vibe, stops) VALUES ($1, $2, $3, $4)',
      [share_id, city, vibe, JSON.stringify(stops)]
    );

    res.json({ share_id });
  } catch (error) {
    console.error('Share error:', error);
    res.status(500).json({ error: 'Failed to save day plan' });
  }
});

// GET /api/day-planner/share/:shareId
router.get('/share/:shareId', async (req: Request, res: Response) => {
  try {
    const { shareId } = req.params;
    const result = await pool.query(
      'SELECT * FROM day_plans WHERE share_id = $1',
      [shareId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Share retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve day plan' });
  }
});

export default router;
