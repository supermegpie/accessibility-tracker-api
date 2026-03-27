import { Router, Request, Response } from 'express';
import { Client } from '@googlemaps/google-maps-services-js';
import pool from '../db';

const router = Router();
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

    // Step 5: Fetch CTA elevator status for Chicago
    let elevatorOutages: string[] = [];
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
      if (elevatorOutages.length === 0) {
        score += 20;
        factors.push('No CTA elevator outages reported');
      } else {
        score += 10;
        warnings.push(`${elevatorOutages.length} CTA elevator outage(s) in the area`);
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
    });

  } catch (error) {
    console.error('Trip planner error:', error);
    res.status(500).json({ error: 'Failed to plan trip' });
  }
});

export default router;
