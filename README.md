# ♿ Business Accessibility Tracker — API

The backend API for the Business Accessibility Tracker app. Built with Node.js, Express, and PostgreSQL (Neon). Handles business data, Google Places API integration, accessibility reviews, trip planning, and real-time transit status for Chicago, NYC, and Seattle.

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express
- **Database:** PostgreSQL (Neon cloud)
- **APIs:** Google Maps Services (Places API, Geocoding API, Text Search)
- **Transit:** CTA, Metra, MTA, Sound Transit, King County Metro

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/businesses` | Get all saved businesses |
| POST | `/api/businesses` | Save a business to the tracker |
| GET | `/api/businesses/filter` | Filter businesses by score and type |
| GET | `/api/places/search` | Search businesses via Google Places |
| GET | `/api/reviews/:businessId` | Get all reviews for a business |
| POST | `/api/reviews` | Submit an accessibility review |
| GET | `/api/cities/stats` | Get city-wide accessibility stats |
| GET | `/api/trip-planner/search` | Find top 5 accessible destinations |
| POST | `/api/trip-planner/share` | Save results and get shareable link |
| GET | `/api/trip-planner/share/:shareId` | Retrieve shared trip results |

## Getting Started

### Prerequisites

- Node.js v20+
- A Neon account (free) at [neon.tech](https://neon.tech)
- A Google Cloud account with the following APIs enabled:
  - Maps JavaScript API
  - Places API
  - Geocoding API

### Installation

1. Clone the repository:
```bash
git clone https://github.com/supermegpie/accessibility-tracker-api.git
cd accessibility-tracker-api
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Fill in your environment variables in `.env`

5. Create the database tables in your Neon SQL Editor:

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

6. Start the development server:
```bash
npm run dev
```

7. Verify it's running:
```bash
curl http://localhost:3000/health
```

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Port to run the server on (default: 3000) |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key (no referrer restrictions) |

## Trip Planner Scoring Algorithm

Each destination is scored out of 100% across four data sources:

| Source | Weight | Details |
|---|---|---|
| Google wheelchair entrance | 25 pts | Verified accessible entrance flag from Google Places |
| Google rating | 15 pts | 15 pts for 4+ stars, 8 pts for 3+ stars |
| Community reviews | 40 pts | Mobility (20) + Restroom (15) + Review count bonus (5) |
| Transit accessibility | 20 pts | Full points if no nearby outages, 10 pts if outages exist elsewhere |

Transit outages are only shown as warnings for destinations within 0.5 miles of an affected station.

## Transit Coverage

- **Chicago:** CTA real-time elevator alerts, Metra GTFS accessibility alerts, Pace Bus
- **New York City:** MTA elevator/escalator status
- **Seattle:** Sound Transit service alerts, King County Metro

## Related Repository

- [accessibility-tracker](https://github.com/supermegpie/accessibility-tracker) — React + TypeScript frontend

## License

MIT
