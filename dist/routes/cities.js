"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
// Pull all accessibility stats for the dashboard ( filtered by city if provided)
router.get('/stats', async (req, res) => {
    try {
        const { city } = req.query;
        //pull one  the ciy name before any comma (e.g. 'Chicago, IL' -> 'Chicago')
        const cityName = city ? city.split(',')[0].trim() : null;
        const cityParam = cityName ? [`%${cityName}%`] : [];
        const cityFilter = cityName ? 'WHERE b.address ILIKE $1' : '';
        const result = await db_1.default.query(`
      SELECT 
        b.business_type,
        COUNT(b.id) as total_businesses,
        ROUND(AVG(b.overall_accessibility_score)::numeric, 2) as avg_overall_score,
        ROUND(AVG(r.mobility_score)::numeric, 2) as avg_mobility,
        ROUND(AVG(r.vision_score)::numeric, 2) as avg_vision,
        ROUND(AVG(r.hearing_score)::numeric, 2) as avg_hearing,
        ROUND(AVG(r.sensory_score)::numeric, 2) as avg_sensory,
        ROUND(AVG(r.service_score)::numeric, 2) as avg_service,
        COUNT(r.id) as total_reviews
      FROM businesses b
      LEFT JOIN reviews r ON r.business_id = b.id
      ${cityFilter}
      GROUP BY b.business_type
      ORDER BY avg_overall_score DESC NULLS LAST
    `, cityParam);
        const overallResult = await db_1.default.query(`
      SELECT
        COUNT(b.id) as total_businesses,
        ROUND(AVG(b.overall_accessibility_score)::numeric, 2) as avg_overall_score,
        ROUND(AVG(r.mobility_score)::numeric, 2) as avg_mobility,
        ROUND(AVG(r.vision_score)::numeric, 2) as avg_vision,
        ROUND(AVG(r.hearing_score)::numeric, 2) as avg_hearing,
        ROUND(AVG(r.sensory_score)::numeric, 2) as avg_sensory,
        ROUND(AVG(r.service_score)::numeric, 2) as avg_service,
        COUNT(r.id) as total_reviews
      FROM businesses b
      LEFT JOIN reviews r ON r.business_id = b.id
      ${cityFilter}
    `, cityParam);
        const topBusinesses = await db_1.default.query(`
      SELECT id, name, address, business_type, overall_accessibility_score
      FROM businesses
      WHERE overall_accessibility_score IS NOT NULL
      ${cityName ? 'AND address ILIKE $1' : ''}
      ORDER BY overall_accessibility_score DESC
      LIMIT 5
    `, cityParam);
        // Get most commonly verified features
        const topTagsResult = await db_1.default.query(`
      SELECT tag, COUNT(*) as count
      FROM reviews r, unnest(r.tags) AS tag
      ${cityName ? 'JOIN businesses b ON r.business_id = b.id WHERE b.address ILIKE $1' : ''}
      GROUP BY tag
      ORDER BY count DESC
      LIMIT 8
    `, cityParam);
        res.json({
            city: cityName || 'All Cities',
            overall: overallResult.rows[0],
            byType: result.rows,
            topBusinesses: topBusinesses.rows,
            topTags: topTagsResult.rows
        });
    }
    catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to fetch city stats' });
    }
});
exports.default = router;
