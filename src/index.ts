import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import businessRoutes from './routes/businesses';
import placesRoutes from './routes/places';
import reviewRoutes from './routes/reviews';
import cityRoutes from './routes/cities';
import tripPlannerRoutes from './routes/tripPlanner';

dotenv.config();
 
const app = express();
const PORT = process.env.PORT || 3000;
 
//Only allow requests from the frontend
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://accessibility-tracker-sooty.vercel.app',
  ],
  credentials: true
}));
app.use(express.json()); // needed to read JSON from POST requests
 
//Needed to confirm the server is running
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'API is running' });
});

app.use('/api/businesses', businessRoutes);
app.use('/api/places', placesRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/cities', cityRoutes);
app.use('/api/trip-planner', tripPlannerRoutes);
 
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

