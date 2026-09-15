"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const businesses_1 = __importDefault(require("./routes/businesses"));
const places_1 = __importDefault(require("./routes/places"));
const reviews_1 = __importDefault(require("./routes/reviews"));
const cities_1 = __importDefault(require("./routes/cities"));
const tripPlanner_1 = __importDefault(require("./routes/tripPlanner"));
const elevators_1 = __importDefault(require("./routes/elevators"));
const users_1 = __importDefault(require("./routes/users"));
const reviewFeatures_1 = __importDefault(require("./routes/reviewFeatures"));
const dayPlanner_1 = __importDefault(require("./routes/dayPlanner"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
//Only allow requests from the frontend
app.use((0, cors_1.default)());
app.use(express_1.default.json()); // needed to read JSON from POST requests
//Needed to confirm the server is running
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'API is running' });
});
app.use('/api/businesses', businesses_1.default);
app.use('/api/places', places_1.default);
app.use('/api/reviews', reviews_1.default);
app.use('/api/cities', cities_1.default);
app.use('/api/trip-planner', tripPlanner_1.default);
app.use('/api/elevators', elevators_1.default);
app.use('/api/users', users_1.default);
app.use('/api/review-features', reviewFeatures_1.default);
app.use('/api/day-planner', dayPlanner_1.default);
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
