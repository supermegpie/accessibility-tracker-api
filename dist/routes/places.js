"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const google_maps_services_js_1 = require("@googlemaps/google-maps-services-js");
const router = (0, express_1.Router)();
const client = new google_maps_services_js_1.Client();
// Search for businesses near a location using Google Places
router.get('/search', async (req, res) => {
    try {
        const { location, type, query } = req.query;
        if (!location) {
            res.status(400).json({ error: 'Location is required' });
            return;
        }
        // Turn the location name into lat/lng coordinates
        const geocodeResponse = await client.geocode({
            params: {
                address: location,
                key: process.env.GOOGLE_MAPS_API_KEY,
            }
        });
        if (!geocodeResponse.data.results || geocodeResponse.data.results.length === 0) {
            res.status(400).json({ error: 'Could not find location. Please enter a valid city or neighborhood.' });
            return;
        }
        const { lat, lng } = geocodeResponse.data.results[0].geometry.location;
        let places;
        if (query) {
            // Search for a specific business by name using text search
            const textResponse = await client.textSearch({
                params: {
                    query: `${query} in ${location}`,
                    location: { lat, lng },
                    radius: 10000,
                    key: process.env.GOOGLE_MAPS_API_KEY,
                }
            });
            places = textResponse.data.results;
            // Center on the first result if available
            if (places.length > 0 && places[0].geometry?.location) {
                const firstResult = places[0].geometry.location;
                return res.json({
                    center: { lat: firstResult.lat, lng: firstResult.lng },
                    places
                });
            }
        }
        else {
            // Use the coordinates to find nearby businesses of the requested type
            const placesResponse = await client.placesNearby({
                params: {
                    location: { lat, lng },
                    radius: 1000,
                    type: type || 'establishment',
                    key: process.env.GOOGLE_MAPS_API_KEY,
                }
            });
            places = placesResponse.data.results;
        }
        // Cross-reference with our database to get accessibility scores
        const placeIds = places.map((p) => p.place_id).filter(Boolean);
        let dbBusinesses = [];
        if (placeIds.length > 0) {
            const dbResult = await db_1.default.query(`SELECT google_place_id, overall_accessibility_score, 
                mobility_accessibility_score, vision_accessibility_score,
                hearing_accessibility_score, sensory_accessibility_score,
                google_rating, google_wheelchair_accessible, auto_scored
         FROM businesses 
         WHERE google_place_id = ANY($1)`, [placeIds]);
            dbBusinesses = dbResult.rows;
        }
        // Merge database scores into places results
        const dbMap = new Map(dbBusinesses.map((b) => [b.google_place_id, b]));
        const enrichedPlaces = places.map((p) => ({
            ...p,
            db_data: dbMap.get(p.place_id) || null
        }));
        res.json({
            center: { lat, lng },
            places: enrichedPlaces
        });
    }
    catch (error) {
        console.error('Places API error:', error);
        res.status(500).json({ error: 'Failed to fetch places' });
    }
});
exports.default = router;
