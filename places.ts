import { Router, Request, Response } from 'express';
import { Client } from '@googlemaps/google-maps-services-js';

const router = Router();
const client = new Client();

//Search for businesses near provided location using Google Places
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { location, type } = req.query;

    if (!location) {
      res.status(400).json({ error: 'Location is required' });
      return;
    }

    // Convert location name into latitude/longitude
    const geocodeResponse = await client.geocode({
      params: {
        address: location as string,
        key: process.env.GOOGLE_MAPS_API_KEY as string,
      }
    });

    const { lat, lng } = geocodeResponse.data.results[0].geometry.location;

    // Search for nearby places (nearby coordinates) using Google Places API
    const placesResponse = await client.placesNearby({
      params: {
        location: { lat, lng },
        radius: 1000,
        type: (type as string) || 'establishment',
        key: process.env.GOOGLE_MAPS_API_KEY as string,
      }
    });

    res.json({
      center: { lat, lng },
      places: placesResponse.data.results
    });

  } catch (error: any) {
    console.error('Places API error:', JSON.stringify(error?.response?.data || error?.message || error));
    res.status(500).json({ error: 'Failed to fetch places' });
  }
});

export default router;