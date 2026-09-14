import { Client } from '@googlemaps/google-maps-services-js';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const CHICAGO_GRID = [
  { lat: 41.9742, lng: -87.6573 },
  { lat: 41.9742, lng: -87.6298 },
  { lat: 41.9742, lng: -87.6023 },
  { lat: 41.8781, lng: -87.6573 },
  { lat: 41.8781, lng: -87.6298 },
  { lat: 41.8781, lng: -87.6023 },
  { lat: 41.7620, lng: -87.6573 },
  { lat: 41.7620, lng: -87.6298 },
  { lat: 41.7620, lng: -87.6023 },
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

  console.log('Starting bulk import for Chicago...');
  console.log(`Grid points: ${CHICAGO_GRID.length}, Business types: ${BUSINESS_TYPES.length}`);

  for (const gridPoint of CHICAGO_GRID) {
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

          // Check if already in database
          const existing = await pool.query(
            'SELECT id FROM businesses WHERE google_place_id = $1',
            [place.place_id]
          );

          if (existing.rows.length > 0) {
            totalDuplicates++;
            continue;
          }

          await sleep(150);

          // Get wheelchair accessibility details
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

          // Only import if Google verified wheelchair access OR rating is 4+
          if (!wheelchairAccessible && (!rating || rating < 4)) {
            totalSkipped++;
            continue;
          }

          // Baseline auto score
          let autoScore = 0;
          if (wheelchairAccessible) autoScore = 3.5;
          else if (rating && rating >= 4.5) autoScore = 3.0;
          else autoScore = 2.5;

          await pool.query(
            `INSERT INTO businesses 
              (google_place_id, name, address, latitude, longitude, business_type,
               overall_accessibility_score, google_wheelchair_accessible, google_rating, auto_scored)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
             ON CONFLICT (google_place_id) DO NOTHING`,
            [
              place.place_id,
              place.name,
              place.vicinity || '',
              place.geometry.location.lat,
              place.geometry.location.lng,
              businessType,
              autoScore,
              wheelchairAccessible,
              rating,
            ]
          );

          totalImported++;
          console.log(`  Imported: ${place.name} (wheelchair: ${wheelchairAccessible}, rating: ${rating})`);
        }

        await sleep(200);

      } catch (error) {
        console.error(`  Error:`, error);
      }
    }
  }

  console.log('\n=============================');
  console.log(`Import complete!`);
  console.log(`Imported: ${totalImported}`);
  console.log(`Skipped: ${totalSkipped}`);
  console.log(`Duplicates: ${totalDuplicates}`);
  console.log('=============================');

  await pool.end();
}

importBusinesses().catch(console.error);
