// routes/theatres.js — Theatre listing route
const express = require('express');
const router = express.Router();

const { getCollection } = require('../config/db');
const { readJSON } = require('../utils/json-store');

// GET /api/theatres — List all theatres
router.get('/', async (req, res) => {
    try {
        const theatresCollection = getCollection('theatres');
        const theatres = theatresCollection
            ? await theatresCollection.find({}).toArray()
            : await readJSON('theatres.json');
        res.json(theatres);
    } catch (err) {
        console.error('Theatres error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
