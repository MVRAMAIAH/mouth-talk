// server.js — Backend
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const cookieParser = require('cookie-parser');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();

// 1. Move logging to the absolute top for debugging
app.use((req, res, next) => {
    console.log(`[DEBUG] ${new Date().toISOString()} - ${req.method} ${req.url} - Origin: ${req.headers.origin}`);
    next();
});

// 2. Health checks immediately after logging
app.get('/health', (req, res) => res.status(200).send('HEALTH_OK'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Improved CORS for production and development
app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5173'
        ];

        // Allow no-origin (like mobile apps or curl) or allowed origins
        if (!origin || allowedOrigins.some(o => typeof o === 'string' ? o === origin : o.test(origin))) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked for origin: ${origin}`);
            callback(null, true); // Still allowing all for now as requested, but logged
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// Import Auth Routes
const authRoutes = require('./routes/auth');
const authMiddleware = require('./middleware/auth');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const STATIC_ROOT = path.join(PROJECT_ROOT, 'frontend');
const DATA_DIR = path.join(__dirname, 'data');

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.DB_NAME || 'mouthtalk';

let dbClient = null;
let db = null;
let bookingsCollection = null;
let reviewsCollection = null;
let theatresCollection = null;
let usersCollection = null;

// Per-category movie collections
const CATEGORY_NAMES = ['tollywood', 'kollywood', 'sandalwood', 'mollywood', 'bollywood', 'hollywood', 'webseries'];
let categoryCollections = {};

// Load local JSON as fallback
function loadLocalJSON(filename) {
    const jsonPath = path.join(DATA_DIR, filename);
    if (fs.existsSync(jsonPath)) {
        try {
            return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        } catch (e) {
            console.error(`Local JSON parse error (${filename}):`, e);
        }
    }
    return [];
}

// Write JSON to local file
function writeLocalJSON(filename, data) {
    const jsonPath = path.join(DATA_DIR, filename);
    try {
        fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`Local JSON write error (${filename}):`, e);
    }
}

// Generate a simple unique ID for JSON-stored reviews
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// Initialize MongoDB
async function initDb() {
    if (!MONGODB_URI) return;
    const maskedUri = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//[USER:$1]:***@');
    console.log('MongoDB URI Debug:', maskedUri);
    try {
        dbClient = new MongoClient(MONGODB_URI);
        await dbClient.connect();
        db = dbClient.db(DB_NAME);

        for (const cat of CATEGORY_NAMES) {
            categoryCollections[cat] = db.collection(cat);
        }

        bookingsCollection = db.collection('bookings');
        reviewsCollection = db.collection('reviews');
        theatresCollection = db.collection('theatres');
        usersCollection = db.collection('users');

        app.set('db', db);

        console.log('Connected to MongoDB');
        console.log('Category collections:', CATEGORY_NAMES.join(', '));
    } catch (err) {
        console.error('MongoDB connection failed:', err.message);
        categoryCollections = {};
    }
}

function hasDbCollections() {
    return Object.keys(categoryCollections).length > 0;
}

// Sync theatres.json → MongoDB
async function syncTheatres() {
    if (!theatresCollection) return;
    try {
        const jsonPath = path.join(DATA_DIR, 'theatres.json');
        if (!fs.existsSync(jsonPath)) return;

        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (!Array.isArray(data)) return;

        const now = new Date();
        const ids = data.map(item => item.id);

        for (const item of data) {
            await theatresCollection.updateOne(
                { id: item.id },
                { $set: { ...item, updatedAt: now }, $setOnInsert: { createdAt: now } },
                { upsert: true }
            );
        }
        // [REMOVED WIPE] await theatresCollection.deleteMany({ id: { $nin: ids } });
        console.log(`✅ Synced theatres.json → theatres (${data.length} docs)`);
    } catch (err) {
        console.error('❌ Error syncing theatres:', err);
    }
}

// Sync bookings.json → MongoDB
async function syncBookings() {
    if (!bookingsCollection) return;
    try {
        const jsonPath = path.join(DATA_DIR, 'bookings.json');
        if (!fs.existsSync(jsonPath)) return;

        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (typeof data !== 'object' || Array.isArray(data)) return;

        const now = new Date();
        const allKeys = [];

        for (const [movieId, ids] of Object.entries(data)) {
            for (const bookingId of ids) {
                const key = `${movieId}:${bookingId}`;
                allKeys.push(key);
                await bookingsCollection.updateOne(
                    { bookingId },
                    { $set: { movieId, bookingId, updatedAt: now }, $setOnInsert: { createdAt: now, used: false } },
                    { upsert: true }
                );
            }
        }
        const allBookingIds = Object.values(data).flat();
        // [REMOVED WIPE] await bookingsCollection.deleteMany({ bookingId: { $nin: allBookingIds } });
        const totalCount = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
        console.log(`✅ Synced bookings.json → bookings (${totalCount} docs across ${Object.keys(data).length} movies)`);
    } catch (err) {
        console.error('❌ Error syncing bookings:', err);
    }
}

// Sync movies.json → per-category MongoDB collections
async function syncCategoryCollections() {
    if (!hasDbCollections()) return;
    try {
        const jsonPath = path.join(DATA_DIR, 'movies.json');
        if (!fs.existsSync(jsonPath)) return;

        const allMovies = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (!Array.isArray(allMovies)) return;

        const grouped = {};
        for (const cat of CATEGORY_NAMES) grouped[cat] = [];
        for (const movie of allMovies) {
            const cat = (movie.category || '').toLowerCase();
            if (grouped[cat]) grouped[cat].push(movie);
        }

        const now = new Date();

        for (const cat of CATEGORY_NAMES) {
            const coll = categoryCollections[cat];
            const movies = grouped[cat];
            const ids = movies.map(m => m.id);

            for (const movie of movies) {
                await coll.updateOne(
                    { id: movie.id },
                    { $set: { ...movie, updatedAt: now }, $setOnInsert: { createdAt: now } },
                    { upsert: true }
                );
            }
            // [REMOVED WIPE] await coll.deleteMany({ id: { $nin: ids } });
        }
        console.log(`✅ Synced movies.json → ${CATEGORY_NAMES.join(', ')} (${allMovies.length} total movies)`);
    } catch (err) {
        console.error('❌ Error syncing category collections:', err);
    }
}

// ─── API ROUTES ───────────────────────────────────────
app.use('/api/auth', authRoutes);

app.get('/api/movies', async (req, res) => {
    try {
        if (hasDbCollections()) {
            const results = [];
            for (const cat of CATEGORY_NAMES) {
                const docs = await categoryCollections[cat].find({}).toArray();
                results.push(...docs);
            }
            return res.json(results);
        }
        res.json(loadLocalJSON('movies.json'));
    } catch (err) {
        console.error('Error fetching movies:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/movies/:id', async (req, res) => {
    try {
        const id = req.params.id;
        if (hasDbCollections()) {
            for (const cat of CATEGORY_NAMES) {
                const doc = await categoryCollections[cat].findOne({ id });
                if (doc) return res.json(doc);
            }
            return res.status(404).json({ error: 'Movie not found' });
        }
        const movie = loadLocalJSON('movies.json').find(m => m.id === id);
        if (!movie) return res.status(404).json({ error: 'Movie not found' });
        res.json(movie);
    } catch (err) {
        console.error('Error fetching movie:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/movies', authMiddleware, async (req, res) => {
    try {
        if (req.user.email !== 'ramaiah5496@gmail.com') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const movieData = req.body;
        const { id, title, category, poster } = movieData;

        if (!id || !title || !category || !poster) {
            return res.status(400).json({ error: 'Missing required fields (id, title, category, poster)' });
        }

        if (!CATEGORY_NAMES.includes(category.toLowerCase())) {
            return res.status(400).json({ error: 'Invalid category' });
        }

        if (hasDbCollections()) {
            const coll = categoryCollections[category.toLowerCase()];
            await coll.updateOne(
                { id },
                { $set: { ...movieData, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
                { upsert: true }
            );
        }

        const movies = loadLocalJSON('movies.json');
        const existingIndex = movies.findIndex(m => m.id === id);
        if (existingIndex > -1) {
            movies[existingIndex] = { ...movies[existingIndex], ...movieData };
        } else {
            movies.push(movieData);
        }
        writeLocalJSON('movies.json', movies);

        // --- NEW: Generate 10-character Booking IDs ---
        // Generate 15 random 10-character alphanumeric IDs (uppercase)
        const newBookingIds = Array.from({ length: 15 }, () => 
            (Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2))
            .toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(10, 'X').substring(0, 10)
        );

        // Save to local bookings.json
        const localBookings = loadLocalJSON('bookings.json');
        if (!localBookings[id]) {
            localBookings[id] = newBookingIds;
        } else {
            // Append if movie exists
            localBookings[id] = [...new Set([...localBookings[id], ...newBookingIds])].slice(0, 50); // limit to a reasonable amount
        }
        writeLocalJSON('bookings.json', localBookings);

        // Save to MongoDB bookingsCollection
        if (hasDbCollections() && bookingsCollection) {
            const now = new Date();
            for (const bId of newBookingIds) {
                await bookingsCollection.updateOne(
                    { bookingId: bId },
                    { $set: { movieId: id, bookingId: bId, updatedAt: now }, $setOnInsert: { createdAt: now, used: false } },
                    { upsert: true }
                );
            }
        }
        // ----------------------------------------------

        // Auto-push the JSON change
        const { exec } = require('child_process');
        exec(`git add backend/data/movies.json backend/data/bookings.json && git commit -m "auto(db): update movies and bookings with ${title}" && git push origin main`, { cwd: PROJECT_ROOT }, (err, stdout, stderr) => {
            if (err) console.error('Git push failed:', stderr);
            else console.log('Successfully auto-pushed to cloud');
        });

        console.log(`🎬 Movie added/updated: ${title} (${category}) by admin`);
        res.status(201).json({ success: true, movie: movieData });
    } catch (err) {
        console.error('Error adding movie:', err);
        res.status(500).json({ error: 'Server error adding movie' });
    }
});

app.post('/api/upload-image', authMiddleware, async (req, res) => {
    try {
        if (req.user.email !== 'ramaiah5496@gmail.com') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { filename, base64 } = req.body;
        if (!filename || !base64) return res.status(400).json({ error: 'Missing data' });
        
        const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
        const cleanFilename = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const filepath = path.join(STATIC_ROOT, 'assets', 'images', cleanFilename);
        
        fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
        
        const { exec } = require('child_process');
        exec(`git add "frontend/assets/images/${cleanFilename}" && git commit -m "auto(assets): push uploaded image ${cleanFilename}" && git push origin main`, { cwd: PROJECT_ROOT }, (err, stdout, stderr) => {
            if (err) console.error('Git push image failed:', stderr);
            else console.log('Successfully pushed image:', cleanFilename);
        });
        
        res.json({ success: true, url: cleanFilename });
    } catch (err) {
        console.error('Upload Error:', err);
        res.status(500).json({ error: 'Server error during upload' });
    }
});

app.delete('/api/movies/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.email !== 'ramaiah5496@gmail.com') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const id = req.params.id;

        // 1. Delete from MongoDB
        if (hasDbCollections()) {
            for (const cat of CATEGORY_NAMES) {
                await categoryCollections[cat].deleteOne({ id });
            }
        }

        // 2. Delete from local JSON
        const movies = loadLocalJSON('movies.json');
        const updatedMovies = movies.filter(m => m.id !== id);
        writeLocalJSON('movies.json', updatedMovies);

        // Auto-push the JSON change so the deletion persists across deployments
        const { exec } = require('child_process');
        exec(`git add backend/data/movies.json && git commit -m "auto(db): delete movie ${id}" && git push origin main`, { cwd: PROJECT_ROOT }, (err, stdout, stderr) => {
            if (err) console.error('Git push movies.json deletion failed:', stderr);
            else console.log(`Successfully auto-pushed movies.json deletion for movie: ${id}`);
        });

        console.log(`🗑️ Movie deleted: ${id} by admin`);
        res.json({ success: true, message: 'Movie deleted permanently' });
    } catch (err) {
        console.error('Error deleting movie:', err);
        res.status(500).json({ error: 'Server error deleting movie' });
    }
});

app.post('/api/verify-booking', async (req, res) => {
    try {
        const { bookingId, movieId } = req.body;
        if (!bookingId || !movieId) {
            return res.status(400).json({ error: 'Booking ID and Movie are required' });
        }
        const upperBookingId = bookingId.toUpperCase();

        if (bookingsCollection) {
            const doc = await bookingsCollection.findOne({ movieId, bookingId: upperBookingId });
            if (!doc) return res.status(404).json({ error: 'Invalid booking ID' });
            if (doc.used) return res.status(400).json({ error: 'This booking ID has already been used for a review' });
        } else {
            const bookings = loadLocalJSON('bookings.json');
            const movieBookings = bookings[movieId];
            if (!movieBookings || !movieBookings.includes(upperBookingId)) {
                return res.status(404).json({ error: 'Invalid booking ID' });
            }
            const reviews = loadLocalJSON('reviews.json');
            if (reviews.some(r => r.bookingId === upperBookingId)) {
                return res.status(400).json({ error: 'This booking ID has already been used for a review' });
            }
        }

        const allMovies = loadLocalJSON('movies.json');
        const movie = allMovies.find(m => m.id === movieId);
        res.json({ valid: true, bookingId: upperBookingId, movieId, movieTitle: movie ? movie.title : movieId });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/reviews', async (req, res) => {
    try {
        const { movieId, badge } = req.query;
        const filter = {};
        if (movieId) filter.movieId = movieId;
        if (badge) filter.userBadge = badge;
        if (reviewsCollection) {
            return res.json(await reviewsCollection.find(filter).sort({ likes: -1, createdAt: -1 }).toArray());
        }
        let reviews = loadLocalJSON('reviews.json');
        if (movieId) reviews = reviews.filter(r => r.movieId === movieId);
        if (badge) reviews = reviews.filter(r => r.userBadge === badge);
        reviews.sort((a, b) => (b.likes || 0) - (a.likes || 0) || new Date(b.createdAt) - new Date(a.createdAt));
        res.json(reviews);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/reviews', async (req, res) => {
    try {
        const { bookingId, movieId, movieTitle, userName, rating, text, userBadge } = req.body;
        if (!bookingId || !movieId || !userName || !rating || !text) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const upperBookingId = bookingId.toUpperCase();

        if (bookingsCollection) {
            const doc = await bookingsCollection.findOne({ movieId, bookingId: upperBookingId });
            if (!doc) return res.status(404).json({ error: 'Invalid booking ID' });
            if (doc.used) return res.status(400).json({ error: 'This booking ID has already been used for a review' });
        } else {
            const bookings = loadLocalJSON('bookings.json');
            const movieBookings = bookings[movieId];
            if (!movieBookings || !movieBookings.includes(upperBookingId)) {
                return res.status(404).json({ error: 'Invalid booking ID' });
            }
            const existingReviews = loadLocalJSON('reviews.json');
            if (existingReviews.some(r => r.bookingId === upperBookingId)) {
                return res.status(400).json({ error: 'This booking ID has already been used for a review' });
            }
        }

        const review = {
            _id: generateId(),
            bookingId: upperBookingId,
            movieId,
            movieTitle: movieTitle || movieId,
            userName: userName.trim(),
            userBadge: userBadge || null,
            rating: parseInt(rating),
            text: text.trim(),
            likes: 0,
            dislikes: 0,
            createdAt: new Date()
        };

        if (reviewsCollection) {
            const result = await reviewsCollection.insertOne(review);
            review._id = result.insertedId;
            await bookingsCollection.updateOne(
                { movieId, bookingId: upperBookingId },
                { $set: { used: true, usedAt: new Date() } }
            );
        } else {
            const reviews = loadLocalJSON('reviews.json');
            reviews.push(review);
            writeLocalJSON('reviews.json', reviews);
        }
        res.status(201).json(review);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/reviews/:id/react', async (req, res) => {
    try {
        const reviewId = req.params.id;
        const { type } = req.body;
        if (!['like', 'dislike'].includes(type)) {
            return res.status(400).json({ error: 'Type must be like or dislike' });
        }
        const field = type === 'like' ? 'likes' : 'dislikes';

        if (reviewsCollection) {
            let result = await reviewsCollection.findOneAndUpdate(
                { _id: reviewId },
                { $inc: { [field]: 1 } },
                { returnDocument: 'after' }
            );
            if (!result) {
                try {
                    result = await reviewsCollection.findOneAndUpdate(
                        { _id: new ObjectId(reviewId) },
                        { $inc: { [field]: 1 } },
                        { returnDocument: 'after' }
                    );
                } catch (e) { /* not a valid ObjectId, ignore */ }
            }
            if (!result) return res.status(404).json({ error: 'Review not found' });
            return res.json({ likes: result.likes || 0, dislikes: result.dislikes || 0 });
        }

        const reviews = loadLocalJSON('reviews.json');
        const review = reviews.find(r => r._id === reviewId);
        if (!review) return res.status(404).json({ error: 'Review not found' });
        review[field] = (review[field] || 0) + 1;
        writeLocalJSON('reviews.json', reviews);
        res.json({ likes: review.likes || 0, dislikes: review.dislikes || 0 });
    } catch (err) {
        console.error('React error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/theatres', async (req, res) => {
    try {
        const theatres = theatresCollection ? await theatresCollection.find({}).toArray() : loadLocalJSON('theatres.json');
        res.json(theatres);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── STATIC FILES ──────────────────────────────────────
app.use(express.static(STATIC_ROOT));
app.use('/assets', express.static(path.join(STATIC_ROOT, 'assets')));

// SPA Fallback
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found' });
    }
    const indexPath = path.join(STATIC_ROOT, 'index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    res.status(404).send('Not found');
});

const PORT = process.env.PORT || 3000;

// Start server
initDb().then(async () => {
    if (hasDbCollections()) {
        // INSTEAD of uploading old JSON to Atlas, download the TRUE data from Atlas and update the local JSON file!
        try {
            const results = [];
            for (const cat of CATEGORY_NAMES) {
                const docs = await categoryCollections[cat].find({}).toArray();
                results.push(...docs);
            }
            writeLocalJSON('movies.json', results);
            console.log('✅ Overwrote local movies.json with live data from MongoDB Atlas');
        } catch (err) {
            console.error('Error updating local movies.json from Atlas:', err);
        }
    }
    app.listen(PORT, () => {
        console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    });
});
