import { Router, Request, Response } from 'express';
import { Client } from '@googlemaps/google-maps-services-js';

const router = Router();
const client = new Client();

// Search for businesses near a location using Google Places
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { location, type, query } = req.query;

    if (!location) {
      res.status(400).json({ error: 'Location is required' });
      return;
    }

    // Turn the location name into lat/lng coordinates
    const geocodeResponse = await client.geocode({
      params: {
        address: location as string,
        key: process.env.GOOGLE_MAPS_API_KEY as string,
      }
    });

    const { lat, lng } = geocodeResponse.data.results[0].geometry.location;

    let places;

    if (query) {
      // Search for a specific business by name using text search
      const textResponse = await client.textSearch({
        params: {
          query: `${query} in ${location}`,
          location: { lat, lng },
          radius: 10000,
          key: process.env.GOOGLE_MAPS_API_KEY as string,
        }
      });
      places = textResponse.data.results;
    } else {
      // Use the coordinates to find nearby businesses of the requested type
      const placesResponse = await client.placesNearby({
        params: {
          location: { lat, lng },
          radius: 1000,
          type: (type as string) || 'establishment',
          key: process.env.GOOGLE_MAPS_API_KEY as string,
        }
      });
      places = placesResponse.data.results;
    }

    res.json({
      center: { lat, lng },
      places
    });

  } catch (error) {
    console.error('Places API error:', error);
    res.status(500).json({ error: 'Failed to fetch places' });
  }
});

export default router;
