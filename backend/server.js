// server.js — Backend
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
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

// Rate Limiter for Search
const searchLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many search requests, please try again later.' }
});

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
let commentsCollection = null;
let reactionsCollection = null;
let commentReactionsCollection = null;
let followsCollection = null;

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

function toId(id) {
    if (!id) return id;
    if (typeof id !== 'string') return id;
    if (id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id)) {
        try { return new ObjectId(id); } catch (e) { return id; }
    }
    return id;
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
        followsCollection = db.collection('follows');
        theatresCollection = db.collection('theatres');
        usersCollection = db.collection('users');
        commentsCollection = db.collection('comments');
        reactionsCollection = db.collection('reactions');
        commentReactionsCollection = db.collection('comment_reactions');

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

// --- User Search API ---
app.get('/api/users/search', searchLimiter, async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || query.length < 2) {
            return res.status(400).json({ error: 'Search query must be at least 2 characters long' });
        }

        let users = [];
        if (usersCollection) {
            // Case-insensitive, partial match search
            users = await usersCollection.find({
                fullName: { $regex: query, $options: 'i' }
            }).limit(10).toArray();
        } else {
            const allUsers = loadLocalJSON('users.json');
            users = allUsers.filter(u => 
                (u.fullName || '').toLowerCase().includes(query.toLowerCase())
            ).slice(0, 10);
        }

        // Return only necessary public fields
        const safeUsers = users.map(u => ({
            uid: u.uid,
            username: u.fullName,
            picture: u.picture || null,
            badge: u.badge || null,
            onboardingComplete: u.onboardingComplete || false,
            // Bio-equivalents from "Movie DNA"
            motherTongue: u.motherTongue || '',
            actor: u.actor || ''
        }));

        res.json(safeUsers);
    } catch (err) {
        console.error('User search error:', err);
        res.status(500).json({ error: 'Server error during search' });
    }
});

// --- User Profile Details ---
app.get('/api/users/:uid', async (req, res) => {
    try {
        const uid = req.params.uid;
        let user;
        if (usersCollection) {
            user = await usersCollection.findOne({ uid });
        } else {
            const allUsers = loadLocalJSON('users.json');
            user = allUsers.find(u => u.uid === uid);
        }

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Get Follow Stats
        let followerCount = 0;
        let followingCount = 0;
        let isFollowing = false;

        // Try to get current user UID from token for follow status
        let viewerUid = null;
        if (req.cookies.token) {
            try {
                const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET || 'fallback-secret-for-dev-only');
                viewerUid = decoded.uid;
            } catch (e) { /* ignore */ }
        }

        if (followsCollection) {
            followerCount = await followsCollection.countDocuments({ followingId: uid });
            followingCount = await followsCollection.countDocuments({ followerId: uid });
            if (viewerUid) {
                const followDoc = await followsCollection.findOne({ followerId: viewerUid, followingId: uid });
                isFollowing = !!followDoc;
            }
        } else {
            const allFollows = loadLocalJSON('follows.json');
            followerCount = allFollows.filter(f => f.followingId === uid).length;
            followingCount = allFollows.filter(f => f.followerId === uid).length;
            if (viewerUid) {
                isFollowing = allFollows.some(f => f.followerId === viewerUid && f.followingId === uid);
            }
        }

        res.json({
            uid: user.uid,
            fullName: user.fullName,
            picture: user.picture || null,
            badge: user.badge || null,
            motherTongue: user.motherTongue || '',
            actor: user.actor || '',
            favouriteActress: user.favouriteActress || '',
            favouriteDirector: user.favouriteDirector || '',
            favouriteComposer: user.favouriteComposer || '',
            onboardingComplete: user.onboardingComplete || false,
            followerCount,
            followingCount,
            isFollowing,
            isMe: viewerUid === uid
        });
    } catch (err) {
        console.error('Fetch user details error:', err);
        res.status(500).json({ error: 'Server error fetching user details' });
    }
});

