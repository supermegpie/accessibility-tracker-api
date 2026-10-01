import { Client } from '@googlemaps/google-maps-services-js';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const NYC_GRID = [
  { lat: 40.8448, lng: -73.8648 }, // Bronx — Fordham
  { lat: 40.8448, lng: -73.9196 }, // Bronx — Concourse
  { lat: 40.7282, lng: -73.7949 }, // Queens — Jamaica
  { lat: 40.7282, lng: -73.8448 }, // Queens — Jackson Heights
  { lat: 40.7580, lng: -73.9855 }, // Manhattan — Midtown
  { lat: 40.7128, lng: -74.0060 }, // Manhattan — Lower Manhattan
  { lat: 40.7831, lng: -73.9712 }, // Manhattan — Upper West Side
  { lat: 40.7549, lng: -73.9840 }, // Manhattan — Midtown East
  { lat: 40.6782, lng: -73.9442 }, // Brooklyn — Crown Heights
  { lat: 40.6501, lng: -73.9496 }, // Brooklyn — Flatbush
  { lat: 40.6892, lng: -74.0445 }, // Brooklyn — Park Slope
  { lat: 40.5795, lng: -74.1502 }, // Staten Island — St. George
  { lat: 40.8116, lng: -73.9465 }, // Manhattan — Harlem
  { lat: 40.7721, lng: -73.9302 }, // Queens — Astoria
  { lat: 40.7081, lng: -73.9571 }, // Brooklyn — Williamsburg
  { lat: 40.5795, lng: -73.8213 }, // Queens — The Rockaways
];

const BUSINESS_TYPES = [
  'restaurant', 'cafe', 'bar', 'museum', 'lodging',
  'store', 'pharmacy', 'gym', 'hospital', 'park',
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function importBusinesses() {
  let totalImported = 0;
  let totalSkipped = 0;
  let totalDuplicates = 0;

  console.log('Starting bulk import for New York City...');

  for (const gridPoint of NYC_GRID) {
    for (const businessType of BUSINESS_TYPES) {
      console.log(`\nSearching ${businessType} near ${gridPoint.lat},${gridPoint.lng}...`);

      try {
        const placesResponse = await client.placesNearby({
          params: {
            location: { lat: gridPoint.lat, lng: gridPoint.lng },
            radius: 2000,
            type: businessType as any,
            key: process.env.GOOGLE_MAPS_API_KEY as string,
          }
        });

        const places = placesResponse.data.results;
        console.log(`  Found ${places.length} places`);

        for (const place of places) {
          if (!place.place_id || !place.name || !place.geometry?.location) continue;

          const existing = await pool.query(
            'SELECT id FROM businesses WHERE google_place_id = $1',
            [place.place_id]
          );

          if (existing.rows.length > 0) { totalDuplicates++; continue; }

          await sleep(150);

          let wheelchairAccessible = false;
          let rating = place.rating || null;

          try {
            const detailsResponse = await client.placeDetails({
              params: {
                place_id: place.place_id,
                fields: ['wheelchair_accessible_entrance', 'rating'],
                key: process.env.GOOGLE_MAPS_API_KEY as string,
              }
            });
            wheelchairAccessible = (detailsResponse.data.result as any).wheelchair_accessible_entrance || false;
            rating = detailsResponse.data.result.rating || rating;
          } catch (_e) {}

          if (!wheelchairAccessible && (!rating || rating < 4)) { totalSkipped++; continue; }

          const autoScore = wheelchairAccessible ? 3.5 : rating && rating >= 4.5 ? 3.0 : 2.5;

          await pool.query(
            `INSERT INTO businesses 
              (google_place_id, name, address, latitude, longitude, business_type,
               overall_accessibility_score, google_wheelchair_accessible, google_rating, auto_scored)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
             ON CONFLICT (google_place_id) DO NOTHING`,
            [place.place_id, place.name, place.vicinity || '',
             place.geometry.location.lat, place.geometry.location.lng,
             businessType, autoScore, wheelchairAccessible, rating]
          );

          totalImported++;
          console.log(`  Imported: ${place.name}`);
        }

        await sleep(200);
      } catch (error) {
        console.error(`  Error:`, error);
      }
    }
  }

  console.log('\n=============================');
  console.log(`NYC import complete!`);
  console.log(`Imported: ${totalImported}`);
  console.log(`Skipped: ${totalSkipped}`);
  console.log(`Duplicates: ${totalDuplicates}`);
  console.log('=============================');

  await pool.end();
}

importBusinesses().catch(console.error);
