"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
//Check if username is available before user signup (avoid duplicates)
router.get('/username-check/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const result = await db_1.default.query('SELECT id FROM users WHERE username = $1', [username]);
        res.json({ available: result.rows.length === 0 });
    }
    catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to check username' });
    }
});
// Save or update a user when they log in
router.post('/', async (req, res) => {
    try {
        const { firebase_uid, email, display_name, first_name, last_name, username, identifies_as_disabled, is_caregiver, disability_categories } = req.body;
        if (!firebase_uid || !email) {
            res.status(400).json({ error: 'firebase_uid and email are required' });
            return;
        }
        // insert if new, update fields if existing
        const result = await db_1.default.query(`INSERT INTO users (firebase_uid, email, display_name, first_name, last_name, username, identifies_as_disabled, is_caregiver, disability_categories)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (firebase_uid)
       DO UPDATE SET 
         email = $2,
         display_name = COALESCE($3, users.display_name),
         first_name = COALESCE($4, users.first_name),
         last_name = COALESCE($5, users.last_name),
         username = COALESCE($6, users.username),
         identifies_as_disabled = COALESCE($7, users.identifies_as_disabled),
         is_caregiver = COALESCE($8, users.is_caregiver),
         disability_categories = COALESCE($9, users.disability_categories)
       RETURNING *`, [firebase_uid, email, display_name || email.split('@')[0], first_name, last_name, username, identifies_as_disabled, is_caregiver, disability_categories]);
        res.status(201).json({ user: result.rows[0] });
    }
    catch (error) {
        console.error('Database error:', error);
        if (error.code === '23505' && error.constraint === 'users_username_key') {
            res.status(409).json({ error: 'That username is already taken. Please choose a different one.' });
            return;
        }
        res.status(500).json({ error: 'Failed to save user' });
    }
});
//Find a user by firebase_uid
router.get('/:firebaseUid', async (req, res) => {
    try {
        const { firebaseUid } = req.params;
        const result = await db_1.default.query('SELECT * FROM users WHERE firebase_uid = $1', [firebaseUid]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});
exports.default = router;