// --- User Review History ---
app.get('/api/users/:uid/reviews', async (req, res) => {
    try {
        const uid = req.params.uid;
        
        // 1. Find user to get their name for legacy review matching
        let user;
        if (usersCollection) {
            user = await usersCollection.findOne({ uid });
        } else {
            user = loadLocalJSON('users.json').find(u => u.uid === uid);
        }

        if (!user) return res.status(404).json({ error: 'User not found' });

        let reviews = [];
        if (reviewsCollection) {
            // Search by UID (new) or userName (legacy fallback)
            reviews = await reviewsCollection.find({
                $or: [{ uid }, { userName: user.fullName }]
            }).sort({ createdAt: -1 }).toArray();
        } else {
            const allReviews = loadLocalJSON('reviews.json');
            reviews = allReviews.filter(r => r.uid === uid || r.userName === user.fullName);
            reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        res.json(reviews);
    } catch (err) {
        console.error('Fetch user reviews error:', err);
        res.status(500).json({ error: 'Server error fetching user reviews' });
    }
});

// --- Follow/Unfollow API ---
app.post('/api/follow/:id', authMiddleware, async (req, res) => {
    try {
        const followerId = req.user.uid;
        const followingId = req.params.id;

        if (followerId === followingId) {
            return res.status(400).json({ error: 'You cannot follow yourself' });
        }

        if (followsCollection) {
            await followsCollection.updateOne(
                { followerId, followingId },
                { $set: { followerId, followingId, createdAt: new Date() } },
                { upsert: true }
            );
        } else {
            const follows = loadLocalJSON('follows.json');
            const exists = follows.find(f => f.followerId === followerId && f.followingId === followingId);
            if (!exists) {
                follows.push({ followerId, followingId, createdAt: new Date() });
                writeLocalJSON('follows.json', follows);
            }
        }

        res.json({ success: true, message: 'Followed successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Follow error' });
    }
});

app.delete('/api/unfollow/:id', authMiddleware, async (req, res) => {
    try {
        const followerId = req.user.uid;
        const followingId = req.params.id;

        if (followsCollection) {
            await followsCollection.deleteOne({ followerId, followingId });
        } else {
            const follows = loadLocalJSON('follows.json');
            const updated = follows.filter(f => !(f.followerId === followerId && f.followingId === followingId));
            writeLocalJSON('follows.json', updated);
        }

        res.json({ success: true, message: 'Unfollowed successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Unfollow error' });
    }
});

// --- User Follow Lists ---
app.get('/api/users/:id/followers', async (req, res) => {
    try {
        const targetUid = req.params.id;

        // Try to get current user UID from token for mutual followers logic
        let viewerUid = null;
        if (req.cookies.token) {
            try {
                const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET || 'fallback-secret-for-dev-only');
                viewerUid = decoded.uid;
            } catch (e) { /* ignore */ }
        }

        let followers = [];
        if (followsCollection) {
            followers = await followsCollection.find({ followingId: targetUid }).toArray();
        } else {
            followers = loadLocalJSON('follows.json').filter(f => f.followingId === targetUid);
        }

        const followerUids = followers.map(f => f.followerId);
        let followerProfiles = [];
        
        if (usersCollection) {
            followerProfiles = await usersCollection.find({ uid: { $in: followerUids } }).toArray();
        } else {
            followerProfiles = loadLocalJSON('users.json').filter(u => followerUids.includes(u.uid));
        }

        // Check if viewer follows back for "isFollowing" status in list
        let followedByViewer = [];
        if (viewerUid) {
            if (followsCollection) {
                const docs = await followsCollection.find({ followerId: viewerUid, followingId: { $in: followerUids } }).toArray();
                followedByViewer = docs.map(d => d.followingId);
            } else {
                followedByViewer = loadLocalJSON('follows.json')
                    .filter(f => f.followerId === viewerUid && followerUids.includes(f.followingId))
                    .map(f => f.followingId);
            }
        }

        const safetyProfiles = followerProfiles.map(u => ({
            uid: u.uid,
            fullName: u.fullName,
            picture: u.picture || null,
            badge: u.badge || null,
            isFollowing: followedByViewer.includes(u.uid)
        }));

        res.json(safetyProfiles);
    } catch (err) {
        res.status(500).json({ error: 'Fetch followers error' });
    }
});

