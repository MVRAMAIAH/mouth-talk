// routes/movies.js — Movie CRUD routes
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const authMiddleware = require('../middleware/auth');
const requireAdmin = require('../middleware/admin');
const { movieRules, imageUploadRules } = require('../middleware/validate');
const { hasDb, getCollection, getCategoryCollection, CATEGORY_NAMES } = require('../config/db');
const { readJSON, writeJSON } = require('../utils/json-store');
const { generateId } = require('../utils/helpers');

const STATIC_ROOT = path.resolve(__dirname, '..', '..', 'frontend');

// GET /api/movies — List all movies (with pagination)
router.get('/', async (req, res) => {
    const reqId = generateId().substring(0, 6);
    console.time(`[Movies] GET /api/movies - ${reqId}`);
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
        const category = (req.query.category || '').toLowerCase();
        const skip = (page - 1) * limit;

        if (hasDb()) {
            let results = [];
            console.time(`[Movies] MongoDB_Query - ${reqId}`);

            if (category && CATEGORY_NAMES.includes(category)) {
                // Single category
                const coll = getCategoryCollection(category);
                results = await coll.find({}, { projection: { _id: 0 } }).skip(skip).limit(limit).toArray();
            } else {
                // All categories concurrently
                const promises = CATEGORY_NAMES.map(cat => 
                    getCategoryCollection(cat).find({}, { projection: { _id: 0 } }).toArray()
                );
                const allDocs = await Promise.all(promises);
                for (const docs of allDocs) {
                    results.push(...docs);
                }
                // Paginate the combined results
                results = results.slice(skip, skip + limit);
            }
            console.timeEnd(`[Movies] MongoDB_Query - ${reqId}`);
            
            console.timeEnd(`[Movies] GET /api/movies - ${reqId}`);
            return res.json(results);
        }

        // JSON fallback
        console.time(`[Movies] JSON_Fallback - ${reqId}`);
        let movies = await readJSON('movies.json');
        if (category) {
            movies = movies.filter(m => (m.category || '').toLowerCase() === category);
        }
        console.timeEnd(`[Movies] JSON_Fallback - ${reqId}`);
        console.timeEnd(`[Movies] GET /api/movies - ${reqId}`);
        res.json(movies.slice(skip, skip + limit));
    } catch (err) {
        console.error('Error fetching movies:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/movies/:id — Get single movie
router.get('/:id', async (req, res) => {
    const reqId = generateId().substring(0, 6);
    console.time(`[Movies] GET /api/movies/:id - ${reqId}`);
    try {
        const id = req.params.id;

        if (hasDb()) {
            console.time(`[Movies] MongoDB_FindOne - ${reqId}`);
            const promises = CATEGORY_NAMES.map(cat => 
                getCategoryCollection(cat).findOne({ id }, { projection: { _id: 0 } })
            );
            const docs = await Promise.all(promises);
            const doc = docs.find(d => d !== null);
            console.timeEnd(`[Movies] MongoDB_FindOne - ${reqId}`);
            
            console.timeEnd(`[Movies] GET /api/movies/:id - ${reqId}`);
            if (doc) return res.json(doc);
            return res.status(404).json({ error: 'Movie not found' });
        }

        console.time(`[Movies] JSON_FindOne - ${reqId}`);
        const movie = (await readJSON('movies.json')).find(m => m.id === id);
        console.timeEnd(`[Movies] JSON_FindOne - ${reqId}`);
        
        console.timeEnd(`[Movies] GET /api/movies/:id - ${reqId}`);
        if (!movie) return res.status(404).json({ error: 'Movie not found' });
        res.json(movie);
    } catch (err) {
        console.error('Error fetching movie:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/movies — Add/update movie (admin only)
router.post('/', authMiddleware, requireAdmin, movieRules, async (req, res) => {
    const reqId = generateId().substring(0, 6);
    console.time(`[Movies] POST /api/movies - ${reqId}`);
    try {
        const movieData = req.body;
        const { id, title, category } = movieData;

        if (hasDb()) {
            console.time(`[Movies] MongoDB_UpsertMovie - ${reqId}`);
            const coll = getCategoryCollection(category.toLowerCase());
            await coll.updateOne(
                { id },
                { $set: { ...movieData, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
                { upsert: true }
            );
            console.timeEnd(`[Movies] MongoDB_UpsertMovie - ${reqId}`);
        }

        // Also update local JSON
        const movies = await readJSON('movies.json');
        const existingIndex = movies.findIndex(m => m.id === id);
        if (existingIndex > -1) {
            movies[existingIndex] = { ...movies[existingIndex], ...movieData };
        } else {
            movies.push(movieData);
        }
        await writeJSON('movies.json', movies);

        // Generate booking IDs for the new movie
        const newBookingIds = Array.from({ length: 10 }, () =>
            (Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2))
                .toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(10, 'X').substring(0, 10)
        );

        const localBookings = await readJSON('bookings.json');
        if (!localBookings[id]) {
            localBookings[id] = newBookingIds;
        } else {
            localBookings[id] = [...new Set([...localBookings[id], ...newBookingIds])].slice(0, 50);
        }
        await writeJSON('bookings.json', localBookings);

        // Save booking IDs to MongoDB
        if (hasDb()) {
            console.time(`[Movies] MongoDB_BulkWriteBookings - ${reqId}`);
            const bookingsCollection = getCollection('bookings');
            const now = new Date();
            
            const operations = newBookingIds.map(bId => ({
                updateOne: {
                    filter: { bookingId: bId },
                    update: { $set: { movieId: id, bookingId: bId, updatedAt: now }, $setOnInsert: { createdAt: now, used: false } },
                    upsert: true
                }
            }));
            await bookingsCollection.bulkWrite(operations);
            console.timeEnd(`[Movies] MongoDB_BulkWriteBookings - ${reqId}`);
        }

        console.timeEnd(`[Movies] POST /api/movies - ${reqId}`);
        console.log(`🎬 Movie added/updated: ${title} (${category}) by admin`);
        res.status(201).json({ success: true, movie: movieData });
    } catch (err) {
        console.error('Error adding movie:', err);
        res.status(500).json({ error: 'Server error adding movie' });
    }
});

// DELETE /api/movies/:id — Delete movie (admin only)
router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
    const reqId = generateId().substring(0, 6);
    console.time(`[Movies] DELETE /api/movies/:id - ${reqId}`);
    try {
        const id = req.params.id;

        if (hasDb()) {
            console.time(`[Movies] MongoDB_DeleteAll - ${reqId}`);
            const promises = CATEGORY_NAMES.map(cat => 
                getCategoryCollection(cat).deleteOne({ id })
            );
            await Promise.all(promises);
            console.timeEnd(`[Movies] MongoDB_DeleteAll - ${reqId}`);
        }

        const movies = await readJSON('movies.json');
        const updatedMovies = movies.filter(m => m.id !== id);
        await writeJSON('movies.json', updatedMovies);

        console.timeEnd(`[Movies] DELETE /api/movies/:id - ${reqId}`);
        console.log(`🗑️ Movie deleted: ${id} by admin`);
        res.json({ success: true, message: 'Movie deleted permanently' });
    } catch (err) {
        console.error('Error deleting movie:', err);
        res.status(500).json({ error: 'Server error deleting movie' });
    }
});

// POST /api/upload-image — Upload image (admin only)
router.post('/upload-image', authMiddleware, requireAdmin, imageUploadRules, async (req, res) => {
    try {
        const { filename, base64 } = req.body;

        const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
        const cleanFilename = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const filepath = path.join(STATIC_ROOT, 'assets', 'images', cleanFilename);

        fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));

        res.json({ success: true, url: cleanFilename });
    } catch (err) {
        console.error('Upload Error:', err);
        res.status(500).json({ error: 'Server error during upload' });
    }
});

module.exports = router;
