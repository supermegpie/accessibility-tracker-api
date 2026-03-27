import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import businessRoutes from './routes/businesses';
import placesRoutes from './routes/places';
import reviewRoutes from './routes/reviews';

dotenv.config();
 
const app = express();
const PORT = process.env.PORT || 3000;
 
// Allow requests from your React frontend
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json()); // Parse JSON request bodies
 
// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'API is running' });
});

app.use('/api/businesses', businessRoutes);
app.use('/api/places', placesRoutes);
app.use('/api/reviews', reviewRoutes);
 
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