app.get('/api/users/:id/following', async (req, res) => {
    try {
        const targetUid = req.params.id;
        
        let following = [];
        if (followsCollection) {
            following = await followsCollection.find({ followerId: targetUid }).toArray();
        } else {
            following = loadLocalJSON('follows.json').filter(f => f.followerId === targetUid);
        }

        const followingUids = following.map(f => f.followingId);
        let followingProfiles = [];
        
        if (usersCollection) {
            followingProfiles = await usersCollection.find({ uid: { $in: followingUids } }).toArray();
        } else {
            followingProfiles = loadLocalJSON('users.json').filter(u => followingUids.includes(u.uid));
        }

        const safetyProfiles = followingProfiles.map(u => ({
            uid: u.uid,
            fullName: u.fullName,
            picture: u.picture || null,
            badge: u.badge || null,
            isFollowing: true // By definition, since we are viewing who they follow
        }));

        res.json(safetyProfiles);
    } catch (err) {
        res.status(500).json({ error: 'Fetch following error' });
    }
});

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
        // Generate 10 random 10-character alphanumeric IDs (uppercase)
        const newBookingIds = Array.from({ length: 10 }, () =>
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

        // Try to get UID from token for state sync
        let uid = null;
        if (req.cookies.token) {
            try {
                const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET || 'fallback-secret-for-dev-only');
                uid = decoded.uid;
            } catch (e) { /* ignore */ }
        }

        let reviews = [];
        if (reviewsCollection) {
            reviews = await reviewsCollection.find(filter).sort({ likes: -1, createdAt: -1 }).toArray();
        } else {
            reviews = loadLocalJSON('reviews.json');
            if (movieId) reviews = reviews.filter(r => r.movieId === movieId);
            if (badge) reviews = reviews.filter(r => r.userBadge === badge);
            reviews.sort((a, b) => (b.likes || 0) - (a.likes || 0) || new Date(b.createdAt) - new Date(a.createdAt));
        }

        // Attach user reaction if logged in
        if (uid) {
            const reactions = reactionsCollection
                ? await reactionsCollection.find({ uid, reviewId: { $in: reviews.map(r => r._id.toString()) } }).toArray()
                : loadLocalJSON('reactions.json').filter(r => r.uid === uid);

            const reactMap = {};
            reactions.forEach(r => reactMap[r.reviewId] = r.type);
            reviews = reviews.map(r => ({ ...r, userReaction: reactMap[r._id.toString()] || null }));
        }

        res.json(reviews);
    } catch (err) {
        console.error('Fetch reviews error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/reviews', authMiddleware, async (req, res) => {
    try {
        const { bookingId, movieId, movieTitle, userName, rating, text, userBadge } = req.body;
        const uid = req.user.uid; // From authMiddleware

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
            uid, // Link to the user
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

app.post('/api/reviews/:id/react', authMiddleware, async (req, res) => {
    try {
        const reviewId = req.params.id;
        const { type } = req.body;
        const uid = req.user.uid;

        if (!['like', 'dislike'].includes(type)) {
            return res.status(400).json({ error: 'Type must be like or dislike' });
        }

        const isLike = type === 'like';
        const otherType = isLike ? 'dislike' : 'like';
        const field = isLike ? 'likes' : 'dislikes';
        const otherField = isLike ? 'dislikes' : 'likes';

        if (reviewsCollection && reactionsCollection) {
            // 1. Check existing reaction
            const existing = await reactionsCollection.findOne({ reviewId, uid });

            if (!existing) {
                // New reaction
                await reactionsCollection.insertOne({ reviewId, uid, type, createdAt: new Date() });
                await reviewsCollection.updateOne({ _id: toId(reviewId) }, { $inc: { [field]: 1 } });
            } else if (existing.type === type) {
                // Toggle off
                await reactionsCollection.deleteOne({ _id: existing._id });
                await reviewsCollection.updateOne({ _id: toId(reviewId) }, { $inc: { [field]: -1 } });
            } else {
                // Switch reaction (Like -> Dislike or vice versa)
                await reactionsCollection.updateOne({ _id: existing._id }, { $set: { type, updatedAt: new Date() } });
                await reviewsCollection.updateOne({ _id: toId(reviewId) }, { $inc: { [field]: 1, [otherField]: -1 } });
            }

            const updated = await reviewsCollection.findOne({ _id: reviewId });
            return res.json({ likes: updated.likes || 0, dislikes: updated.dislikes || 0, userReaction: existing && existing.type === type ? null : type });
        }

        // Local Fallback
        const reviews = loadLocalJSON('reviews.json');
        const reactions = loadLocalJSON('reactions.json');
        const review = reviews.find(r => r._id === reviewId);
        if (!review) return res.status(404).json({ error: 'Review not found' });

        const reactIdx = reactions.findIndex(r => r.reviewId === reviewId && r.uid === uid);
        let userReaction = type;

        if (reactIdx === -1) {
            reactions.push({ reviewId, uid, type, createdAt: new Date() });
            review[field] = (review[field] || 0) + 1;
        } else if (reactions[reactIdx].type === type) {
            reactions.splice(reactIdx, 1);
            review[field] = Math.max(0, (review[field] || 0) - 1);
            userReaction = null;
        } else {
            const oldType = reactions[reactIdx].type;
            const oldField = oldType === 'like' ? 'likes' : 'dislikes';
            reactions[reactIdx].type = type;
            review[field] = (review[field] || 0) + 1;
            review[oldField] = Math.max(0, (review[oldField] || 0) - 1);
        }

        writeLocalJSON('reviews.json', reviews);
        writeLocalJSON('reactions.json', reactions);
        res.json({ likes: review.likes || 0, dislikes: review.dislikes || 0, userReaction });
    } catch (err) {
        console.error('React error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/reviews/:id/comments', async (req, res) => {
    try {
        const reviewId = req.params.id;

        // Try to get UID from token for state sync
        let uid = null;
        if (req.cookies.token) {
            try {
                const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET || 'fallback-secret-for-dev-only');
                uid = decoded.uid;
            } catch (e) { /* ignore */ }
        }

        let comments = [];
        if (commentsCollection) {
            comments = await commentsCollection.find({ reviewId }).sort({ createdAt: 1 }).toArray();
        } else {
            comments = loadLocalJSON('comments.json');
            comments = comments.filter(c => c.reviewId === reviewId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        }

        // Attach user reaction if logged in
        if (uid) {
            const reactions = commentReactionsCollection
                ? await commentReactionsCollection.find({ uid, commentId: { $in: comments.map(c => c._id.toString()) } }).toArray()
                : loadLocalJSON('comment_reactions.json').filter(r => r.uid === uid);

            const reactMap = {};
            reactions.forEach(r => reactMap[r.commentId] = r.type);
            comments = comments.map(c => ({ ...c, userReaction: reactMap[c._id.toString()] || null }));
        }

        res.json(comments);
    } catch (err) {
        console.error('Fetch comments error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/reviews/:id/comments', authMiddleware, async (req, res) => {
    try {
        const reviewId = req.params.id;
        const { text, parentId } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'Comment text is required' });
        }

        // Fetch full user record from DB (JWT only has uid/email/name)
        let fullUser = null;
        if (usersCollection) {
            fullUser = await usersCollection.findOne({ uid: req.user.uid });
        } else {
            const users = loadLocalJSON('users.json');
            fullUser = users.find(u => u.uid === req.user.uid);
        }

        const comment = {
            _id: generateId(),
            reviewId,
            parentId: parentId || null,
            userId: req.user.uid,
            userName: (fullUser && fullUser.fullName) || req.user.name || 'Anonymous',
            userAvatar: (fullUser && fullUser.picture) || null,
            userBadge: (fullUser && fullUser.badge) || null,
            text: text.trim(),
            likes: 0,
            dislikes: 0,
            createdAt: new Date()
        };

        if (commentsCollection) {
            const result = await commentsCollection.insertOne(comment);
            comment._id = result.insertedId;
        } else {
            const comments = loadLocalJSON('comments.json');
            comments.push(comment);
            writeLocalJSON('comments.json', comments);
        }
        res.status(201).json(comment);
    } catch (err) {
        console.error('Comment error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin-only: Delete a comment (and its child replies)
app.delete('/api/comments/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.email !== 'ramaiah5496@gmail.com') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const commentId = req.params.id;

        if (commentsCollection) {
            // Delete child replies first
            await commentsCollection.deleteMany({ parentId: commentId });
            // Delete the comment itself
            await commentsCollection.deleteOne({ _id: toId(commentId) });
            // Also try string-based _id match
            await commentsCollection.deleteOne({ _id: commentId });
            // Clean up reactions
            if (commentReactionsCollection) {
                await commentReactionsCollection.deleteMany({ commentId });
            }
        } else {
            let comments = loadLocalJSON('comments.json');
            comments = comments.filter(c => c._id !== commentId && c.parentId !== commentId);
            writeLocalJSON('comments.json', comments);
            let reactions = loadLocalJSON('comment_reactions.json');
            reactions = reactions.filter(r => r.commentId !== commentId);
            writeLocalJSON('comment_reactions.json', reactions);
        }

        console.log(`🗑️ Admin deleted comment: ${commentId}`);
        res.json({ success: true, message: 'Comment deleted' });
    } catch (err) {
        console.error('Delete comment error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/comments/:id/react', authMiddleware, async (req, res) => {
    try {
        const commentId = req.params.id;
        const { type } = req.body;
        const uid = req.user.uid;

        if (!['like', 'dislike'].includes(type)) {
            return res.status(400).json({ error: 'Type must be like or dislike' });
        }

        const isLike = type === 'like';
        const otherType = isLike ? 'dislike' : 'like';
        const field = isLike ? 'likes' : 'dislikes';
        const otherField = isLike ? 'dislikes' : 'likes';

        if (commentsCollection && commentReactionsCollection) {
            // 1. Check existing reaction
            const existing = await commentReactionsCollection.findOne({ commentId, uid });

            if (!existing) {
                // New reaction
                await commentReactionsCollection.insertOne({ commentId, uid, type, createdAt: new Date() });
                await commentsCollection.updateOne({ _id: toId(commentId) }, { $inc: { [field]: 1 } });
            } else if (existing.type === type) {
                // Toggle off
                await commentReactionsCollection.deleteOne({ _id: existing._id });
                await commentsCollection.updateOne({ _id: toId(commentId) }, { $inc: { [field]: -1 } });
            } else {
                // Switch reaction
                await commentReactionsCollection.updateOne({ _id: existing._id }, { $set: { type, updatedAt: new Date() } });
                await commentsCollection.updateOne({ _id: toId(commentId) }, { $inc: { [field]: 1, [otherField]: -1 } });
            }

            const updated = await commentsCollection.findOne({ _id: toId(commentId) });
            return res.json({ likes: updated.likes || 0, dislikes: updated.dislikes || 0, userReaction: existing && existing.type === type ? null : type });
        }

        // Local Fallback
        const comments = loadLocalJSON('comments.json');
        const reactions = loadLocalJSON('comment_reactions.json');
        const comment = comments.find(c => c._id === commentId);
        if (!comment) return res.status(404).json({ error: 'Comment not found' });

        const reactIdx = reactions.findIndex(r => r.commentId === commentId && r.uid === uid);
        let userReaction = type;

        if (reactIdx === -1) {
            reactions.push({ commentId, uid, type, createdAt: new Date() });
            comment[field] = (comment[field] || 0) + 1;
        } else if (reactions[reactIdx].type === type) {
            reactions.splice(reactIdx, 1);
            comment[field] = Math.max(0, (comment[field] || 0) - 1);
            userReaction = null;
        } else {
            const oldType = reactions[reactIdx].type;
            const oldField = oldType === 'like' ? 'likes' : 'dislikes';
            reactions[reactIdx].type = type;
            comment[field] = (comment[field] || 0) + 1;
            comment[oldField] = Math.max(0, (comment[oldField] || 0) - 1);
        }

        writeLocalJSON('comments.json', comments);
        writeLocalJSON('comment_reactions.json', reactions);
        res.json({ likes: comment.likes || 0, dislikes: comment.dislikes || 0, userReaction });
    } catch (err) {
        console.error('Comment react error:', err);
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
