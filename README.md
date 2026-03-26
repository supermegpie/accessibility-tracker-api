# ♿ Business Accessibility Tracker — API

The backend API for the Business Accessibility Tracker app. Built with Node.js, Express, and PostgreSQL (Neon). Handles business data, Google Places API integration, and database management.

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express
- **Database:** PostgreSQL (Neon cloud)
- **APIs:** Google Maps Services (Places API, Geocoding API)

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

4. Fill in your environment variables in `.env`:
```
PORT=3000
DATABASE_URL=postgresql://username:password@ep-xxxx.us-east-2.aws.neon.tech/neondb
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

5. Create the database tables by running these SQL commands in your Neon SQL Editor:

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
```

6. Start the development server:
```bash
npm run dev
```

7. Verify it's running:
```bash
curl http://localhost:3000/health
```

You should see: `{"status":"OK","message":"API is running"}`

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/businesses` | Get all saved businesses |
| POST | `/api/businesses` | Save a business to the tracker |
| GET | `/api/places/search?location=Chicago,IL&type=restaurant` | Search businesses via Google Places |

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Port to run the server on (default: 3000) |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key (no referrer restrictions) |

## Related Repository

- [accessibility-tracker](https://github.com/supermegpie/accessibility-tracker) — React + TypeScript frontend

## License

MIT
