# Business Accessibility Tracker — API

This is the backend for Accessibility Tracker, a community-driven app that helps people with disabilities find and review accessible businesses. Built with Node.js, Express, and PostgreSQL.
It handles everything the frontend needs such as, saving businesses, storing reviews, searching Google Places, calculating accessibility scores, and pulling real-time transit data for Chicago, NYC, and Seattle (with more cities to be added).

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express
- **Database:** PostgreSQL vis Neon 
- **APIs:** Google Maps, Google Places API, and Google Geocoding API Text Search
- **Transit:** CTA, Metra, MTA, Sound Transit, King County Metro

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Check if the server is running |
| GET | `/api/businesses` | Get all saved businesses |
| POST | `/api/businesses` | Save a business to the tracker |
| GET | `/api/businesses/filter` | Filter businesses by accessibility score or business type |
| GET | `/api/places/search` | Search Google Places by location and type |
| GET | `/api/reviews/:businessId` | Get all reviews for a business |
| POST | `/api/reviews` | Submit a new accessibility review |
| GET | `/api/cities/stats` | Get city-wide accessibility stats for the dashboard |
| GET | `/api/trip-planner/search` | Find top 5 accessible destinations |
| POST | `/api/trip-planner/share` | Save results and get shareable link |
| GET | `/api/trip-planner/share/:shareId` | Load previously shared trip results |

## Getting Started

You will need Node.js v20+, a free Neon account for the database, and a Google Cloud account with Maps, Places, and Geocoding APIs enabled.

### Installation

```bash
git clone https://github.com/supermegpie/accessibility-tracker-api.git
cd accessibility-tracker-api
npm install
cp .env.example .env
# Fill in your environment variables in `.env`
npm run dev
```

### Verify it's working:

```bash
curl curl http://localhost:3000/health
```

### Database Setup

Run the following in your Neon SQL Editor to create the tables:

```sql
CREATE TABLE cities (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  state VARCHAR(50),
  country VARCHAR(50) DEFAULT 'US',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE businesses (
  id SERIAL PRIMARY KEY,
  google_place_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  city_id INTEGER REFERENCES cities(id),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  business_type VARCHAR(100),
  overall_accessibility_score DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  firebase_uid VARCHAR(128) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  business_id INTEGER REFERENCES businesses(id),
  firebase_uid VARCHAR(128) NOT NULL,
  mobility_score INTEGER CHECK (mobility_score BETWEEN 1 AND 5),
  sensory_score INTEGER CHECK (sensory_score BETWEEN 1 AND 5),
  service_score INTEGER CHECK (service_score BETWEEN 1 AND 5),
  restroom_score INTEGER CHECK (restroom_score BETWEEN 1 AND 5),
  parking_score INTEGER CHECK (parking_score BETWEEN 1 AND 5),
  overall_score DECIMAL(3,2),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE shared_searches (
  id SERIAL PRIMARY KEY,
  share_id VARCHAR(12) UNIQUE NOT NULL,
  query TEXT NOT NULL,
  city TEXT NOT NULL,
  results JSONB NOT NULL,
  cta_outages INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Port to run the server on (default: 3000) |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key |

## How the Trip Planner Scores Destinations

Each result gets a score out of 100 based on four data sources. The weights reflect what matters most to people with disabilities:

| Source | Weight | Details |
|---|---|---|
| Google wheelchair entrance | 25 pts | Whether Google has verified the entrance is accessible |
| Google rating | 15 pts | Higher rated places tend to provide better service overall |
| Community reviews | 40 pts | The most important factor because it's the firsthand experience from the disability community |
| Transit accessibility | 20 pts | Reduced if there are active outages near the destination |

Transit outages are only shown as warnings for destinations within 0.5 miles of an affected station (i.e.,we will warn someone about an elevator outage across town).

## Transit Coverage

- **Chicago:** CTA real-time elevator alerts, Metra accessibility alerts, Pace Bus
- **New York City:** MTA elevator/escalator status
- **Seattle:** Sound Transit service alerts, King County Metro

More cities coming soon.

## Related Repository

- [accessibility-tracker](https://github.com/supermegpie/accessibility-tracker) — React + TypeScript frontend

Accessibility benefits EVERYONE.
MIT License
