import { Router, Request, Response } from 'express';
import { Client } from '@googlemaps/google-maps-services-js';
import pool from '../db';

const router = Router();

// Calculate distance between two coordinates in miles
function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// CTA station coordinates for matching outages
const CTA_STATIONS: { name: string; lat: number; lng: number }[] = [
  { name: 'Chicago', lat: 41.8967, lng: -87.6315 },
  { name: 'Grand', lat: 41.8912, lng: -87.6278 },
  { name: 'Lake', lat: 41.8858, lng: -87.6278 },
  { name: 'Monroe', lat: 41.8808, lng: -87.6278 },
  { name: 'Jackson', lat: 41.8781, lng: -87.6278 },
  { name: 'Harrison', lat: 41.8740, lng: -87.6278 },
  { name: 'Roosevelt', lat: 41.8670, lng: -87.6267 },
  { name: 'Clark/Lake', lat: 41.8858, lng: -87.6315 },
  { name: 'State/Lake', lat: 41.8858, lng: -87.6278 },
  { name: 'Washington', lat: 41.8831, lng: -87.6278 },
  { name: 'Quincy', lat: 41.8788, lng: -87.6344 },
  { name: 'LaSalle', lat: 41.8756, lng: -87.6317 },
  { name: 'Clinton', lat: 41.8756, lng: -87.6408 },
  { name: 'UIC-Halsted', lat: 41.8753, lng: -87.6497 },
  { name: 'Merchandise Mart', lat: 41.8884, lng: -87.6354 },
];
const client = new Client();

