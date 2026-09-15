"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
//GET all community reviews for a specific business
router.get('/:businessId', async (req, res) => {
    try {
        const { businessId } = req.params;
        const result = await db_1.default.query('SELECT * FROM reviews WHERE business_id = $1 ORDER BY created_at DESC', [businessId]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to fetch reviews' });
    }
});
// Save a new accessibility review submitted by a user (POST)
router.post('/', async (req, res) => {
    try {
        const { business_id, firebase_uid, mobility_score, vision_score, hearing_score, sensory_score, service_score, restroom_score, parking_score, comment, tags } = req.body;
        // Find overall score by taking average of the 4 disability-specific categories
        const overall_score = ((mobility_score || 0) +
            (vision_score || 0) +
            (hearing_score || 0) +
            (sensory_score || 0)) / 4;
        //Save the review to DB
        const result = await db_1.default.query(`INSERT INTO reviews 
        (business_id, firebase_uid, mobility_score, vision_score, hearing_score, sensory_score, service_score, restroom_score, parking_score, overall_score, comment, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`, [business_id, firebase_uid, mobility_score, vision_score, hearing_score, sensory_score, service_score, restroom_score, parking_score, overall_score, comment, tags || []]);
        //Update the business accessibility scores with new review added
        await db_1.default.query(`UPDATE businesses 
       SET 
         overall_accessibility_score = (
           SELECT AVG(overall_score) FROM reviews WHERE business_id = $1
         ),
         mobility_accessibility_score = (
           SELECT AVG(mobility_score) FROM reviews WHERE business_id = $1
         ),
         vision_accessibility_score = (
           SELECT AVG(vision_score) FROM reviews WHERE business_id = $1
         ),
         hearing_accessibility_score = (
           SELECT AVG(hearing_score) FROM reviews WHERE business_id = $1
         ),
         sensory_accessibility_score = (
           SELECT AVG(sensory_score) FROM reviews WHERE business_id = $1
         )
       WHERE id = $1`, [business_id]);
        res.status(201).json({ message: 'Review submitted!', review: result.rows[0] });
    }
    catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to submit review' });
    }
});
// GET /api/reviews/user/:firebaseUid — get all reviews submitted by a user
router.get('/user/:firebaseUid', async (req, res) => {
    try {
        const { firebaseUid } = req.params;
        const result = await db_1.default.query(`SELECT r.*, b.name as business_name, b.address as business_address,
              b.overall_accessibility_score, b.google_place_id
       FROM reviews r
       JOIN businesses b ON r.business_id = b.id
       WHERE r.firebase_uid = $1
       ORDER BY r.created_at DESC`, [firebaseUid]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to fetch user reviews' });
    }
});
exports.default = router;
