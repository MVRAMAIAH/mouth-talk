// server.js — MTALK Backend (modular)
const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const promClient = require('prom-client');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ register: promClient.register });

// ─── Config ────────────────────────────────────────────
const { connectDb, hasDb, getCategoryCollection, CATEGORY_NAMES } = require('./config/db');
const { buildCors } = require('./config/cors');

// ─── App Setup ─────────────────────────────────────────
const app = express();

// Middleware
app.use(morgan('short'));
app.use(buildCors());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// ─── Health Checks ─────────────────────────────────────
app.get('/health', (req, res) => res.status(200).send('HEALTH_OK'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', promClient.register.contentType);
        res.end(await promClient.register.metrics());
    } catch (ex) {
        res.status(500).end(ex);
    }
});

// ─── API Routes ────────────────────────────────────────
const authRoutes = require('./routes/auth');
const moviesRoutes = require('./routes/movies');
const reviewsRoutes = require('./routes/reviews');
const usersRoutes = require('./routes/users');
const followRoutes = require('./routes/follow');
const notificationsRoutes = require('./routes/notifications');
const theatresRoutes = require('./routes/theatres');
const bookingsRoutes = require('./routes/bookings');
const commentsRoutes = require('./routes/comments');

app.use('/api/auth', authRoutes);
app.use('/api/movies', moviesRoutes);

// Upload image shares the movies router (POST /api/upload-image → movies router)
app.post('/api/upload-image', (req, res, next) => {
    req.url = '/upload-image';
    moviesRoutes(req, res, next);
});

app.use('/api/reviews', reviewsRoutes);
app.use('/api/users', usersRoutes);

// Follow/Unfollow
app.use('/api/follow', followRoutes);
app.delete('/api/unfollow/:id', (req, res, next) => {
    req.url = `/${req.params.id}`;
    req.method = 'DELETE';
    followRoutes(req, res, next);
});

// Follower/following lists (mounted under /api/users but served by follow router)
app.get('/api/users/:id/followers', (req, res, next) => {
    req.url = `/${req.params.id}/followers`;
    followRoutes(req, res, next);
});
app.get('/api/users/:id/following', (req, res, next) => {
    req.url = `/${req.params.id}/following`;
    followRoutes(req, res, next);
});

app.use('/api/notifications', notificationsRoutes);
app.use('/api/theatres', theatresRoutes);
app.post('/api/verify-booking', (req, res, next) => {
    req.url = '/';
    bookingsRoutes(req, res, next);
});

// Comments — mounted under both /api/reviews/:id/comments and /api/comments
app.get('/api/reviews/:id/comments', (req, res, next) => {
    req.url = `/review/${req.params.id}`;
    commentsRoutes(req, res, next);
});
app.post('/api/reviews/:id/comments', (req, res, next) => {
    req.url = `/review/${req.params.id}`;
    commentsRoutes(req, res, next);
});
app.use('/api/comments', commentsRoutes);

// ─── Static Files ──────────────────────────────────────
const STATIC_ROOT = path.resolve(__dirname, '..', 'frontend');
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

// ─── Start Server ──────────────────────────────────────
const PORT = process.env.PORT || 3000;

connectDb().then(async (db) => {
    if (db) app.set('db', db);

    // On startup: sync live MongoDB data to local JSON as backup
    if (hasDb()) {
        try {
            const { writeJSON } = require('./utils/json-store');
            const results = [];
            for (const cat of CATEGORY_NAMES) {
                const docs = await getCategoryCollection(cat).find({}).toArray();
                results.push(...docs);
            }
            await writeJSON('movies.json', results);
            console.log('[Sync] Local movies.json updated from MongoDB Atlas');
        } catch (err) {
            console.error('[Sync] Error:', err.message);
        }
    }

    app.listen(PORT, () => {
        console.log(`\n🚀 MTALK server running on http://localhost:${PORT}`);
    });
});