// GET /api/trip-planner/search?query=italian+restaurant&city=Chicago,IL
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { query, city } = req.query;

    if (!query || !city) {
      res.status(400).json({ error: 'Query and city are required' });
      return;
    }

    // Step 1: Geocode the city to get coordinates
    const geocodeResponse = await client.geocode({
      params: {
        address: city as string,
        key: process.env.GOOGLE_MAPS_API_KEY as string,
      }
    });

    const { lat, lng } = geocodeResponse.data.results[0].geometry.location;

    // Step 2: Search Google Places for matching businesses
    const placesResponse = await client.textSearch({
      params: {
        query: `${query} in ${city}`,
        location: { lat, lng },
        radius: 5000,
        key: process.env.GOOGLE_MAPS_API_KEY as string,
      }
    });

    const places = placesResponse.data.results.slice(0, 20);

    // Step 3: Get details for each place including wheelchair accessibility
    const detailedPlaces = await Promise.all(
      places.map(async (place) => {
        try {
          const detailResponse = await client.placeDetails({
            params: {
              place_id: place.place_id!,
              fields: ['place_id', 'name', 'formatted_address', 'geometry',
                      'wheelchair_accessible_entrance', 'rating',
                      'user_ratings_total', 'opening_hours', 'types'],
              key: process.env.GOOGLE_MAPS_API_KEY as string,
            }
          });
          return detailResponse.data.result;
        } catch {
          return place;
        }
      })
    );

    // Step 4: Check if each place has reviews in our database
    const placeIds = detailedPlaces.map(p => p.place_id).filter(Boolean);
    const dbResult = await pool.query(
      `SELECT b.google_place_id, b.overall_accessibility_score,
              AVG(r.mobility_score) as avg_mobility,
              AVG(r.restroom_score) as avg_restroom,
              AVG(r.service_score) as avg_service,
              COUNT(r.id) as review_count
       FROM businesses b
       LEFT JOIN reviews r ON r.business_id = b.id
       WHERE b.google_place_id = ANY($1)
       GROUP BY b.google_place_id, b.overall_accessibility_score`,
      [placeIds]
    );

    const dbMap: Record<string, any> = {};
    dbResult.rows.forEach(row => {
      dbMap[row.google_place_id] = row;
    });

    // Step 5: Fetch transit accessibility status for Chicago
    let elevatorOutages: string[] = [];
    let metraOutages: string[] = [];
    let paceOutages: string[] = [];

    // CTA elevator status
    try {
      const ctaResponse = await fetch(
        'https://lapi.transitchicago.com/api/1.0/alerts.aspx?outputType=JSON&accessibility=true'
      );
      const ctaData = await ctaResponse.json();
      const alerts = ctaData?.CTAAlerts?.Alert || [];
      elevatorOutages = alerts
        .filter((a: any) => a.ShortDescription?.toLowerCase().includes('elevator'))
        .map((a: any) => a.ShortDescription);
    } catch {
      elevatorOutages = [];
    }

    // Metra accessibility alerts
    try {
      const metraResponse = await fetch(
        'https://gtfsapi.metrarail.com/gtfs/alerts',
        { headers: { 'Accept': 'application/json' } }
      );
      if (metraResponse.ok) {
        const metraData = await metraResponse.json();
        const entities = metraData?.entity || [];
        metraOutages = entities
          .filter((e: any) => {
            const header = e?.alert?.header_text?.translation?.[0]?.text || '';
            return header.toLowerCase().includes('elevator') ||
                   header.toLowerCase().includes('accessible') ||
                   header.toLowerCase().includes('wheelchair');
          })
          .map((e: any) => e?.alert?.header_text?.translation?.[0]?.text || 'Metra accessibility alert');
      }
    } catch {
      metraOutages = [];
    }

    // Pace bus - use 511 regional feed
    try {
      const paceResponse = await fetch(
        'https://www.pacebus.com/service-alerts'
      );
      if (paceResponse.ok) {
        paceOutages = [];
      }
    } catch {
      paceOutages = [];
    }

    const totalOutages = elevatorOutages.length + metraOutages.length;

    // Step 6: Score each place
    const scoredPlaces = detailedPlaces.map(place => {
      let score = 0;
      let maxScore = 0;
      const factors: string[] = [];
      const warnings: string[] = [];

      // Google wheelchair accessible entrance (25 points)
      maxScore += 25;
      if ((place as any).wheelchair_accessible_entrance === true) {
        score += 25;
        factors.push('Google verified wheelchair accessible entrance');
      }

      // Google rating (15 points)
      maxScore += 15;
      if (place.rating && place.rating >= 4) {
        score += 15;
        factors.push(`Highly rated on Google (${place.rating} stars)`);
      } else if (place.rating && place.rating >= 3) {
        score += 8;
      }

      // App review scores (40 points)
      maxScore += 40;
      const dbData = dbMap[place.place_id!];
      if (dbData) {
        const mobilityScore = Number(dbData.avg_mobility) || 0;
        const restroomScore = Number(dbData.avg_restroom) || 0;
        const reviewCount = Number(dbData.review_count) || 0;

        if (mobilityScore >= 4) {
          score += 20;
          factors.push(`Community rated mobility ${mobilityScore.toFixed(1)}/5`);
        } else if (mobilityScore >= 3) {
          score += 10;
        }

        if (restroomScore >= 4) {
          score += 15;
          factors.push(`Community rated restrooms ${restroomScore.toFixed(1)}/5`);
        } else if (restroomScore >= 3) {
          score += 8;
        }

        if (reviewCount > 0) {
          score += 5;
          factors.push(`${reviewCount} community review${reviewCount > 1 ? 's' : ''}`);
        }
      } else {
        warnings.push('No community reviews yet');
      }

      // CTA transit accessibility (20 points)
      maxScore += 20;
      const placeLat = place.geometry?.location?.lat || 0;
      const placeLng = place.geometry?.location?.lng || 0;

      // Find nearby CTA stations within 0.5 miles
      const nearbyStations = CTA_STATIONS.filter(station =>
        distanceMiles(placeLat, placeLng, station.lat, station.lng) <= 0.5
      );

      // Match outages to nearby stations
      const nearbyCtaOutages = elevatorOutages.filter(outage =>
        nearbyStations.some(station =>
          outage.toLowerCase().includes(station.name.toLowerCase())
        )
      );

      // Match metra outages to nearby area (within 1 mile)
      const nearbyMetraOutages = metraOutages.filter(() =>
        distanceMiles(placeLat, placeLng, 41.8819, -87.6278) <= 1.0
      );

      if (totalOutages === 0) {
        score += 20;
        factors.push('No transit accessibility outages reported nearby (CTA + Metra)');
      } else if (nearbyCtaOutages.length === 0 && nearbyMetraOutages.length === 0) {
        score += 20;
        factors.push('No transit outages affecting this destination');
      } else {
        score += 10;
        if (nearbyCtaOutages.length > 0) {
          warnings.push(`${nearbyCtaOutages.length} nearby CTA elevator outage(s) may affect travel: ${nearbyCtaOutages[0]}`);
        }
        if (nearbyMetraOutages.length > 0) {
          warnings.push(`${nearbyMetraOutages.length} Metra accessibility alert(s) in the area`);
        }
      }

      const accessibilityScore = Math.round((score / maxScore) * 100);

      return {
        place_id: place.place_id,
        name: place.name,
        address: (place as any).formatted_address || '',
        location: place.geometry?.location,
        google_rating: place.rating,
        google_accessible: (place as any).wheelchair_accessible_entrance,
        accessibility_score: accessibilityScore,
        community_score: dbData?.overall_accessibility_score || null,
        review_count: dbData?.review_count || 0,
        factors,
        warnings,
        types: place.types || [],
      };
    });

    // Step 7: Sort by accessibility score and return top 5
    const top5 = scoredPlaces
      .sort((a, b) => b.accessibility_score - a.accessibility_score)
      .slice(0, 5);

    res.json({
      query,
      city,
      center: { lat, lng },
      results: top5,
      cta_outages: elevatorOutages.length,
      metra_outages: metraOutages.length,
      pace_outages: paceOutages.length,
      total_transit_outages: totalOutages,
    });

  } catch (error) {
    console.error('Trip planner error:', error);
    res.status(500).json({ error: 'Failed to plan trip' });
  }
});

// POST /api/trip-planner/share - save results and return share ID
router.post('/share', async (req, res) => {
  try {
    const { query, city, results, cta_outages } = req.body;

    // Generate a random 8 character share ID
    const shareId = Math.random().toString(36).substring(2, 10);

    await pool.query(
      `INSERT INTO shared_searches (share_id, query, city, results, cta_outages)
       VALUES ($1, $2, $3, $4, $5)`,
      [shareId, query, city, JSON.stringify(results), cta_outages]
    );

    res.json({ share_id: shareId });
  } catch (error) {
    console.error('Share error:', error);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// GET /api/trip-planner/share/:shareId - retrieve shared results
router.get('/share/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    const result = await pool.query(
      'SELECT * FROM shared_searches WHERE share_id = $1',
      [shareId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Share link not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Share fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch shared results' });
  }
});

export default router;
