import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

//Computes 1-5 score from the tiered answers
//Blanks stay blank (one one yes is needed to pass each tier)
function computeScore(
  tier1_q1: boolean | null,
  tier1_q2: boolean | null,
  tier2_q1: boolean | null,
  tier2_q2: boolean | null,
  tier3_features: string[],
  warnings: string[]
): number {

  // Tier 1 (at least one yes to pass)
  //Score 0 means cannot enter (no accessible enter confirmed)
  const tier1_passed = (tier1_q1 === true || tier1_q2 === true);
  if (!tier1_passed) return 0;

  // Tier 2 (at least one yes required to score above 2)
  const tier2_passed = (tier2_q1 === true || tier2_q2 === true);
  if (!tier2_passed) return 1;

  // Tier 3 (count confirmed features and warnings)
  const featureCount = tier3_features?.length || 0;
  const warningCount = warnings?.length || 0;

  // Score 2 (passed tier 1 and 2 but fewer than 2 tier 3 features
  if (featureCount < 2) return 2;

  // Score 5 (3+ features, no warnings)
  if (featureCount >= 3 && warningCount === 0) return 5;

  // Score 4 (has 2+ features and no warnings)
  if (featureCount >= 2 && warningCount === 0) return 4;

  // Score of 3 (passed tier 1 and 2 but not enough tier 3 features or has warnings)
  if (featureCount < 2 || warningCount > 0) return 3;
}

// POST /api/review-features save structured feature answers
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      review_id,
      business_id,
      firebase_uid,
      category,
      tier1_q1,
      tier1_q2,
      tier2_q1,
      tier2_q2,
      tier3_features,
      warnings
    } = req.body;

    if (!business_id || !firebase_uid || !category) {
      res.status(400).json({ error: 'business_id, firebase_uid, and category are required' });
      return;
    }

    // No blank override within tiers 
    const tier1_passed = tier1_q1 === true || tier1_q2 === true;
    const tier2_passed = tier2_q1 === true || tier2_q2 === true;

    // Cross category feature override (if the same reviewer confirmed a feature)
    // in another category for this business, autofill it here if not already present
    const otherReviews = await pool.query(
      `SELECT tier3_features, warnings FROM review_features
       WHERE business_id = $1 AND firebase_uid = $2 AND category != $3`,
      [business_id, firebase_uid, category]
    );

    const confirmedElsewhere = new Set<string>();
    const warnedElsewhere = new Set<string>();
    for (const row of otherReviews.rows) {
      (row.tier3_features || []).forEach((f: string) => confirmedElsewhere.add(f));
      (row.warnings || []).forEach((w: string) => warnedElsewhere.add(w));
    }

    // Merge features and warnings (only add from other categories if not already present)
    const resolvedFeatures = Array.from(new Set([
      ...(tier3_features || []),
      ...[...confirmedElsewhere].filter(f => !(tier3_features || []).includes(f))
    ]));

    const resolvedWarnings = Array.from(new Set([
      ...(warnings || []),
      ...[...warnedElsewhere].filter(w => !(warnings || []).includes(w))
    ]));

    const computed_score = computeScore(
      tier1_q1, tier1_q2,
      tier2_q1, tier2_q2,
      resolvedFeatures,
      resolvedWarnings
    );

    const result = await pool.query(
      `INSERT INTO review_features
        (review_id, business_id, firebase_uid, category,
         tier1_q1, tier1_q2, tier1_passed,
         tier2_q1, tier2_q2, tier2_passed,
         tier3_features, warnings, computed_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        review_id || null,
        business_id,
        firebase_uid,
        category,
        tier1_q1,
        tier1_q2,
        tier1_passed,
        tier2_q1,
        tier2_q2,
        tier2_passed,
        resolvedFeatures || [],
        resolvedWarnings || [],
        computed_score
      ]
    );

    // Update the relevant category score on the business
    const colMap: Record<string, string> = {
      mobility: 'mobility_accessibility_score',
      vision: 'vision_accessibility_score',
      hearing: 'hearing_accessibility_score',
      sensory: 'sensory_accessibility_score',
    };

    const scoreCol = colMap[category];
    if (scoreCol) {
      await pool.query(
        `UPDATE businesses
         SET ${scoreCol} = (
           SELECT AVG(computed_score)
           FROM review_features
           WHERE business_id = $1 AND category = $2
         ),
         overall_accessibility_score = (
           SELECT AVG(computed_score)
           FROM review_features
           WHERE business_id = $1
         )
         WHERE id = $1`,
        [business_id, category]
      );
    }

    res.status(201).json({ feature: result.rows[0], computed_score });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to save review features' });
  }
});

// GET /api/review-features/:businessId (get all feature answers for a business)
router.get('/:businessId', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const { category } = req.query;

    const query = category
      ? `SELECT * FROM review_features WHERE business_id = $1 AND category = $2 ORDER BY created_at DESC`
      : `SELECT * FROM review_features WHERE business_id = $1 ORDER BY created_at DESC`;

    const params = category ? [businessId, category] : [businessId];
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch review features' });
  }
});

// GET /api/review-features/:businessId/summary 
//feature counts per business
router.get('/:businessId/summary', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;

    const result = await pool.query(
      `SELECT
        category,
        COUNT(*) as response_count,
        ROUND(AVG(computed_score)::numeric, 2) as avg_score,
        SUM(CASE WHEN tier1_passed THEN 1 ELSE 0 END) as tier1_pass_count,
        SUM(CASE WHEN tier2_passed THEN 1 ELSE 0 END) as tier2_pass_count
       FROM review_features
       WHERE business_id = $1
       GROUP BY category
       ORDER BY category`,
      [businessId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch feature summary' });
  }
});

export default router;
