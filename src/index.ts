import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import businessRoutes from './routes/businesses';
import placesRoutes from './routes/places';
import reviewRoutes from './routes/reviews';
import cityRoutes from './routes/cities';
import tripPlannerRoutes from './routes/tripPlanner';
import elevatorRoutes from './routes/elevators';
import dayPlannerRoutes from './routes/dayPlanner';

dotenv.config();
 
const app = express();
const PORT = process.env.PORT || 3000;
 
//Only allow requests from the frontend
app.use(cors());
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
app.use('/api/elevators', elevatorRoutes);
app.use('/api/day-planner', dayPlannerRoutes);
 
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

